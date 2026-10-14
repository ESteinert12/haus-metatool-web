// cue-sheet-import.js
//
// Parses cue sheets from production companies and PROs (SESAC/ASCAP/etc) and
// matches the cues against HAUS's own catalog (titles/team_writers) so splits
// can be verified. Separate track from the EBR registration/export pipeline
// (generate-ebr-export.js, ebr-lot-export.js) -- this is NOT part of that.
//
// Formats handled (confirmed against real files, not guessed -- see the
// parse_cue_sheets.py proof-of-concept this was ported from):
//   A) PRO cue sheet CSV (e.g. "Cue_Sheet_Details_####_SESAC_LLC.csv")
//      Either a metadata header block + "Seq #,Song Title,...,IP Name,Role,
//      Society" rows (one row per party, repeated Seq# per cue), OR the same
//      shape with no metadata block and a leading unnamed ref-code column.
//      Some real exports of this type only ever include the composer (C) row,
//      never a publisher (E) row -- handled via the title-prefix fallback.
//   B) Production "MUSIC FINAL" xlsx (e.g. "AP12 385 Evel Empire MUSIC
//      FINAL.xlsx"): CLIP NAME, START TIME, END TIME, DURATION, WRITER,
//      PUBLISHER -- writer/publisher cells packed as
//      "NAME, PRO, PCT%, NAME2, PRO2, PCT2%, ..."
//   C) Internal HAUS pre-filtered per-episode log (e.g. "SN2804.csv"):
//      EPID,Cue#,Song Title,Start Time,End Time,Duration -- no party info,
//      already HAUS-only by construction (source already filtered to HAUS).
//   D) Internal HAUS per-episode log w/ full party detail (e.g. "HAUS CUE
//      SHEET_AP12385.xlsx"): EPID, Cue Number, Filename, Writers, Publishers
//      -- multiple parties pipe-separated: "Name, PRO, Pct | Name2, PRO2, Pct2"
//
// Any file that doesn't match one of these shapes comes back as format
// 'UNKNOWN' with zero cues rather than a guess -- surfaced to the importer so
// a human decides what to do with it, per this project's no-guessing rule.

const XLSX = require('xlsx');
const fs = require('fs');

