#!/usr/bin/env node
// apply_artist_judgment_calls.js
//
// Applies the 58 high-confidence judgment-call resolutions from
// ambiguous_artist_judgment_review.md (reviewed and approved by Kyle) to
// the remaining ambiguous_artist backlog. For each, re-fetches that chosen
// artist's qualifying studio albums from MusicBrainz (same filter as
// resolve_ambiguous_artist.js: primary-type Album, excluding Compilation/
// Live/Soundtrack/Remix/DJ-mix/Mixtape/Spokenword/Interview), takes the
// top 5 by rating_votes (matching this project's established per-artist
// cap from the original MusicBrainz pass), dedupes against the current
// rmo_clean_names.json, and merges in both:
//   - ambiguous_artist_newly_resolved.json (appends, source: 'judgment_call')
//   - rmo_clean_names.json (appends new album titles, read-fresh-then-write)
//
// Does NOT touch the 25 genuine ties -- those stay in
// ambiguous_artist_still_unresolved.json untouched for Kyle's own review.
//
// Run (resumable -- device_bash/terminal time limits apply the same way):
//   cd ~/Documents/GitHub/haus-metatool-web
//   node apply_artist_judgment_calls.js

const fs = require('fs')

const UA = 'HausMetatoolAmbiguousArtistResolver/1.0 (+https://hausmusic.com)'
const BASE_INTERVAL_MS = 1100
function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

const EXCLUDE_SECONDARY = new Set(['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape', 'Spokenword', 'Interview'])
const TOP_N = 5

