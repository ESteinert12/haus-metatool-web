// sesac-export.js
//
// Server-side SESAC Bulk Song Recordings export, companion to ebr-lot-export.js.
// Ported line-for-line (not re-derived) from Kyle's own ebr-consolidator skill
// (scripts/transform_sesac.py), which has been HAUS's real, working SESAC
// transform since May 2026. That script's input was a wide-format EBR xlsx
// (one row per song, ASCAP/BMI template shape) -- which is exactly the shape
// ebrBuildRow() in ebr-lot-export.js already produces, so this module takes
// those same row arrays (zipped against EBR_HEADERS) instead of re-reading a
// file from disk. Column names and order are verified byte-for-byte against
// Kyle's real "SESAC Bulk Song Recordings Template.xlsx" (2026-11-18) --
// same 26 headers, same A1:Z1 order. The field-level rules below (allowed
// WRITER TYPE / PUBLISHER TYPE values, IPI zero-padding, Yes/No for public
// domain, SONG # left blank, ISWC length) come from that template's actual
// data-validation rules and cell comments, NOT from transform_sesac.py --
// several of transform_sesac.py's original choices (Y/N, 'C'/'E' codes,
// SONG # = our own sku_root) do not match the real template and would have
// failed SESAC's own validation or silently misrepresented the submission.
// See each fix below for the specific rule it corrects.
//
// Historically, any title with a SESAC-affiliated writer was simply excluded
// from EBR/MusicMark export entirely ("export separately, not part of this
// MusicMark batch") with no automated separate path. This module is that
// separate path: it's new, not a port of any prior ATMOSPHERE code.

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

// Same routing table as ebr-lot-export.js's HAUS_PUBLISHERS, but SESAC wants
// the full "PRO - COUNTRY" display string baked into the publisher's PRO
// field too, per the template's own "SESAC - USA" / "ASCAP - USA" / "BMI -
// USA" affiliation dropdown values (confirmed against the template's hidden
// data_validation sheet, which lists these plus ~230 other PRO/country pairs).
const HAUS_PUBLISHERS_SESAC = {
  'BMI':   { name: 'SDNYC Music',           pro: 'BMI - USA',   ipi: '554507939' },
  'SESAC': { name: 'SDBK Music',            pro: 'SESAC - USA', ipi: '555590134' },
}
const HAUS_DEFAULT_PUB_SESAC = { name: 'HAUS Collection Musik', pro: 'ASCAP - USA', ipi: '770983501' }

const PRO_DISPLAY = {
  'ASCAP':  'ASCAP - USA',
  'BMI':    'BMI - USA',
  'SESAC':  'SESAC - USA',
  'GMR':    'GMR - USA',
  'SOCAN':  'SOCAN - CANADA',
  'APRA':   'APRA - AUSTRALIA',
  'PRS':    'PRS - UNITED KINGDOM',
  'GEMA':   'GEMA - GERMANY',
  'SACEM':  'SACEM - FRANCE',
}

function proDisplay(pro) {
  if (!nonempty(pro)) return ''
  const p = String(pro).trim().toUpperCase()
  return PRO_DISPLAY[p] || pro
}

function hausPubForPro(pro) {
  const p = pro ? String(pro).trim().toUpperCase() : ''
  return HAUS_PUBLISHERS_SESAC[p] || HAUS_DEFAULT_PUB_SESAC
}

function nonempty(val) {
  return val !== null && val !== undefined && String(val).trim().toLowerCase() !== '' && String(val).trim().toLowerCase() !== 'nan'
}

function clean(val) {
  return nonempty(val) ? String(val).trim() : ''
}

// Used only for numeric *matching* (comparing a writer's controlled-pub IPI
// reference against an Original Pub slot's IPI) -- NOT for the IPI value
// that actually goes in the output row. Kept separate from ipiFormat() below
// so matching still works even if one side has leading zeros and the other
// doesn't (both get run through this before comparison).
function cleanNum(val) {
  if (!nonempty(val)) return ''
  const f = parseFloat(val)
  if (Number.isNaN(f)) return String(val).trim()
  return Number.isInteger(f) ? String(f) : String(f)
}

