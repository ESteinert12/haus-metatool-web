// royalty-episode-match.js
//
// Resolves a royalty statement line's free-text show_name/episode_name
// (scraped per-format in royalty-import.js, confirmed by code review to be
// populated on 56-99% of real lines depending on PRO) to a real row in the
// episodes table, scoped to a show already known via shows.js's
// show_aliases.
//
// Deliberately conservative, same spirit as shows.js: LOOKUP the show,
// never create one from royalty text (see shows.js's lookupShowId comment
// for why). Episode resolution only ever runs once a show has resolved --
// matching episode titles across unrelated shows is exactly where a false
// positive could sneak in. Any ambiguity (zero or multiple candidate
// episodes) is reported, not guessed at.
//
// Pulled into its own module (not inside api.js, which can't be require()'d
// -- it calls app.listen() at load time) so the same logic runs in the live
// import route, in offline dry-run/analysis scripts, and in a mock-DB test.

const { lookupShowId } = require('./shows.js')

// Real data quirk, confirmed by scanning the actual ROYALTY STATEMENTS
// archive (321 files): the SAME real episode title gets mangled differently
// by different PROs' CSV exports -- ASCAP drops apostrophes outright
// ("CANT CATCH A BREAK"), BMI replaces them with a space
// ("CAN T CATCH A BREAK"). Stripping ALL non-alphanumeric characters (not
// just collapsing whitespace) makes every real variant of "Can't Catch a
// Break" collapse to the same key, which is what actually lets this work
// without a fuzzy/similarity matcher.
function normalizeEpisodeKey(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// SESAC appends "(Ep 162)" to episode_name; pulls the number out and
// returns the text with the suffix removed, or null if there's no such
// suffix (most formats don't have one -- that's normal, not a parse miss).
function extractEpisodeNumberSuffix(text) {
  const raw = String(text || '')
  const m = raw.match(/^(.*?)\s*\(\s*ep\.?\s*(\d+)\s*\)\s*$/i)
  if (!m) return null
  return { cleanedText: m[1].trim(), episodeNum: m[2] }
}

// ASCAP_FOR-specific real quirk, confirmed in the same scan: its "Series
// Name" column sometimes carries the episode info crammed into the SAME
// field with a "#" separator, e.g. "AMERICAN PICKERS #SOMETHING WEIRD HERE"
// or "AMERICAN PICKERS #HYDRO HOMESTEAD #208". Stripping from the first "#"
// onward before the show lookup matters for EVERY format that might do this
// (not just ASCAP_FOR) -- without it, the show text would normalize
// differently from the plain "AMERICAN PICKERS" alias and fail to resolve
// at all, which is the bigger risk than losing the embedded episode hint.
// What follows the "#" is kept only as a weak fallback hint, since the
// dedicated episode_name field is already reliable on this format 98.4% of
// the time per the same scan.
function splitShowField(rawShowName) {
  const raw = String(rawShowName || '').trim()
  const hashIdx = raw.indexOf('#')
  if (hashIdx === -1) return { show: raw, hintParts: [] }
  const show = raw.slice(0, hashIdx).trim()
  const hintParts = raw.slice(hashIdx + 1).split('#').map(s => s.trim()).filter(Boolean)
  return { show, hintParts }
}

// client: anything with an async .query(sql, params) -- a pg Pool, a
// PoolClient inside a transaction, or a mock (same convention as shows.js).
// episodeCache: optional Map(showId -> episodes[]) the caller can reuse
// across many lines in the same import so each show's episode list is only
// fetched once, not once per line.
async function resolveRoyaltyLineEpisode(client, { showNameRaw, episodeNameRaw }, episodeCache) {
  const { show: showNameForLookup, hintParts } = splitShowField(showNameRaw)
  const showId = await lookupShowId(client, showNameForLookup)
  if (!showId) return { matchedEpisodeId: null, reason: 'show_not_found' }

  let episodes
  if (episodeCache && episodeCache.has(showId)) {
    episodes = episodeCache.get(showId)
  } else {
    const r = await client.query(`SELECT id, episode_num, episode_title FROM episodes WHERE show_id = $1`, [showId])
    episodes = r.rows
    if (episodeCache) episodeCache.set(showId, episodes)
  }
  if (!episodes.length) return { matchedEpisodeId: null, reason: 'show_has_no_episodes' }

  // Try an explicit episode NUMBER first -- a stronger, independent signal
  // than text when one is present (SESAC's "(Ep 162)" suffix; the ASCAP_FOR
  // "#208"-style hint). episode_num is stored as TEXT -- compare trimmed
  // text, not numeric, since real values aren't guaranteed zero-padded the
  // same way on both sides.
  const epSuffix = extractEpisodeNumberSuffix(episodeNameRaw)
  const numericHint = hintParts.find(p => /^\d+$/.test(p))
  const episodeNum = epSuffix?.episodeNum || numericHint || null
  if (episodeNum) {
    const numMatches = episodes.filter(e => e.episode_num && String(e.episode_num).trim() === episodeNum)
    if (numMatches.length === 1) return { matchedEpisodeId: numMatches[0].id, reason: 'episode_number' }
    // 0 or >1 numeric matches: don't give up yet, fall through to a text
    // match below -- the episode might just not carry episode_num in our
    // own data, which isn't the same as the royalty line being wrong.
  }

  // Text match: the cleaned episode_name (suffix removed) if present,
  // otherwise the ASCAP_FOR-style non-numeric hint text as a fallback.
  const textCandidate = epSuffix?.cleanedText || String(episodeNameRaw || '').trim() || hintParts.find(p => !/^\d+$/.test(p)) || ''
  const normKey = normalizeEpisodeKey(textCandidate)
  if (!normKey) return { matchedEpisodeId: null, reason: 'no_episode_text' }

  const textMatches = episodes.filter(e => normalizeEpisodeKey(e.episode_title || '') === normKey)
  if (textMatches.length === 1) return { matchedEpisodeId: textMatches[0].id, reason: 'episode_title' }
  if (textMatches.length > 1) return { matchedEpisodeId: null, reason: 'episode_ambiguous' }
  return { matchedEpisodeId: null, reason: 'episode_not_found' }
}

module.exports = { normalizeEpisodeKey, extractEpisodeNumberSuffix, splitShowField, resolveRoyaltyLineEpisode }
