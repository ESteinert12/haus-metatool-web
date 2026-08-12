#!/usr/bin/env node
/**
 * HAUS Split Conversion: 100% model → 200% model
 * Doubles numeric splits for ASCAP and SESAC entries in pub_detail and writer_detail.
 * BMI entries are left unchanged.
 * Scope: all teams where pub_detail contains ASCAP or SESAC.
 *
 * Run: node convert_splits_200pct.js
 * Add --dry-run to preview without writing to DB.
 */

const { Client } = require('/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace/node_modules/pg')

const CONN    = 'postgresql://postgres:postgres123@localhost:5432/haus_music'
const DRY_RUN = process.argv.includes('--dry-run')

// Parse "Name, PRO, number | Name, PRO, number" and double the number
// for any segment whose PRO is ASCAP or SESAC.
function convertDetail(detail) {
  if (!detail) return detail
  return detail
    .split('|')
    .map(seg => {
      const trimmed = seg.trim()
      // Each segment ends with ", PRO, number" — grab the last two comma-parts
      const parts = trimmed.split(',')
      if (parts.length < 3) return seg  // unexpected format, leave alone

      const numStr  = parts[parts.length - 1].trim()
      const proStr  = parts[parts.length - 2].trim().toUpperCase()
      const num     = parseFloat(numStr)

      if (isNaN(num)) return seg  // not a number, leave alone

      const needsConversion = proStr === 'ASCAP' || proStr === 'SESAC' ||
                              proStr.includes('ASCAP') || proStr.includes('SESAC')

      if (!needsConversion) return seg

      // Round to avoid floating-point noise (e.g. 16.5 * 2 = 33, not 33.00000001)
      const doubled = Math.round(num * 2 * 1000) / 1000
      parts[parts.length - 1] = ' ' + doubled
      return parts.join(',')
    })
    .join(' | ')
}

async function run() {
  const client = new Client({ connectionString: CONN })
  await client.connect()
  console.log(DRY_RUN ? '=== DRY RUN — no changes will be written ===\n' : 'Connected.\n')

  // Fetch all teams with ASCAP or SESAC in pub_detail
  const { rows } = await client.query(`
    SELECT team_id, pub_detail, writer_detail
    FROM teams
    WHERE pub_detail ILIKE '%ASCAP%' OR pub_detail ILIKE '%SESAC%'
    ORDER BY team_id
  `)

  console.log(`Found ${rows.length} teams to convert.\n`)

  let changed = 0
  for (const row of rows) {
    const newPub    = convertDetail(row.pub_detail)
    const newWriter = convertDetail(row.writer_detail)

    const pubChanged    = newPub    !== row.pub_detail
    const writerChanged = newWriter !== row.writer_detail

    if (!pubChanged && !writerChanged) continue

    console.log(`${row.team_id}`)
    if (pubChanged)    console.log(`  pub:    ${row.pub_detail}\n       → ${newPub}`)
    if (writerChanged) console.log(`  writer: ${row.writer_detail}\n       → ${newWriter}`)
    console.log()

    if (!DRY_RUN) {
      await client.query(
        `UPDATE teams SET pub_detail = $1, writer_detail = $2 WHERE team_id = $3`,
        [newPub, newWriter, row.team_id]
      )
    }
    changed++
  }

  await client.end()
  console.log(DRY_RUN
    ? `Dry run complete. ${changed} rows would be updated.`
    : `Done. ${changed} rows updated.`)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