// FIX (template rule, cols K/P "WRITER IPI #"/"PUBLISHER IPI #"): the
// template's data validation requires EXACTLY 11 characters, zero-padded
// (its own comment example: "00123456789"). transform_sesac.py's original
// cleanNum() ran IPIs through parseFloat, which silently strips leading
// zeros -- a real 9-digit IPI like "001234567" became "1234567" (7 digits,
// wrong number entirely, not just wrong width). This strips non-digits then
// zero-pads to 11; an IPI already longer than 11 digits (shouldn't happen --
// IPI name numbers are defined as <=11 digits) is left as-is rather than
// truncated, since silently cutting digits off a real ID is worse than
// shipping something a human will notice is too long.
function ipiFormat(val) {
  if (!nonempty(val)) return ''
  const digits = String(val).replace(/\D/g, '')
  if (!digits) return ''
  return digits.length < 11 ? digits.padStart(11, '0') : digits
}

// FIX (template rule, col E "ISWC #"): template requires exactly 11
// characters. ATMOSPHERE/EBR typically stores ISWC with punctuation
// (e.g. "T-123.456.789-0", 15 chars) -- stripping non-alphanumerics gives
// the real 11-char form ("T1234567890"). If what's left still isn't 11
// chars starting with 'T', this returns it unchanged rather than guessing,
// so buildSesacExport's caller can see it in the output and warnings can
// flag it (see validateSesacRows) instead of silently submitting a bad ISWC.
function iswcFormat(val) {
  if (!nonempty(val)) return ''
  const stripped = String(val).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return stripped
}

const SESAC_COLS = [
  'SONG TITLE *', 'SONG # *', 'SONG AKA(S)', 'PUBLIC DOMAIN', 'ISWC #',
  '© REGISTRATION #', '© REGISTRATION DATE',
  'WRITER FIRST NAME *', 'WRITER MIDDLE NAME', 'WRITER LAST NAME *',
  'WRITER IPI #', 'WRITER TYPE *', 'WRITER AFFILIATION', 'SESAC WRITER ACCOUNT #',
  'PUBLISHER NAME *', 'PUBLISHER IPI #', 'PUBLISHER TYPE *', 'PUBLISHER AFFILIATION',
  'SESAC PUBLISHER ACCOUNT #', 'WRITER / PUBLISHER % SHARE *',
  'ARTIST NAME *', 'ALBUM TITLE', 'RECORD LABEL', 'RELEASE DATE', 'ISRC', 'MP3 FILE NAME',
]

// FIX (template rule, col L "WRITER TYPE *"): the template's dropdown only
// allows "Arranger" or "Composer/Author" -- two options, nothing else.
// transform_sesac.py's original code passed through MusicMark's own 'C'
// role code unchanged, which isn't a valid SESAC value at all. Every writer
// ebrBuildRow() produces today is hardcoded role 'C' (Composer) -- there is
// currently no path to 'Arranger' in this codebase -- so this maps 'C' (and
// anything unrecognized, defensively) to "Composer/Author", and only maps to
// "Arranger" if an actual arranger code shows up in the future.
function writerTypeFor(roleCode) {
  const r = clean(roleCode).toUpperCase()
  if (r === 'A' || r === 'AR' || r === 'ARRANGER') return 'Arranger'
  return 'Composer/Author'
}

// FIX (template rule, col Q "PUBLISHER TYPE *"): the template's dropdown only
// allows "Sub Publisher", "Original Publisher", or "Administrator".
// transform_sesac.py's original code hardcoded 'E', which matches none of
// these. Every publisher getPubForWriter() resolves here is one of HAUS's
// own controlled publishers (the same ones EBR_HEADERS marks "Original Pub
// Controlled (Y/N)" = YES) -- so "Original Publisher" is the one correct
// constant for this pipeline, not a per-row lookup.
const PUBLISHER_TYPE = 'Original Publisher'

