// Read-only: what does MusicMark's own "comments" field say for the rows
// that came back with an NP (not RA/AC) status, and does the original
// submitted file for those sku_roots actually have a Writer IPI Name# gap?
require('dotenv').config()
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function main() {
  const { rows } = await pool.query(`
    SELECT sku_root, work_title, status, comments, source_file
    FROM ebr_acknowledgments
    WHERE status NOT IN ('RA','AC')
    ORDER BY source_file, sku_root
  `)
  console.log('Total non-RA/AC acknowledgment rows:', rows.length)

  const statusCounts = {}
  for (const r of rows) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
  console.log('By status:', statusCounts)

  const distinctComments = new Map()
  for (const r of rows) {
    const c = (r.comments || '(blank)').trim()
    distinctComments.set(c, (distinctComments.get(c) || 0) + 1)
  }
  console.log('\nDistinct comment text (count):')
  for (const [c, n] of [...distinctComments.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(` [${n}x] ${c}`)
  }

  console.log('\nSample 5 full rows:')
  console.log(rows.slice(0, 5))

  await pool.end()
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