// ── Title normalization (for matching against titles.title) ────────────────
function normTitle(raw) {
  if (!raw) return '';
  let s = String(raw).toUpperCase();
  s = s.replace(/[_-]+/g, ' ');
  s = s.replace(/\b(FULL|NODR|NO DRUMS|DNB|DRUMS AND FX|MIX|ALT MIX|NOPNO|NODMSPERC)\b/g, '');
  s = s.replace(/[^A-Z0-9 ]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Forward-transform a catalog title into the same camelCase, no-separator
// form buildHausName() (index.html) uses to build a shipped filename's title
// segment -- e.g. "Deadly Delight" -> "DeadlyDelight". Kept byte-for-byte in
// sync with that function's own transform so a filename-derived title
// segment can be compared against this as an EXACT match, never a guessed
// reversal (ported 2026-10-14, see parseHausFilenameTitle below).
function titleToCamelKey(title) {
  if (!title) return '';
  return String(title)
    .replace(/[^a-zA-Z0-9 _]/g, '')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// Composer-id and musical-key shapes buildHausName()/detectVersion() use in a
// shipped filename -- copied here (not re-derived) so this stays an exact
// structural match, not a guess. See index.html's own COMP_RE/KEY_RE2.
const HAUS_FILENAME_COMPOSER_RE = /^[A-Z]\d{2,3}[a-z]$/i;
const HAUS_FILENAME_KEY_RE = /^[A-Ga-g](?:sharp|flat|##?|bb?)?m?$/i;

// A HAUS-shipped filename is always HAUS[JUP]_<TitleCamel>_<Key>_<ComposerId>_
// <Version>.<ext> (buildHausName(), index.html). Several cue sheet formats
// (D, D2, D3, B2, H, I -- see their own parsers above) have no separate title
// field at all and use this filename AS titleRaw, so normTitle() alone never
// recovers a real title from it ("HAUS_DeadlyDelight_Dm_R13a1591_FULL" does
// not normalize anywhere near "Deadly Delight"). This pulls just the
// TitleCamel segment back out -- structurally, by requiring an exact 5-part
// shape with a recognizable key and composer-id segment either side of it --
// so it can be compared against titleToCamelKey(realTitle) as an exact match.
// Returns null (no guess) if the string doesn't match that exact shape.
// NOT YET VERIFIED against the real cue sheet file corpus -- Kyle to confirm
// via a real import before this is trusted in production.
function parseHausFilenameTitle(raw) {
  if (!raw) return null;
  const noExt = String(raw).replace(/\.[^.]+$/, '');
  const parts = noExt.split('_');
  if (parts.length !== 5) return null;
  const [prefix, titleCamel, key, composerId, /* version, unused */] = parts;
  if (!/^(HAUS|AETNHAUS)(JUP)?$/i.test(prefix)) return null;
  if (!HAUS_FILENAME_KEY_RE.test(key)) return null;
  if (!HAUS_FILENAME_COMPOSER_RE.test(composerId)) return null;
  if (!titleCamel) return null;
  return titleCamel;
}

// token-overlap score for fuzzy fallback matching, 0..1
function tokenOverlapScore(a, b) {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return union ? inter / union : 0;
}

// ── Format sniffing ──────────────────────────────────────────────────────
function sniffFormat(filePath, origName) {
  const ext = (origName || filePath).toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xlsm') {
    const wb = XLSX.readFile(filePath);
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: '' });
      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const vals = rows[r].map(v => String(v || '').trim().toUpperCase());
        // EBR registration-template export, not a cue sheet at all -- exclude.
        if (vals.includes('WORK TITLE') && vals.some(v => v.includes('SUBMITTER WORK ID'))) return 'EBR_SKIP';
        if (vals.some(v => v.includes('CLIP NAME'))) return 'B';
        // D4: same shape as D but header uses "E_WRITERS"/"E_PUBLISHERS" instead
        // of plain "WRITERS"/"PUBLISHERS" -- match by substring, parsed by parseFormatD.
        if (vals.some(v => v.includes('WRITERS')) && vals.some(v => v.includes('PUBLISHERS')) && vals.some(v => v.includes('FILENAME'))) return 'D';
      }
      // G: "BEST OF Cue Sheets" compilation format -- long metadata header block
      // (up to ~20 rows) before the real header row with Role/Name/Society/
      // Publisher/Duration cols, so this needs a wider scan than the others.
      for (let r = 0; r < Math.min(rows.length, 25); r++) {
        const vals = rows[r].map(v => String(v || '').trim().toUpperCase());
        if (vals.some(v => v.includes('CUE TITLE')) && vals.includes('ROLE') && vals.some(v => v.includes('SOCIETY'))) return 'G';
      }
    }
    // D3: headerless per-episode cue list -- no header row at all (or only a
    // partial stub like ["EPID","Cue Number"]), each data row ends in a
    // writer-cell/publisher-cell pair ("Name, PRO, Pct | Name2, PRO2, Pct2").
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      for (let r = 0; r < Math.min(rows.length, 6); r++) {
        let row = rows[r] || [];
        while (row.length && (row[row.length - 1] == null || row[row.length - 1] === '')) row = row.slice(0, -1);
        if (row.length < 4) continue;
        const last = String(row[row.length - 1] || '');
        const prev = String(row[row.length - 2] || '');
        const looksLikeParty = s => /,\s*(ASCAP|BMI|SESAC|SOCAN|APRA|NO SOCIETY)/i.test(s);
        const hasHausFile = row.some(c => /^(HAUS|AETNHAUS)[_ ]/i.test(String(c || '')));
        if (looksLikeParty(last) && looksLikeParty(prev) && hasHausFile) return 'D3';
      }
    }
    return 'UNKNOWN';
  }
  // csv
  const fullText = fs.readFileSync(filePath, 'utf8');
  const head = fullText.split(/\r?\n/).slice(0, 12).join('\n');
  if (head.includes('Seq #') && head.includes('Song Title')) return 'A';
  const firstLine = fullText.split(/\r?\n/)[0] || '';
  if (/^EPID,Cue#?/.test(firstLine.trim())) return 'C';

  const headerFields = splitCsvLine(firstLine).map(f => f.trim());
  const headerUpper = headerFields.map(f => f.toUpperCase());
  // D2: CSV twin of format D -- "Episode ID,Cue Number,Filename,Writers,Publishers"
  // (plural "Writers"/"Publishers" distinguishes it from B2's singular "WRITER"/"PUBLISHER")
  if (headerUpper.includes('WRITERS') && headerUpper.includes('PUBLISHERS') && headerUpper.some(f => f.includes('FILENAME'))) {
    return 'D2';
  }
  // H: manifest-only list -- filename + duration (+ seq/cue number), NO writer/
  // publisher columns at all. Classification falls back entirely to the
  // HAUS_/AETNHAUS_ filename-prefix heuristic. Column order varies, and the
  // filename/episode columns are spelled a few different ways across sources.
  if (headerUpper.some(f => f.includes('FILENAME') || f.includes('FILE NAME')) &&
      headerUpper.some(f => f === 'EPID' || f.includes('EP NUMBER') || f.includes('EPISODE NUMBER')) &&
      !headerUpper.some(f => f.includes('WRITER') || f.includes('PUBLISHER'))) {
    return 'H';
  }
  // I: EDL-style clip manifest -- "EVENT,REGION NAME,SKU,...,DURATION" (column
  // count varies 5-9), filename embedded in the REGION NAME column, no EPID
  // and no writer/publisher data at all. Classification is heuristic-only,
  // same as H.
  if (headerUpper.some(f => f.includes('EVENT')) && headerUpper.some(f => f.includes('REGION NAME')) &&
      headerUpper.some(f => f.includes('DURATION'))) {
    return 'I';
  }
  // E: "BEST OFs" compilation review lists -- "Reel No,#,Cue Title,Name,Publisher,Duration"
  // (or "#,Reel No,..." -- order varies, detect by token presence)
  if (headerUpper.some(f => f.includes('CUE TITLE')) && headerUpper.includes('PUBLISHER') && headerUpper.some(f => f.includes('DURATION'))) {
    return 'E';
  }
  // B2: CSV twin of format B -- 8 positional columns [ref,seq,filename,start,end,
  // duration,writerCell,publisherCell], header optional (some real files have
  // none at all and start directly with data).
  const dataLine = headerFields.length === 8 && /^\d{1,2}:\d{2}:\d{2}$/.test((splitCsvLine(firstLine)[3] || '').trim())
    ? firstLine
    : (fullText.split(/\r?\n/)[1] || '');
  const dataFields = splitCsvLine(dataLine).map(f => f.trim());
  if (dataFields.length === 8 && /^\d{1,2}:\d{2}:\d{2}$/.test(dataFields[3] || '') && /^\d{1,2}:\d{2}:\d{2}$/.test(dataFields[4] || '')) {
    return 'B2';
  }
  return 'UNKNOWN';
}

