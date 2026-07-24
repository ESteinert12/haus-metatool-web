// rebuild-mix-stems.js
// Re-populates mix_stems from the B2 bucket by listing all files and
// matching each one back to its sku_root in the titles table.
//
//   node rebuild-mix-stems.js            — dry run (shows counts, no DB writes)
//   node rebuild-mix-stems.js --import   — write to DB
//   node rebuild-mix-stems.js --verbose  — log every file processed

const https  = require('https')
const { Pool } = require('pg')

const DRY    = !process.argv.includes('--import')
const VERBOSE = process.argv.includes('--verbose')

const B2_KEY_ID  = '0050a76021cb5da0000000004'
const B2_APP_KEY = 'K0054dTbDhVLVzQj0WqsE6h2w6QILXo'
const B2_BUCKET  = 'haus-music'

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

// ── B2 helpers ────────────────────────────────────────────────────────────────
function b2Request({ method = 'GET', hostname, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const opts = {
      hostname, path, method,
      headers: {
        ...headers,
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

async function b2Authorize() {
  const creds = Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64')
  const res = await b2Request({
    hostname: 'api.backblazeb2.com',
    path: '/b2api/v3/b2_authorize_account',
    headers: { Authorization: `Basic ${creds}` }
  })
  if (!res.authorizationToken) throw new Error(`B2 auth failed: ${JSON.stringify(res)}`)
  // B2 v3 nests fields under apiInfo.storageApi; v2 has them at top level.
  // For restricted app keys, bucketId is in the auth response (list_buckets returns nothing).
  const storageApi = res.apiInfo?.storageApi
  return {
    authorizationToken: res.authorizationToken,
    apiUrl:      storageApi?.apiUrl      || res.apiUrl,
    downloadUrl: storageApi?.downloadUrl || res.downloadUrl,
    // Restricted key: bucket is locked to one bucket — ID is in auth response
    bucketId:    storageApi?.bucketId    || res.allowed?.bucketId || null,
    accountId:   res.accountId
  }
}

async function b2ListBuckets(auth) {
  const host = auth.apiUrl.replace(/^https?:\/\//, '')
  const res = await b2Request({
    hostname: host,
    path: '/b2api/v3/b2_list_buckets',
    headers: { Authorization: auth.authorizationToken }
  })
  return res.buckets || []
}

async function b2ListAllFiles(auth, bucketId) {
  const host = auth.apiUrl.replace(/^https?:\/\//, '')
  const files = []
  let startFileName = undefined

  while (true) {
    const params = new URLSearchParams({ bucketId, maxFileCount: '10000' })
    if (startFileName) params.set('startFileName', startFileName)
    const res = await b2Request({
      hostname: host,
      path: `/b2api/v3/b2_list_file_names?${params}`,
      headers: { Authorization: auth.authorizationToken }
    })
    if (!res.files) throw new Error(`B2 list error: ${JSON.stringify(res)}`)
    files.push(...res.files)
    process.stdout.write(`  Listed ${files.length} files…\r`)
    if (!res.nextFileName) break
    startFileName = res.nextFileName
  }
  console.log()
  return files
}

// ── Stem name normalization ───────────────────────────────────────────────────
// Extracts and normalizes the version suffix from the filename.
// Returns a canonical stem name used consistently in the DB.
function detectStemName(filename) {
  // Strip extension, grab last _TOKEN
  const base = filename.replace(/\.[^.]+$/, '')
  const m = base.match(/_([A-Za-z0-9]+)$/)
  if (!m) return 'FULL'
  return normalizeStem(m[1])
}

function normalizeStem(raw) {
  const u = raw.toUpperCase()

  // FULL variants
  if (u === 'FULL' || u === 'FULLWAV' || u === 'FULLMP3' || u === 'FULLFULL' || u === 'FULLA') return 'FULL'

  // DNB variants
  if (u === 'DNB' || u === 'DMB' || u === 'BND' || u === 'DANDB' || u === 'BAND D' || u === 'D&B') return 'DNB'
  if (u === 'NODNB' || u === 'NODNBA') return 'NoDNB'
  if (u === 'NODNBB') return 'NoDNBb'

  // STING variants
  if (u === 'STING' || u === 'STG' || u === 'STINGS' || u === 'STINGER' || u === 'STING1' || u === 'STING2') return 'STING'
  if (u === 'STINGA' || u === 'STNGA' || u === 'STGA' || u === 'STINGAWAV') return 'STINGa'
  if (u === 'STINGB' || u === 'STNGB' || u === 'STGB') return 'STINGb'
  if (u === 'STINGC' || u === 'STNGC') return 'STINGc'
  if (u === 'STINGERA') return 'STINGERa'
  if (u === 'STINGERB') return 'STINGERb'

  // BUMPER variants
  if (u === 'BUMPER' || u === 'BUMP' || u === 'BMPER' || u === 'BUMPERWAV' || u === 'BUMPERER' || u === 'BUMPER1') return 'BUMPER'
  if (u === 'BUMPERA' || u === 'BUMPERAWAV') return 'BUMPERa'
  if (u === 'BUMPERB' || u === 'BUMPERB' || u === 'BUMPER2') return 'BUMPERb'
  if (u === 'BUMPERC') return 'BUMPERc'
  if (u === 'BUMPERD') return 'BUMPERd'
  if (u === 'BUMPERE') return 'BUMPERe'

  // NoDrums variants
  if (/^NO(DRUMS?|DRMS?|SRUMS?|DRUMNS?)A?$/.test(u)) return u.endsWith('A') ? 'NoDrumsa' : 'NoDrums'

  // NoLead variants
  if (/^NO ?LEAD/.test(u)) {
    if (u.endsWith('A')) return 'NoLeada'
    return 'NoLead'
  }

  // NoDNB handled above

  // NoBass variants
  if (/^NO ?BASS$/.test(u)) return 'NoBass'

  // NoVox / NoVocals
  if (/^NO ?VOX$/.test(u) || /^NO ?VOCAL(S)?$/.test(u)) return 'NoVox'

  // NoPiano
  if (/^NO ?PIANO$/.test(u) || u === 'NOPIZZ') return 'NoPiano'

  // NoSynths
  if (/^NO ?SYNTH(S)?$/.test(u)) return 'NoSynths'

  // NoStrings
  if (/^NO ?STRINGS?$/.test(u)) return 'NoStrings'

  // NoPerc
  if (/^NO ?PERC(USSION)?$/.test(u)) return 'NoPerc'

  // NoGuitars
  if (/^NO ?GTR(S)?$/.test(u) || /^NO ?GUITAR(S)?$/.test(u)) return 'NoGuitars'

  // LowGtr variants
  if (/^(LOW|LO)(GTR(S)?|GUITAR(S)?)$/.test(u)) return 'LowGtr'

  // ALT variants — preserve a/b/c suffix, normalize case
  if (/^ALT/.test(u)) {
    const suffix = raw.slice(3) // preserve case of suffix letter
    return 'ALT' + suffix.toUpperCase()
  }

  // Time edits (30, 60, 15, etc.)
  if (/^\d+(SEC|S)?$/.test(u)) return raw.replace(/[Ss][Ee][Cc]|[Ss]$/, '') + 's'

  // DRUMS / PERC / BASS / etc — keep as canonical uppercase
  if (u === 'DRUMS' || u === 'DRUM') return 'DRUMS'
  if (u === 'PERC' || u === 'PERCUSSION') return 'PERC'
  if (u === 'BASS') return 'BASS'
  if (u === 'PIANO' || u === 'SOLOPIANO' || u === 'PIANOONLY') return 'PIANO'
  if (u === 'GUITAR' || u === 'GTR' || u === 'GUITARS' || u === 'GTRS' || u === 'SOLOGUITAR' || u === 'SOLOGUITARS') return 'GUITARS'
  if (u === 'STRINGS' || u === 'STRINGSONLY') return 'STRINGS'
  if (u === 'VOX' || u === 'VOXONLY' || u === 'VOC') return 'VOX'

  // SIB / specialty
  if (u === 'SIB') return 'SIB'

  // Fallback — keep as-is (unusual variants, composer-specific stems like S87eFULL)
  return raw
}

// ── Parse a B2 file key into its components ───────────────────────────────────
// B2 paths have variable depth. Track folder is always the 2nd-to-last segment,
// filename is the last. sku_root is the leading token of the track folder.
//
// Examples:
//   cirrus/C27_Aaron Saloman_CIRRUS/C27a2463_Space And Time/HAUS_..._FULL.wav
//   260625_Beta Lot 1/R48a5204_Some Title/HAUS_..._FULL.wav
//   some/deep/path/R48a5204_Some Title/HAUS_..._FULL.wav
function parseB2Key(fileName) {
  const parts = fileName.split('/')
  if (parts.length < 3) return null   // need at least album/trackFolder/file

  const filename    = parts[parts.length - 1]
  const trackFolder = parts[parts.length - 2]

  // Only process audio files
  const ext = filename.split('.').pop().toLowerCase()
  if (!['wav', 'mp3', 'aiff', 'aif'].includes(ext)) return null

  // sku_root is the leading alphanumeric token in the track folder
  // Track folder formats: "C27a2463_Space And Time", "R48a5204 - Some Title", "R48a5204"
  // sku_root: composer prefix + sequence digits (3-7 digits total)
  const skuMatch = trackFolder.match(/^([A-Z][A-Z0-9]*[a-zA-Z]\d{3,7})[\s_\-]/i)
    || trackFolder.match(/^([A-Z][A-Z0-9]*[a-zA-Z]\d{3,7})$/i)
  if (!skuMatch) return null

  const skuRoot  = skuMatch[1]
  const stemName = detectStemName(filename)
  const album    = parts[0]   // top-level folder = album or lot name

  return { album, trackFolder, filename, skuRoot, stemName, b2Key: fileName }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  mix_stems Rebuild from B2')
  console.log(DRY ? '  MODE: DRY RUN (pass --import to write)' : '  MODE: IMPORTING')
  console.log('══════════════════════════════════════════\n')

  // 1. Authorize
  process.stdout.write('  Authorizing with B2…')
  const auth = await b2Authorize()
  console.log(' ✓')

  // 2. Find bucket ID
  // Restricted app keys don't return buckets via list_buckets — ID is in auth response.
  process.stdout.write('  Finding bucket…')
  let bucketId = auth.bucketId
  if (!bucketId) {
    // Master key: fall back to listing buckets
    const buckets = await b2ListBuckets(auth)
    const bucket  = buckets.find(b => b.bucketName.toLowerCase() === B2_BUCKET.toLowerCase())
    if (!bucket) throw new Error(`Bucket "${B2_BUCKET}" not found. Available: ${buckets.map(b => b.bucketName).join(', ')}`)
    bucketId = bucket.bucketId
  }
  console.log(` ✓  ${B2_BUCKET} (${bucketId})`)

  // 3. List all files
  console.log('\n  Listing all files in bucket…')
  const allFiles = await b2ListAllFiles(auth, bucketId)
  console.log(`  ✓  ${allFiles.length} total files in bucket`)
  console.log('\n  Sample paths (first 20):')
  allFiles.slice(0, 20).forEach(f => console.log(`    ${f.fileName}`))
  console.log()

  // 4. Parse and filter to audio track files
  const parsed  = []
  const skipped = []
  for (const f of allFiles) {
    const p = parseB2Key(f.fileName)
    if (p) parsed.push(p)
    else skipped.push(f.fileName)
  }
  console.log(`  ✓  ${parsed.length} audio files parsed`)
  console.log(`  →  ${skipped.length} files skipped (non-audio or unrecognized path)`)

  if (VERBOSE && skipped.length > 0) {
    console.log('\n  Skipped files (sample):')
    skipped.slice(0, 20).forEach(f => console.log(`    ${f}`))
    if (skipped.length > 20) console.log(`    … and ${skipped.length - 20} more`)
  }

  // 5. Load all known sku_roots from DB (build both exact and lowercase maps)
  process.stdout.write('\n  Loading titles from DB…')
  const titleRows = await pool.query('SELECT sku_root FROM titles')
  const knownSkus    = new Set(titleRows.rows.map(r => r.sku_root))
  // Lower-case map: lowercase(sku_root) → canonical sku_root (for case-insensitive fallback)
  const lowerSkuMap  = new Map(titleRows.rows.map(r => [r.sku_root.toLowerCase(), r.sku_root]))
  console.log(` ✓  ${knownSkus.size} titles loaded`)

  // 6. Group by sku_root, check for matches (exact first, then case-insensitive)
  const matched   = []
  const unmatched = []
  let caseFixes   = 0
  for (const p of parsed) {
    if (knownSkus.has(p.skuRoot)) {
      matched.push(p)
    } else {
      // Case-insensitive fallback — handles legacy uppercase sku_roots (C32B4433 vs C32b4433)
      const canonical = lowerSkuMap.get(p.skuRoot.toLowerCase())
      if (canonical) {
        matched.push({ ...p, skuRoot: canonical })
        caseFixes++
      } else {
        unmatched.push(p)
      }
    }
  }
  if (caseFixes > 0) console.log(`  →  ${caseFixes} files matched via case-insensitive fallback`)

  console.log(`  ✓  ${matched.length} files match a title in DB`)
  if (unmatched.length > 0) {
    console.log(`  ⚠  ${unmatched.length} files have no matching title (new tracks or bad path?)`)
    console.log('\n  Unmatched sample (first 20):')
    unmatched.slice(0, 20).forEach(p => console.log(`    ${p.b2Key}  →  sku_root="${p.skuRoot}"`))
    if (unmatched.length > 20) console.log(`    … and ${unmatched.length - 20} more (--verbose for all)`)
  }

  // Stem name distribution
  const stemCounts = {}
  for (const p of matched) stemCounts[p.stemName] = (stemCounts[p.stemName] || 0) + 1
  console.log('\n  Stem distribution:')
  for (const [stem, cnt] of Object.entries(stemCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${stem.padEnd(10)} ${cnt}`)
  }

  // Album/lot distribution
  const albumCounts = {}
  for (const p of matched) albumCounts[p.album] = (albumCounts[p.album] || 0) + 1
  console.log('\n  Album/lot distribution:')
  for (const [album, cnt] of Object.entries(albumCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(cnt).padStart(5)}  ${album}`)
  }

  if (DRY) {
    console.log('\n  DRY RUN — no DB changes made.')
    console.log('  Run with --import to write to mix_stems.\n')
    await pool.end()
    return
  }

  // 7. Bulk-insert into mix_stems (500 rows per query for speed)
  console.log('\n  Inserting into mix_stems…')
  let inserted = 0, errors = 0
  const BATCH = 500

  for (let i = 0; i < matched.length; i += BATCH) {
    const batch = matched.slice(i, i + BATCH)
    // Build multi-row VALUES: ($1,$2,$3,$4),($5,$6,$7,$8),...
    const values = []
    const params = []
    let idx = 1
    for (const p of batch) {
      values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3})`)
      params.push(p.skuRoot, p.stemName, p.filename, p.b2Key)
      idx += 4
    }
    try {
      const r = await pool.query(
        `INSERT INTO mix_stems (sku_root, stem_name, filename, b2_key)
         VALUES ${values.join(',')}
         ON CONFLICT DO NOTHING`,
        params
      )
      inserted += r.rowCount
    } catch (e) {
      errors++
      if (errors <= 5) console.error(`  ✗  batch at ${i}: ${e.message}`)
      // Fall back to row-by-row for this batch to isolate bad rows
      for (const p of batch) {
        try {
          const r = await pool.query(
            `INSERT INTO mix_stems (sku_root, stem_name, filename, b2_key)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [p.skuRoot, p.stemName, p.filename, p.b2Key]
          )
          inserted += r.rowCount
        } catch (e2) {
          if (errors <= 10) console.error(`  ✗  ${p.b2Key}: ${e2.message}`)
        }
      }
    }
    process.stdout.write(`  ${Math.min(i + BATCH, matched.length)} / ${matched.length}\r`)
  }

  console.log(`\n\n  ✅ Inserted: ${inserted}`)
  if (errors) console.log(`  ✗  Errors: ${errors}`)

  // Verify
  const check = await pool.query('SELECT COUNT(*) FROM mix_stems')
  console.log(`\n  mix_stems total rows now: ${check.rows[0].count}`)

  await pool.end()
}

run().catch(async e => {
  console.error('\n[rebuild-mix-stems] Fatal:', e.message)
  await pool.end()
  process.exit(1)
})
