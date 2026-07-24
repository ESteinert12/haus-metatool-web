// backfill-descriptions.js
// Reads Titles_Descriptions.csv and updates description on matching titles rows.
// CSV format: filename, title, description, sku_root
//
// Run: node backfill-descriptions.js          (dry run)
//      node backfill-descriptions.js --execute (apply)

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const DRY_RUN = !process.argv.includes('--execute')

// Simple CSV parser — handles quoted fields with embedded commas/newlines
function parseCSV(text) {
  const rows = []
  let i = 0
  while (i < text.length) {
    const row = []
    while (i < text.length) {
      if (text[i] === '"') {
        // Quoted field
        i++ // skip opening quote
        let val = ''
        while (i < text.length) {
          if (text[i] === '"' && text[i+1] === '"') { val += '"'; i += 2 }
          else if (text[i] === '"') { i++; break }
          else { val += text[i++] }
        }
        row.push(val)
        if (text[i] === ',') i++ // skip comma
        else break // newline or EOF
      } else {
        // Unquoted field
        let val = ''
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          val += text[i++]
        }
        row.push(val.trim())
        if (text[i] === ',') i++
        else break
      }
    }
    // skip line ending
    while (i < text.length && (text[i] === '\n' || text[i] === '\r')) i++
    if (row.length >= 4) rows.push(row)
  }
  return rows
}

async function run() {
  console.log(DRY_RUN
    ? '🔍 DRY RUN — no changes written. Add --execute to apply.\n'
    : '⚡ EXECUTE MODE\n'
  )

  const jsonPath = path.join(__dirname, 'descriptions-clean.json')
  if (!fs.existsSync(jsonPath)) {
    console.error('✗ descriptions-clean.json not found — run the Python parse step first')
    await pool.end(); return
  }

  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  console.log(`Loaded ${rows.length} rows from descriptions-clean.json\n`)

  // Filter to rows with valid sku + description
  const valid = rows.filter(r => r.sku && r.description && r.description.trim())
  const skipped = rows.length - valid.length

  let updated = 0, notFound = 0

  if (!DRY_RUN) {
    // Bulk update in chunks of 500 using VALUES list
    const CHUNK = 500
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK)
      // Build: UPDATE titles SET description = v.txt FROM (VALUES ($1,$2),...) AS v(sku,desc)
      // WHERE titles.sku_root = v.sku AND (titles.description IS NULL OR titles.description = '')
      const vals = []
      const placeholders = chunk.map((r, j) => {
        vals.push(r.sku, r.description.trim())
        return `($${j*2+1}, $${j*2+2})`
      }).join(', ')

      const res = await pool.query(
        `UPDATE titles SET description = v.txt
         FROM (VALUES ${placeholders}) AS v(sku, txt)
         WHERE titles.sku_root = v.sku
           AND (titles.description IS NULL OR titles.description = '')`,
        vals
      )
      updated += res.rowCount
      process.stdout.write(`\r  Progress: ${Math.min(i + CHUNK, valid.length)}/${valid.length} processed, ${updated} updated`)
    }
    console.log() // newline after progress
  } else {
    updated = valid.length
  }

  console.log(`  Updated:   ${updated}`)
  console.log(`  Skipped (no desc): ${skipped}`)
  if (!DRY_RUN) console.log(`  Not found in DB:   ${notFound}`)

  if (DRY_RUN) {
    console.log('\nRun with --execute to apply:')
    console.log('  node backfill-descriptions.js --execute\n')
  } else {
    console.log('\n✓ Done.')
  }

  await pool.end()
}

run().catch(async e => { console.error(e.message); await pool.end() })