// Full quote-aware CSV tokenizer that DOES handle embedded newlines inside
// quoted fields (needed for the "BEST OFs" format, where a multi-writer cell
// is written as one quoted field with a literal newline between names).
// Returns an array of records, each an array of field strings.
function parseCsvRecords(content) {
  const records = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQ) {
      if (c === '"') {
        if (content[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\r') { /* skip, \n handles the break */ }
      else if (c === '\n') { row.push(cur); cur = ''; records.push(row); row = []; }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); records.push(row); }
  return records.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// minimal CSV line splitter respecting quotes (no embedded newlines inside fields expected)
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ── Format A: PRO cue sheet CSV ──────────────────────────────────────────
function parseFormatA(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  for (const ln of lines.slice(0, 10)) {
    const low = ln.toLowerCase();
    if (low.startsWith('program title:')) meta.program = ln.split(':').slice(1).join(':').trim();
    else if (low.startsWith('episode title:')) meta.episode = ln.split(':').slice(1).join(':').trim();
    else if (low.startsWith('episode number:')) meta.episodeNum = ln.split(':').slice(1).join(':').trim();
    else if (low.startsWith('air date:')) meta.airDate = ln.split(':').slice(1).join(':').trim();
    else if (low.includes('cue sheet:')) meta.cueSheetId = ln.split(':').slice(1).join(':').trim();
  }

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Seq #') && lines[i].includes('Song Title')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { meta, cues: [] };

  let fieldNames = splitCsvLine(lines[headerIdx]).map(f => f.trim());
  fieldNames = fieldNames.map(f => f || 'ref_code');

  const cuesBySeq = {};
  const order = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCsvLine(lines[i]);
    const row = {};
    fieldNames.forEach((f, idx) => { row[f] = (vals[idx] !== undefined ? vals[idx] : '').trim(); });
    const seq = row['Seq #'];
    if (!seq) continue;
    if (!cuesBySeq[seq]) {
      cuesBySeq[seq] = {
        seq,
        titleRaw: row['Song Title'] || '',
        workNum: row['SESAC Work #'] || '',
        usage: row['Usage'] || '',
        duration: row['Duration'] || '',
        parties: [],
      };
      order.push(seq);
    }
    cuesBySeq[seq].parties.push({
      name: row['IP Name'] || '',
      role: row['Role'] || '',
      pro: row['Society'] || '',
      pct: null,
    });
  }
  return { meta, cues: order.map(s => cuesBySeq[s]) };
}

// ── Format B: production "MUSIC FINAL" xlsx ─────────────────────────────
function parsePartyListCommas(cell) {
  // "NAME, PRO, PCT%, NAME2, PRO2, PCT2%, ..." -> [{name,pro,pct}]
  if (!cell) return [];
  const parts = String(cell).split(',').map(p => p.trim());
  const out = [];
  for (let i = 0; i + 2 < parts.length + 1 && i < parts.length; i += 3) {
    if (i + 2 < parts.length) {
      out.push({ name: parts[i], pro: parts[i + 1], pct: (parts[i + 2] || '').replace('%', '').trim() });
    }
  }
  return out;
}

function excelTimeToHMS(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const totalSec = Math.round(v * 86400);
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
  }
  return String(v);
}

