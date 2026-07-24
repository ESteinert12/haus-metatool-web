#!/usr/bin/env node
// Find titles with no stems, scan B2 for their files, and insert stem records.
// Usage:
//   node fix-migration-orphans.js              — dry run, show all orphans
//   node fix-migration-orphans.js --sku T40l050 — single track dry run
//   node fix-migration-orphans.js --apply      — insert stems for all orphans
//   node fix-migration-orphans.js --sku T40l050 --apply

const { Pool } = require('pg')
const https    = require('https')

const APPLY      = process.argv.includes('--apply')
const SINGLE_SKU = (() => { const i = process.argv.indexOf('--sku'); return i > -1 ? process.argv[i+1] : null })()

const B2_KEY_ID  = '0050a76021cb5da0000000004'
const B2_APP_KEY = 'K0054dTbDhVLVzQj0WqsE6h2w6QILXo'
const B2_BUCKET  = 'haus-music'

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

// ── B2 helpers ───────────────────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve(data) }
      })
    }).on('error', reject)
  })
}

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function b2Authorize() {
  const creds = Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64')
  const res = await httpsGet('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    Authorization: `Basic ${creds}`
  })
  if (!res.authorizationToken) throw new Error('B2 auth failed: ' + JSON.stringify(res))
  return res // { authorizationToken, apiUrl, downloadUrl, ... }
}

async function b2ListFiles(auth, bucketId, prefix) {
  const files = []
  let startFileName = null
  do {
    const body = { bucketId, prefix, maxFileCount: 1000 }
    if (startFileName) body.startFileName = startFileName
    const res = await httpsPost(
      `${auth.apiUrl}/b2api/v2/b2_list_file_names`,
      { Authorization: auth.authorizationToken },
      body
    )
    if (res.files) files.push(...res.files)
    startFileName = res.nextFileName
  } while (startFileName)
  return files
}

async function b2GetBucketId(auth, bucketName) {
  const res = await httpsPost(
    `${auth.apiUrl}/b2api/v2/b2_list_buckets`,
    { Authorization: auth.authorizationToken },
    { accountId: auth.accountId, bucketName }
  )
  return res.buckets?.[0]?.bucketId || null
}

// ── Stem name from filename ──────────────────────────────────────────────────
function inferStemName(filename) {
  if (/_FULL\./i.test(filename))   return 'FULL'
  if (/_STEMS\./i.test(filename))  return 'STEMS'
  if (/_ALT\./i.test(filename))    return 'ALT'
  if (/_BUMPER\./i.test(filename)) return 'BUMPER'
  if (/_60\./i.test(filename))     return '60'
  if (/_30\./i.test(filename))     return '30'
  if (/_15\./i.test(filename))     return '15'
  return filename.replace(/\.[^.]+$/, '').split('_').pop() || 'FULL'
}

function isAudio(filename) {
  return /\.(wav|aif|aiff|mp3)$/i.test(filename)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n── Migration Orphan B2 Repair ─────────────────────────────`)
  console.log(`Mode: ${APPLY ? '⚠️  APPLY' : '🔍 DRY RUN'}`)
  if (SINGLE_SKU) console.log(`SKU filter: ${SINGLE_SKU}`)

  // 1. Find orphan titles (no stems in DB)
  const where = SINGLE_SKU ? `AND t.sku_root = '${SINGLE_SKU}'` : ''
  const orphans = await pool.query(`
    SELECT t.sku_root, t.title, t.lot_id, l.lot_name
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    LEFT JOIN lots l       ON l.lot_id    = t.lot_id
    WHERE ms.sku_root IS NULL ${where}
    GROUP BY t.sku_root, t.title, t.lot_id, l.lot_name
    ORDER BY t.sku_root
  `)

  console.log(`\nOrphan titles (no stems): ${orphans.rows.length}`)
  if (!orphans.rows.length) { console.log('None — all good!'); await pool.end(); return }

  // 2. Authorize B2
  console.log('\nConnecting to B2…')
  const auth = await b2Authorize()
  console.log(`✓ Authorized (${auth.apiUrl})`)
  const bucketId = await b2GetBucketId(auth, B2_BUCKET)
  if (!bucketId) throw new Error(`Bucket "${B2_BUCKET}" not found`)
  console.log(`✓ Bucket: ${B2_BUCKET} (${bucketId})`)

  let totalFixed = 0

  for (const row of orphans.rows) {
    const { sku_root, title, lot_name } = row
    console.log(`\n── ${sku_root}  "${title}"  lot: ${lot_name || '(none)'}`)

    // Search B2 for files whose key contains this sku_root
    const files = await b2ListFiles(auth, bucketId, sku_root)
    const audioFiles = files.filter(f => isAudio(f.fileName))

    if (!audioFiles.length) {
      // Try case-insensitive prefix variants (migration may have used different casing)
      console.log(`   No files found with prefix "${sku_root}" — trying uppercase…`)
      const upper = await b2ListFiles(auth, bucketId, sku_root.toUpperCase())
      audioFiles.push(...upper.filter(f => isAudio(f.fileName)))
    }

    if (!audioFiles.length) {
      console.log(`   ✗ No audio files found in B2 — check bucket manually`)
      continue
    }

    audioFiles.forEach(f => console.log(`   ${f.fileName}  (b2_key: ${f.fileName})`))

    if (!APPLY) continue

    // Insert stem records
    for (const f of audioFiles) {
      const filename = f.fileName.split('/').pop()
      const stemName = inferStemName(filename)
      await pool.query(`
        INSERT INTO mix_stems (sku_root, stem_name, filename, b2_key)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (sku_root, filename) DO UPDATE SET b2_key = EXCLUDED.b2_key
      `, [sku_root, stemName, filename, f.fileName])
      console.log(`   ✅ ${filename} → stem "${stemName}", b2_key="${f.fileName}"`)
    }
    totalFixed++
  }

  if (APPLY) console.log(`\n✅ Fixed ${totalFixed} of ${orphans.rows.length} orphans`)
  else        console.log(`\n── DRY RUN COMPLETE — run with --apply to insert stems ──`)

  await pool.end()
}

run().catch(async e => {
  console.error('Error:', e.message)
  await pool.end()
  process.exit(1)
})
