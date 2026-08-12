#!/usr/bin/env node
/**
 * HAUS Titles Import
 * Loads TITLES_Table.csv (32,650 rows) from FileMaker export into PostgreSQL.
 * Run: node import_titles.js [--dry-run]
 */

const { Client } = require('/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace/node_modules/pg')
const fs   = require('fs')
const path = require('path')

const CONN    = 'postgresql://postgres:postgres123@localhost:5432/haus_music'
const CSV     = '/Users/HAUS/Desktop/DATA MIGRATION PROJECT/TITLES_Table.csv'
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH   = 200

// ── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(filepath) {
  const raw = fs.readFileSync(filepath, 'latin1').replace(/\x00/g, '')
  const rows = []
  let cur = '', inQ = false, fields = []
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { fields.push(cur); cur = '' }
    else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && raw[i+1] === '\n') i++
      fields.push(cur); cur = ''
      if (fields.some(f => f)) rows.push(fields)
      fields = []
    } else { cur += c }
  }
  if (fields.length) { fields.push(cur); rows.push(fields) }
  return rows
}

// ── SKU parsing ──────────────────────────────────────────────────────────────
// SKUROOT in CSV = full SKU incl. album digit (e.g. "R73a3642")
// sku_root = everything except last char  ("R73a364")
// composer_id = strip trailing digits     ("R73a")
function parseSku(raw) {
  if (!raw || raw.trim().length < 7) return null
  const sku        = raw.trim()
  const albumDigit = sku.slice(-1)
  const skuRoot    = sku.slice(0, -1)
  if (!/^[0-9Xx]$/i.test(albumDigit)) return null
  const m = skuRoot.match(/^([A-Za-z]+\d+[A-Za-z]?)(\d+)$/)
  if (!m) return null
  return { sku, skuRoot, albumDigit: albumDigit.toUpperCase(), composerId: m[1] }
}

// ── Genre parsing ────────────────────────────────────────────────────────────
function parseGenre(g1, g2) {
  if (!g1) return { primary: null, secondary: g2 || null }
  const parts = g1.split('_')
  if (parts.length >= 2) return { primary: parts[0].trim(), secondary: parts.slice(1).join(' ').trim() || g2 || null }
  return { primary: g1.trim(), secondary: g2 || null }
}

// ── Mood normalisation ───────────────────────────────────────────────────────
function cleanMood(m) {
  if (!m) return null
  const first = m.split('\x0b')[0].trim()
  if (!first) return null
  return first.charAt(0).toUpperCase() + first.slice(1)
}