function parseFormatB(filePath, origName) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const cues = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let headerRow = -1, headers = [];
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const vals = rows[r].map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v.includes('CLIP NAME'))) { headerRow = r; headers = vals; break; }
    }
    if (headerRow === -1) continue;
    const colOf = needle => headers.findIndex(h => h.includes(needle));
    const cClip = colOf('CLIP NAME'), cStart = colOf('START TIME'), cEnd = colOf('END TIME'),
      cDur = colOf('DURATION'), cWriter = colOf('WRITER'), cPub = colOf('PUBLISHER');
    let seq = 0;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (cClip === -1 || !row[cClip]) continue;
      seq++;
      const writers = parsePartyListCommas(row[cWriter]).map(w => ({ ...w, role: 'C' }));
      const publishers = parsePartyListCommas(row[cPub]).map(p => ({ ...p, role: 'E' }));
      cues.push({
        seq: String(seq),
        titleRaw: String(row[cClip]).trim(),
        workNum: '',
        usage: '',
        duration: cDur !== -1 ? excelTimeToHMS(row[cDur]) : '',
        start: cStart !== -1 ? excelTimeToHMS(row[cStart]) : '',
        end: cEnd !== -1 ? excelTimeToHMS(row[cEnd]) : '',
        parties: [...writers, ...publishers],
      });
    }
  }
  return { meta: { program: '', episode: origName || '', episodeNum: '', airDate: '', cueSheetId: '' }, cues };
}

// ── Format C: internal HAUS pre-filtered log ────────────────────────────
function parseFormatC(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
    if (row['EPID']) meta.episodeNum = row['EPID'];
    cues.push({
      seq: row['Cue#'] || row['Cue #'] || '',
      titleRaw: row['Song Title'] || '',
      workNum: '',
      usage: '',
      duration: row['Duration'] || '',
      start: row['Start Time'] || '',
      end: row['End Time'] || '',
      parties: [], // pre-filtered source, no party rows given
    });
  }
  return { meta, cues };
}

// ── Format D: internal HAUS per-episode log w/ full party detail ───────
function parsePipePartyList(cell, role) {
  if (!cell) return [];
  return String(cell).split('|').map(chunk => {
    const parts = chunk.split(',').map(p => p.trim());
    if (parts.length >= 3) return { name: parts[0], pro: parts[1], pct: parts[2].replace('%', ''), role };
    if (parts[0]) return { name: parts[0], pro: '', pct: '', role };
    return null;
  }).filter(Boolean);
}

function parseFormatD(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let headerRow = -1, headers = [];
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const vals = rows[r].map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v.includes('WRITERS'))) { headerRow = r; headers = vals; break; }
    }
    if (headerRow === -1) continue;
    // substring match so "E_WRITERS"/"E_PUBLISHERS" (format D4) resolve the same as
    // plain "WRITERS"/"PUBLISHERS"
    const colOf = name => headers.findIndex(h => h === name || h.includes(name));
    const cEpid = colOf('EPID'), cCue = colOf('CUE NUMBER'), cFile = colOf('FILENAME'),
      cWriters = colOf('WRITERS'), cPubs = colOf('PUBLISHERS');
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (cFile === -1 || !row[cFile]) continue;
      if (cEpid !== -1 && row[cEpid]) meta.episodeNum = String(row[cEpid]);
      const writers = parsePipePartyList(row[cWriters], 'C');
      const publishers = parsePipePartyList(row[cPubs], 'E');
      cues.push({
        seq: cCue !== -1 && row[cCue] != null ? String(row[cCue]) : '',
        titleRaw: String(row[cFile]).trim(),
        workNum: '',
        usage: '',
        duration: '',
        parties: [...writers, ...publishers],
      });
    }
  }
  return { meta, cues };
}

