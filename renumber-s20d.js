// renumber-s20d.js
// Renumbers S20d tracks from sequences 935-948 → 94-107.
// Fixes: DB (titles, lot_titles, mix_stems, playlist_tracks),
//        B2 key paths, shipping folder names, sku_sequences counter.
//
// Usage:
//   node renumber-s20d.js            — dry run (preview only, no changes)
//   node renumber-s20d.js --execute  — apply all changes

const { Pool }  = require('pg')
const https     = require('https')
const fs        = require('fs')
const path      = require('path')
const os        = require('os')

const DRY = !process.argv.includes('--execute')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

// ── SKU map: old → new ────────────────────────────────────────────────────────
// seq 935-948 → 93-106, album digit stays '4'
const SKU_MAP = {}
for (let i = 0; i < 14; i++) {
  const oldSeq = 935 + i
  const newSeq = 94  + i
  const oldSku = 'S20d' + String(oldSeq).padStart(3,'0') + '4'   // S20d9354 … S20d9484
  const newSku = 'S20d' + String(newSeq).padStart(3,'0') + '4'   // S20d0944 … S20d1074
  SKU_MAP[oldSku] = newSku
}

// ── Load cfg for shipping + B2 ────────────────────────────────────────────────
function loadCfg() {
  try {
    const p = path.join(os.homedir(), '.haus-workspace-cfg.json')
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch { return {} }
}

// ── B2 helpers ────────────────────────────────────────────────────────────────
let b2Auth = null

async function b2Authorize(keyId, appKey) {
  return new Promise((resolve, reject) => {
    const creds = Buffer.from(`${keyId}:${appKey}`).toString('base64')
    const req = https.request({
      hostname: 'api.backblazeb2.com',
      path:     '/b2api/v2/b2_authorize_account',
      headers:  { Authorization: `Basic ${creds}` }
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.end()
  })
}

async function b2Request(auth, path, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(auth.apiUrl + path)
    const data = JSON.stringify(body)
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        Authorization:  auth.authorizationToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let out = ''
      res.on('data', d => out += d)
      res.on('end', () => resolve(JSON.parse(out)))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function b2CopyFile(auth, bucketId, oldKey, newKey) {
  // B2 copy: b2_copy_file (server-side, no download)
  const r = await b2Request(auth, '/b2api/v2/b2_copy_file', {
    sourceFileId:    null,  // will fill in
    fileName:        newKey,
    destinationBucketId: bucketId,
    range:           null,
    metadataDirective: 'COPY'
  })
  return r
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const cfg = loadCfg()

  console.log('\n══════════════════════════════════════════')
  console.log('  S20d SKU Renumber: 935-948 → 94-107')
  console.log(DRY ? '  MODE: DRY RUN (no changes will be made)' : '  MODE: EXECUTE — MAKING CHANGES')
  console.log('══════════════════════════════════════════\n')

  console.log('  SKU mapping:')
  for (const [o, n] of Object.entries(SKU_MAP)) console.log(`    ${o}  →  ${n}`)
  console.log()

  // ── 1. Confirm all 14 tracks exist in DB ─────────────────────────────────
  const oldSkus  = Object.keys(SKU_MAP)
  const { rows: existing } = await pool.query(
    `SELECT sku_root, title FROM titles WHERE sku_root = ANY($1) ORDER BY sku_root`,
    [oldSkus]
  )
  console.log(`─── DB: titles (${existing.length}/14 found) ───`)
  for (const r of existing) console.log(`  ${r.sku_root}  "${r.title}"`)
  const missing = oldSkus.filter(s => !existing.find(r => r.sku_root === s))
  if (missing.length) console.warn(`  ⚠  Not in DB: ${missing.join(', ')}`)
  console.log()

  // ── 2. Collision check — make sure new SKUs don't already exist ───────────
  const newSkus = Object.values(SKU_MAP)
  const { rows: collisions } = await pool.query(
    `SELECT sku_root, title FROM titles WHERE sku_root = ANY($1)`,
    [newSkus]
  )
  if (collisions.length) {
    console.error('  ✗  NEW SKU COLLISIONS — cannot proceed:')
    collisions.forEach(r => console.error(`     ${r.sku_root} already exists: "${r.title}"`))
    await pool.end(); process.exit(1)
  }
  console.log('  ✓  No new-SKU collisions\n')

  // ── 3. Check mix_stems ────────────────────────────────────────────────────
  const { rows: stems } = await pool.query(
    `SELECT sku_root, mix_stem_id, filename, b2_key FROM mix_stems WHERE sku_root = ANY($1) ORDER BY sku_root, mix_stem_id`,
    [oldSkus]
  )
  console.log(`─── DB: mix_stems (${stems.length} rows) ───`)
  for (const s of stems) console.log(`  ${s.sku_root}  ${s.filename}  b2=${s.b2_key || 'null'}`)
  console.log()

  // ── 4. Check playlist_tracks ──────────────────────────────────────────────
  const { rows: plTracks } = await pool.query(
    `SELECT pt.sku_root, p.name AS playlist FROM playlist_tracks pt JOIN playlists p ON p.id=pt.playlist_id WHERE pt.sku_root = ANY($1)`,
    [oldSkus]
  )
  if (plTracks.length) {
    console.log(`─── DB: playlist_tracks (${plTracks.length} rows) ───`)
    plTracks.forEach(r => console.log(`  ${r.sku_root}  in playlist "${r.playlist}"`))
    console.log()
  } else {
    console.log('  ✓  No playlist_tracks entries for these SKUs\n')
  }

  // ── 5. Check shipping folder ──────────────────────────────────────────────
  const shipping = cfg.hausjup
  const diskRenames = []
  if (shipping) {
    console.log(`─── Disk: shipping folder ───`)
    for (const [oldSku, newSku] of Object.entries(SKU_MAP)) {
      try {
        const lots = fs.readdirSync(shipping)
        let found = false
        for (const lot of lots) {
          const lotPath = path.join(shipping, lot)
          try {
            const tracks = fs.readdirSync(lotPath)
            const match  = tracks.find(t => t.startsWith(oldSku.slice(0,7)))
            if (match) {
              const oldTrackPath = path.join(lotPath, match)
              // New folder name: replace old sku prefix with new sku prefix in folder name
              const newFolderName = match.replace(oldSku.slice(0,7), newSku.slice(0,7))
              const newTrackPath  = path.join(lotPath, newFolderName)
              // Audio files inside also need renaming (they contain the SKU)
              const audioFiles = fs.readdirSync(oldTrackPath)
              diskRenames.push({ oldTrackPath, newTrackPath, oldFolderName: match, newFolderName, lot, audioFiles })
              console.log(`  ${oldSku} → ${newSku}  |  ${lot}/${match}  →  ${newFolderName}`)
              found = true; break
            }
          } catch {}
        }
        if (!found) console.warn(`  ⚠  ${oldSku}: no shipping folder found`)
      } catch {}
    }
    console.log()
  } else {
    console.warn('  ⚠  hausjup not in cfg — skipping disk rename preview\n')
  }

  // ── 6. B2 key preview ─────────────────────────────────────────────────────
  const b2Renames = []
  for (const s of stems) {
    if (!s.b2_key) continue
    const newSku   = SKU_MAP[s.sku_root]
    if (!newSku) continue
    // b2_key format: {composerFolder}/{trackFolder}/{filename}
    // Replace old sku prefix (first 7 chars without album digit) in both folder and filename
    const oldPrefix = s.sku_root.slice(0,7)
    const newPrefix = newSku.slice(0,7)
    const newB2Key  = s.b2_key.split('/').map(part => part.replace(oldPrefix, newPrefix)).join('/')
    b2Renames.push({ stemId: s.mix_stem_id, oldKey: s.b2_key, newB2Key, newSku })
  }
  if (b2Renames.length) {
    console.log(`─── B2: ${b2Renames.length} file key renames ───`)
    b2Renames.slice(0, 6).forEach(r => console.log(`  ${r.oldKey}\n    → ${r.newB2Key}`))
    if (b2Renames.length > 6) console.log(`  … and ${b2Renames.length - 6} more`)
    console.log()
  }

  if (DRY) {
    console.log('══════════════════════════════════════════')
    console.log('  DRY RUN complete — no changes made.')
    console.log('  Re-run with --execute to apply.\n')
    await pool.end(); return
  }

  // ════════════════════════════════════════════
  // EXECUTE MODE
  // ════════════════════════════════════════════
  console.log('─── Applying changes… ───\n')

  // B2 auth
  let b2AuthData = null
  if (b2Renames.length && cfg.b2KeyId && cfg.b2AppKey) {
    console.log('  Authorizing B2…')
    b2AuthData = await b2Authorize(cfg.b2KeyId, cfg.b2AppKey)
    console.log(`  ✓  B2 authorized (bucket: ${cfg.b2BucketId || 'check app'})\n`)
  } else if (b2Renames.length) {
    console.warn('  ⚠  B2 credentials not found in cfg — skipping B2 renames. Update mix_stems.b2_key only.\n')
  }

  // ── DB: update in a single transaction ──────────────────────────────────
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const [oldSku, newSku] of Object.entries(SKU_MAP)) {
      // titles
      await client.query(`UPDATE titles SET sku_root=$1 WHERE sku_root=$2`, [newSku, oldSku])
      // lot_titles
      await client.query(`UPDATE lot_titles SET sku_root=$1 WHERE sku_root=$2`, [newSku, oldSku])
      // playlist_tracks
      await client.query(`UPDATE playlist_tracks SET sku_root=$1 WHERE sku_root=$2`, [newSku, oldSku])
      // mix_stems — sku_root + b2_key
      for (const r of b2Renames.filter(b => b.newSku === newSku)) {
        await client.query(
          `UPDATE mix_stems SET sku_root=$1, b2_key=$2 WHERE mix_stem_id=$3`,
          [newSku, r.newB2Key, r.stemId]
        )
      }
      console.log(`  DB  ${oldSku} → ${newSku}`)
    }

    // sku_sequences: reset to 107 (93 + 14 tracks used)
    await client.query(
      `UPDATE sku_sequences SET next_seq=108 WHERE composer_full_id='S20d'`,
    )
    // also fix teams table
    await client.query(
      `UPDATE teams SET next_seq=108 WHERE composer_full_id='S20d'`,
    )
    console.log(`  DB  sku_sequences S20d → next_seq=107`)

    await client.query('COMMIT')
    console.log('\n  ✓  DB transaction committed\n')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('  ✗  DB transaction ROLLED BACK:', e.message)
    await pool.end(); process.exit(1)
  } finally {
    client.release()
  }

  // ── Disk: rename shipping folders ────────────────────────────────────────
  for (const { oldTrackPath, newTrackPath, oldFolderName, newFolderName, lot, audioFiles } of diskRenames) {
    try {
      // Rename audio files inside the track folder first (they embed the SKU in filename)
      // Find the old 7-char prefix in filenames and replace
      const oldMatch = Object.keys(SKU_MAP).find(s => oldFolderName.startsWith(s.slice(0,7)))
      const newMatch = oldMatch ? SKU_MAP[oldMatch] : null
      if (oldMatch && newMatch) {
        const oldPrefix7 = oldMatch.slice(0,7)
        const newPrefix7 = newMatch.slice(0,7)
        for (const fname of audioFiles) {
          if (fname.includes(oldPrefix7)) {
            const newFname = fname.replace(oldPrefix7, newPrefix7)
            fs.renameSync(path.join(oldTrackPath, fname), path.join(oldTrackPath, newFname))
            console.log(`  Disk  ${fname} → ${newFname}`)
          }
        }
      }
      // Rename the track folder itself
      fs.renameSync(oldTrackPath, newTrackPath)
      console.log(`  Disk  ${lot}/${oldFolderName} → ${newFolderName}`)
    } catch (e) {
      console.error(`  ✗  Disk rename failed for ${oldFolderName}:`, e.message)
    }
  }

  // ── B2: copy files to new keys, then hide old keys ───────────────────────
  if (b2AuthData && cfg.b2BucketId) {
    console.log(`\n  B2: renaming ${b2Renames.length} files…`)
    // We can't directly rename in B2 — must list, copy, hide (delete version)
    // Use b2_list_file_names to get fileId, then b2_copy_file, then b2_hide_file

    for (const r of b2Renames) {
      try {
        // List to get fileId of old key
        const listed = await b2Request(b2AuthData, '/b2api/v2/b2_list_file_names', {
          bucketId:       cfg.b2BucketId,
          startFileName:  r.oldKey,
          maxFileCount:   1,
          prefix:         r.oldKey
        })
        const file = listed.files?.[0]
        if (!file || file.fileName !== r.oldKey) {
          console.warn(`  ⚠  B2: not found: ${r.oldKey}`)
          continue
        }
        // Copy to new key
        const copied = await b2Request(b2AuthData, '/b2api/v2/b2_copy_file', {
          sourceFileId:        file.fileId,
          fileName:            r.newB2Key,
          destinationBucketId: cfg.b2BucketId,
          metadataDirective:   'COPY'
        })
        if (copied.fileId) {
          // Hide (soft-delete) the old key
          await b2Request(b2AuthData, '/b2api/v2/b2_hide_file', {
            bucketId: cfg.b2BucketId,
            fileName: r.oldKey
          })
          console.log(`  B2  ${r.oldKey.split('/').pop()} → ${r.newB2Key.split('/').pop()}`)
        } else {
          console.error(`  ✗  B2 copy failed for ${r.oldKey}:`, JSON.stringify(copied))
        }
      } catch (e) {
        console.error(`  ✗  B2 error for ${r.oldKey}:`, e.message)
      }
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log('  ✅  Renumber complete.')
  console.log('  Run: node sku-audit.js --verbose')
  console.log('  to verify S20d sequences are clean.\n')
  await pool.end()
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