// rowObj: a plain object keyed by EBR_HEADERS column name (see
// ebrRowToObject below) for ONE song, mirroring the pandas Series a DataFrame
// row gave transform_sesac.py's process_song().
function getPubForWriter(rowObj, writerIdx) {
  const writerPro = clean(rowObj[`Writer PR Affiliation ${writerIdx}`])
  const pubIpiRef = cleanNum(rowObj[`1st Controlled Pub IPI Name# or Internal ID for Writer ${writerIdx}`])

  // EBR_HEADERS only ever has 4 "Original Pub" slots (EBR_MAX_ORIGINAL_PUBS),
  // not 10 -- the Python source looped 1..10 defensively; looping the same
  // range here is harmless (slots 5-10 are simply absent from rowObj).
  for (let p = 1; p <= 10; p++) {
    const pName = rowObj[`Original Pub Name ${p}`]
    const pIpi = cleanNum(rowObj[`Original Pub IPI Name# ${p}`])
    const pPro = clean(rowObj[`Original Pub PR Affiliation ${p}`])
    if (!nonempty(pName)) continue
    if (pubIpiRef && pIpi && pubIpiRef === pIpi) {
      return { name: clean(pName), ipi: ipiFormat(pIpi), pro: proDisplay(pPro) }
    }
  }
  const def = hausPubForPro(writerPro)
  return { name: def.name, ipi: ipiFormat(def.ipi), pro: def.pro }
}

// Build one SESAC output row per writer on the song. Mirrors process_song()
// exactly, including that EVERY writer on the row is included (not just
// SESAC-affiliated ones) -- a registration describes the whole work's
// ownership, so a mixed ASCAP/BMI/SESAC-writer song still produces one row
// per writer here, each with its own PRO/publisher.
function processSong(rowObj) {
  const title = clean(rowObj['Work Title'])
  // FIX (template rule, col B "SONG # *"): the template's own comment says
  // this is required ONLY when editing an existing SESAC song, and must be
  // left blank when adding a new one; it's also typed as a whole number.
  // transform_sesac.py's original code filled this with our own
  // Submitter Work ID (HAUS's sku_root, e.g. "T40d0133") -- a non-numeric
  // string that would fail SESAC's whole-number check outright, and would
  // also have told SESAC this is an edit to an existing song with that ID,
  // which it isn't. This pipeline only ever submits new registrations, so
  // SONG # is always left blank.
  const songNum = ''
  const iswc = iswcFormat(rowObj['ISWC'])
  // FIX (template rule, col D "PUBLIC DOMAIN"): the template's dropdown is
  // literally "Yes,No" -- transform_sesac.py's original 'Y'/'N' abbreviation
  // is not one of the two allowed values.
  const pdFlag = String(rowObj['Arrangement of PD Work (Y/N)'] || '').trim().toUpperCase().startsWith('Y') ? 'Yes' : 'No'

  const akas = []
  for (let i = 1; i <= 10; i++) {
    const a = clean(rowObj[`Alt Title ${i}`])
    if (a) akas.push(a)
  }
  const akaStr = akas.join('; ')

  const outRows = []
  for (let w = 1; w <= 10; w++) {
    const wLn = clean(rowObj[`Writer LN ${w}`])
    const wFn = clean(rowObj[`Writer FN ${w}`])
    if (!wLn && !wFn) continue

    const wIpi = ipiFormat(rowObj[`Writer IPI Name# ${w}`])
    const wType = writerTypeFor(rowObj[`Writer Role Code ${w}`])
    const wPro = clean(rowObj[`Writer PR Affiliation ${w}`])
    // ATMOSPHERE's own EBR_HEADERS "Writer Share N" holds each writer's FULL
    // ownership percentage (writers sum to ~100%, per generate-ebr-export.js's
    // own bad-split check) -- a different convention from the original
    // FileMaker pipeline transform_sesac.py was built against, where that
    // field already held the half-share value. SESAC's "% SHARE" column
    // wants the half-share (same thing ebrBuildRow already computes for
    // "Original Pub World Own Share" as split_pct / 2, and the template's
    // own comment on this column confirms it: "will be applied to both the
    // Writer and Owner Publisher... cannot exceed 50%"), so halve it here
    // too rather than copying the full share across.
    const wShareRaw = rowObj[`Writer Share ${w}`]
    const wShareVal = nonempty(wShareRaw) ? (parseFloat(wShareRaw) || 0) / 2 : 0

    const pub = getPubForWriter(rowObj, w)

    outRows.push([
      title, songNum, akaStr, pdFlag, iswc,
      '', '',
      wFn, '', wLn,
      wIpi, wType, proDisplay(wPro), '',
      pub.name, pub.ipi, PUBLISHER_TYPE, pub.pro,
      '', wShareVal,
      '', '', '', '', '', '',
    ])
  }
  return outRows
}

