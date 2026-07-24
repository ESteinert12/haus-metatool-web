// stemless-export.js
// Exports all titles with no mix_stems rows to a CSV file.
//
//   node stemless-export.js
//
// Output: stemless-titles.csv (same directory)

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

async function run() {
  console.log('Querying stemless titles…')
  const result = await pool.query(`
    SELECT
      t.sku_root,
      t.title,
      t.composer_id,
      t.lot_id,
      pg.primary_genre_name  AS primary_genre,
      sg.secondary_genre_name AS secondary_genre,
      t.key,
      t.bpm,
      t.description,
      TO_CHAR(t.created_at, 'YYYY-MM-DD') AS created_at
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    LEFT JOIN primary_genres pg ON pg.primary_genre_id = t.primary_genre_id
    LEFT JOIN secondary_genres sg ON sg.secondary_genre_id = t.secondary_genre_id
    WHERE ms.sku_root IS NULL
    ORDER BY t.composer_id, t.sku_root
  `)

  const rows = result.rows
  console.log(`Found ${rows.length} titles with no mix_stems.`)

  const headers = ['sku_root', 'title', 'composer_id', 'lot_id', 'primary_genre', 'secondary_genre', 'key', 'bpm', 'description', 'created_at']
  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','))
  }

  const outPath = path.join(__dirname, 'stemless-titles.csv')
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`Saved → ${outPath}`)

  await pool.end()
}

run().catch(async e => {
  console.error('Error:', e.message)
  await pool.end()
  process.exit(1)
})