function norm (s) {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function mbFetch (url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
  if (res.status === 503) {
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

async function getStudioAlbums (artistId) {
  const url = `https://musicbrainz.org/ws/2/release-group?artist=${artistId}&type=album&limit=100&inc=ratings&fmt=json`
  const data = await mbFetch(url)
  const groups = data['release-groups'] || []
  const qualifying = groups.filter(g => {
    const secondary = g['secondary-types'] || []
    return !secondary.some(t => EXCLUDE_SECONDARY.has(t))
  })
  return qualifying.map(g => ({
    id: g.id,
    title: g.title,
    year: (g['first-release-date'] || '').slice(0, 4),
    rating_votes: (g.rating && g.rating['votes-count']) || 0,
    rating_value: (g.rating && g.rating.value) || null
  }))
}

// {ksl_name: {artist_id, artist_name, disambiguation}} -- the 58 approved judgment calls
const JUDGMENT_CALLS = {
  'Adam Cohen': { artist_id: '32812b1f-c62e-4625-be28-812c190e5219', artist_name: 'Adam Cohen', disambiguation: 'Canadian singer-songwriter' },
  'Agent Orange': { artist_id: '3214be8b-6d78-4c8e-9c93-b1e31a9bc4d6', artist_name: 'Agent Orange', disambiguation: 'California surf-punk' },
  'Alice Cooper': { artist_id: 'ee58c59f-8e7f-4430-b8ca-236c4d3745ae', artist_name: 'Alice Cooper', disambiguation: 'the singer, active as a solo artist 1975-present' },
  'Ashra': { artist_id: '2d262241-ad1e-4b2d-904a-c38039f0a531', artist_name: 'Ashra', disambiguation: 'electronic spin-off of Ash Ra Tempel' },
  'ATC': { artist_id: '408b2a33-d229-46a5-a361-0667bc616e34', artist_name: 'ATC', disambiguation: 'German Euro-dance group' },
  'Black Coffee': { artist_id: '7fa03932-cd68-498f-aa4f-d4a6a2ce6071', artist_name: 'Black Coffee', disambiguation: 'house DJ/producer Nkosinathi Maphumulo' },
  'Broken Bells': { artist_id: '62d364d2-550b-420e-b918-b3bd1e4a2efc', artist_name: 'Broken Bells', disambiguation: 'indie rock duo Danger Mouse & James Mercer' },
  'Buddha Bar': { artist_id: 'b1e42b46-1e46-4cf1-8e85-e044a596bd46', artist_name: 'Buddha-Bar', disambiguation: 'Artist from Amazon' },
  'Cannons': { artist_id: 'eb9eb9f8-c691-4fef-9bdf-0cbffbfa42ee', artist_name: 'Cannons', disambiguation: 'electro pop band from Los Angeles, CA' },
  'Cybotron': { artist_id: 'cd1a3be7-a10b-499c-acdd-1defaea473f8', artist_name: 'Cybotron', disambiguation: 'Detroit techno group founded by Juan Atkins & Richard Davis' },
  'David Rose': { artist_id: 'a429333f-fb1e-4158-95f1-74617c870077', artist_name: 'David Rose', disambiguation: 'songwriter, pianist and orchestra leader' },
  'Dirty Honey': { artist_id: 'de7ecc1f-487c-4ef9-8a0c-c18146c309c4', artist_name: 'Dirty Honey', disambiguation: 'Los Angeles blues/hard rock band' },
  'DJ Krush': { artist_id: '38d16213-25ba-450d-8665-4e08548e62e3', artist_name: 'DJ Krush', disambiguation: 'Japan, producer, DJ' },
  'DNA': { artist_id: '97cecdca-af46-4344-9677-ed80bfe43b66', artist_name: 'DNA', disambiguation: '90s UK dance, key tracks "Tom\'s Diner", "Can You Handle It?"' },
  'Dogs': { artist_id: '83658bca-b1a8-4086-b94c-5ef535ce822b', artist_name: 'Dogs', disambiguation: 'French rock band' },
  'Double Trouble': { artist_id: '2452fb69-e6b0-4834-aa94-b4a0635b7a96', artist_name: 'Double Trouble', disambiguation: 'assoc. with Stevie Ray Vaughan' },
  'Excision': { artist_id: '733c6e6f-0306-403e-9243-82b16a4f82d8', artist_name: 'Excision', disambiguation: 'dubstep producer' },
  'Feed Me': { artist_id: 'c8eec78b-f3c5-4d59-a010-e709f7be4508', artist_name: 'Feed Me', disambiguation: 'Jon Gooch, UK electronic artist' },
  'Fergie': { artist_id: '1c46e82f-4764-4d82-a33b-5d5aee5e2881', artist_name: 'Fergie', disambiguation: 'American singer' },
  'Gary Stewart': { artist_id: 'cc8337c4-2e82-4392-9b56-1283fb0a6015', artist_name: 'Gary Stewart', disambiguation: 'US country musician & songwriter' },
  'Gigi': { artist_id: 'df5eef30-7463-4f8c-bbb3-c7b70cb04f69', artist_name: 'GIGI', disambiguation: 'Indonesian pop rock band' },
  'H.E.R': { artist_id: '93998e01-ff53-4af7-ba2a-5674adcdf21e', artist_name: 'H.E.R.', disambiguation: 'US R&B artist' },
  'John Paul Young': { artist_id: '2af13455-6062-473c-af2a-804a0ac7f641', artist_name: 'John Paul Young', disambiguation: 'Australian pop singer' },
  'John Williams': { artist_id: '53b106e7-0cc6-42cc-ac95-ed8d30a3a98e', artist_name: 'John Williams', disambiguation: 'American score composer and conductor' },
  'Lakeside': { artist_id: '4e2dc6e4-1808-4850-8e97-df7ea8007f39', artist_name: 'Lakeside', disambiguation: 'US funk band' },
  'MAGIC!': { artist_id: '53fa616a-e2b4-4982-bef8-6362b44054f0', artist_name: 'MAGIC!', disambiguation: 'Canadian reggae-pop band' },
  'Marc Antoine': { artist_id: 'e974b781-bfb9-43df-b1b6-565baf9768b0', artist_name: 'Marc Antoine', disambiguation: 'French jazz guitarist' },
  'Mark Knight': { artist_id: 'b7ec322e-3450-4bd0-ac3c-1e2e9744e32b', artist_name: 'Mark Knight', disambiguation: 'UK house DJ & producer; founded Toolroom Records' },
  'Maxwell': { artist_id: 'd252cca8-8214-43e5-b81a-101eb4a1447e', artist_name: 'Maxwell', disambiguation: 'US soul/R&B singer-songwriter' },
  'Meduza': { artist_id: '016b6741-a443-492c-ae7f-fb0378d3270e', artist_name: 'MEDUZA', disambiguation: 'Italian production trio' },
  'Mike Jones': { artist_id: '08962fc5-ed17-453b-9c68-ff7922eb4957', artist_name: 'Mike Jones', disambiguation: 'US rapper' },
  'MK': { artist_id: '4545675e-4006-4271-8e82-703cae7e1748', artist_name: 'MK', disambiguation: 'US house producer Marc Kinchen' },
  'Mr. President': { artist_id: '6255d25c-8231-4ff5-9b49-e26d760d6466', artist_name: 'Mr. President', disambiguation: 'German Euro-Dance trio' },
  'No Mercy': { artist_id: '8f7725c5-de2f-4987-9e0e-5d5604ab264b', artist_name: 'No Mercy', disambiguation: 'US pop/dance trio' },
  'Olive': { artist_id: '39e82ca1-733e-4203-a00f-c6a70a371625', artist_name: 'Olive', disambiguation: 'UK dance/breakbeat/trip-hop group' },
  'OMI': { artist_id: '33e6ded6-22cc-447e-aefa-9a7a6ba81b6b', artist_name: 'OMI', disambiguation: '"Cheerleader", Jamaican reggae/pop artist Omar Samuel Pasley' },
  'Pepper': { artist_id: '04f8dad4-de2d-4e98-8837-6a55075a9847', artist_name: 'Pepper', disambiguation: 'dub rock band from Hawaii' },
  'Pete Rodriguez': { artist_id: 'da29a598-bb58-481d-a9eb-8ad9ef00a515', artist_name: 'Pete Rodriguez', disambiguation: 'boogaloo artist' },
  'Phoenix': { artist_id: '8d455809-96b3-4bb6-8829-ea4beb580d35', artist_name: 'Phoenix', disambiguation: 'French indie band' },
  'Proleter': { artist_id: '1f7ea922-f391-4089-bced-9b1e035e4642', artist_name: 'ProleteR', disambiguation: 'French swing-hop producer' },
  'Rob Thomas': { artist_id: 'e42680f7-e439-4666-9c2c-536c2b3c6db3', artist_name: 'Rob Thomas', disambiguation: 'Matchbox Twenty' },
  'Rockwell': { artist_id: 'b7d224b3-a31c-4616-b69f-b6fcabd5cfbd', artist_name: 'Rockwell', disambiguation: 'R&B - "Somebody\'s Watching Me"' },
  'Sergio Vargas': { artist_id: '04fc84a1-5efa-4ae3-b763-a0aeaab9f65c', artist_name: 'Sergio Vargas', disambiguation: 'Dominican merengue singer' },
  'Sigma': { artist_id: '89ec6f82-1ad7-42d5-983e-ebf90f6868c8', artist_name: 'Sigma', disambiguation: 'UK drum & bass production duo' },
  'Stax': { artist_id: '83c257d6-3076-43cb-b428-d3c13f668706', artist_name: 'Stax', disambiguation: 'jazz' },
  'Steam': { artist_id: '7c1bfa64-9ff6-4b3f-a5aa-610298b76a55', artist_name: 'Steam', disambiguation: '60s US pop-rock band' },
  'Temples': { artist_id: '1916fc94-bf9c-4ba2-90b0-22ebb5444d57', artist_name: 'Temples', disambiguation: 'English psychedelic rock band' },
  'The Carter Family': { artist_id: '29c5b1fb-5dcc-4499-b225-4ceeeb8a73d1', artist_name: 'The Carter Family', disambiguation: 'the original Carter Family, 1927-1943' },
  'The Highwaymen': { artist_id: 'c685765c-b778-4ed6-9035-8f7088431765', artist_name: 'The Highwaymen', disambiguation: 'country supergroup' },
  'The Phantoms': { artist_id: 'caf28186-af18-4b48-aadb-22ce1218b0ca', artist_name: 'The Phantoms', disambiguation: 'Nashville rock band founded by Andrew Simple' },
  'The Sundays': { artist_id: '9df32318-47d5-4df7-bc68-3ed9e15eb0f6', artist_name: 'The Sundays', disambiguation: '(unlabeled, 3 albums matches real discography)' },
  'The Urge': { artist_id: '4c35ea75-02d5-4a7a-8b01-f17effc07580', artist_name: 'The Urge', disambiguation: 'US alternative rock band' },
  'The Wanted': { artist_id: 'bcb16f22-b064-4b80-b3a3-c824bccdbab1', artist_name: 'The Wanted', disambiguation: 'English-Irish pop boy band' },
  'Thomas Schumacher': { artist_id: '25fdd039-edad-466e-b150-d7405c4da995', artist_name: 'Thomas Schumacher', disambiguation: '(unlabeled, 4 albums)' },
  'Twenty 4 Seven': { artist_id: '5fdbf7e7-8643-44ad-94a7-3d669e3876e4', artist_name: 'Twenty 4 Seven', disambiguation: 'euro house' },
  'Tyla': { artist_id: '45425c84-9092-4e2c-b732-e1d0280b580a', artist_name: 'Tyla', disambiguation: 'South African singer' },
  'Walk The Moon': { artist_id: 'd4aad415-9cd0-4845-9b05-0416fdcc9fc4', artist_name: 'WALK THE MOON', disambiguation: 'indie rock band 2008+' },
  'Zebra': { artist_id: 'a8ad585a-2776-4531-a1cc-93b9a3c9d43b', artist_name: 'Zebra', disambiguation: 'US hard rock band' }
}

async function main () {
  const names = Object.keys(JUDGMENT_CALLS)
  console.log(`Total judgment-call names to apply: ${names.length}`)

  const resolvedFile = 'ambiguous_artist_newly_resolved.json'
  let resolved = fs.existsSync(resolvedFile) ? JSON.parse(fs.readFileSync(resolvedFile, 'utf8')) : []
  const alreadyResolved = new Set(resolved.map(r => r.ksl_name))

  const additionsFile = 'ambiguous_artist_judgment_additions.json'
  let additions = fs.existsSync(additionsFile) ? JSON.parse(fs.readFileSync(additionsFile, 'utf8')) : []

  const progressFile = 'ambiguous_artist_judgment_progress.json'
  let progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : []
  const done = new Set(progress.filter(p => p.outcome !== 'error').map(p => p.ksl_name))

  // Read rmo_clean_names.json fresh each time to avoid racing other processes
  const rmoNames = JSON.parse(fs.readFileSync('rmo_clean_names.json', 'utf8'))
  const rmoNorms = new Set(rmoNames.map(norm))

  const remaining = names.filter(n => !done.has(n))
  console.log(`Remaining: ${remaining.length}`)

  let i = 0
  for (const name of remaining) {
    i++
    const call = JUDGMENT_CALLS[name]
    process.stdout.write(`[${i}/${remaining.length}] ${name} -> ${call.artist_name} [${call.disambiguation}] ... `)
    try {
      const albums = await getStudioAlbums(call.artist_id)
      await sleep(BASE_INTERVAL_MS)
      const top = [...albums].sort((a, b) => (b.rating_votes || 0) - (a.rating_votes || 0)).slice(0, TOP_N)

      if (!alreadyResolved.has(name)) {
        resolved.push({ ksl_name: name, artist_id: call.artist_id, artist_name: call.artist_name, source: 'judgment_call', disambiguation: call.disambiguation, top_albums: top })
      }

      let added = 0
      for (const a of top) {
        if (!a.title) continue
        if (rmoNorms.has(norm(a.title))) continue
        additions.push({
          name: a.title,
          content_type: 'album',
          reference_artist: name,
          year: a.year,
          rating_votes: a.rating_votes,
          rating_value: a.rating_value,
          mb_release_group_id: a.id,
          added_via_ksl: name,
          resolution_source: 'judgment_call'
        })
        rmoNorms.add(norm(a.title))
        added++
      }
      console.log(`${albums.length} studio albums, ${added} new RMO titles staged`)
      progress.push({ ksl_name: name, outcome: 'done', album_count: albums.length, added })
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      progress.push({ ksl_name: name, outcome: 'error', error: err.message })
    }
    fs.writeFileSync(resolvedFile, JSON.stringify(resolved, null, 2))
    fs.writeFileSync(additionsFile, JSON.stringify(additions, null, 2))
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2))
  }

  console.log('\n==== SUMMARY ====')
  console.log(`Total names: ${names.length}`)
  console.log(`Done: ${progress.filter(p => p.outcome === 'done').length}`)
  console.log(`Errors: ${progress.filter(p => p.outcome === 'error').length}`)
  console.log(`Total RMO titles staged: ${additions.length}`)
  console.log('\nNOTHING merged into rmo_clean_names.json yet -- that is a separate step')
  console.log('(merge_artist_judgment_additions.js) once this finishes cleanly.')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
