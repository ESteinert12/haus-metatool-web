// sesac-export.js
//
// Server-side SESAC Bulk Song Recordings export, companion to ebr-lot-export.js.
// Ported line-for-line (not re-derived) from Kyle's own ebr-consolidator skill
// (scripts/transform_sesac.py), which has been HAUS's real, working SESAC
// transform since May 2026. That script's input was a wide-format EBR xlsx
// (one row per song, ASCAP/BMI template shape) -- which is exactly the shape
// ebrBuildRow() in ebr-lot-export.js already produces, so this module takes
// those same row arrays (zipped against EBR_HEADERS) instead of re-reading a
// file from disk. Column names, routing table, IPI-matching logic and the
// 50% share-balance validation are all kept identical to the Python source --
// see transform_sesac.py for the authoritative comments on each rule.
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
// field too, per transform_sesac.py.
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

function cleanNum(val) {
  if (!nonempty(val)) return ''
  const f = parseFloat(val)
  if (Number.isNaN(f)) return String(val).trim()
  return Number.isInteger(f) ? String(f) : String(f)
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
      return { name: clean(pName), ipi: pIpi, pro: proDisplay(pPro) }
    }
  }
  const def = hausPubForPro(writerPro)
  return { name: def.name, ipi: def.ipi, pro: def.pro }
}

// Build one SESAC output row per writer on the song. Mirrors process_song()
// exactly, including that EVERY writer on the row is included (not just
// SESAC-affiliated ones) -- a registration describes the whole work's
// ownership, so a mixed ASCAP/BMI/SESAC-writer song still produces one row
// per writer here, each with its own PRO/publisher.
function processSong(rowObj) {
  const title = clean(rowObj['Work Title'])
  const songNum = clean(rowObj['Submitter Work ID'])
  const iswc = clean(rowObj['ISWC'])
  const pdFlag = String(rowObj['Arrangement of PD Work (Y/N)'] || '').trim().toUpperCase().startsWith('Y') ? 'Y' : 'N'

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

    const wIpi = cleanNum(rowObj[`Writer IPI Name# ${w}`])
    const wRole = clean(rowObj[`Writer Role Code ${w}`]) || 'C'
    const wPro = clean(rowObj[`Writer PR Affiliation ${w}`])
    // ATMOSPHERE's own EBR_HEADERS "Writer Share N" holds each writer's FULL
    // ownership percentage (writers sum to ~100%, per generate-ebr-export.js's
    // own bad-split check) -- a different convention from the original
    // FileMaker pipeline transform_sesac.py was built against, where that
    // field already held the half-share value. SESAC's "% SHARE" column
    // wants the half-share (same thing ebrBuildRow already computes for
    // "Original Pub World Own Share" as split_pct / 2), so halve it here too
    // rather than copying the full share across -- confirmed necessary by a
    // dry-run test: without this, two 50/50 writers validated as summing to
    // 100, not the expected 50.
    const wShareRaw = rowObj[`Writer Share ${w}`]
    const wShareVal = nonempty(wShareRaw) ? (parseFloat(wShareRaw) || 0) / 2 : 0

    const pub = getPubForWriter(rowObj, w)

    outRows.push([
      title, songNum, akaStr, pdFlag, iswc,
      '', '',
      wFn, '', wLn,
      wIpi, wRole, proDisplay(wPro), '',
      pub.name, pub.ipi, 'E', pub.pro,
      '', wShareVal,
      '', '', '', '', '', '',
    ])
  }
  return outRows
}

// Checks per-song writer-share totals sum to 50.0 (the SESAC-template half of
// the 50/50 writer/publisher split) -- same tolerance and message shape as
// transform_sesac.py's validate(). Returns warning strings; callers decide
// whether to block on them (ebr-lot-export.js exposes these in its result
// rather than silently shipping unbalanced data).
function validateSesacRows(allRows) {
  const sums = new Map()
  for (const r of allRows) {
    const key = `${r[0]}\u0000${r[1]}` // title, song#
    sums.set(key, (sums.get(key) || 0) + (parseFloat(r[19]) || 0))
  }
  const warnings = []
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
