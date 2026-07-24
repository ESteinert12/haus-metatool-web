// title-collision-fix.js
// Resolves the 490 collision sku_roots where two different songs share the same
// 8-char sku_root. This happens for composers with 1000+ songs:
//   - Song at seq=101 + album digit → R13a1011 (8 chars, correct)
//   - Song at seq=1011 stored without album digit → R13a1011 (8 chars, WRONG)
//
// Uses THE COLLECTION_full list.csv (which has TITLE column) to find the
// correct sku_root for each title, then updates the misassigned ones.
// Also moves the wrong title's stems to the correct sku_root.
//
//   node title-collision-fix.js            — dry run + save collision-fix.csv
//   node title-collision-fix.js --fix      — apply fixes

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX = process.argv.includes('--fix')

// ── Load master list: (title_lower, composer_id) → correct sku_root ───────────
function loadMaster() {
  const UPLOADS = path.join(os.homedir(),
    'Library/Application Support/Claude/local-agent-mode-sessions/a1155e18-d57c-4e1e-8cdb-7bc4766f493d/492b8352-c57b-4766-8fc9-eb9107691393/local_2bfd3fc7-2fe3-4f8c-a2f8-7680beb8fd01/uploads'
  )
  const candidates = [
    path.join(__dirname, 'THE COLLECTION_full list.csv'),
    path.join(UPLOADS, 'THE COLLECTION_full list.csv')
  ]
  const masterPath = candidates.find(p => fs.existsSync(p))
  if (!masterPath) throw new Error('Cannot find THE COLLECTION_full list.csv')
  console.log(`Master file: ${masterPath}`)

  const byTitleComposer = {}  // "composerId|title_lower" → sku_root
  const byTitle         = {}  // "title_lower" → sku_root (fallback if unambiguous)
  const titleCounts     = {}  // track how many times each title appears

  const content = fs.readFileSync(masterPath, 'utf8')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '')

  let isFirst = true
  for (const line of content.split('\n')) {
    if (isFirst) { isFirst = false; continue }  // skip header
    const cols = line.split(',')
    if (cols.length < 2) continue
    const sku      = cols[0].trim().replace(/^"|"$/g, '')
    const title    = cols[1].trim().replace(/^"|"$/g, '')
    const filename = cols[4] ? cols[4].trim().replace(/^"|"$/g, '') : ''  // col 4 = Filename

    if (!sku || !title || sku.length < 8) continue

    // Extract composer from filename: HAUS_Title_Key_ComposerID_Version
    const parts = filename.split('_')
    // Composer ID is typically the 4th segment (index 3)
    const composerId = parts.length >= 4 ? parts[3].trim() : ''

    const titleKey    = title.toLowerCase()
    const composerKey = composerId ? `${composerId.toLowerCase()}|${titleKey}` : null

    if (composerKey) byTitleComposer[composerKey] = sku
    titleCounts[titleKey] = (titleCounts[titleKey] || 0) + 1
    if (!byTitle[titleKey]) byTitle[titleKey] = sku
    else byTitle[titleKey] = null  // ambiguous — multiple songs with same title
  }

  return { byTitleComposer, byTitle, titleCounts }
}

