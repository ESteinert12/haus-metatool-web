// shows.js — shared show-normalization/resolution helpers.
//
// episodes.program is free text, scraped verbatim from each cue sheet's own
// metadata header (cue-sheet-import.js, one block per format) — confirmed by
// reading every format's parser that NOTHING normalizes it: capitalization,
// punctuation, and whitespace all pass through exactly as the source file
// wrote them. The episode dedupe key in api.js's cue-sheet import route is
// an EXACT TEXT match on (program, episode_num), so any variant spelling of
// the same real show silently creates a second, disconnected "show" with no
// way to tell it's the same one — and there was nowhere to put show-level
// metadata (network, producer, status) since there was no shows row at all.
//
// This module is the one place "what counts as the same show" is decided,
// pulled out of api.js (which can't be require()'d directly — it calls
// app.listen() at load time, same constraint as every other live-DB script
// in this project) so the exact same logic runs both in the live import
// route and in the offline dry-run/backfill scripts. There must never be two
// implementations of this that can drift apart from each other.
//
// Deliberately CONSERVATIVE: only trim + collapse internal whitespace +
// uppercase. No fuzzy/similarity matching (Levenshtein, etc.) — without
// having seen the real distribution of episodes.program values (Neon isn't
// reachable from the cloud session that wrote this; see
// dryrun-shows-normalization.js), a fuzzy merge risks silently combining two
// real, different shows that happen to have similar names (e.g. "SNAPPED"
// vs "SNAPPED NOTORIOUS" are different shows, not a spelling variant of one).
// Anything beyond exact-after-normalization drift is surfaced for a human to
// decide, never auto-merged.

function normalizeShowAlias(program) {
  return String(program || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

// Resolve (or create) the shows row a raw `program` string belongs to.
// `client` is anything with an async .query(sql, params) method — a pg
// Pool, a pg PoolClient inside a transaction, or a mock with the same shape
// (see the mock-DB test pattern used elsewhere in this project).
// Returns null for a blank/null program — nothing to key a show off of.
async function resolveShowId(client, program) {
  const raw = String(program || '').trim()
  if (!raw) return null
  const alias = normalizeShowAlias(raw)

  const found = await client.query(`SELECT show_id FROM show_aliases WHERE alias = $1 LIMIT 1`, [alias])
  if (found.rows.length) return found.rows[0].show_id

  const newShow = await client.query(`INSERT INTO shows (name) VALUES ($1) RETURNING id`, [raw])
  const showId = newShow.rows[0].id

  // ON CONFLICT DO NOTHING + re-lookup: two concurrent imports both seeing
  // this show for the first time could race here. If this insert loses the
  // race, fall through to the alias the winner just inserted rather than
  // erroring out or leaving two shows rows for the same alias.
  const savedAlias = await client.query(
    `INSERT INTO show_aliases (show_id, alias) VALUES ($1,$2) ON CONFLICT (alias) DO NOTHING RETURNING show_id`,
    [showId, alias]
  )
  if (savedAlias.rows.length) return showId

  const raced = await client.query(`SELECT show_id FROM show_aliases WHERE alias = $1 LIMIT 1`, [alias])
  return raced.rows[0]?.show_id ?? showId
}

module.exports = { normalizeShowAlias, resolveShowId }