// ── Format B2: CSV twin of format B ──────────────────────────────────────
// 8 positional columns: [ref/EPID, seq, filename, start, end, duration,
// writerCell, publisherCell]. Header row is optional (some real files have
// none and start directly with data) -- detect it by checking whether row 0
// looks like a data row itself (field[3] is an H:MM:SS time).
function parseFormatB2(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const cues = [];
  const first = splitCsvLine(lines[0]).map(f => f.trim());
  const firstIsData = /^\d{1,2}:\d{2}:\d{2}$/.test(first[3] || '');
  const startIdx = firstIsData ? 0 : 1;
  for (let i = startIdx; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]).map(v => v.trim());
    if (f.length < 8 || !f[2]) continue;
    if (i === startIdx) meta.episodeNum = f[0] || meta.episodeNum;
    const writers = parsePartyListCommas(f[6]).map(w => ({ ...w, role: 'C' }));
    const publishers = parsePartyListCommas(f[7]).map(p => ({ ...p, role: 'E' }));
    cues.push({
      seq: f[1] || '',
      titleRaw: f[2] || '',
      workNum: '',
      usage: '',
      duration: f[5] || '',
      start: f[3] || '',
      end: f[4] || '',
      parties: [...writers, ...publishers],
    });
  }
  return { meta, cues };
}

// ── Format D2: CSV twin of format D ──────────────────────────────────────
// "Episode ID,Cue Number,Filename,Writers,Publishers" -- same pipe-separated
// multi-party cells as format D, just CSV instead of xlsx.
function parseFormatD2(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const cues = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]).map(v => v.trim());
    const row = {};
    header.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    const epid = row['Episode ID'] || row['EPID'] || '';
    const fname = row['Filename'] || row['FileName'] || '';
    if (!fname) continue;
    if (epid) meta.episodeNum = epid;
    const writers = parsePipePartyList(row['Writers'], 'C');
    const publishers = parsePipePartyList(row['Publishers'], 'E');
    cues.push({
      seq: row['Cue Number'] || '',
      titleRaw: fname,
      workNum: '',
      usage: '',
      duration: '',
      parties: [...writers, ...publishers],
    });
  }
  return { meta, cues };
}

// ── Format E: "BEST OFs" compilation review lists ────────────────────────
// "Reel No,#,Cue Title,Name,Publisher,Duration" (column order varies --
// matched by name, not position). Thinner than every other format: a single
// writer-name cell (sometimes several names joined by a literal embedded
// newline, no PRO or split %) and a single publisher name (no PRO either).
// Needs the newline-aware parseCsvRecords, not a line-by-line split.
function parseFormatE(filePath) {
  const records = parseCsvRecords(fs.readFileSync(filePath, 'utf8'));
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  if (!records.length) return { meta, cues: [] };
  const header = records[0].map(h => h.trim());
  const col = name => header.findIndex(h => h.toUpperCase() === name);
  const cReel = col('REEL NO'), cNum = col('#'), cTitle = col('CUE TITLE'),
    cName = col('NAME'), cPub = col('PUBLISHER'), cDur = col('DURATION');
  const cues = [];
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    const title = (cTitle !== -1 ? r[cTitle] : '') || '';
    if (!title.trim()) continue;
    if (cReel !== -1 && r[cReel]) meta.episodeNum = r[cReel].trim();
    const writerNames = (cName !== -1 ? r[cName] || '' : '').split('\n').map(n => n.trim()).filter(Boolean);
    const parties = writerNames.map(name => ({ name, role: 'C', pro: '', pct: '' }));
    const pubName = (cPub !== -1 ? r[cPub] || '' : '').trim();
    if (pubName) parties.push({ name: pubName, role: 'E', pro: '', pct: '' });
    cues.push({
      seq: cNum !== -1 ? (r[cNum] || '').trim() : '',
      titleRaw: title.trim(),
      workNum: '',
      usage: '',
      duration: cDur !== -1 ? (r[cDur] || '').trim() : '',
      parties,
    });
  }
  return { meta, cues };
}

