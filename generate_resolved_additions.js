#!/usr/bin/env node
// generate_resolved_additions.js
// Takes the 257 ambiguous_person names now resolved to a real TMDB person
// (217 via the popularity-floor bug fix, 40 via a fresh movie_credits
// composer-credit confirmation — see resolve_ambiguous.js) and runs them
// through the SAME final step the original composer_confirmed pass used:
// pull movie_credits, filter to job === "Original Music Composer", rank by
// vote_count desc, take the top 10, and write additions in the exact same
// schema as rmo_ksl_seed_additions.json — {name, content_type, reference_artist,
// year, vote_count, tmdb_id, added_via_ksl}.
//
// This does NOT touch rmo_clean_names.json or ksl_clean_names.json. It only
// produces a review file, same as every other addition in this project has
// gone through before being merged in.
//
// Resumable + chunked the same way as resolve_ambiguous.js, since this may
// run from a time-limited shell. Run directly in a normal terminal and it'll
// just go straight through:
//   cd ~/Documents/GitHub/haus-metatool-web
//   node generate_resolved_additions.js 999

require('dotenv').config()
const fs = require('fs')

const TMDB_KEY = process.env.TMDB_API_KEY
if (!TMDB_KEY) { console.error('Missing TMDB_API_KEY in .env'); process.exit(1) }

const RESOLVED_FILE = 'ambiguous_newly_resolved.json'
const RMO_FILE = 'rmo_clean_names.json'
const OUT_ADDITIONS = 'ambiguous_resolved_additions.json'
const OUT_PROGRESS = 'ambiguous_resolved_additions_progress.json' // per-name done-tracking

const TOP_N = 10
const BATCH_LIMIT = Number(process.argv[2]) || 999
const BASE_INTERVAL_MS = 300

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

function norm (s) {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function tmdbFetch (url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`TMDB HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

async function getComposerMovies (personId) {
  const url = `https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${TMDB_KEY}`
  const data = await tmdbFetch(url)
  const crew = data.crew || []
  return crew
    .filter(c => c.job === 'Original Music Composer')
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
    .slice(0, TOP_N)
}

async function main () {
  const resolved = JSON.parse(fs.readFileSync(RESOLVED_FILE, 'utf8'))
  console.log(`Total resolved identities to pull filmographies for: ${resolved.length}`)

  const rmoNames = JSON.parse(fs.readFileSync(RMO_FILE, 'utf8'))
  const rmoNorms = new Set(rmoNames.map(norm))

  let additions = fs.existsSync(OUT_ADDITIONS) ? JSON.parse(fs.readFileSync(OUT_ADDITIONS, 'utf8')) : []
  let progress = fs.existsSync(OUT_PROGRESS) ? JSON.parse(fs.readFileSync(OUT_PROGRESS, 'utf8')) : []
  const done = new Set(progress.filter(p => p.outcome !== 'error').map(p => p.ksl_name))

  const remaining = resolved.filter(e => !done.has(e.ksl_name))
  console.log(`Remaining to process: ${remaining.length}`)
  const batch = remaining.slice(0, BATCH_LIMIT)
  console.log(`Processing this run: ${batch.length} (batch limit ${BATCH_LIMIT})\n`)

  let i = 0
  for (const e of batch) {
    i++
    process.stdout.write(`[${i}/${batch.length}] ${e.ksl_name} (${e.person_name}, id ${e.person_id}) ... `)
    try {
      const movies = await getComposerMovies(e.person_id)
      await sleep(BASE_INTERVAL_MS)
      let added = 0
      for (const m of movies) {
        const title = m.title || m.original_title
        if (!title) continue
        if (rmoNorms.has(norm(title))) continue // already in RMO, skip
        additions.push({
          name: title,
          content_type: 'movie',
          reference_artist: e.ksl_name,
          year: (m.release_date || '').slice(0, 4),
          vote_count: m.vote_count || 0,
          tmdb_id: m.id,
          added_via_ksl: e.ksl_name,
          resolution_source: e.source // 'floor_bug_fix' or 'credits_confirmed', for audit trail
        })
        rmoNorms.add(norm(title)) // avoid dupes within this same run too
        added++
      }
      console.log(`${movies.length} composer credits found, ${added} new RMO titles added`)
      progress.push({ ksl_name: e.ksl_name, outcome: 'done', movie_count: movies.length, added })
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      progress.push({ ksl_name: e.ksl_name, outcome: 'error', error: err.message })
    }
    fs.writeFileSync(OUT_ADDITIONS, JSON.stringify(additions, null, 2))
    fs.writeFileSync(OUT_PROGRESS, JSON.stringify(progress, null, 2))
  }

  const stillRemaining = remaining.length - batch.length
  console.log('\n==== SUMMARY (this run) ====')
  console.log(`Total RMO titles staged for addition: ${additions.length}`)
  console.log(`Names processed so far: ${progress.filter(p => p.outcome === 'done').length} / ${resolved.length}`)
  console.log(`Errors so far: ${progress.filter(p => p.outcome === 'error').length}`)
  if (stillRemaining > 0) console.log(`${stillRemaining} names still unprocessed — run again to continue.`)
  else console.log('Complete — nothing left to process.')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