// ── KSL builder ──────────────────────────────────────────────────────────────
function buildKsl(ksl1, ksl2) {
  const parts = []
  if (ksl1 && ksl1.trim()) parts.push(ksl1.trim())
  if (ksl2) ksl2.split('\x0b').map(s => s.trim()).filter(Boolean).forEach(k => { if (!parts.includes(k)) parts.push(k) })
  return parts.join(', ') || null
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const client = new Client({ connectionString: CONN })
  await client.connect()
  console.log(DRY_RUN ? '=== DRY RUN ===\n' : 'Connected.\n')

  // Pre-load lookup tables
  const teams          = await client.query('SELECT team_id, composer_full_id FROM teams')
  const primaryGenres  = await client.query('SELECT primary_genre_id, primary_genre_name FROM primary_genres')
  const secondaryGenres = await client.query('SELECT secondary_genre_id, primary_genre_id, secondary_genre_name FROM secondary_genres')
  const mood1Table     = await client.query('SELECT mood_1_id, mood_1_name FROM mood_1')
  const mood2Table     = await client.query('SELECT mood_2_id, mood_2_name FROM mood_2')

  const teamMap    = new Map(teams.rows.map(r => [r.composer_full_id.toUpperCase(), r.team_id]))
  const mood1Map   = new Map(mood1Table.rows.map(r => [r.mood_1_name.toUpperCase(), r.mood_1_id]))
  const mood2Map   = new Map(mood2Table.rows.map(r => [r.mood_2_name.toUpperCase(), r.mood_2_id]))

  // Genre maps: primary by name, secondary by name (case-insensitive)
  const primaryGenreMap = new Map()
  primaryGenres.rows.forEach(r => primaryGenreMap.set(r.primary_genre_name.toUpperCase(), r.primary_genre_id))

  const secondaryGenreMap = new Map()
  secondaryGenres.rows.forEach(r => secondaryGenreMap.set(r.secondary_genre_name.toUpperCase(), r.secondary_genre_id))

  console.log(`Lookups: ${teamMap.size} teams, ${primaryGenreMap.size} genres, ${secondaryGenres.rows.length} subgenres, ${mood1Map.size} mood1, ${mood2Map.size} mood2\n`)

  const allRows  = parseCSV(CSV)
  const dataRows = allRows.slice(1)
  console.log(`${dataRows.length} rows to process\n`)

  let inserted = 0, skipped = 0, noTeam = 0, noSku = 0
  const unknownGenres = new Set(), unknownMoods = new Set()

  for (let b = 0; b < dataRows.length; b += BATCH) {
    const batch = dataRows.slice(b, b + BATCH)
    if (!DRY_RUN) await client.query('BEGIN')

    for (const row of batch) {
      const [filenameRoot, title, bpm, skuRaw, genre1, genre2, key, ksl1, ksl2, mmwRaw, mood1Raw, mood2Raw] = row

      if (!title || !skuRaw) { skipped++; continue }

      const parsed = parseSku(skuRaw)
      if (!parsed) { noSku++; continue }

      const { skuRoot, composerId } = parsed

      const teamId = teamMap.get(composerId.toUpperCase())
      if (!teamId) { noTeam++; continue }

      // Genre lookups
      const { primary, secondary } = parseGenre(genre1, genre2)
      let primaryGenreId = null, secondaryGenreId = null
      if (primary) {
        const key1 = primary.toUpperCase()
        const key2 = (primary.charAt(0).toUpperCase() + primary.slice(1).toLowerCase()).toUpperCase()
        primaryGenreId = primaryGenreMap.get(key1) || primaryGenreMap.get(key2) || null
        if (!primaryGenreId && key1 === 'CMYSTERIOUSOMEDY') primaryGenreId = primaryGenreMap.get('COMEDY') || null
        if (!primaryGenreId) unknownGenres.add(primary)
      }
      if (secondary) {
        secondaryGenreId = secondaryGenreMap.get(secondary.toUpperCase()) || null
      }

      // KSL
      const kslIds = buildKsl(ksl1, ksl2)

      // Moods
      const mood1Clean = cleanMood(mood1Raw)
      const mood1Id = mood1Clean ? (mood1Map.get(mood1Clean.toUpperCase()) || null) : null
      if (mood1Clean && !mood1Id) unknownMoods.add(mood1Clean)

      const mood2Clean = cleanMood(mood2Raw)
      const mood2Id = mood2Clean ? (mood2Map.get(mood2Clean.toUpperCase()) || null) : null

      if (DRY_RUN) { inserted++; continue }

      try {
        const r = await client.query(
          `INSERT INTO titles
             (sku_root, lot_id, composer_id, team_id, variant, title, key, bpm,
              primary_genre_id, secondary_genre_id, mood_1_id, mood_2_id, ksl_ids)
           VALUES ($1, NULL, $2, $3, 'a', $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (sku_root) DO NOTHING
           RETURNING sku_root`,
          [skuRoot, composerId, teamId, title,
           key || null, bpm ? Math.round(parseFloat(bpm)) : null,
           primaryGenreId, secondaryGenreId, mood1Id, mood2Id, kslIds]
        )
        if (r.rowCount > 0) inserted++
        else skipped++
      } catch(e) {
        console.error(`\n  ERR ${skuRoot}: ${e.message}`)
        skipped++
      }
    }

    if (!DRY_RUN) await client.query('COMMIT')
    const done = Math.min(b + BATCH, dataRows.length)
    process.stdout.write(`\r  Progress: ${done}/${dataRows.length} (${inserted} inserted, ${skipped} skipped)`)
  }

  await client.end()
  console.log(`\n\nDone.`)
  console.log(`  Inserted:      ${inserted}`)
  console.log(`  Skipped/dupe:  ${skipped}`)
  console.log(`  No team match: ${noTeam}`)
  console.log(`  Bad SKU:       ${noSku}`)
  if (unknownGenres.size) console.log(`  Unknown genres: ${[...unknownGenres].join(', ')}`)
  if (unknownMoods.size)  console.log(`  Unknown moods:  ${[...unknownMoods].slice(0,10).join(', ')}`)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
