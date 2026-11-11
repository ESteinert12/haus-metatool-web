#!/usr/bin/env node
// diff_ksl_rmo_live.js — READ-ONLY. No INSERT, UPDATE, or DELETE anywhere in
// this file. Connects to the real production Neon DB (DATABASE_URL in .env)
// and pulls the current live ksl_name / rmo_name values, then diffs them
// against our local rmo_clean_names.json / ksl_clean_names.json so we know
// exactly what's actually new before writing any merge script.
//
// Run:
//   cd ~/Documents/GitHub/haus-metatool-web
//   node diff_ksl_rmo_live.js

require('dotenv').config()
const fs = require('fs')
const { Pool } = require('pg')

const connStr = process.env.DATABASE_URL
if (!connStr) { console.error('Missing DATABASE_URL in .env'); process.exit(1) }

function norm (s) {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function main () {
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    statement_timeout: 20000,
    query_timeout: 25000
  })

  console.log('Connecting to production Neon (read-only queries only)...')

  const kslRes = await pool.query('SELECT ksl_name FROM ksl ORDER BY ksl_name')
  const rmoRes = await pool.query('SELECT rmo_name FROM rmo ORDER BY rmo_name')
  await pool.end()

  const liveKsl = kslRes.rows.map(r => r.ksl_name)
  const liveRmo = rmoRes.rows.map(r => r.rmo_name)
  console.log(`Live production: ${liveKsl.length} ksl rows, ${liveRmo.length} rmo rows`)

  const localKsl = JSON.parse(fs.readFileSync('ksl_clean_names.json', 'utf8'))
  const localRmo = JSON.parse(fs.readFileSync('rmo_clean_names.json', 'utf8'))
  console.log(`Local files: ${localKsl.length} ksl names, ${localRmo.length} rmo names`)

  const liveKslNorms = new Set(liveKsl.map(norm))
  const liveRmoNorms = new Set(liveRmo.map(norm))
  const localKslNorms = new Set(localKsl.map(norm))
  const localRmoNorms = new Set(localRmo.map(norm))

  const kslNewLocal = localKsl.filter(n => !liveKslNorms.has(norm(n)))
  const kslOnlyLive = liveKsl.filter(n => !localKslNorms.has(norm(n)))
  const rmoNewLocal = localRmo.filter(n => !liveRmoNorms.has(norm(n)))
  const rmoOnlyLive = liveRmo.filter(n => !localRmoNorms.has(norm(n)))

  console.log('\n==== KSL ====')
  console.log(`In local but NOT in production (need to insert): ${kslNewLocal.length}`)
  console.log(`In production but NOT in local (production has drifted ahead): ${kslOnlyLive.length}`)

  console.log('\n==== RMO ====')
  console.log(`In local but NOT in production (need to insert): ${rmoNewLocal.length}`)
  console.log(`In production but NOT in local (production has drifted ahead): ${rmoOnlyLive.length}`)

  fs.writeFileSync('live_vs_local_diff.json', JSON.stringify({
    live_counts: { ksl: liveKsl.length, rmo: liveRmo.length },
    local_counts: { ksl: localKsl.length, rmo: localRmo.length },
    ksl_new_in_local: kslNewLocal,
    ksl_only_in_live: kslOnlyLive,
    rmo_new_in_local: rmoNewLocal,
    rmo_only_in_live: rmoOnlyLive
  }, null, 2))
  console.log('\nFull diff written to live_vs_local_diff.json')
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
