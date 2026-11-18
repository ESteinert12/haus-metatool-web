#!/usr/bin/env node
// merge_artist_judgment_additions.js
//
// Merges ambiguous_artist_judgment_additions.json (produced by
// apply_artist_judgment_calls.js) into rmo_clean_names.json. Reads
// rmo_clean_names.json fresh right before writing, to avoid clobbering
// any other process (e.g. the background MusicBrainz pass, if it's ever
// running again) that might have written to it in the meantime.
//
// Run:
//   cd ~/Documents/GitHub/haus-metatool-web
//   node merge_artist_judgment_additions.js

const fs = require('fs')

function norm (s) {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function main () {
  const additions = JSON.parse(fs.readFileSync('ambiguous_artist_judgment_additions.json', 'utf8'))
  console.log(`Staged additions: ${additions.length}`)

  const rmoNames = JSON.parse(fs.readFileSync('rmo_clean_names.json', 'utf8'))
  const rmoNorms = new Set(rmoNames.map(norm))
  console.log(`Current rmo_clean_names.json: ${rmoNames.length} titles`)

  let addedCount = 0
  const newNames = [...rmoNames]
  for (const a of additions) {
    const n = norm(a.name)
    if (rmoNorms.has(n)) continue // defensive re-check; shouldn't happen, staging already deduped
    rmoNorms.add(n)
    newNames.push(a.name)
    addedCount++
  }

  fs.writeFileSync('rmo_clean_names.json', JSON.stringify(newNames, null, 2))
  console.log(`Merged ${addedCount} new titles. rmo_clean_names.json now has ${newNames.length} titles.`)
}

main()
