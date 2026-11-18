#!/usr/bin/env node
// resolve_ambiguous_artist.js
//
// Direct analog of resolve_ambiguous.js, but for the 277 ambiguous_artist
// entries in rmo_ksl_music_seed_report.json (the MusicBrainz/music pass),
// instead of the 407 ambiguous_person entries from the TMDB/composer pass.
//
// IMPORTANT DIFFERENCE FROM THE COMPOSER PASS: there is no free "Pass A"
// here. The composer pass had a free margin re-check because the original
// bug was in how an *existing* popularity margin was being floored. This
// pass's "candidates" field only carries a MusicBrainz search-match score
// (0-100, how well the NAME matched the query) -- not a popularity/fame
// signal at all. Checked across all 277 entries: candidate counts range
// 2-25, and the gap between the top two scores is never >=20 (168 are
// 10-19, 98 are 1-9, 11 are exact ties). A name-match-score margin cannot
// tell us which same-named artist is the famous one, so there is nothing
// to "fix" for free -- every entry needs a real API check.
//
// Resolution strategy (mirrors the composer pass's Pass B: confirm with
// actual output, not a proxy signal):
//   For each candidate artist id, browse MusicBrainz release-groups,
//   keep primary-type Album only, EXCLUDE secondary-type Compilation/
//   Live/Soundtrack/Remix/DJ-mix/Mixtape (same "real studio album" bar
//   the rest of this pipeline already uses -- see the matched_artist_
//   no_studio_albums bucket in the same report), and fetch ratings.
//
//   - 1 candidate with >=1 qualifying studio album, rest have 0: resolved.
//   - 2+ candidates with qualifying albums: compare total rating_votes
//     across their qualifying albums; if the top candidate has >=3x the
//     next candidate's total votes (same 3x margin used throughout this
//     project) AND at least 5 total votes (avoid a 1-vote-vs-0-vote false
//     "landslide"), resolved. Otherwise stays flagged for human review --
//     real ambiguity (e.g. two working artists who both released albums).
//   - 0 candidates with any qualifying studio album: stays unresolved,
//     same as the existing matched_artist_no_studio_albums bucket would
//     have called it for a single-candidate match.
//
// MusicBrainz requires a descriptive User-Agent and asks for <=1 req/sec
// without an API key (there isn't one -- MB is free/open, no key needed).
// Per MB's own etiquette guidance the contact field just needs to be SOME
// reachable identifier for the app, not a personal address -- using a
// generic project URL/name here instead of an email.
//
// Writes:
//   ambiguous_artist_resolution_report.json   -- full breakdown per name
//   ambiguous_artist_newly_resolved.json      -- {ksl_name, artist_id, artist_name, source, top_albums}
//   ambiguous_artist_still_unresolved.json    -- the real remaining human-review list
//
// Run (resumable, chunked -- each device_bash call is time-limited):
//   cd ~/Documents/GitHub/haus-metatool-web
//   node resolve_ambiguous_artist.js 40

const fs = require('fs')

const REPORT_FILE = 'rmo_ksl_music_seed_report.json'
const OUT_REPORT = 'ambiguous_artist_resolution_report.json'
const OUT_RESOLVED = 'ambiguous_artist_newly_resolved.json'
const OUT_UNRESOLVED = 'ambiguous_artist_still_unresolved.json'

const UA = 'HausMetatoolAmbiguousArtistResolver/1.0 (+https://hausmusic.com)'
const BASE_INTERVAL_MS = 1100 // MB's documented courtesy limit is ~1 req/sec; pad a bit
function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

const EXCLUDE_SECONDARY = new Set(['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape', 'Spokenword', 'Interview'])

