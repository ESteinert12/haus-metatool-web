#!/usr/bin/env node
/**
 * Seed teams.next_seq from FileMaker export
 * Run after migration_034_next_seq.sql:
 *   node seed_next_seq.js
 */

const { Client } = require('/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace/node_modules/pg')
const fs   = require('fs')
const path = require('path')

const CONN    = 'postgresql://postgres:postgres123@localhost:5432/haus_music'
const CSV     = path.join('/Users/HAUS/Desktop/DATA MIGRATION PROJECT', 'team table (1).csv')

// Minimal CSV parser (handles quoted fields)
function parseCSV(text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cur); cur = '' }
      else { cur += c }
    }
    cols.push(cur)
    rows.push(cols)
  }
  return rows
}

async function run() {
  const client = new Client({ connectionString: CONN })
  await client.connect()
  console.log('Connected.\n')

  const text = fs.readFileSync(CSV, 'latin1')
  const rows = parseCSV(text)

  let updated = 0, skipped = 0, missing = 0

  for (const row of rows) {
    const composerFullId = (row[10] || '').trim()   // e.g. "R04b"
    const nextSeqStr     = (row[15] || '').trim()   // e.g. "1077"

    if (!composerFullId || !nextSeqStr || !/^\d+$/.test(nextSeqStr)) {
      skipped++
      continue
    }

    const nextSeq = parseInt(nextSeqStr, 10)

    const r = await client.query(
      `UPDATE teams SET next_seq = $1 WHERE composer_full_id = $2`,
      [nextSeq, composerFullId]
    )

    if (r.rowCount === 0) {
      console.log(`  MISS  ${composerFullId} (not in teams table)`)
      missing++
    } else {
      console.log(`  OK    ${composerFullId} → next_seq = ${nextSeq}`)
      updated++
    }
  }

  await client.end()
  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Not found: ${missing}`)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
