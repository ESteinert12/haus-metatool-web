#!/usr/bin/env node
/**
 * Inspects the FileMaker teams CSV to find which column holds the correct next_seq.
 * We know S33a's correct value is 4880 — find the column that matches.
 */

const fs = require('fs')
const CSV = '/Users/HAUS/Desktop/DATA MIGRATION PROJECT/team table (1).csv'

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

const rows = parseCSV(fs.readFileSync(CSV, 'latin1'))
const header = rows[0]
const data   = rows.slice(1)

console.log(`CSV has ${header.length} columns, ${data.length} data rows\n`)

// Print header column names with indices
console.log('Column headers:')
header.forEach((h, i) => console.log(`  [${i}] ${h}`))

// Find S33a row
const s33a = data.find(r => (r[10] || '').trim() === 'S33a')
if (s33a) {
  console.log('\nS33a row (all columns):')
  s33a.forEach((v, i) => { if (v.trim()) console.log(`  [${i}] ${header[i] || '?'} = "${v.trim()}"`) })
  console.log('\nColumns containing "4880":')
  s33a.forEach((v, i) => { if (v.trim() === '4880') console.log(`  [${i}] ${header[i] || '?'}`) })
} else {
  console.log('\nS33a not found in column 10 — searching all columns...')
  data.forEach((r, ri) => {
    r.forEach((v, ci) => {
      if (v.trim() === 'S33a') console.log(`  Row ${ri}, col ${ci}: S33a found`)
    })
  })
}
