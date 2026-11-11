#!/usr/bin/env node
// resolve_ambiguous.js
// Reprocesses the 407 ambiguous_person entries from rmo_ksl_seed_report.json
// in two passes:
//
//   Pass A (free, no API calls): fix the popularity-floor bug. The original
//   auto-pick rule was `top.popularity >= Math.max(3 * second.popularity, 1)`
//   — the `Math.max(..., 1)` created an absolute floor of 1.0 that almost no
//   real TMDB person score ever clears, so a >=3x relative margin never
//   actually got to auto-resolve. This pass re-runs the SAME 3x-margin rule
//   with the floor removed, using only the popularity data already cached
//   in the report (zero new TMDB calls).
//
//   Pass B (needs TMDB calls, ~190 names): for names that don't clear even
//   a fixed 3x margin, popularity alone can't disambiguate. For each
//   candidate we re-run a TMDB /search/person call (to recover
//   known_for_department, which the original script didn't persist) and,
//   for anyone tagged department "Sound", confirm with a real
//   movie_credits lookup checking for an actual job === "Original Music
//   Composer" credit — the same authoritative test composer_confirmed
//   entries already passed elsewhere in this pipeline. Only an exact
//   single confirmed match resolves; anything else (0 or 2+ confirmed
//   composers) stays flagged for a human pick.
//
// Writes:
//   ambiguous_resolution_report.json — full breakdown per name
//   ambiguous_newly_resolved.json    — {ksl_name, person_id, person_name, source: 'floor_bug_fix'|'credits_confirmed'}
//   ambiguous_still_unresolved.json  — the real remaining human-review list
//
// Run:
//   cd ~/Documents/GitHub/haus-metatool-web
//   node resolve_ambiguous.js

require('dotenv').config()
const fs = require('fs')

const TMDB_KEY = process.env.TMDB_API_KEY
if (!TMDB_KEY) { console.error('Missing TMDB_API_KEY in .env'); process.exit(1) }

const REPORT_FILE = 'rmo_ksl_seed_report.json'
const OUT_REPORT = 'ambiguous_resolution_report.json'
const OUT_RESOLVED = 'ambiguous_newly_resolved.json'
const OUT_UNRESOLVED = 'ambiguous_still_unresolved.json'

const BASE_INTERVAL_MS = 300 // TMDB's documented limits are generous (~50/sec); still pacing politely
function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function tmdbFetch (url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`TMDB HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

async function searchPersonDepartments (name) {
  // Re-run the search to recover known_for_department per candidate id,
  // which wasn't saved originally.
  const url = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&api_key=${TMDB_KEY}`
  const data = await tmdbFetch(url)
  const byId = new Map()
  for (const p of (data.results || [])) byId.set(p.id, p.known_for_department || null)
  return byId
}

async function isConfirmedComposer (personId) {
  const url = `https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${TMDB_KEY}`
  const data = await tmdbFetch(url)
  const crew = data.crew || []
  const composerCredits = crew.filter(c => c.job === 'Original Music Composer')
  return composerCredits
}

// Each device_bash call is a fresh, time-limited shell, so this script
// processes at most BATCH_LIMIT Pass-B names per run (argv[2], default 40)
// and resumes from wherever the prior run left off by reading its own
// output files back in. Safe to just call `node resolve_ambiguous.js`
// repeatedly until it reports "Pass B complete."
const BATCH_LIMIT = Number(process.argv[2]) || 40

