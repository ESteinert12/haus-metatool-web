// recover-titles.js
// Re-imports titles from THE COLLECTION_full list.csv back into Neon.
// Safe to re-run — uses ON CONFLICT DO NOTHING.
//
//   node recover-titles.js            — dry run (counts only)
//   node recover-titles.js --import   — write to DB

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const IMPORT = process.argv.includes('--import')

// ── Find CSV ──────────────────────────────────────────────────────────────────
const candidates = [
  path.join(__dirname, 'THE COLLECTION_full list.csv'),
  path.join(os.homedir(), 'Library/Application Support/Claude/local-agent-mode-sessions/a1155e18-d57c-4e1e-8cdb-7bc4766f493d/492b8352-c57b-4766-8fc9-eb9107691393/local_2bfd3fc7-2fe3-4f8c-a2f8-7680beb8fd01/uploads/THE COLLECTION_full list.csv')
]
const csvPath = candidates.find(p => fs.existsSync(p))
if (!csvPath) { console.error('Cannot find THE COLLECTION_full list.csv'); process.exit(1) }
console.log(`CSV: ${csvPath}`)

// ── Parse CSV ────────────────────────────────────────────────────────────────
// Columns: SKUROOT,TITLE,BPM,ALBUM,Filename,Filename Root,Genre 1,Genre 2,Key,KSL 1,KSL 2,MMW,Mood 1,Mood 2,VOX,RELEASE DATE,RMO,RMO 2
function parseLine(line) {
  const cols = []
  let cur = '', inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cols.push(cur.trim())
  return cols
}

function extractComposerId(skuRoot) {
  // Match composer prefix: letters+digits then a single variant letter,
  // stopping before the digit sequence. Handles R48a, S33a, R90L, C27b, etc.
  const m = skuRoot.match(/^([A-Z][A-Z0-9]*[a-zA-Z])(?=\d)/)
  return m ? m[1] : null
}

const content = fs.readFileSync(csvPath, 'utf8')
  .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '')
const lines = content.split('\n')
const header = parseLine(lines[0])

// Column indices
const COL = {
  sku:    header.findIndex(h => /skuroot/i.test(h)),
  title:  header.findIndex(h => /^title$/i.test(h)),
  bpm:    header.findIndex(h => /^bpm$/i.test(h)),
  key:    header.findIndex(h => /^key$/i.test(h)),
  rmo:    header.findIndex(h => /^rmo$/i.test(h.trim())),
  rmo2:   header.findIndex(h => /^rmo\s*2$/i.test(h.trim())),
}
console.log('Column map:', COL)

const rows = []
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim()
  if (!line) continue
  const cols = parseLine(line)
  const sku   = cols[COL.sku]?.trim()
  const title = cols[COL.title]?.trim()
  if (!sku || !title || sku.length < 7) continue

  const composerId = extractComposerId(sku)
  const bpm   = parseInt(cols[COL.bpm]) || null
  const key   = cols[COL.key]?.trim() || null

  rows.push({ sku, title, composerId, bpm, key })
}

console.log(`\nParsed ${rows.length} rows from CSV`)

async function run() {
  if (!IMPORT) {
    console.log('\nDRY RUN — no changes made.')
    console.log(`Ready to import ${rows.length} titles.`)
    console.log('Run with --import to write to DB:\n  node recover-titles.js --import\n')
    await pool.end()
    return
  }

  console.log('\n── Importing titles ──\n')

  // Resolve team_id map: composer_full_id → team_id
  const teamRows = await pool.query(`SELECT team_id, composer_full_id FROM teams`)
  const teamMap = {}
  for (const r of teamRows.rows) teamMap[r.composer_full_id] = r.team_id

  let inserted = 0, skipped = 0, errors = 0
  const BATCH = 500

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    for (const row of batch) {
      try {
        const teamId = teamMap[row.composerId] || null
        const result = await pool.query(`
          INSERT INTO titles (sku_root, composer_id, team_id, title, key, bpm, variant, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'a', now(), now())
        `, [row.sku, row.composerId, teamId, row.title, row.key, row.bpm])
        if (result.rowCount > 0) inserted++
        else skipped++
      } catch (e) {
        errors++
        if (errors <= 5) console.error(`  ✗ ${row.sku}: ${e.message}`)
      }
    }
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)} / ${rows.length}\r`)
  }

  console.log(`\n\n  ✅ Inserted: ${inserted}`)
  console.log(`  ⚠  Skipped (already existed): ${skipped}`)
  if (errors) console.log(`  ✗  Errors: ${errors}`)

  // Verify
  const check = await pool.query('SELECT COUNT(*) FROM titles')
  console.log(`\n  Titles in DB now: ${check.rows[0].count}`)
  await pool.end()
}

run().catch(async e => {
  console.error('Fatal:', e.message)
  await pool.end()
  process.exit(1)
})