async function mbFetch (url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
  if (res.status === 503) {
    // MB rate-limit backoff: wait longer and retry once
    await sleep(3000)
    const res2 = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
    if (!res2.ok) throw new Error(`MB HTTP ${res2.status} (after 503 retry)`)
    return res2.json()
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`MB HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

// Returns { qualifyingAlbums: [{id,title,year,rating_votes,rating_value}], totalVotes }
async function getStudioAlbums (artistId) {
  const url = `https://musicbrainz.org/ws/2/release-group?artist=${artistId}&type=album&limit=100&inc=ratings&fmt=json`
  const data = await mbFetch(url)
  const groups = data['release-groups'] || []
  const qualifying = groups.filter(g => {
    const secondary = g['secondary-types'] || []
    return !secondary.some(t => EXCLUDE_SECONDARY.has(t))
  })
  const albums = qualifying.map(g => ({
    id: g.id,
    title: g.title,
    year: (g['first-release-date'] || '').slice(0, 4),
    rating_votes: (g.rating && g.rating['votes-count']) || 0,
    rating_value: (g.rating && g.rating.value) || null
  }))
  const totalVotes = albums.reduce((s, a) => s + a.rating_votes, 0)
  return { albums, totalVotes }
}

const BATCH_LIMIT = Number(process.argv[2]) || 40

async function main () {
  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'))
  const amb = report.filter(e => e.resolution === 'ambiguous_artist')
  console.log(`Total ambiguous_artist entries: ${amb.length}`)

  let resolved = fs.existsSync(OUT_RESOLVED) ? JSON.parse(fs.readFileSync(OUT_RESOLVED, 'utf8')) : []
  let stillUnresolved = fs.existsSync(OUT_UNRESOLVED) ? JSON.parse(fs.readFileSync(OUT_UNRESOLVED, 'utf8')) : []
  let fullBreakdown = fs.existsSync(OUT_REPORT) ? JSON.parse(fs.readFileSync(OUT_REPORT, 'utf8')) : []

  // Same lesson learned from resolve_ambiguous.js: don't treat a prior
  // run's error entries as "done," or a network blip permanently drops names.
  const erroredNames = new Set(fullBreakdown.filter(x => x.outcome === 'error').map(x => x.ksl_name))
  if (erroredNames.size > 0) {
    console.log(`Clearing ${erroredNames.size} stale error entries from a prior run so they're retried.`)
    fullBreakdown = fullBreakdown.filter(x => x.outcome !== 'error')
    stillUnresolved = stillUnresolved.filter(x => x.reason !== 'api_error')
  }

  const alreadyDone = new Set(fullBreakdown.map(x => x.ksl_name))
  const remaining = amb.filter(e => !alreadyDone.has(e.ksl_name))
  console.log(`Remaining to process: ${remaining.length}`)
  const batch = remaining.slice(0, BATCH_LIMIT)
  console.log(`Processing this run: ${batch.length} (batch limit ${BATCH_LIMIT})\n`)

  let i = 0
  for (const e of batch) {
    i++
    const name = e.ksl_name
    process.stdout.write(`[${i}/${batch.length}] ${name} (${(e.candidates || []).length} candidates) ... `)
    try {
      const results = []
      for (const c of (e.candidates || [])) {
        const { albums, totalVotes } = await getStudioAlbums(c.id)
        await sleep(BASE_INTERVAL_MS)
        results.push({ id: c.id, name: c.name, disambiguation: c.disambiguation, albums, totalVotes })
      }
      const withAlbums = results.filter(r => r.albums.length > 0).sort((a, b) => b.totalVotes - a.totalVotes)

      if (withAlbums.length === 0) {
        console.log('no candidate has a qualifying studio album — unresolved')
        stillUnresolved.push({ ksl_name: name, reason: 'no_candidate_has_studio_albums', candidate_count: (e.candidates || []).length })
        fullBreakdown.push({ ksl_name: name, outcome: 'unresolved_no_studio_albums' })
      } else if (withAlbums.length === 1) {
        const w = withAlbums[0]
        console.log(`RESOLVED (sole candidate with studio albums) -> ${w.name} (${w.albums.length} albums)`)
        resolved.push({ ksl_name: name, artist_id: w.id, artist_name: w.name, source: 'sole_candidate_with_albums', top_albums: w.albums })
        fullBreakdown.push({ ksl_name: name, outcome: 'resolved_sole_candidate', chosen: w.name, album_count: w.albums.length })
      } else {
        const top = withAlbums[0]
        const second = withAlbums[1]
        const topVotes = top.totalVotes
        const secondVotes = second.totalVotes || 0.01
        const ratio = topVotes / secondVotes
        if (ratio >= 3 && top.totalVotes >= 5) {
          console.log(`RESOLVED (vote landslide, ${topVotes} vs ${second.totalVotes}) -> ${top.name}`)
          resolved.push({ ksl_name: name, artist_id: top.id, artist_name: top.name, source: 'vote_landslide', top_votes: topVotes, second_votes: second.totalVotes, ratio: Number(ratio.toFixed(1)), top_albums: top.albums })
          fullBreakdown.push({ ksl_name: name, outcome: 'resolved_vote_landslide', chosen: top.name, ratio: Number(ratio.toFixed(1)) })
        } else {
          console.log(`MULTIPLE real candidates (${withAlbums.length}), no clean landslide — needs human pick`)
          stillUnresolved.push({ ksl_name: name, reason: 'multiple_candidates_with_albums', candidates: withAlbums.map(r => ({ id: r.id, name: r.name, disambiguation: r.disambiguation, album_count: r.albums.length, total_votes: r.totalVotes })) })
          fullBreakdown.push({ ksl_name: name, outcome: 'unresolved_multiple_with_albums', count: withAlbums.length })
        }
      }
    } catch (err) {
      const causeMsg = err.cause ? ` | cause: ${err.cause.code || err.cause.message || JSON.stringify(err.cause)}` : ''
      console.log(`ERROR: ${err.message}${causeMsg}`)
      stillUnresolved.push({ ksl_name: name, reason: 'api_error', error: err.message, cause: err.cause ? (err.cause.code || String(err.cause)) : null })
      fullBreakdown.push({ ksl_name: name, outcome: 'error', error: err.message, cause: err.cause ? (err.cause.code || String(err.cause)) : null })
    }
    fs.writeFileSync(OUT_REPORT, JSON.stringify(fullBreakdown, null, 2))
    fs.writeFileSync(OUT_RESOLVED, JSON.stringify(resolved, null, 2))
    fs.writeFileSync(OUT_UNRESOLVED, JSON.stringify(stillUnresolved, null, 2))
  }

  const remainingAfterThisRun = remaining.length - batch.length
  console.log('\n==== SUMMARY (this run) ====')
  console.log(`Total ambiguous_artist entries: ${amb.length}`)
  console.log(`Resolved so far (sole candidate with albums): ${resolved.filter(r => r.source === 'sole_candidate_with_albums').length}`)
  console.log(`Resolved so far (vote landslide): ${resolved.filter(r => r.source === 'vote_landslide').length}`)
  console.log(`Total resolved so far: ${resolved.length}`)
  console.log(`Still unresolved so far (real human-review backlog): ${stillUnresolved.length}`)
  if (remainingAfterThisRun > 0) {
    console.log(`\n${remainingAfterThisRun} names still unprocessed — run again to continue.`)
  } else {
    console.log('\nComplete — nothing left to process.')
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