async function main () {
  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'))
  const amb = report.filter(e => e.resolution === 'ambiguous_person')
  console.log(`Total ambiguous_person entries: ${amb.length}`)

  let resolved = fs.existsSync(OUT_RESOLVED) ? JSON.parse(fs.readFileSync(OUT_RESOLVED, 'utf8')) : []
  let stillUnresolved = fs.existsSync(OUT_UNRESOLVED) ? JSON.parse(fs.readFileSync(OUT_UNRESOLVED, 'utf8')) : []
  let fullBreakdown = fs.existsSync(OUT_REPORT) ? JSON.parse(fs.readFileSync(OUT_REPORT, 'utf8')) : []

  // A prior run that errored out (e.g. a network blip) marked those names
  // 'error' in fullBreakdown — don't treat that as "done", or they'll be
  // skipped forever instead of retried. Drop any stale error entries from
  // all three in-memory structures before computing what's left to do.
  const erroredNames = new Set(fullBreakdown.filter(x => x.outcome === 'error').map(x => x.ksl_name))
  if (erroredNames.size > 0) {
    console.log(`Clearing ${erroredNames.size} stale error entries from a prior run so they're retried.`)
    fullBreakdown = fullBreakdown.filter(x => x.outcome !== 'error')
    stillUnresolved = stillUnresolved.filter(x => x.reason !== 'api_error')
  }

  const alreadyDone = new Set(fullBreakdown.map(x => x.ksl_name))

  // ---- Pass A: fixed-floor re-check (no API calls, instant, redone every run but idempotent) ----
  if (!fullBreakdown.some(x => x.outcome === 'resolved_floor_bug_fix' || x.outcome && x.pass === 'A')) {
    const needsApiCheckAll = []
    for (const e of amb) {
      const cands = e.candidates || []
      if (cands.length < 2) { needsApiCheckAll.push(e); continue }
      const sorted = [...cands].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      const top = sorted[0]
      const second = sorted[1]
      const topPop = top.popularity || 0
      const secondPop = second.popularity || 0.01
      const ratio = topPop / (secondPop || 0.01)
      if (ratio >= 3) {
        resolved.push({ ksl_name: e.ksl_name, person_id: top.id, person_name: top.name, source: 'floor_bug_fix', top_popularity: topPop, second_popularity: secondPop, ratio: Number(ratio.toFixed(1)) })
        fullBreakdown.push({ ksl_name: e.ksl_name, outcome: 'resolved_floor_bug_fix', chosen: top.name, ratio: Number(ratio.toFixed(1)) })
        alreadyDone.add(e.ksl_name)
      } else {
        needsApiCheckAll.push(e)
      }
    }
    console.log(`Pass A (popularity-floor fix): resolved ${resolved.length} so far, ${needsApiCheckAll.length} go to Pass B`)
    fs.writeFileSync(OUT_REPORT, JSON.stringify(fullBreakdown, null, 2))
    fs.writeFileSync(OUT_RESOLVED, JSON.stringify(resolved, null, 2))
  }

  // ---- Pass B: TMDB known_for_department + movie_credits confirmation ----
  const needsApiCheck = amb.filter(e => {
    const cands = e.candidates || []
    if (alreadyDone.has(e.ksl_name)) return false
    if (cands.length < 2) return true
    const sorted = [...cands].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    const ratio = (sorted[0].popularity || 0) / (sorted[1].popularity || 0.01)
    return ratio < 3
  })
  console.log(`Pass B remaining (not yet processed): ${needsApiCheck.length}`)
  const batch = needsApiCheck.slice(0, BATCH_LIMIT)
  console.log(`Processing this run: ${batch.length} (batch limit ${BATCH_LIMIT})`)

  let i = 0
  for (const e of batch) {
    i++
    const name = e.ksl_name
    process.stdout.write(`[${i}/${needsApiCheck.length}] ${name} ... `)
    try {
      const deptById = await searchPersonDepartments(name)
      await sleep(BASE_INTERVAL_MS)
      const soundCandidates = (e.candidates || []).filter(c => deptById.get(c.id) === 'Sound')

      if (soundCandidates.length === 0) {
        console.log('no Sound-department candidate — staying unresolved')
        stillUnresolved.push({ ksl_name: name, reason: 'no_sound_department_candidate', candidate_count: (e.candidates || []).length })
        fullBreakdown.push({ ksl_name: name, outcome: 'unresolved_no_sound_dept' })
        continue
      }

      const confirmedComposers = []
      for (const c of soundCandidates) {
        const credits = await isConfirmedComposer(c.id)
        await sleep(BASE_INTERVAL_MS)
        if (credits.length > 0) confirmedComposers.push({ id: c.id, name: c.name, credits })
      }

      if (confirmedComposers.length === 1) {
        const chosen = confirmedComposers[0]
        console.log(`CONFIRMED composer -> ${chosen.name} (${chosen.credits.length} film credits)`)
        resolved.push({ ksl_name: name, person_id: chosen.id, person_name: chosen.name, source: 'credits_confirmed', composer_credits: chosen.credits.map(c => ({ title: c.title, release_date: c.release_date })) })
        fullBreakdown.push({ ksl_name: name, outcome: 'resolved_credits_confirmed', chosen: chosen.name, credit_count: chosen.credits.length })
      } else if (confirmedComposers.length > 1) {
        console.log(`MULTIPLE confirmed composers (${confirmedComposers.length}) — real ambiguity, needs human pick`)
        stillUnresolved.push({ ksl_name: name, reason: 'multiple_confirmed_composers', candidates: confirmedComposers.map(c => ({ id: c.id, name: c.name, credit_count: c.credits.length })) })
        fullBreakdown.push({ ksl_name: name, outcome: 'unresolved_multiple_composers', count: confirmedComposers.length })
      } else {
        console.log('Sound-dept candidate(s) found but none have an actual Composer credit — unresolved')
        stillUnresolved.push({ ksl_name: name, reason: 'sound_dept_but_no_composer_credit', candidate_count: soundCandidates.length })
        fullBreakdown.push({ ksl_name: name, outcome: 'unresolved_sound_no_credit' })
      }
    } catch (err) {
      const causeMsg = err.cause ? ` | cause: ${err.cause.code || err.cause.message || JSON.stringify(err.cause)}` : ''
      console.log(`ERROR: ${err.message}${causeMsg}`)
      stillUnresolved.push({ ksl_name: name, reason: 'api_error', error: err.message, cause: err.cause ? (err.cause.code || String(err.cause)) : null })
      fullBreakdown.push({ ksl_name: name, outcome: 'error', error: err.message, cause: err.cause ? (err.cause.code || String(err.cause)) : null })
    }
    // save after every name — interrupting mid-batch loses nothing
    fs.writeFileSync(OUT_REPORT, JSON.stringify(fullBreakdown, null, 2))
    fs.writeFileSync(OUT_RESOLVED, JSON.stringify(resolved, null, 2))
    fs.writeFileSync(OUT_UNRESOLVED, JSON.stringify(stillUnresolved, null, 2))
  }

  const remainingAfterThisRun = needsApiCheck.length - batch.length
  console.log('\n==== SUMMARY (this run) ====')
  console.log(`Total ambiguous_person entries: ${amb.length}`)
  console.log(`Resolved so far (floor-bug fix, popularity margin): ${resolved.filter(r => r.source === 'floor_bug_fix').length}`)
  console.log(`Resolved so far (TMDB credits-confirmed): ${resolved.filter(r => r.source === 'credits_confirmed').length}`)
  console.log(`Total resolved so far: ${resolved.length}`)
  console.log(`Still unresolved so far (real human-review backlog): ${stillUnresolved.length}`)
  if (remainingAfterThisRun > 0) {
    console.log(`\n${remainingAfterThisRun} Pass-B names still unprocessed — run again to continue.`)
  } else {
    console.log('\nPass B complete — nothing left to process.')
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
