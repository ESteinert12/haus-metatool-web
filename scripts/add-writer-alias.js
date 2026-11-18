#!/usr/bin/env node
// Add/update a writer-name alias (e.g. "Steve Mayone" -> "Stephen Mayone"), so
// the Cue Sheets tab's writer-splits mismatch warning (splitsMismatch() in
// index.html) doesn't flag a nickname/spelling variant as "not on file."
//
//   node scripts/add-writer-alias.js "<alias>" "<canonical name>"
//
// Example:
//   node scripts/add-writer-alias.js "Steve Mayone" "Stephen Mayone"
//
// This is deliberately display-only and scoped to the cue-sheet mismatch
// check (per Erik, 2026-11-17) -- it does NOT affect title/SKU matching or
// any royalty/payment logic, both of which match by title, never by writer
// name. The Cue Sheets tab also has a "Save alias" button right on each
// mismatched name now (one click, scoped to that cue's actual on-file
// writers) -- use that for the normal day-to-day case. This script is for
// adding an alias directly, without having a cue sheet open in front of you
// (e.g. clearing a backlog of known variants in one sitting). Needs
// DATABASE_URL in the environment (or .env), the same connection api.js uses.

require('dotenv').config()
const { Pool } = require('pg')

const normalize = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()

;(async () => {
  const aliasArg     = process.argv[2]
  const canonicalArg = process.argv[3]
  if (!aliasArg || !canonicalArg) {
    console.error('usage: node scripts/add-writer-alias.js "<alias>" "<canonical name>"')
    console.error('example: node scripts/add-writer-alias.js "Steve Mayone" "Stephen Mayone"')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (put it in .env)'); process.exit(1) }

  const alias = normalize(aliasArg)
  const canonical = normalize(canonicalArg)
  if (alias === canonical) {
    console.error(`alias and canonical name normalize to the same thing ("${alias}") -- nothing to add.`)
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    // Defensive: api.js creates this table itself on startup, but this
    // script may be run before that code has been deployed. Idempotent, so
    // harmless once the real schema-init has also run.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS writer_aliases (
        id             SERIAL PRIMARY KEY,
        alias          TEXT NOT NULL UNIQUE,
        canonical_name TEXT NOT NULL,
        created_at     TIMESTAMPTZ DEFAULT now()
      )
    `)
    const r = await pool.query(
      `INSERT INTO writer_aliases (alias, canonical_name) VALUES ($1, $2)
       ON CONFLICT (alias) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
       RETURNING alias, canonical_name`,
      [alias, canonical])
    console.log(`✅ "${r.rows[0].alias}" -> "${r.rows[0].canonical_name}"`)
  } finally { await pool.end() }
})().catch(e => { console.error(e.message); process.exit(1) })
