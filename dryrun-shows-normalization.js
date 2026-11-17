#!/usr/bin/env node
// dryrun-shows-normalization.js — READ-ONLY, no writes of any kind.
//
// Dumps every distinct episodes.program value from real Neon and groups them
// by normalizeShowAlias() (trim + collapse whitespace + uppercase — see
// shows.js, the same function the live import route and the real backfill
// script both use), so Erik/Kyle can review which raw spellings are
// genuinely the same show BEFORE any shows/show_aliases row gets created
// for real.
//
// Deliberately conservative, same reasoning as shows.js: this only groups
// EXACT matches after normalization, never fuzzy/similarity matching. Two
// different real shows with similar names will correctly NOT be grouped
// together by this script. If two genuinely-the-same shows differ by more
// than case/whitespace (an abbreviation, a trailing "-CUES"/season suffix,
// a typo), this script will show them as two separate single-spelling
// groups rather than guessing they're the same — flag those to Claude by
// name rather than expecting this script to catch them.
//
// Run this from your own terminal, not from any cloud/bridge session —
// Neon has been structurally unreachable from every cloud execution path
// tried in this project so far (confirmed repeatedly, most recently for the
// royalty-tracker work: getaddrinfo EAI_AGAIN resolving the Neon hostname).
//
// Usage: node dryrun-shows-normalization.js
require('dotenv').config()
const { Pool } = require('pg')
const { normalizeShowAlias } = require('./shows.js')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

  const { rows } = await pool.query(`
    SELECT program, COUNT(*)::int AS episode_count
    FROM episodes
    GROUP BY program
    ORDER BY program NULLS LAST
  `)
  await pool.end()

  const groups = new Map() // normalized alias -> [{program, episode_count}]
  let blankEpisodeCount = 0
  let blankRowCount = 0
  for (const r of rows) {
    if (!r.program || !r.program.trim()) {
      blankEpisodeCount += r.episode_count
      blankRowCount += 1
      continue
    }
    const alias = normalizeShowAlias(r.program)
    if (!groups.has(alias)) groups.set(alias, [])
    groups.get(alias).push(r)
  }

  const totalEpisodes = rows.reduce((s, r) => s + r.episode_count, 0)
  console.log(`Distinct episodes.program values (including blank): ${rows.length}`)
  console.log(`  of which blank/null: ${blankRowCount} rows, ${blankEpisodeCount} episodes (these get no show -- nothing to key off of)`)
  console.log(`Total episodes: ${totalEpisodes}`)
  console.log(`Normalized groups (would become this many distinct shows if nothing else changes): ${groups.size}\n`)

  const multi = [...groups.entries()].filter(([, variants]) => variants.length > 1)
  const single = [...groups.entries()].filter(([, variants]) => variants.length === 1)

  console.log(`=== ${multi.length} groups where MULTIPLE raw spellings normalize to the same thing ===`)
  console.log(`(these would already auto-merge correctly under normalizeShowAlias() -- just confirm each really is one show, not two unrelated shows that happen to share a normalized spelling)\n`)
  for (const [alias, variants] of multi.sort((a, b) => b[1].length - a[1].length)) {
    const total = variants.reduce((s, v) => s + v.episode_count, 0)
    console.log(`  normalized: "${alias}"  (${total} episodes total)`)
    for (const v of variants.sort((a, b) => b.episode_count - a.episode_count)) {
      console.log(`    - "${v.program}"  (${v.episode_count} episodes)`)
    }
    console.log()
  }

  console.log(`=== ${single.length} groups with exactly one spelling (nothing to merge, not printed individually) ===`)
  console.log(`${single.reduce((s, [, v]) => s + v[0].episode_count, 0)} episodes total across these.\n`)

  console.log('Nothing was written to the database by this script.')
  console.log('Next step: review the MULTIPLE-spelling groups above. For each one, confirm (or correct)')
  console.log('whether it is genuinely one show. Separately, flag any shows you know have DIFFERENT')
  console.log('spellings that do NOT share a normalized form above (an abbreviation, a typo, a')
  console.log('"-CUES"/season suffix one cue-sheet source adds) -- those will show as separate')
  console.log('single-spelling groups here and need a manual alias added, this script will not catch them.')
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
