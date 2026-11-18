#!/usr/bin/env node
// One-time backfill: sets episodes.show_id for every pre-existing episode
// that doesn't have one yet (the shows/show_aliases feature, shipped
// 2026-11-17, only resolves show_id going forward -- at cue-sheet-import
// time for a brand new episode, or opportunistically if an existing one
// gets re-touched by a later import. There was never a one-time sweep over
// rows that already existed, flagged as "deliberately not built yet" in
// claude/handoff-2026-11-17-shows-table-and-ui-kaizen-backlog.md).
//
// Added 2026-11-18 alongside the Shows & Episodes tab, which groups
// episodes with no show_id into an "unassigned" bucket per raw program
// string so nothing is invisible in the meantime -- this script is how you
// fold those into real, de-duplicated shows rows.
//
//   node scripts/backfill-show-ids.js            -- dry run, writes nothing
//   node scripts/backfill-show-ids.js --commit   -- actually writes show_id
//
// Uses the exact same resolveShowId()/normalizeShowAlias() from shows.js
// that the live cue-sheet-import route uses -- there must never be two
// implementations of "what counts as the same show" that can drift apart.
// Deliberately conservative (trim + collapse whitespace + uppercase only,
// no fuzzy matching) for the same reason shows.js documents: without having
// reviewed the real data, a fuzzy merge risks silently combining two real,
// different shows that happen to have similar names.
//
// Needs DATABASE_URL in the environment (or .env), the same connection
// api.js uses.

require('dotenv').config()
const { Pool } = require('pg')
const { normalizeShowAlias, resolveShowId } = require('../shows.js')

;(async () => {
  const commit = process.argv.includes('--commit')
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (put it in .env)'); process.exit(1) }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    const { rows } = await pool.query(
      `SELECT id, program FROM episodes WHERE show_id IS NULL AND program IS NOT NULL AND program != '' ORDER BY id`
    )
    console.log(`${rows.length} episode${rows.length === 1 ? '' : 's'} with no show_id to process.`)
    if (!rows.length) return

    // Group first so identical/variant program strings only print once in
    // the summary, and so a dry run shows exactly what will merge.
    const groups = new Map()   // normalized alias -> { programs: Set, episodeIds: [] }
    for (const r of rows) {
      const alias = normalizeShowAlias(r.program)
      if (!groups.has(alias)) groups.set(alias, { programs: new Set(), episodeIds: [] })
      const g = groups.get(alias)
      g.programs.add(r.program)
      g.episodeIds.push(r.id)
    }

    console.log(`\n${groups.size} distinct show${groups.size === 1 ? '' : 's'} after normalizing (trim + collapse whitespace + uppercase):\n`)
    for (const [alias, g] of groups) {
      const variants = [...g.programs]
      const tag = variants.length > 1 ? `  <- ${variants.length} spelling variants merging into one show` : ''
      console.log(`  "${alias}" (${g.episodeIds.length} episode${g.episodeIds.length === 1 ? '' : 's'})${tag}`)
      if (variants.length > 1) variants.forEach(v => console.log(`      - "${v}"`))
    }

    if (!commit) {
      console.log(`\nDry run only -- nothing written. Re-run with --commit to apply.`)
      return
    }

    console.log(`\nWriting show_id for ${rows.length} episodes...`)
    let updated = 0
    for (const r of rows) {
      const showId = await resolveShowId(pool, r.program)
      if (!showId) continue
      await pool.query(`UPDATE episodes SET show_id = $1 WHERE id = $2`, [showId, r.id])
      updated++
    }
    console.log(`✅ backfilled show_id on ${updated} of ${rows.length} episodes, across ${groups.size} shows.`)
  } finally { await pool.end() }
})().catch(e => { console.error(e.message); process.exit(1) })
