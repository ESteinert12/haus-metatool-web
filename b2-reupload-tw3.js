// b2-reupload-tw3.js
// Uploads any TW3 shipping files that are missing from B2 and updates mix_stems.b2_key
// Run: node b2-reupload-tw3.js

const https  = require('https')
const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const { Pool } = require('pg')

const KEY_ID  = '0a76021cb5da'
const APP_KEY = '00512129adc584be3490f5e337f63dbc5f2a7c1c66'
const BUCKET  = 'haus-music'
const CONN    = 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const SKUS    = ['R82a8854', 'S20d1064', 'S20d1074']

const SHIPPING = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260708_TEXAS WIVES_3'

// ─── HTTP helper ────────────────────────────────────────────────────────────
function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function jsonReq(opts, body) {
  return request(opts, body ? JSON.stringify(body) : undefined).then(r => ({
    status: r.status,
    body: JSON.parse(r.body.toString())
  }))
}

// ─── B2 auth ────────────────────────────────────────────────────────────────
async function authorize() {
  const creds = Buffer.from(`${KEY_ID}:${APP_KEY}`).toString('base64')
  const r = await jsonReq({
    hostname: 'api.backblazeb2.com',
    path: '/b2api/v3/b2_authorize_account',
    method: 'GET',
    headers: { Authorization: `Basic ${creds}` }
  })
  if (r.status !== 200) throw new Error(`Auth failed: ${r.body.message}`)
  const s = r.body.apiInfo?.storageApi
  return {
    token:       r.body.authorizationToken,
    accountId:   r.body.accountId,
    apiUrl:      s?.apiUrl || 'https://api.backblazeb2.com',
    downloadUrl: s?.downloadUrl || r.body.downloadUrl,
  }
}

async function getBucketId(auth) {
  const host = new URL(auth.apiUrl).hostname
  const r = await jsonReq({
    hostname: host,
    path: `/b2api/v3/b2_list_buckets?accountId=${auth.accountId}`,
    method: 'GET',
    headers: { Authorization: auth.token }
  })
  if (r.status !== 200) throw new Error(`list_buckets failed: ${r.body.message}`)
  const bucket = (r.body.buckets || []).find(b => b.bucketName === BUCKET)
  if (!bucket) throw new Error(`Bucket '${BUCKET}' not found`)
  return bucket.bucketId
}

async function getUploadUrl(auth, bucketId) {
  const host = new URL(auth.apiUrl).hostname
  const payload = JSON.stringify({ bucketId })
  const r = await jsonReq({
    hostname: host,
    path: '/b2api/v3/b2_get_upload_url',
    method: 'POST',
    headers: { Authorization: auth.token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, { bucketId })
  if (r.status !== 200) throw new Error(`get_upload_url failed: ${r.body.message}`)
  return { uploadUrl: r.body.uploadUrl, uploadAuthToken: r.body.authorizationToken }
}

async function uploadFile(uploadUrl, uploadToken, localPath, b2Key) {
  const data     = fs.readFileSync(localPath)
  const sha1     = crypto.createHash('sha1').update(data).digest('hex')
  const mime     = localPath.endsWith('.mp3') ? 'audio/mpeg' : localPath.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream'
  const url      = new URL(uploadUrl)
  const r = await request({
    hostname: url.hostname,
    path:     url.pathname + url.search,
    method:   'POST',
    headers: {
      Authorization:     uploadToken,
      'X-Bz-File-Name': encodeURIComponent(b2Key).replace(/%2F/g, '/'),
      'Content-Type':    mime,
      'Content-Length':  data.length,
      'X-Bz-Content-Sha1': sha1,
    }
  }, data)
  const body = JSON.parse(r.body.toString())
  if (r.status !== 200) throw new Error(`upload failed: ${body.message}`)
  return body
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false } })

  console.log('Authorizing with B2…')
  const auth     = await authorize()
  const bucketId = await getBucketId(auth)
  const upUrl    = await getUploadUrl(auth, bucketId)
  console.log('✓ Authorized\n')

  for (const sku of SKUS) {
    console.log(`── ${sku}`)

    // Get title for folder name
    const titleRow = await pool.query(`SELECT title FROM titles WHERE sku_root=$1`, [sku])
    if (!titleRow.rows.length) { console.log('  ⚠ Not in DB, skipping\n'); continue }
    const title = titleRow.rows[0].title

    // Find matching shipping subfolder
    let trackFolder = null
    try {
      const entries = fs.readdirSync(SHIPPING)
      trackFolder = entries.find(e => e.startsWith(sku))
    } catch (e) { console.log(`  ⚠ Can't read shipping folder: ${e.message}\n`); continue }

    if (!trackFolder) { console.log(`  ⚠ No shipping folder found for ${sku}\n`); continue }
    const trackDir = path.join(SHIPPING, trackFolder)
    console.log(`  Folder: ${trackFolder}`)

    // Get mix_stems from DB
    const stemsRes = await pool.query(
      `SELECT mix_stem_id, filename, b2_key FROM mix_stems WHERE sku_root=$1 ORDER BY filename`, [sku]
    )
    const stems = stemsRes.rows

    let uploaded = 0, skipped = 0, failed = 0

    for (const stem of stems) {
      const localPath = path.join(trackDir, stem.filename)
      if (!fs.existsSync(localPath)) {
        console.log(`  ✗ ${stem.filename} — not in shipping folder`)
        failed++
        continue
      }

      // Verify it's in B2 already — if b2_key exists, do a quick HEAD check
      // For simplicity, just re-upload anything missing from DB or where we suspect it's wrong
      // (the app plays from B2 so a duplicate upload is harmless)
      const b2Key = stem.b2_key
      if (!b2Key) {
        console.log(`  ⚠ ${stem.filename} — no b2_key in DB, skipping (run b2 index first)`)
        skipped++
        continue
      }

      process.stdout.write(`  ↑ ${stem.filename} … `)
      try {
        const sizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1)
        await uploadFile(upUrl.uploadUrl, upUrl.uploadAuthToken, localPath, b2Key)
        // Update b2_key in DB to confirm (it should already be set, but refreshes it)
        await pool.query(`UPDATE mix_stems SET b2_key=$1 WHERE mix_stem_id=$2`, [b2Key, stem.mix_stem_id])
        console.log(`✓ ${sizeMB} MB`)
        uploaded++
      } catch (e) {
        console.log(`FAILED: ${e.message}`)
        failed++
      }
    }

    console.log(`  → ${uploaded} uploaded, ${skipped} skipped, ${failed} failed\n`)
  }

  await pool.end()
  console.log('Done.')
}

main().catch(e => { console.error(e.message); process.exit(1) })