// ── Classification: is this cue ours? ───────────────────────────────────
// hausPublisherNames: lowercased Set of publisher names from deal_publishers
// (the real source of truth -- not hardcoded). Deliberately excludes
// sold-to-A&E imprints like "Just Call Me Angel Music" / "Escape The
// Ordinary Music", which are NOT in deal_publishers, so they fall out of
// this filter naturally -- out of scope per 2026-10 decision.
function classifyCue(cue, hausPublisherNames) {
  for (const p of cue.parties) {
    const key = (p.name || '').trim().toLowerCase();
    if (key && hausPublisherNames.has(key)) {
      return { isHaus: true, reason: 'publisher match', confidence: 'confirmed' };
    }
  }
  if (!cue.parties.length || !cue.parties.some(p => p.role === 'E')) {
    if (/^(HAUS|AETNHAUS)[_ ]/i.test(cue.titleRaw)) {
      return { isHaus: true, reason: 'HAUS_ filename prefix, no publisher row to confirm', confidence: 'heuristic' };
    }
  }
  return { isHaus: false, reason: '', confidence: null };
}

// ── Main entry point ─────────────────────────────────────────────────────
// Returns { format, meta, cues: [{seq,titleRaw,titleNormalized,workNum,usage,
//   duration,parties,isHaus,classifyReason,classifyConfidence}] }
// ── Format D3: headerless per-episode cue list (xlsx) ────────────────────
// No real header row (or just a stub like ["EPID","Cue Number"]). Each data
// row ends in [...optional EPID, optional cueNum, filename, optional title,
// writerCell, publisherCell] -- column count varies 4-6 depending on which
// optional leading fields are present. Detect filename by the HAUS_/AETNHAUS_
// prefix and work outward from there.
function parseFormatD3(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const looksLikeParty = s => /,\s*(ASCAP|BMI|SESAC|SOCAN|APRA|NO SOCIETY)\b/i.test(String(s || ''));
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    for (let row of rows) {
      if (!row) continue;
      while (row.length && (row[row.length - 1] == null || row[row.length - 1] === '')) row = row.slice(0, -1);
      if (row.length < 4) continue;
      const writerCell = row[row.length - 2];
      const pubCell = row[row.length - 1];
      if (!looksLikeParty(writerCell) || !looksLikeParty(pubCell)) continue;
      const lead = row.slice(0, row.length - 2).map(v => (v == null ? '' : String(v).trim()));
      const fileIdx = lead.findIndex(c => /^(HAUS|AETNHAUS)[_ ]/i.test(c));
      if (fileIdx === -1) continue;
      const filename = lead[fileIdx];
      const before = lead.slice(0, fileIdx); // optional [EPID] or [EPID, cueNum]
      const after = lead.slice(fileIdx + 1);  // optional [title]
      const epid = before[0] || '';
      const cueNum = before[1] || (before.length === 1 && /^\d+$/.test(before[0]) ? before[0] : '');
      if (epid) meta.episodeNum = epid;
      const writers = parsePipePartyList(writerCell, 'C');
      const publishers = parsePipePartyList(pubCell, 'E');
      cues.push({
        seq: cueNum ? String(cueNum) : '',
        titleRaw: after[0] || filename,
        workNum: '',
        usage: '',
        duration: '',
        parties: [...writers, ...publishers],
      });
    }
  }
  return { meta, cues };
}