function lookupSku(master, title, composerId) {
  const titleKey    = title.toLowerCase().trim()
  const composerKey = `${composerId.toLowerCase()}|${titleKey}`
  return master.byTitleComposer[composerKey]
      || (master.byTitle[titleKey] || null)  // null if ambiguous
}

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Title Collision Fix')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: DRY RUN')
  console.log('══════════════════════════════════════════\n')

  console.log('Loading master list...')
  const master = loadMaster()
  console.log(`Master entries: ${Object.keys(master.byTitleComposer).length} (composer+title)\n`)

  // Find all collision sku_roots with full row data
  const dups = await pool.query(`
    SELECT t.ctid, t.sku_root, t.title, t.composer_id
    FROM titles t
    WHERE t.sku_root IN (
      SELECT sku_root FROM titles
      GROUP BY sku_root HAVING COUNT(*) > 1
    )
    ORDER BY t.sku_root, t.ctid
  `)

  // Group by sku_root
  const groups = {}
  for (const row of dups.rows) {
    if (!groups[row.sku_root]) groups[row.sku_root] = []
    groups[row.sku_root].push(row)
  }

  const toFix       = []  // { stayRow, moveRow, newSku }
  const noMasterMatch = []
  const ambiguous   = []

  for (const [sku, rows] of Object.entries(groups)) {
    const resolved = rows.map(r => ({
      ...r,
      correctSku: lookupSku(master, r.title, r.composer_id)
    }))

    // Both need a master list match
    const allMatched = resolved.every(r => r.correctSku)
    if (!allMatched) {
      noMasterMatch.push({ sku, rows: resolved })
      continue
    }

    // Find which title belongs at the current sku and which needs to move
    const stay = resolved.find(r => r.correctSku === sku)
    const move = resolved.find(r => r.correctSku !== sku)

    if (!stay || !move) {
      // Both say different sku, or both say same sku — ambiguous
      ambiguous.push({ sku, rows: resolved })
      continue
    }

    // Verify move target doesn't already exist in titles (would create new collision)
    toFix.push({ stayRow: stay, moveRow: move, currentSku: sku, newSku: move.correctSku })
  }

  console.log(`  Total collision groups:    ${Object.keys(groups).length}`)
  console.log(`  Resolvable via master list: ${toFix.length}`)
  console.log(`  No master list match:       ${noMasterMatch.length}`)
  console.log(`  Ambiguous (same/both wrong): ${ambiguous.length}`)

  // Show sample
  if (toFix.length > 0) {
    console.log('\n  Sample moves:')
    toFix.slice(0, 10).forEach(({ stayRow, moveRow, currentSku, newSku }) => {
      console.log(`\n    Collision at: ${currentSku}`)
      console.log(`      KEEP: "${stayRow.title}" [${stayRow.composer_id}]  stays at ${currentSku}`)
      console.log(`      MOVE: "${moveRow.title}" [${moveRow.composer_id}]  → ${newSku}`)
    })
    if (toFix.length > 10) console.log(`\n  ... and ${toFix.length - 10} more`)
  }

  if (noMasterMatch.length > 0) {
    console.log(`\n  ⚠  No master match (top 10):`)
    noMasterMatch.slice(0, 10).forEach(({ sku, rows }) => {
      console.log(`\n    ${sku}:`)
      rows.forEach(r => console.log(`      "${r.title}" [${r.composer_id}] → master lookup: ${r.correctSku || 'NOT FOUND'}`))
    })
  }

  // Collision check: do any newSku targets already exist?
  const newSkus = toFix.map(f => f.newSku)
  const existing = newSkus.length
    ? await pool.query(`SELECT sku_root FROM titles WHERE sku_root = ANY($1)`, [newSkus])
    : { rows: [] }
  const existingSet = new Set(existing.rows.map(r => r.sku_root))
  const newCollisions = toFix.filter(f => existingSet.has(f.newSku))
  if (newCollisions.length > 0) {
    console.log(`\n  ⚠  ${newCollisions.length} target sku_roots already occupied (will skip):`)
    newCollisions.slice(0, 5).forEach(f =>
      console.log(`    ${f.newSku}  (for "${f.moveRow.title}")`)
    )
  }
  const fixable = toFix.filter(f => !existingSet.has(f.newSku))
  console.log(`\n  Fixable (no new collision): ${fixable.length}`)

  // Export CSV
  const outPath = path.join(__dirname, 'collision-fix.csv')
  const esc = v => `"${String(v||'').replace(/"/g,'""')}"`
  const lines = ['action,collision_sku,title,composer,correct_sku']
  fixable.forEach(({ stayRow, moveRow, currentSku, newSku }) => {
    lines.push(['KEEP', currentSku, esc(stayRow.title), stayRow.composer_id, currentSku].join(','))
    lines.push(['MOVE', currentSku, esc(moveRow.title), moveRow.composer_id, newSku].join(','))
  })
  noMasterMatch.forEach(({ sku, rows }) =>
    rows.forEach(r => lines.push(['NO_MATCH', sku, esc(r.title), r.composer_id, ''].join(',')))
  )
  ambiguous.forEach(({ sku, rows }) =>
    rows.forEach(r => lines.push(['AMBIGUOUS', sku, esc(r.title), r.composer_id, r.correctSku||''].join(',')))
  )
  fs.writeFileSync(outPath, lines.join('\n'))
  console.log(`\n  → Saved collision-fix.csv (${lines.length - 1} rows)`)

  if (!FIX) {
    console.log(`\nRun with --fix to apply ${fixable.length} title moves:`)
    console.log('  node title-collision-fix.js --fix\n')
    await pool.end()
    return
  }

  // Apply fixes
  console.log(`\n─── Applying ${fixable.length} title sku_root moves ───\n`)
  let done = 0
  let stemsMoved = 0

  for (const { moveRow, currentSku, newSku } of fixable) {
    if (existingSet.has(newSku)) continue  // skip new collisions

    // Update the title's sku_root
    await pool.query(`UPDATE titles SET sku_root=$1 WHERE ctid=$2`, [newSku, moveRow.ctid])
    await pool.query(`UPDATE title_moods SET sku_root=$1 WHERE sku_root=$2`, [newSku, currentSku])
    await pool.query(`UPDATE title_rmo   SET sku_root=$1 WHERE sku_root=$2`, [newSku, currentSku])

    // Move the stems that belong to this title using filename matching
    // Filename format: HAUS_TitleCamelCase_Key_ComposerID_Version
    // Try to match stem filenames to the title being moved
    const words = moveRow.title.split(/\s+/).filter(w => w.length > 2)
    if (words.length > 0) {
      // Build a pattern that matches if the title words appear consecutively in the filename
      const titlePattern = words.join('').replace(/[^a-zA-Z0-9]/g, '')  // CamelCase-like
      const stemResult = await pool.query(`
        UPDATE mix_stems
        SET sku_root = $1
        WHERE sku_root = $2
          AND (
            replace(replace(filename, ' ', ''), '-', '') ILIKE $3
            OR filename ILIKE $4
          )
        RETURNING 1
      `, [newSku, currentSku,
          `%HAUS_${titlePattern}%`,
          `%${words[0]}%`
      ])
      stemsMoved += stemResult.rowCount
    }

    done++
    if (done % 50 === 0) process.stdout.write(`  ${done} / ${fixable.length}\r`)
  }

  console.log(`\n  ✅ ${done} titles moved to correct sku_root.`)
  console.log(`  ✅ ~${stemsMoved} stem rows moved to match.`)
  if (noMasterMatch.length + ambiguous.length > 0)
    console.log(`  ⚠  ${noMasterMatch.length + ambiguous.length} collisions still need manual review — see collision-fix.csv`)
  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[collision-fix] Error:', e.message)
  await pool.end()
  process.exit(1)
})