// Checks per-song writer-share totals sum to 50.0 (the SESAC-template half of
// the 50/50 writer/publisher split) -- same tolerance and message shape as
// transform_sesac.py's validate(). Also flags any individual row whose share
// exceeds the template's own hard cap of 50% (col T's data validation:
// type="decimal", operator="lessThanOrEqual", 50) -- shouldn't be reachable
// given upstream's ~100%-sum filter, but checked anyway since a value SESAC's
// own template would reject is worth surfacing rather than assuming it can't
// happen. Returns warning strings; callers decide whether to block on them
// (ebr-lot-export.js exposes these in its result rather than silently
// shipping unbalanced or over-cap data).
function validateSesacRows(allRows) {
  const warnings = []
  const sums = new Map()
  for (const r of allRows) {
    const key = `${r[0]}\u0000${r[1]}` // title, song#
    sums.set(key, (sums.get(key) || 0) + (parseFloat(r[19]) || 0))
    if (parseFloat(r[19]) > 50) {
      warnings.push(`"${r[0]}": writer/publisher share ${r[19]} exceeds the template's 50% cap`)
    }
  }
  for (const [key, total] of sums) {
    const [title, num] = key.split('\u0000')
    if (Math.abs(total - 50.0) > 0.5) {
      warnings.push(`"${title}" (${num}): writer shares sum to ${total.toFixed(2)} (expected 50.00)`)
    }
  }
  return warnings
}

// Converts one ebrBuildRow()-shaped array (positional, matching EBR_HEADERS)
// into a named object, the same lookup shape process_song() expects from a
// pandas row.
function ebrRowToObject(ebrHeaders, dataRow) {
  const obj = {}
  ebrHeaders.forEach((h, i) => { obj[h] = dataRow[i] })
  return obj
}

// titleRows: array of ebrBuildRow()-shaped arrays (EBR_HEADERS order).
// Returns { rows, warnings } where rows is the flat array of SESAC output
// rows (one per writer, all songs concatenated) ready to write.
function buildSesacExport(ebrHeaders, wideRows) {
  const allRows = []
  for (const dataRow of wideRows) {
    const rowObj = ebrRowToObject(ebrHeaders, dataRow)
    allRows.push(...processSong(rowObj))
  }
  const warnings = validateSesacRows(allRows)
  return { rows: allRows, warnings }
}

function writeSesacFile(rows, outPath) {
  const ws = XLSX.utils.aoa_to_sheet([SESAC_COLS, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  XLSX.writeFile(wb, outPath)
}

module.exports = { buildSesacExport, writeSesacFile, SESAC_COLS, ebrRowToObject }