// ── Format G: "BEST OF Cue Sheets" compilation review xlsx ───────────────
// Metadata header block (program/episode/production info in label|value
// pairs), then a real header row with columns incl. #, Reel No, Cue Title,
// Use, Theme, Description, Role, Name, Society [Share%], Publisher,
// Society [Share%], Music Origin, Identifiers, Duration. Column order
// varies by file -- matched by name, not position. Name is a newline-
// separated parallel list of composers; Publisher is its OWN separate
// newline-separated list, not 1:1 aligned with Name (a cue can have a
// different count of publisher entries than writer entries), so both are
// recorded as independent party rows rather than zipped together.
function parseFormatG(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row = (rows[r] || []).map(v => String(v || '').trim());
      const idx = row.findIndex(v => v.toUpperCase() === 'ORIGINAL PRODUCTION TITLE');
      if (idx !== -1 && row[idx + 1]) meta.program = row[idx + 1];
      const eidx = row.findIndex(v => v.toUpperCase() === 'EPISODE TITLE');
      if (eidx !== -1 && row[eidx + 1]) meta.episode = row[eidx + 1];
      const pidx = row.findIndex(v => v.toUpperCase() === 'PRODUCTION ID');
      if (pidx !== -1 && row[pidx + 1]) meta.episodeNum = row[pidx + 1];
    }
    let headerRow = -1, headers = [];
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const vals = (rows[r] || []).map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v.includes('CUE TITLE')) && vals.includes('ROLE')) { headerRow = r; headers = vals; break; }
    }
    if (headerRow === -1) continue;
    const colOf = name => headers.findIndex(h => h === name || h.includes(name));
    const cNum = colOf('#'), cTitle = headers.findIndex(h => h.includes('CUE TITLE')),
      cDur = headers.findIndex(h => h.includes('DURATION')), cRole = colOf('ROLE'),
      cName = colOf('NAME'), cPub = headers.findIndex(h => h.includes('PUBLISHER'));
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || cTitle === -1 || !row[cTitle]) continue;
      const names = cName !== -1 ? String(row[cName] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
      const pubs = cPub !== -1 ? String(row[cPub] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
      const parties = [
        ...names.map(n => ({ name: n, pro: '', pct: '', role: 'C' })),
        ...pubs.map(n => ({ name: n, pro: '', pct: '', role: 'E' })),
      ];
      cues.push({
        seq: cNum !== -1 && row[cNum] != null ? String(row[cNum]) : '',
        titleRaw: String(row[cTitle]).trim(),
        workNum: '',
        usage: cRole !== -1 ? String(row[cRole] || '') : '',
        duration: cDur !== -1 ? String(row[cDur] || '') : '',
        parties,
      });
    }
  }
  return { meta, cues };
}

// ── Format H: manifest-only CSV ───────────────────────────────────────────
// Filename + duration (+ seq/cue number) with NO writer/publisher columns
// at all -- these are internal inventory lists, not PRO cue sheets. Column
// order varies ("EPID,Filename,CueNumber,Duration" vs "Ep Number,Clip
// Number,Filename,Duration" etc.), matched by header name. Since there's
// no party data, classification falls through entirely to the HAUS_/
// AETNHAUS_ filename-prefix heuristic in classifyCue.
function parseFormatH(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const cues = [];
  if (!lines.length) return { meta, cues };
  const headers = splitCsvLine(lines[0]).map(f => f.trim().toUpperCase());
  const colOf = name => headers.findIndex(h => h === name || h.includes(name));
  const cEpid = headers.findIndex(h => h === 'EPID' || h.includes('EP NUMBER'));
  const cFile = colOf('FILENAME');
  const cSeq = headers.findIndex(h => h.includes('CUE NUMBER') || h.includes('CUENUMBER') || h.includes('CLIP NUMBER'));
  const cDur = colOf('DURATION');
  if (cFile === -1) return { meta, cues };
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]).map(v => v.trim());
    if (!f[cFile]) continue;
    if (cEpid !== -1 && f[cEpid]) meta.episodeNum = f[cEpid];
    cues.push({
      seq: cSeq !== -1 ? (f[cSeq] || '') : '',
      titleRaw: f[cFile],
      workNum: '',
      usage: '',
      duration: cDur !== -1 ? (f[cDur] || '') : '',
      parties: [],
    });
  }
  return { meta, cues };
}

// ── Format I: EDL-style clip manifest (CSV) ───────────────────────────────
// "EVENT,REGION NAME,SKU,...,DURATION" -- the filename lives in the REGION
// NAME column (sometimes with a ".wav.new...." suffix tacked on from the
// editing software), no EPID and no writer/publisher data at all.
// Classification is heuristic-only (HAUS_/AETNHAUS_ filename prefix), same
// as format H.
function parseFormatI(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const cues = [];
  if (!lines.length) return { meta, cues };
  const headers = splitCsvLine(lines[0]).map(f => f.trim().toUpperCase());
  const cEvent = headers.findIndex(h => h.includes('EVENT'));
  const cRegion = headers.findIndex(h => h.includes('REGION NAME'));
  const cDur = headers.findIndex(h => h.includes('DURATION'));
  if (cRegion === -1) return { meta, cues };
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]).map(v => v.trim());
    const raw = f[cRegion];
    if (!raw) continue;
    // strip a trailing ".wav.new.##_##-##.A#"-style editor suffix off the filename
    const filename = raw.replace(/\.wav\.new.*$/i, '').replace(/\.wav$/i, '');
    cues.push({
      seq: cEvent !== -1 ? (f[cEvent] || '') : '',
      titleRaw: filename,
      workNum: '',
      usage: '',
      duration: cDur !== -1 ? (f[cDur] || '') : '',
      parties: [],
    });
  }
  return { meta, cues };
}

function parseCueSheetFile(filePath, origName, hausPublisherNames = new Set()) {
  const format = sniffFormat(filePath, origName);
  let meta = {}, cues = [];
  if (format === 'A') ({ meta, cues } = parseFormatA(filePath));
  else if (format === 'B') ({ meta, cues } = parseFormatB(filePath, origName));
  else if (format === 'C') ({ meta, cues } = parseFormatC(filePath));
  else if (format === 'D') ({ meta, cues } = parseFormatD(filePath));
  else if (format === 'B2') ({ meta, cues } = parseFormatB2(filePath));
  else if (format === 'D2') ({ meta, cues } = parseFormatD2(filePath));
  else if (format === 'E') ({ meta, cues } = parseFormatE(filePath));
  else if (format === 'D3') ({ meta, cues } = parseFormatD3(filePath));
  else if (format === 'G') ({ meta, cues } = parseFormatG(filePath));
  else if (format === 'H') ({ meta, cues } = parseFormatH(filePath));
  else if (format === 'I') ({ meta, cues } = parseFormatI(filePath));
  else if (format === 'EBR_SKIP') return { format: 'EBR_SKIP', meta: {}, cues: [] };
  else return { format: 'UNKNOWN', meta: {}, cues: [] };

  for (const cue of cues) {
    cue.titleNormalized = normTitle(cue.titleRaw);
    // null when titleRaw isn't a recognizable HAUS-convention filename --
    // see parseHausFilenameTitle's own comment.
    cue.filenameCamelKey = parseHausFilenameTitle(cue.titleRaw);
    if (format === 'C') {
      cue.isHaus = true;
      cue.classifyReason = 'pre-filtered source (already HAUS-only)';
      cue.classifyConfidence = 'confirmed';
    } else {
      const c = classifyCue(cue, hausPublisherNames);
      cue.isHaus = c.isHaus;
      cue.classifyReason = c.reason;
      cue.classifyConfidence = c.confidence;
    }
  }
  return { format, meta, cues };
}

// Matching against the real titles catalog. `titlesIndex` is an array of
// {sku_root, title, team_id} pulled fresh from Postgres by the caller --
// this module never talks to the DB directly, so it stays testable and
// reusable outside the live app.
// Exact-only matching (no fuzzy/token-overlap fallback -- removed 2026-10 per
// Kyle: real HAUS filenames crunch words together ("DEADLYDELIGHT") while
// catalog titles are spaced ("Deadly Delight"), so token-overlap scoring was
// unreliable enough to be worse than no auto-match at all. Anything that
// isn't an exact normalized-title match comes back unmatched and goes
// through the manual search-to-confirm picker in the UI instead of a guess.
function matchCueToTitles(cue, titlesIndex) {
  const norm = cue.titleNormalized;
  if (norm) {
    const exact = titlesIndex.filter(t => t.normTitle === norm);
    if (exact.length === 1) return { status: 'matched', candidates: exact, confidence: 'exact' };
    if (exact.length > 1) return { status: 'ambiguous', candidates: exact, confidence: 'exact-multiple' };
  }

  // Fallback for cues whose only title text IS a HAUS-shipped filename
  // (formats D/D2/D3/B2/H/I -- see parseHausFilenameTitle above). Still an
  // exact match -- against a second, precomputed key (titlesIndex[].camelKey,
  // set wherever titlesIndex is built in api.js) -- never a fuzzy guess.
  if (cue.filenameCamelKey) {
    const camelExact = titlesIndex.filter(t => t.camelKey === cue.filenameCamelKey);
    if (camelExact.length === 1) return { status: 'matched', candidates: camelExact, confidence: 'filename-exact' };
    if (camelExact.length > 1) return { status: 'ambiguous', candidates: camelExact, confidence: 'filename-exact-multiple' };
  }

  return { status: 'unmatched', candidates: [] };
}

module.exports = {
  normTitle,
  titleToCamelKey,
  parseHausFilenameTitle,
  tokenOverlapScore,
  sniffFormat,
  parseCueSheetFile,
  matchCueToTitles,
  classifyCue,
};
