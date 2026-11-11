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
//   J) "SCRIPPS NETWORKS MUSIC CUE SHEET" xlsx (Left/Right LLC productions for
//      Scripps/HGTV shows -- Caribbean Life, House Hunters, Island Life, etc.):
//      metadata label|value rows, then Track Title/Composer/Publisher/
//      Performing Rights Society columns -- one composer+pct cell and one
//      publisher+pct cell per row, continuation rows for extra parties on a
//      cue (added 2026-11-10, see cue-sheet-format-survey handoff).
//   K) "Music Force" cue sheet xlsx (vendor-branded, confirmed verbatim in
//      every real sample's metadata block -- Snapped/From Jupiter, Southern
//      Hospitality 4, Vanderpump Rules): two-row header, row B splitting
//      Composer into First/Middle/Last Name + Society + Percentage and
//      Publisher into Publisher Name + Society + Percentage, continuation
//      rows for extra parties (added 2026-11-10, see same handoff).
//
// Formats A-I and D2-D4 (not all documented above -- see each parseFormatX's
// own comment) were already in this file before 2026-11-10; J and K above are
// the first additions from the 2026-11-10 cue-sheet-format-survey pass.
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
  // Mix/version-suffix vocabulary (expanded 2026-10-28, derived from the real
  // HAUS CUE SHEETS corpus -- 17,643 HAUS-own cue titles -- to add BUMPER/
  // STING/ALT/DRUMS/MAIN/NODRUMS/NOLEAD). Stripped ONLY as a TRAILING tag --
  // one or more, repeatedly, from the end of the string inward -- never
  // mid-title. The 2026-10-28 commit stripped these words wherever they
  // appeared in the string (no \b...$ anchor), which silently ate a real
  // title word out of the middle of several live catalog titles: "Alt
  // Approach" -> "Approach", "Main Street" -> "Street", "TBT Sting Goes Solo
  // Universal" -> "TBT Goes Solo Universal", "Bumper To Bumper" -> "To".
  // Anchoring to the end fixes every one of those (ALT/MAIN/STING there are
  // not the last word, so they're left alone) without weakening the
  // original intent -- "HAUS_DrivingSeat_MAIN" and "Thunder Drums" still
  // normalize the suffix away.
  //
  // This does NOT (and structurally cannot) fix the smaller set of titles
  // where the LIVE CATALOG itself has two distinct entries differing only by
  // a genuinely trailing tag word -- e.g. "Thunder" vs "Thunder Drums",
  // "Lafayette" vs "Lafayette Main". Those still normalize to the same key,
  // but matchCueToTitles() already treats a normTitle() collision as
  // status: 'ambiguous' rather than silently picking one, so this is a
  // flagged-for-human-review outcome, not a data-corruption risk. Resolving
  // those fully needs a catalog/vocabulary decision (e.g. should DRUMS/MAIN
  // stay in this list at all, given the catalog uses them to distinguish
  // real stem variants), not another regex tweak -- see
  // check-new-strip-words-collisions.js.
  // Leading-article stripping (The/A/An) was considered and NOT added --
  // zero HAUS-own cue titles in the real corpus start with one, unlike BMI
  // royalty statements where that pattern is real.
  const TRAILING_SUFFIX_RE = /\b(DRUMS AND FX|NO DRUMS|ALT MIX|FULL|NODR|NODRUMS|DNB|MIX|NOPNO|NODMSPERC|BUMPER|STING|ALT|BASS AND DRUM|DRUM AND BASS|DRUMS AND BASS|DRUMS|DRUM|MAIN|NOLEAD)\b[^A-Z0-9]*$/;
  let prev;
  do {
    prev = s;
    s = s.replace(TRAILING_SUFFIX_RE, '');
  } while (s !== prev);
  s = s.replace(/[^A-Z0-9 ]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Same cleanup as normTitle() (case, underscores/hyphens, punctuation,
// whitespace) but WITHOUT the mix/version-suffix stripping step. Used to
// try an exact-as-written match BEFORE normTitle()'s stripped form is tried
// -- see matchCueToTitles() below for why: the live catalog genuinely
// contains distinct songs that differ only by a trailing tag-like word
// ("Thunder" vs "Thunder Drums", "Lafayette" vs "Lafayette Main"), and a
// strict match resolves those correctly without ever needing to strip
// anything.
function normTitleStrict(raw) {
  if (!raw) return '';
  let s = String(raw).toUpperCase();
  s = s.replace(/[_-]+/g, ' ');
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
      // K: the sheet itself is sometimes literally named "MusicForce Cue
      // Sheet" even when no cell in the metadata block spells out "Music
      // Force" verbatim (confirmed real -- a Snapped-branded sample under
      // SNAPPED/Season 22 (no HAUS)/ has this exact sheet name with the
      // metadata block using "Production Company"/"Project Type" labels
      // instead) -- checked once per sheet, not per row.
      if (/musicforce/i.test(sheetName.replace(/\s+/g, ''))) return 'K';
      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const vals = rows[r].map(v => String(v || '').trim().toUpperCase());
        // EBR registration-template export, not a cue sheet at all -- exclude.
        if (vals.includes('WORK TITLE') && vals.some(v => v.includes('SUBMITTER WORK ID'))) return 'EBR_SKIP';
        if (vals.some(v => v.includes('CLIP NAME'))) return 'B';
        // D4: same shape as D but header uses "E_WRITERS"/"E_PUBLISHERS" instead
        // of plain "WRITERS"/"PUBLISHERS" -- match by substring, parsed by parseFormatD.
        if (vals.some(v => v.includes('WRITERS')) && vals.some(v => v.includes('PUBLISHERS')) && vals.some(v => v.includes('FILENAME'))) return 'D';
        // J: "SCRIPPS NETWORKS MUSIC CUE SHEET" (Left/Right LLC productions for
        // Scripps/HGTV shows -- Caribbean Life, House Hunters, Island Life, etc.)
        // -- real header row is "Performing Rights Cleared by the Following
        // Source, CD Code, Track Number, Track Title, Composer, Publisher,
        // Performing Rights Society, Time In, ... Total Running Time, Music
        // Usage, Music Origin, Album Title". TRACK TITLE + PERFORMING RIGHTS
        // SOCIETY together are unique to this template among the real corpus.
        if (vals.some(v => v.includes('TRACK TITLE')) && vals.some(v => v.includes('PERFORMING RIGHTS SOCIETY'))) return 'J';
        // K: "Music Force" cue sheet (real vendor name, confirmed verbatim in the
        // metadata block of every real sample -- Snapped/From Jupiter, Southern
        // Hospitality 4, Vanderpump Rules). Two-row header further down
        // ("Cue#,Song Title,Composer,...,Publisher,...,Usage,Duration,Direct
        // Source" over a sub-row splitting Composer into First/Middle/Last Name
        // + Society + Percentage and Publisher into Publisher Name + Society +
        // Percentage) -- detected by parseFormatK itself; sniffing is done here
        // off the one reliably-present literal vendor-name cell, since the
        // metadata block's column offsets shift between real files.
        if (vals.some(v => v === 'MUSIC FORCE')) return 'K';
        // L: "Jupiter Entertainment Music Cue Sheet" (Fatal Attraction, Notorious,
        // and the "ATL_"/"SC_"/"SEC_" files under FROM JUPITER Jan 2023). Header
        // row varies in exact wording between real files (seen: "Music
        // Composition Title"/"Cue Name" for the title column, "Composer(s)" vs
        // plain "Composer", with or without a leading "Cue #" column) but always
        // has separate COMPOSER, PUBLISHER, and an exact "Society" column --
        // that 3-column combination doesn't appear in any other format in this
        // file (format J's is "Performing Rights Society", format D's is
        // "Writers"/"Publishers", format G's has no "Composer"/"Publisher"
        // columns at all). Composer/publisher cells pack one or more parties as
        // free text -- confirmed three distinct real join/field conventions so
        // far ("Name, PRO Pct% / Name2, PRO2 Pct2%", "Name PRO Pct%, Name2 PRO2
        // Pct2%", and a bare "Name, PRO" or even a bare name with no PRO at all)
        // -- parsePartyFreeText() below extracts every "Name [,] PRO [Pct%]"
        // occurrence regardless of which separator is used, rather than trying
        // to pre-split on one assumed delimiter.
        // The "Society" column is sometimes headed "BMI/ASCAP/SESAC" instead
        // (confirmed real under SNAPPED/Season 21 (no HAUS)/), so this is
        // matched by content (a known PRO code name) as well as by the
        // literal "SOCIETY" header text.
        if (vals.some(v => v.includes('COMPOSER')) && vals.some(v => v.includes('PUBLISHER')) &&
            vals.some(v => v === 'SOCIETY' || /ASCAP|BMI|SESAC/.test(v))) return 'L';
        // O: "American Pickers" BACK/DATASHEET/MUSIC FINAL clip manifests --
        // title column labeled "REGION NAME" or "CLIP"/"CLIP NAME" (not the
        // exact "CLIP NAME" format B already claims, since B's own sniff
        // check above already returned for that one case; this one also
        // catches the many real files using the bare "CLIP" header instead),
        // alongside START/END/DUR(ATION) and a WRITER column. Column labels
        // are abbreviated inconsistently across real files (confirmed:
        // "START TIME"/"END TIME"/"DURATION" in some, bare "START"/"END"/
        // "DUR" in others, e.g. AP7 7178/AP10 269) -- matched by substring
        // on the short form, which the long form also contains.
        // IMPORTANT: this format was previously going entirely undetected
        // by its own header and instead being silently misparsed by format
        // D3's generic headerless heuristic (same "last two columns look
        // like party text + a HAUS_ filename somewhere in the row" check
        // that D3 uses for its own, genuinely different and genuinely
        // headerless template) -- D3's column assumptions don't line up
        // with this template's real START/END/DURATION columns, so it was
        // silently taking the START time value as the cue's title and
        // dropping duration entirely. Confirmed by direct comparison against
        // real files before rerouting this shape to its own parser here.
        if ((vals.some(v => v.includes('REGION NAME')) || vals.some(v => v.includes('CLIP'))) &&
            vals.some(v => v.includes('START')) && vals.some(v => v.includes('END')) &&
            vals.some(v => v.includes('DUR')) && vals.some(v => v.includes('WRITER'))) return 'O';
      }
      // G: "BEST OF Cue Sheets" compilation format -- long metadata header block
      // (up to ~20 rows) before the real header row with Role/Name/Society/
      // Publisher/Duration cols, so this needs a wider scan than the others.
      for (let r = 0; r < Math.min(rows.length, 25); r++) {
        const vals = rows[r].map(v => String(v || '').trim().toUpperCase());
        if (vals.some(v => v.includes('CUE TITLE')) && vals.includes('ROLE') && vals.some(v => v.includes('SOCIETY'))) return 'G';
        // M: "Kitty Kelley" (Jupiter Entertainment) -- single-row-per-cue,
        // exact header "CUE TITLE"/"COMPOSER / PRO"/"PUBLISHER / PRO". Real
        // header row is at index 12 (a Program/Episode/Usage-Codes metadata
        // block comes first) -- outside the main 10-row loop above, same
        // reason G needs its own wider scan.
        if (vals.some(v => v.includes('CUE TITLE')) && vals.some(v => v.includes('COMPOSER')) && vals.some(v => v.includes('PUBLISHER'))) return 'M';
        // N: "THE CIRCUS" (AMC Networks template) -- real header ("CUE /
        // TITLE / COMPOSER / SOCIETY / PERFORMED BY / PUBLISHER % / SOCIETY /
        // Master Rights Holder / TIME / USAGE") is at index 10 (a Legend
        // block comes first) -- same reason, needs the wider scan. Each of
        // these workbooks also carries an unrelated "Sheet1" template tab
        // with a totally different header (see parseFormatN's comment) --
        // that tab never matches this check, so sniffing naturally skips it.
        if (vals.some(v => v.includes('COMPOSER') && v.includes('SOCIETY')) && vals.some(v => v.includes('PUBLISHER'))) return 'N';
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

  // L2: CSV twin of format L ("Jupiter Entertainment Music Cue Sheet") --
  // unlike every other CSV format in this file, the real header row here is
  // NOT line 0 (a metadata block comes first, same as the xlsx version), so
  // this scans the first ~15 lines rather than just the first line.
  for (const ln of fullText.split(/\r?\n/).slice(0, 15)) {
    const upper = splitCsvLine(ln).map(f => f.trim().toUpperCase());
    if (upper.some(f => f.includes('COMPOSER')) && upper.some(f => f.includes('PUBLISHER')) && !upper.some(f => f.includes('WRITERS'))) {
      return 'L2';
    }
  }

  const headerFields = splitCsvLine(firstLine).map(f => f.trim());
  const headerUpper = headerFields.map(f => f.toUpperCase());
  // D2: CSV twin of format D -- "Episode ID,Cue Number,Filename,Writers,Publishers"
  // (plural "Writers"/"Publishers" distinguishes it from B2's singular "WRITER"/"PUBLISHER")
  if (headerUpper.includes('WRITERS') && headerUpper.includes('PUBLISHERS') && headerUpper.some(f => f.includes('FILENAME'))) {
    return 'D2';
  }
  // O: "American Pickers" BACK/DATASHEET clip manifests (CSV twin of the
  // xlsx variant -- see parseFormatO's comment). Unlike most other CSV
  // formats here, the real header row isn't always line 0 -- confirmed real
  // on "AP12 372 Classic Car Cemetery MUSIC FINAL.csv", which has 3 blank
  // lines before its header -- so this scans the first ~10 lines, same
  // reasoning as L2 above. One real file ("AP12 378 FARM FRESH
  // DATASHEET.csv") has its last two columns mislabeled in the header
  // itself (blank + "STATE") instead of WRITER/PUBLISHER -- caught instead
  // by a content check on the first data row after the header.
  {
    const allLines = fullText.split(/\r?\n/);
    for (let li = 0; li < Math.min(allLines.length, 10); li++) {
      const upper = splitCsvLine(allLines[li]).map(f => f.trim().toUpperCase());
      const looksHeaderish = upper.some(f => f.includes('CLIP') || f.includes('REGION NAME') || f === 'TITLE') &&
        upper.some(f => f.includes('START')) && upper.some(f => f.includes('END')) && upper.some(f => f.includes('DUR'));
      if (!looksHeaderish) continue;
      if (upper.some(f => f.includes('WRITER'))) return 'O';
      const dataLines = allLines.slice(li + 1).filter(l => l.trim());
      if (dataLines.length) {
        const df = splitCsvLine(dataLines[0]).map(f => f.trim());
        const last = df[df.length - 1] || '', prev = df[df.length - 2] || '';
        const looksLikeParty = s => /,\s*(ASCAP|BMI|SESAC|SOCAN|PRS|GEMA)\b/i.test(s);
        if (looksLikeParty(last) && looksLikeParty(prev)) return 'O';
      }
      break;
    }
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

// Prefer Excel's own cached display text (the cell's `w` field) for a
// numeric time/duration cell over computing it from the raw serial via
// excelTimeToHMS's v*86400 day-fraction formula. Confirmed real and
// necessary for formats K and L (and, separately, M and N's date fields):
// some cue-sheet templates store the DURATION column on a different
// scale than the standard Excel day-fraction (verified directly -- e.g.
// a real K file's raw 0.013888888888888888 is Excel's own cached "0:20",
// not the 86400-formula's "00:20:00"/1200s), so re-deriving from the
// cached text sidesteps needing to know which scale a given file uses.
// Falls back to the formula only on the rare cell with no cached text at
// all (should not happen when reading a real workbook's own worksheet).
function cellTimeText(ws, r, c, rawVal) {
  if (rawVal == null || rawVal === '') return '';
  if (typeof rawVal !== 'number') return String(rawVal).trim();
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws ? ws[addr] : null;
  if (cell && cell.w) return String(cell.w).trim();
  return excelTimeToHMS(rawVal);
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
  // A HAUS_/AETNHAUS_-titled cue can legitimately belong to someone else --
  // a real third-party publisher (including sold-to-A&E imprints like
  // "Just Call Me Angel Music") still blocks this fallback, same as before.
  // The only thing this fallback additionally forgives is a publisher cell
  // that isn't a name at all -- e.g. a bare IPI/ID number like "770983501"
  // with no letters in it, confirmed real (KKF 105 MCS Final.xlsx rows
  // 54/61/86: source cell literally "770983501, ASCAP 50%", publisher name
  // never entered). That still requires a REAL name (any letter at all) to
  // count as "named" and block the fallback, so it never reclassifies a
  // cue that has a genuine non-HAUS publisher.
  const publisherParties = cue.parties.filter(p => p.role === 'E');
  const hasNamedPublisher = publisherParties.some(p => /[a-z]/i.test((p.name || '').trim()));
  if (!hasNamedPublisher) {
    if (/^(HAUS|AETNHAUS)[_ ]/i.test(cue.titleRaw)) {
      const reason = publisherParties.length
        ? 'HAUS_ filename prefix, publisher name unreadable/placeholder'
        : 'HAUS_ filename prefix, no publisher row to confirm';
      return { isHaus: true, reason, confidence: 'heuristic' };
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

// ── Format J: "SCRIPPS NETWORKS MUSIC CUE SHEET" (Left/Right LLC) ────────
// Metadata label|value pairs scattered across the first ~7 rows (both at
// col0/1 and again further along the same row, e.g. row 2 =
// ["Series Title:","Caribbean Life","","","","","Production Company Name: ",
// "LEFT RIGHT LLC",...]), then a real header row: "Performing Rights Cleared
// by the Following Source, CD Code, Track Number, Track Title, Composer,
// Publisher, Performing Rights Society, Time In (hh:mm:ss), Time Out
// (hh:mm:ss), Total Running Time (mm:ss), Music Usage (use codes to right),
// Music Origin, Album Title". One composer+pct cell and one publisher+pct
// cell PER ROW, both sharing a single "Performing Rights Society" column for
// that row (confirmed directly against real rows -- e.g. a row with only a
// publisher cell populated still has exactly one PRO value, which applies to
// whichever of composer/publisher is present on that row). A cue with
// several parties continues on subsequent rows with Track Title (and every
// other per-cue column) left blank -- same continuation-row convention as
// formats already in this file. No cue/seq number column exists in this
// template at all -- seq is assigned as an incrementing per-cue counter.
function parseNamePctCell(cell) {
  const s = String(cell || '').trim();
  if (!s) return { name: '', pct: '' };
  const m = s.match(/^(.*?)\s*([\d.]+)\s*%\s*$/);
  if (m) return { name: m[1].trim(), pct: m[2] };
  return { name: s, pct: '' };
}

function scanLabelValuePairs(rows, maxRows, labelMap, meta, inlinePatterns, ws) {
  const normLabel = s => String(s || '').toUpperCase().replace(/\s*:\s*$/, '').trim().replace(/\s+/g, ' ');
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const rawRow = rows[r] || [];
    // Keep each cell's raw type (number vs string) up front, instead of
    // stringifying immediately -- a label's VALUE cell (e.g. an Air Date)
    // can be a numeric Excel date serial, and stringifying the raw serial
    // directly (the old behavior) silently produced a meaningless number
    // like "44591" instead of the real date. The label cell itself is
    // always text, so normLabel/inlinePatterns still work against the
    // stringified view below.
    const strRow = rawRow.map(v => (v == null ? '' : String(v).trim()));
    for (let c = 0; c < rawRow.length; c++) {
      const label = normLabel(strRow[c]);
      if (label && labelMap[label]) {
        // Column offset between a label cell and its value shifts by one blank
        // cell between real files of the same template (confirmed directly --
        // e.g. Vanderpump Rules' "Music Force" sample has an extra leading
        // blank column every other sampled "Music Force" file doesn't), so
        // take the first non-blank of the next two cells rather than assuming
        // a fixed +1 offset.
        let valCol = -1, rawVal;
        if (rawRow[c + 1] != null && rawRow[c + 1] !== '') { valCol = c + 1; rawVal = rawRow[c + 1]; }
        else if (rawRow[c + 2] != null && rawRow[c + 2] !== '') { valCol = c + 2; rawVal = rawRow[c + 2]; }
        const value = valCol === -1 ? '' : (typeof rawVal === 'number' ? (ws ? cellTimeText(ws, r, valCol, rawVal) : String(rawVal).trim()) : String(rawVal).trim());
        if (value) meta[labelMap[label]] = value;
        continue;
      }
      // Some real files of the same template pack "Label: value" into a
      // SINGLE cell instead of a label cell + separate value cell (confirmed
      // directly -- e.g. Fatal Attraction Season 15 INTL's metadata block is
      // one-cell-per-line, unlike the JUPITER_Fatal Attraction folder's
      // label|value-in-adjacent-cells layout for the same cue sheet template).
      if (inlinePatterns) {
        for (const { re, key } of inlinePatterns) {
          const m = strRow[c].match(re);
          if (m && m[1]) { meta[key] = m[1].trim(); break; }
        }
      }
    }
  }
}

function parseFormatJ(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const labelMap = {
    'SERIES TITLE': 'program',
    'SERIES NUMBER': 'episodeNum',
    'EPISODE TITLE': 'episode',
    'EPISODE NUMBER': 'episodeNum',
    'PREMIERE BROADCAST AIR DATE (IF KNOWN)': 'airDate',
  };
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    scanLabelValuePairs(rows, 8, labelMap, meta, undefined, ws);
    let headerRow = -1, headers = [];
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const vals = (rows[r] || []).map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v.includes('TRACK TITLE')) && vals.some(v => v.includes('PERFORMING RIGHTS SOCIETY'))) {
        headerRow = r; headers = vals; break;
      }
    }
    if (headerRow === -1) continue;
    const colOf = needle => headers.findIndex(h => h.includes(needle));
    const cTrackNum = colOf('TRACK NUMBER'), cTitle = colOf('TRACK TITLE'),
      cComposer = headers.findIndex(h => h === 'COMPOSER'), cPublisher = headers.findIndex(h => h === 'PUBLISHER'),
      cPro = colOf('PERFORMING RIGHTS SOCIETY'), cTimeIn = colOf('TIME IN'), cTimeOut = colOf('TIME OUT'),
      cDur = colOf('TOTAL RUNNING TIME'), cUsage = colOf('MUSIC USAGE');
    let seq = 0;
    let current = null;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const title = cTitle !== -1 ? String(row[cTitle] || '').trim() : '';
      if (title) {
        seq++;
        current = {
          seq: String(seq),
          titleRaw: title,
          workNum: cTrackNum !== -1 ? String(row[cTrackNum] || '').trim() : '',
          usage: cUsage !== -1 ? String(row[cUsage] || '').trim() : '',
          duration: cDur !== -1 ? excelTimeToHMS(row[cDur]) : '',
          start: cTimeIn !== -1 ? String(row[cTimeIn] || '').trim() : '',
          end: cTimeOut !== -1 ? String(row[cTimeOut] || '').trim() : '',
          parties: [],
        };
        cues.push(current);
      }
      if (!current) continue;
      const pro = cPro !== -1 ? String(row[cPro] || '').trim() : '';
      if (cComposer !== -1 && row[cComposer]) {
        const { name, pct } = parseNamePctCell(row[cComposer]);
        if (name) current.parties.push({ name, pro, pct, role: 'C' });
      }
      if (cPublisher !== -1 && row[cPublisher]) {
        const { name, pct } = parseNamePctCell(row[cPublisher]);
        if (name) current.parties.push({ name, pro, pct, role: 'E' });
      }
    }
  }
  return { meta, cues };
}

// ── Format K: "Music Force" cue sheet ─────────────────────────────────────
// Metadata label|value pairs in the first ~6 rows (column offsets shift by
// one between real files -- e.g. Snapped's sample has "Show/Series Title:"
// at col1/val2, Vanderpump Rules' has an extra blank column pushing it to
// col1(label)/val at col3 -- so labels are found by scanning every cell in
// the row, never a fixed column index). Two-row cue-table header further
// down: row A = "Cue#, Song Title, Composer, (blank x4), Publisher, (blank
// x2), Usage, Duration, Direct Source[, Comments]"; row B (sub-header) =
// "(blank x2), First Name, Middle Name, Last Name, Performing Rights
// Society, Percentage, Publisher Name, Performing Rights Society,
// Percentage[, ...]" -- composer's PRO/Percentage are the FIRST occurrence
// of those column names in row B, publisher's are the SECOND; resolved
// positionally off row B, never off row A, since row A never repeats a
// column name. A cue with several parties continues on subsequent rows with
// Cue#/Song Title left blank, same convention as format J.
function parseFormatK(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const labelMap = {
    'SHOW/SERIES TITLE': 'program',
    'EPISODE TITLE': 'episode',
    'AIR DATE': 'airDate',
    'PRODUCTION NUMBER/FILE NAME': 'episodeNum',
  };
  // A real sub-variant of this template (seen under SNAPPED/Season 22 (no
  // HAUS)/) packs "Label: value" into a single cell instead of separate
  // label/value cells -- same situation as format L, see that comment.
  const inlinePatterns = [
    { re: /^show\/series title\s*:\s*(.+)$/i, key: 'program' },
    { re: /^episode title\s*:\s*(.+)$/i, key: 'episode' },
    { re: /^air date\s*:\s*(.+)$/i, key: 'airDate' },
    { re: /^production number\/file name\s*:\s*(.+)$/i, key: 'episodeNum' },
  ];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    scanLabelValuePairs(rows, 8, labelMap, meta, inlinePatterns, ws);
    let headerRowA = -1, headersA = [], headersB = [];
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const vals = (rows[r] || []).map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v === 'CUE#' || v === 'CUE #') && vals.some(v => v.includes('SONG TITLE'))) {
        headerRowA = r; headersA = vals; headersB = (rows[r + 1] || []).map(v => String(v || '').trim().toUpperCase());
        break;
      }
    }
    if (headerRowA === -1) continue;
    const colOfA = needle => headersA.findIndex(h => h.includes(needle));
    const allIdx = (arr, needle) => arr.reduce((acc, h, i) => { if (h.includes(needle)) acc.push(i); return acc; }, []);
    const cCue = headersA.findIndex(h => h === 'CUE#' || h === 'CUE #'), cTitle = colOfA('SONG TITLE'),
      cUsage = colOfA('USAGE'), cDur = colOfA('DURATION'), cSource = colOfA('DIRECT SOURCE');
    const cFirst = headersB.findIndex(h => h.includes('FIRST NAME')), cMiddle = headersB.findIndex(h => h.includes('MIDDLE NAME')),
      cLast = headersB.findIndex(h => h.includes('LAST NAME')), cPubName = headersB.findIndex(h => h.includes('PUBLISHER NAME'));
    const prosB = allIdx(headersB, 'PERFORMING RIGHTS SOCIETY');
    const pctsB = allIdx(headersB, 'PERCENTAGE');
    const cComposerPro = prosB[0] != null ? prosB[0] : -1, cPublisherPro = prosB[1] != null ? prosB[1] : -1;
    const cComposerPct = pctsB[0] != null ? pctsB[0] : -1, cPublisherPct = pctsB[1] != null ? pctsB[1] : -1;
    let current = null;
    for (let r = headerRowA + 2; r < rows.length; r++) {
      const row = rows[r] || [];
      const title = cTitle !== -1 ? String(row[cTitle] || '').trim() : '';
      if (title) {
        current = {
          seq: cCue !== -1 && row[cCue] != null ? String(row[cCue]).trim() : '',
          titleRaw: title,
          workNum: '',
          usage: cUsage !== -1 ? String(row[cUsage] || '').trim() : '',
          // Duration is sometimes a pre-formatted text timecode (e.g. "00:20"
          // or "   00:00:29:01") and sometimes a raw Excel time fraction
          // depending on the real file -- confirmed both ways across the real
          // samples, not assumed. A number is resolved via its own cell's
          // cached display text (cellTimeText), NOT the v*86400 formula:
          // confirmed real (7 of 152 files, e.g. SNAPPED Season 22) that this
          // template's numeric DURATION cells use a different scale than the
          // standard day-fraction, which v*86400 silently got 60x wrong (see
          // cellTimeText's comment). A string is used as-is rather than
          // re-parsed.
          duration: cDur === -1 ? '' : cellTimeText(ws, r, cDur, row[cDur]),
          directSource: cSource !== -1 ? String(row[cSource] || '').trim() : '',
          parties: [],
        };
        cues.push(current);
      }
      if (!current) continue;
      const first = cFirst !== -1 ? String(row[cFirst] || '').trim() : '';
      const middle = cMiddle !== -1 ? String(row[cMiddle] || '').trim() : '';
      const last = cLast !== -1 ? String(row[cLast] || '').trim() : '';
      let composerName = [first, middle, last].filter(Boolean).join(' ');
      if (composerName) {
        let composerPro = cComposerPro !== -1 ? String(row[cComposerPro] || '').trim() : '';
        let composerPct = cComposerPct !== -1 && row[cComposerPct] != null ? String(row[cComposerPct]).trim() : '';
        const compInline = splitInlinePartySuffix(composerName);
        if (compInline) {
          composerName = compInline.name;
          if (!composerPro) composerPro = compInline.pro;
          if (!composerPct) composerPct = compInline.pct;
        }
        current.parties.push({ name: composerName, pro: composerPro, pct: composerPct, role: 'C' });
      }
      let pubName = cPubName !== -1 ? String(row[cPubName] || '').trim() : '';
      if (pubName) {
        let publisherPro = cPublisherPro !== -1 ? String(row[cPublisherPro] || '').trim() : '';
        let publisherPct = cPublisherPct !== -1 && row[cPublisherPct] != null ? String(row[cPublisherPct]).trim() : '';
        const pubInline = splitInlinePartySuffix(pubName);
        if (pubInline) {
          pubName = pubInline.name;
          if (!publisherPro) publisherPro = pubInline.pro;
          if (!publisherPct) publisherPct = pubInline.pct;
        }
        current.parties.push({ name: pubName, pro: publisherPro, pct: publisherPct, role: 'E' });
      }
    }
  }
  return { meta, cues };
}

// ── Format L: "Jupiter Entertainment Music Cue Sheet" ────────────────────
// A composer/publisher cell in this template packs one or more parties as
// free text, with no single reliable delimiter across real files -- confirmed
// directly against three distinct real shapes:
//   "Chase Michael Crow, BMI 50% / Steven Joseph Crow, BMI 50%"  (slash-joined,
//     each party "Name, PRO Pct%")
//   "Lawrence Insula PRS 50%, Mathew Guthrie PRS 50%"            (comma-joined,
//     each party "Name PRO Pct%" -- no comma between name and PRO, so a naive
//     split on "," would wrongly cut INSIDE a party in the slash-joined shape
//     above and wrongly treat the whole string as one party in this shape)
//   "Alexis Grapsas, ASCAP"                                      (single party,
//     no percentage -- sole writer/publisher, 100% implied)
//   "Paul Mottram (PRS)" / " Audio Network Limited"              (PRO in
//     parens on the composer side; the matching publisher cell can have NO
//     PRO or percentage at all, just a bare name)
// Rather than guess which delimiter a given cell uses, parsePartyFreeText()
// scans the whole cell for every "Name [,] [(]PRO[)] [Pct%]" occurrence left
// to right -- this works for all three delimiter styles above without
// needing to pick one, because the party separator (whatever it is) never
// matches the "name" character class once a PRO token has been consumed, so
// the regex naturally resumes at the start of the next party. A cell with NO
// PRO token anywhere (the bare "Audio Network Limited" case) falls back to
// being recorded as a single party with empty pro/pct, same as every other
// format in this file does for a plain name field.
// International PRO list expanded 2026-11-10 after real Fatal Attraction
// INTL cue sheets turned up SIAE (Italy), IMRO (Ireland), TONO (Norway),
// ACUM (Israel), and a same-file misspelling of SUISA as "SUSIA" (left as a
// known alias here, not corrected, since it's the source file's own text).
// STEF (Iceland) added 2026-11-10 after real Kitty Kelley cue sheets turned
// up "Steingrimur Thorhallsson, STEF 100%" / "...STEF (Iceland) 100%".
const PRO_CODES = 'ASCAP|BMI|SESAC|SOCAN|PRS|APRA|GEMA|SACEM|PPL|STIM|SUISA|SUSIA|SIAE|IMRO|TONO|ACUM|KODA|TEOSTO|BUMA|SABAM|SGAE|AKM|NCB|MCPS|ZAIKS|ARTISJUS|OSA|SAMRO|PRO MUSICAE|SOCINPRO|STEF';
// Allows an optional comma between the PRO code and the trailing percentage
// too (",?" before the digit group) -- confirmed real on rows that embed an
// IPI/CAE id, e.g. "Matthew Peter Gurgol (630569155), BMI, 50%" (the id
// parens are stripped before this runs, see parsePartyFreeText).
const PARTY_FREE_TEXT_RE = new RegExp(`([^,/()]+?),?\\s*\\(?\\s*(${PRO_CODES})\\s*\\)?,?\\s*(\\d+(?:\\.\\d+)?)?\\s*%?`, 'gi');
// Reversed field order, confirmed real on a Fatal Attraction Season 14 INTL
// row: "SCORE KEEPERS MUSIC 100% BMI" and "Strange Cranium Productions,
// (50%)BMI" -- the percentage comes BEFORE the PRO code instead of after.
// Tried only as a fallback (see extractPartiesWithPro) since the primary,
// PRO-before-percentage order is what nearly every real file uses.
const PARTY_FREE_TEXT_RE_REVERSED = new RegExp(`([^,/()]+?),?\\s*\\(?\\s*(\\d+(?:\\.\\d+)?)\\s*%\\s*\\)?,?\\s*(${PRO_CODES})`, 'gi');
// Signature check for which order a given chunk uses: the primary (PRO
// first) pattern's lazy name group doesn't exclude digits or "%" from the
// name character class (a real party name can legitimately contain digits),
// so on a reversed-order chunk like "SCORE KEEPERS MUSIC 100% BMI" or "Mark
// Kragen 50% ASCAP" it still "succeeds" by swallowing "100%"/"50%" into the
// name instead of failing outright -- there is no zero-match signal to fall
// back on. Confirmed real on both of those exact rows (Fatal Attraction
// Season 14/14 INTL). Instead, whichever order's PRO code appears EARLIEST
// in the text is tried first, so a percentage-then-PRO run never gets a
// chance to be mis-swallowed as part of a name by the other pattern first.
const PCT_THEN_PRO_RE = new RegExp(`\\d+(?:\\.\\d+)?\\s*%\\s*\\)?\\s*,?\\s*(?:${PRO_CODES})\\b`, 'i');
// Strips stray trailing punctuation a name can pick up from the cell's own
// formatting quirks (a trailing comma or apostrophe left over from "Marco
// Porra' SIAE 100%" or "Marco Porra, SIAE 100%") -- never trims interior
// punctuation, which can be a real part of a name.
function cleanPartyName(name) {
  return name.replace(/[,'";:]+$/, '').trim();
}
// Format K ("Music Force") normally keeps composer/publisher name, PRO and
// percentage in three separate columns, but a real subset of files (seen
// across SNAPPED Seasons 30-32, e.g. SPD 3017/3114/3115/3221/3226) instead
// pack "Name, PRO Pct%" as a single string into the name cell -- sometimes
// alongside already-correct separate PRO/Pct columns (redundant), sometimes
// with the separate columns left blank (the only place that data exists).
// Anchored start-to-end so a legitimate plain name is never misread -- a
// real name has no PRO-society code token in it.
const K_INLINE_SUFFIX_RE = new RegExp(`^(.*?)\\s*,?\\s*(${PRO_CODES})\\s*,?\\s*(\\d+(?:\\.\\d+)?)\\s*%?\\s*$`, 'i');
function splitInlinePartySuffix(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(K_INLINE_SUFFIX_RE);
  if (!m) return null;
  const name = cleanPartyName(m[1].trim());
  if (!name) return null;
  return { name, pro: m[2], pct: m[3] };
}
function runPartyRegex(re, text, role, swap) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const name = cleanPartyName(m[1].trim());
    if (!name) continue;
    out.push(swap ? { name, pro: m[3].toUpperCase(), pct: m[2] || '', role } : { name, pro: m[2].toUpperCase(), pct: m[3] || '', role });
  }
  return out;
}
function extractPartiesWithPro(text, role) {
  // Every real example of this reversed order seen so far (Fatal Attraction
  // Season 14/14 INTL) is consistent for the whole chunk, never mixed with
  // the normal order in the same cell, so a single whole-text test decides
  // which pattern to try first.
  const preferReversed = PCT_THEN_PRO_RE.test(text);
  const first = preferReversed ? runPartyRegex(PARTY_FREE_TEXT_RE_REVERSED, text, role, true) : runPartyRegex(PARTY_FREE_TEXT_RE, text, role, false);
  if (first.length) return first;
  return preferReversed ? runPartyRegex(PARTY_FREE_TEXT_RE, text, role, false) : runPartyRegex(PARTY_FREE_TEXT_RE_REVERSED, text, role, true);
}
function parsePartyFreeText(cell, role, fallbackPro) {
  let s = String(cell || '').trim();
  if (!s) return [];
  // Strip bare-numeric parenthetical OR bracketed IDs (IPI/CAE numbers,
  // e.g. "(630569155)" or "[186724439]" -- confirmed real on an American
  // Pickers file using square brackets instead of parens) -- not captured
  // into the party schema, and otherwise block PARTY_FREE_TEXT_RE from
  // reaching the PRO code that follows them on real cells like "Matthew
  // Peter Gurgol (630569155), BMI, 50%" / "Aaron Steinberg, BMI [186724439]
  // 42.5%".
  s = s.replace(/[(\[]\s*\d[\d\-]*\s*[)\]]/g, '').replace(/\s+/g, ' ').trim();
  // "/", "//", "|", or ";" is the real party separator whenever one of them
  // appears at all (confirmed on real rows -- Fatal Attraction/Sins of the
  // City use "/"; a Snapped CSV twin of this template uses "|" instead,
  // e.g. "Auralation, (BMI), 50%|Red Spot Music, (BMI), 50%"; an American
  // Pickers file uses ";", e.g. "Aaron Steinberg, BMI [...] 42.5%; Stuart
  // Hart, ASCAP [...] 7.5%") -- but whether each party ALSO states its own
  // PRO code varies chunk to chunk within the same cell (and the same
  // file), so each chunk is parsed on its own: a chunk with an embedded PRO
  // code uses it, a bare "Name NN%" chunk falls back to the row-level
  // Society/PRO value passed in as fallbackPro.
  if (/[/|;]/.test(s)) {
    const chunks = s.split(/\s*(?:\/{1,2}|\||;)\s*/).map(c => c.trim()).filter(Boolean);
    const out = [];
    for (const chunk of chunks) {
      const found = extractPartiesWithPro(chunk, role);
      if (found.length) { out.push(...found); continue; }
      const m2 = chunk.match(/^(.*?)\s*\(?\s*(\d+(?:\.\d+)?)\s*%\s*\)?\s*$/);
      const name = cleanPartyName((m2 ? m2[1] : chunk).trim());
      if (name) out.push({ name, pro: fallbackPro || '', pct: m2 ? m2[2] : '', role });
    }
    return out;
  }
  const found = extractPartiesWithPro(s, role);
  if (found.length) return found;
  const m3 = s.match(/^(.*?)\s*\(?\s*(\d+(?:\.\d+)?)\s*%\s*\)?\s*$/);
  const name3 = cleanPartyName((m3 ? m3[1] : s).trim());
  return [{ name: name3, pro: fallbackPro || '', pct: m3 ? m3[2] : '', role }];
}

// Format M ("Kitty Kelley" / Jupiter Entertainment "CUE TITLE / COMPOSER /
// PRO / PUBLISHER / PRO" template) needs its OWN free-text party parser,
// separate from parsePartyFreeText above, because real cells here use a
// comma to split a single party's own name into two pieces (confirmed real:
// "Louis, Yoelin, (BMI), 25%" and "Joshua Lewell, Molen, (BMI), 100%" are
// each ONE person, not two) -- running the shared L/K parser against these
// silently drops the first name fragment (e.g. "Louis") because that
// parser's name class specifically excludes commas (correct for L/K, where
// comma always separates a name from its PRO code or from the next party,
// never splits a single name). Source files are also real mojibake-corrupted
// (confirmed on KKF 105/106: "æ" and "¾" standing in for a lost "/" --
// sometimes doubled around a surviving "/" as "æ/æ", sometimes a lone stray
// prefix/suffix character with no separator role at all -- and a stray
// trailing "Ê"); these carry no content of their own, so they're stripped.
function countProOccurrences(text) {
  const re = new RegExp(`\\b(${PRO_CODES})\\b`, 'gi');
  return (text.match(re) || []).length;
}
const KK_SINGLE_PARTY_RE = new RegExp(`^(.*?)[,\\s]*\\(?\\s*(${PRO_CODES})\\s*\\)?[,\\s]*(\\d+(?:\\.\\d+)?)?\\s*%?\\s*$`, 'i');
// Reversed field order -- confirmed real on KKF 103's "Steingrimur
// Thorhallsson 100% STEF" (percentage BEFORE the PRO code, no comma
// anywhere at all) -- same ambiguity the shared L/K code already handles
// via PCT_THEN_PRO_RE/PARTY_FREE_TEXT_RE_REVERSED, needed again here because
// the KK-specific single-party regex's unrestricted (comma-tolerant) name
// group would otherwise happily swallow "100%" into the name to complete
// the anchored match, same failure mode PARTY_FREE_TEXT_RE_REVERSED exists
// to avoid for the shared parser.
const KK_SINGLE_PARTY_REVERSED_RE = new RegExp(`^(.*?)\\s*\\(?\\s*(\\d+(?:\\.\\d+)?)\\s*%\\s*\\)?\\s*\\(?\\s*(${PRO_CODES})\\s*\\)?\\s*$`, 'i');
function parseKKChunk(chunk, role, fallbackPro) {
  const s = chunk.trim();
  if (!s) return [];
  const proCount = countProOccurrences(s);
  if (proCount === 0) {
    return [{ name: cleanPartyName(s), pro: fallbackPro || '', pct: '', role }];
  }
  if (proCount === 1) {
    const preferReversed = PCT_THEN_PRO_RE.test(s);
    const tryOrder = preferReversed
      ? [[KK_SINGLE_PARTY_REVERSED_RE, true], [KK_SINGLE_PARTY_RE, false]]
      : [[KK_SINGLE_PARTY_RE, false], [KK_SINGLE_PARTY_REVERSED_RE, true]];
    for (const [re, reversed] of tryOrder) {
      const m = s.match(re);
      if (!m) continue;
      const name = cleanPartyName(m[1].trim());
      if (!name) continue;
      return reversed
        ? [{ name, pro: m[3].toUpperCase(), pct: m[2] || '', role }]
        : [{ name, pro: m[2].toUpperCase(), pct: m[3] || '', role }];
    }
  }
  // 2+ PRO occurrences with no separator surviving between parties at all
  // (confirmed real: KKF 103's copy of a cue whose mojibake separator was
  // dropped entirely rather than corrupted into "æ/æ" -- the same cue title
  // in KKF 105 still has "æ/æ" to split on, so this is the same source data,
  // just a worse round of corruption). Names here never carry an internal
  // comma, so the shared L/K regex (comma excluded from the name class) is
  // safe to reuse directly.
  return runPartyRegex(PARTY_FREE_TEXT_RE, s, role, false);
}
function parseKKPartyText(cell, role, fallbackPro) {
  let s = String(cell || '').trim();
  if (!s) return [];
  s = s.replace(/\(\s*\d[\d\-]*\s*\)/g, '');
  s = s.replace(/[æÆ¾Ê]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  if (/[/|]/.test(s)) {
    const chunks = s.split(/\s*(?:\/{1,2}|\|)\s*/).map(c => c.trim()).filter(Boolean);
    let out = [];
    for (const c of chunks) out = out.concat(parseKKChunk(c, role, fallbackPro));
    return out;
  }
  return parseKKChunk(s, role, fallbackPro);
}
function parseFormatM(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    // raw:false reads Excel's own cached DISPLAY text for every cell
    // instead of the raw stored number -- required here because this
    // template's DURATION (and Air Date) cells are NOT standard Excel time
    // serials (confirmed real: a cell with raw value 0.025 under a
    // "DURATION (mm:ss)" format displays as "0:36" -- 36 SECONDS -- not the
    // "36:00" the standard day-fraction formula (v*86400 seconds) would
    // give; American Pickers and other formats in this file use the
    // standard encoding and are unaffected, this one specifically isn't).
    // Trusting Excel's own cached text sidesteps needing to reverse-engineer
    // whatever nonstandard scale produced these files.
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    // Fixed-position metadata block, confirmed identical across all three
    // real KKF 103/105/106 samples: col0=label, col1=value and col3=label,
    // col4=value (both pairs on the same row, offset by a blank col2) for
    // rows 0-4 (Program/Prod.Company, Program ID/Network, Episode/Air Date,
    // Episode #/Contact Name, Episode Length/Contact Email).
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const row = rows[r] || [];
      const label0 = String(row[0] || '').trim().toLowerCase();
      if (label0 === 'program:') meta.program = String(row[1] || '').trim();
      else if (label0 === 'episode:') meta.episode = String(row[1] || '').trim();
      else if (label0 === 'episode #:') meta.episodeNum = String(row[1] || '').trim();
      const label3 = String(row[3] || '').trim().toLowerCase();
      if (label3 === 'air date:') meta.airDate = String(row[4] || '').trim();
    }
    let headerRow = -1, headers = [];
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const vals = (rows[r] || []).map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v.includes('CUE TITLE')) && vals.some(v => v.includes('COMPOSER')) && vals.some(v => v.includes('PUBLISHER'))) {
        headerRow = r; headers = vals; break;
      }
    }
    if (headerRow === -1) continue;
    const cTitle = headers.findIndex(h => h.includes('CUE TITLE'));
    const cComposer = headers.findIndex(h => h.includes('COMPOSER'));
    const cPublisher = headers.findIndex(h => h.includes('PUBLISHER'));
    const cDur = headers.findIndex(h => h.includes('DURATION'));
    const cUse = headers.findIndex(h => h === 'USE' || h.includes('USE'));
    let seq = 0;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const title = cTitle !== -1 ? String(row[cTitle] || '').trim() : '';
      if (!title) continue;
      seq++;
      const use = cUse !== -1 ? String(row[cUse] || '').trim() : '';
      const composers = cComposer !== -1 ? parseKKPartyText(row[cComposer], 'C', use) : [];
      const publishers = cPublisher !== -1 ? parseKKPartyText(row[cPublisher], 'E', use) : [];
      cues.push({
        seq: String(seq),
        titleRaw: title,
        workNum: '',
        usage: use,
        duration: cDur !== -1 ? String(row[cDur] || '').trim() : '',
        parties: [...composers, ...publishers],
      });
    }
  }
  return { meta, cues };
}

// Format N ("THE CIRCUS" / AMC Networks template). Each real workbook also
// carries a second, "Sheet1"-named tab that is a BLANK TEMPLATE populated
// with unrelated Jingle Punks sample rows for reference -- confirmed real
// across all three samples (CIRCUS 203/205/206), never actual per-episode
// data for that file. That sheet's header ("TIME CODE","MUSICAL
// COMPOSITION",...) is completely different from the real per-episode
// sheet's own header, so sniffing (and this parser) key off the real
// header text and naturally skip the template sheet without needing to
// know its name.
function parseFormatN(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    // raw:false reads Excel's own cached display text for every cell --
    // needed for Initial Airdate specifically: this template's real files
    // turned out to use the legacy Mac "1904" date system (confirmed real
    // on CIRCUS 203, whose Airdate serial 41365 means 2013-04-01 under the
    // standard 1900 epoch but Excel's own cached text says "4/2/17"), so
    // recomputing from the raw serial requires knowing which epoch a given
    // workbook uses -- not reliably knowable from the cell alone. Trusting
    // the cached text sidesteps the ambiguity entirely. The per-cue TIME
    // column is already stored as plain text in every real file (not a
    // time serial at all), so this has no effect there.
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    let headerRow = -1, headers = [];
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const vals = (rows[r] || []).map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v.includes('COMPOSER') && v.includes('SOCIETY')) && vals.some(v => v.includes('PUBLISHER'))) {
        headerRow = r; headers = vals; break;
      }
      if (vals.some(v => v === 'PRODUCTION:')) meta.program = String((rows[r] || [])[2] || '').trim();
      if (vals.some(v => v === 'EPISODE NUMBER:')) meta.episodeNum = String((rows[r] || [])[2] || '').trim();
      if (vals.some(v => v === 'EPISODE TITLE:')) meta.episode = String((rows[r] || [])[2] || '').trim();
      if (vals.some(v => v === 'INITIAL AIRDATE:')) meta.airDate = String((rows[r] || [])[2] || '').trim();
    }
    if (headerRow === -1) continue;
    const cCue = headers.findIndex(h => h === 'CUE');
    const cTitle = headers.findIndex(h => h === 'TITLE');
    const cComposer = headers.findIndex(h => h.includes('COMPOSER'));
    const cPublisher = headers.findIndex(h => h.includes('PUBLISHER'));
    const cTime = headers.findIndex(h => h === 'TIME');
    const cUsage = headers.findIndex(h => h.includes('USAGE'));
    if (cTitle === -1) continue;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const title = String(row[cTitle] || '').trim();
      if (!title) continue;
      const usage = cUsage !== -1 ? String(row[cUsage] || '').trim() : '';
      // Each cell can hold more than one party joined by a literal newline
      // (confirmed real: "Jeffrey Peters ASCAP 25%\r\nJared Gutstadt ASCAP
      // 75%") -- every line already has its own inline PRO code, so the
      // shared L/K free-text extractor (which finds every "Name PRO Pct%"
      // occurrence left to right) works directly against each line with no
      // row-level fallback PRO needed.
      const composerLines = cComposer !== -1 ? String(row[cComposer] || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
      const publisherLines = cPublisher !== -1 ? String(row[cPublisher] || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
      let composers = [];
      for (const ln of composerLines) composers = composers.concat(extractPartiesWithPro(ln, 'C'));
      let publishers = [];
      for (const ln of publisherLines) publishers = publishers.concat(extractPartiesWithPro(ln, 'E'));
      cues.push({
        seq: cCue !== -1 ? String(row[cCue] || '').trim() : '',
        titleRaw: title,
        workNum: '',
        usage,
        duration: cTime !== -1 ? String(row[cTime] || '').trim() : '',
        parties: [...composers, ...publishers],
      });
    }
  }
  return { meta, cues };
}

// Format O ("American Pickers" BACK/DATASHEET clip manifests). Shape is
// close to format B ("CLIP NAME"/"MUSIC FINAL") -- clip name, start/end
// timecode, duration, writer cell, publisher cell -- but the title column is
// sometimes labeled "REGION NAME" instead of "CLIP NAME" (confirmed real:
// AP7 7163/7164 BACK.xlsx, and the CONVERTED .csv twins of the same files
// use "CUE"/"TITLE" as two separate columns instead), and the writer/
// publisher cells are real comma-chains with NO slash separator at all
// between multiple parties (e.g. "ANDREW BRICK JOHNSON ASCAP, 50%, BRUCE
// FINGERS, ASCAP, 25%, BILLIE RAY FINGERS ASCAP, 25%") -- confirmed the
// shared parsePartyFreeText/extractPartiesWithPro already parses this
// correctly (PRO_CODES alternation anchors each party boundary; the lazy
// name group naturally backtracks to the right split point even with no
// comma before a PRO code, e.g. "BAYHAM MUSIC LIBRARY BMI, 40%"), so this
// format is kept separate from B only to avoid touching B's existing
// (positional, comma-count-of-3) parsePartyListCommas and risking a
// regression on the 158 files already using it in production.
// One real file (FILTHY RICH GUIDE-adjacent "AP12 378 FARM FRESH
// DATASHEET.csv") has its WRITER/PUBLISHER columns mislabeled in the header
// row itself ("","STATE","") -- sniffFormat detects this one by filename
// plus a content check (see sniffFormat), and this parser always resolves
// the writer/publisher columns positionally (last two columns) rather than
// trusting those specific header labels, so the mislabeling doesn't matter
// once dispatched here.
function parseFormatOWriterPub(cell, role) {
  return parsePartyFreeText(cell, role, '');
}
function parseFormatO(filePath, origName) {
  const ext = (origName || filePath).toLowerCase().split('.').pop();
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  let rows;
  if (ext === 'csv') {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.trim());
    rows = lines.map(ln => splitCsvLine(ln).map(v => v.trim()));
  } else {
    const wb = XLSX.readFile(filePath);
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  }
  let headerRow = -1, headers = [];
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const vals = (rows[r] || []).map(v => String(v || '').trim().toUpperCase());
    if (vals.some(v => v.includes('START')) && vals.some(v => v.includes('END')) && vals.some(v => v.includes('DUR'))) {
      headerRow = r; headers = vals; break;
    }
  }
  if (headerRow === -1) return { meta, cues };
  const cTitle = headers.findIndex(h => h.includes('CLIP') || h.includes('REGION NAME') || h === 'TITLE');
  const cStart = headers.findIndex(h => h.includes('START'));
  const cEnd = headers.findIndex(h => h.includes('END'));
  const cDur = headers.findIndex(h => h.includes('DUR'));
  // Writer/publisher are explicit-labeled in most real files ("WRITER" /
  // "PUBLISHER" or "PUB") -- matched by text first. Some real xlsx sheets
  // pad every row out to the sheet's full used-range width with trailing
  // blank columns (confirmed real: AP8 8199/AP 9230 carry 2 extra blank
  // columns past "PUBLISHER", and a handful of individual rows even have
  // stray numeric data in them -- a running total or similar left over from
  // the source spreadsheet) -- resolving positionally off headers.length in
  // that case would silently grab those blank/stray columns instead. The
  // ONE real file with no explicit WRITER/PUBLISHER label at all ("AP12 378
  // FARM FRESH DATASHEET.csv", labeled blank/"STATE" instead) is resolved
  // positionally as a fallback, but off the last column with a real header
  // LABEL or real DATA in the first populated row -- not off the sheet's
  // raw width -- so it still lands on the true writer/publisher columns.
  let cWriter = headers.findIndex(h => h.includes('WRITER'));
  let cPub = headers.findIndex(h => h.includes('PUBLISHER') || h === 'PUB');
  if (cWriter === -1 || cPub === -1) {
    let lastLabeledIdx = -1;
    for (let c = 0; c < headers.length; c++) if (headers[c]) lastLabeledIdx = c;
    let lastDataIdx = -1;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (!row.some(v => v !== '' && v != null)) continue;
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c] !== '' && row[c] != null) { lastDataIdx = c; break; }
      }
      break;
    }
    const end = Math.max(lastLabeledIdx, lastDataIdx) + 1;
    cWriter = end - 2;
    cPub = end - 1;
  }
  let seq = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const title = cTitle !== -1 ? String(row[cTitle] || '').trim() : '';
    if (!title) continue;
    seq++;
    const writers = parseFormatOWriterPub(row[cWriter], 'C');
    const publishers = parseFormatOWriterPub(row[cPub], 'E');
    cues.push({
      seq: String(seq),
      titleRaw: title,
      workNum: '',
      usage: '',
      duration: cDur !== -1 ? (typeof row[cDur] === 'number' ? excelTimeToHMS(row[cDur]) : String(row[cDur] || '').trim()) : '',
      start: cStart !== -1 ? (typeof row[cStart] === 'number' ? excelTimeToHMS(row[cStart]) : String(row[cStart] || '').trim()) : '',
      end: cEnd !== -1 ? (typeof row[cEnd] === 'number' ? excelTimeToHMS(row[cEnd]) : String(row[cEnd] || '').trim()) : '',
      parties: [...writers, ...publishers],
    });
  }
  meta.episode = origName || '';
  return { meta, cues };
}

function parseFormatL(filePath) {
  const wb = XLSX.readFile(filePath);
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const labelMap = {
    'SHOW/PROMO TITLE': 'program',
    'EPISODE#/TITLE (IF APP.)': 'episodeNum',
    'INITIAL AIRDATE': 'airDate',
  };
  // Some real files of this template put "Label: value" in a single cell
  // instead of separate label/value cells (see scanLabelValuePairs' comment).
  const inlinePatterns = [
    { re: /^show\/promo title\s*:\s*(.+)$/i, key: 'program' },
    { re: /^episode#\/title\s*\(if app\.?\)\s*:\s*(.+)$/i, key: 'episodeNum' },
    { re: /^initial airdate\s*:\s*(.+)$/i, key: 'airDate' },
  ];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    scanLabelValuePairs(rows, 8, labelMap, meta, inlinePatterns, ws);
    let headerRow = -1, headers = [];
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const vals = (rows[r] || []).map(v => String(v || '').trim().toUpperCase());
      if (vals.some(v => v.includes('COMPOSER')) && vals.some(v => v.includes('PUBLISHER')) &&
          vals.some(v => v === 'SOCIETY' || /ASCAP|BMI|SESAC/.test(v))) {
        headerRow = r; headers = vals; break;
      }
    }
    if (headerRow === -1) continue;
    const cCue = headers.findIndex(h => h === 'CUE #' || h === 'CUE#');
    const cTitle = headers.findIndex(h => h.includes('TITLE') || h === 'CUE NAME');
    const cLen = headers.findIndex(h => h.includes('CUE LENGTH') || h.includes('DURATION'));
    const cUse = headers.findIndex(h => h.includes('USE'));
    const cComposer = headers.findIndex(h => h.includes('COMPOSER'));
    const cPublisher = headers.findIndex(h => h.includes('PUBLISHER'));
    const cSociety = headers.findIndex(h => h === 'SOCIETY' || /ASCAP|BMI|SESAC/.test(h));
    if (cTitle === -1) continue;
    let seq = 0;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const title = String(row[cTitle] || '').trim();
      if (!title) continue;
      seq++;
      const society = cSociety !== -1 ? String(row[cSociety] || '').trim() : '';
      // Best-effort fallback only: when a party's own cell has no PRO token
      // at all and the row's Society column looks like "PRO1/PRO2" (seen on
      // real Notorious rows -- composer PRS, publisher BMI, one shared
      // "PRS/BMI" cell), use the first segment for the composer side and the
      // last for the publisher side; otherwise fall back to the whole value
      // for both. Flagged as heuristic, not confirmed, since this template
      // never states per-party PRO and per-row Society separately when both
      // parties are already explicit.
      const societyParts = society.split('/').map(s => s.trim()).filter(Boolean);
      const composerFallback = societyParts[0] || society;
      const publisherFallback = societyParts[societyParts.length - 1] || society;
      const composers = cComposer !== -1 ? parsePartyFreeText(row[cComposer], 'C', composerFallback) : [];
      const publishers = cPublisher !== -1 ? parsePartyFreeText(row[cPublisher], 'E', publisherFallback) : [];
      cues.push({
        seq: cCue !== -1 && row[cCue] != null ? String(row[cCue]).trim() : String(seq),
        titleRaw: title,
        workNum: '',
        usage: cUse !== -1 ? String(row[cUse] || '').trim() : '',
        // A number is resolved via its own cell's cached display text
        // (cellTimeText), NOT the v*86400 formula: confirmed real that
        // every numeric DURATION cell sampled across this template's files
        // uses a different scale than the standard day-fraction, which
        // v*86400 silently got 60x wrong (see cellTimeText's comment).
        duration: cLen !== -1 ? cellTimeText(ws, r, cLen, row[cLen]) : '',
        parties: [...composers, ...publishers],
      });
    }
  }
  return { meta, cues };
}

// ── Format L2: CSV twin of format L ───────────────────────────────────────
// Same "Jupiter Entertainment Music Cue Sheet" template and metadata/header
// layout as format L, just CSV instead of xlsx (confirmed real under
// SNAPPED/Season 21 (no HAUS)/ and .../Season 22 (no HAUS)/) -- reuses the
// same label map, inline-label fallback, and party-text parsing as L. The
// one real difference seen: the trailing PRO column is sometimes headed
// "BMI/ASCAP/SESAC" instead of a plain "Society", so that column is matched
// by content (contains a known PRO code name) as well as by the literal
// "SOCIETY" header text.
function parseFormatL2(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const rows = lines.map(ln => splitCsvLine(ln).map(v => v.trim()));
  const cues = [];
  const meta = { program: '', episode: '', episodeNum: '', airDate: '', cueSheetId: '' };
  const labelMap = {
    'SHOW/PROMO TITLE': 'program',
    'EPISODE#/TITLE (IF APP.)': 'episodeNum',
    'INITIAL AIRDATE': 'airDate',
  };
  const inlinePatterns = [
    { re: /^show\/promo title\s*:\s*(.+)$/i, key: 'program' },
    { re: /^episode#\/title\s*\(if app\.?\)\s*:\s*(.+)$/i, key: 'episodeNum' },
    { re: /^initial airdate\s*:\s*(.+)$/i, key: 'airDate' },
  ];
  scanLabelValuePairs(rows, 8, labelMap, meta, inlinePatterns);
  let headerRow = -1, headers = [];
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const vals = rows[r].map(v => v.toUpperCase());
    if (vals.some(v => v.includes('COMPOSER')) && vals.some(v => v.includes('PUBLISHER'))) {
      headerRow = r; headers = vals; break;
    }
  }
  if (headerRow === -1) return { meta, cues };
  const cTitle = headers.findIndex(h => h.includes('TITLE') || h === 'CUE NAME');
  const cLen = headers.findIndex(h => h.includes('CUE LENGTH') || h.includes('DURATION'));
  const cUse = headers.findIndex(h => h.includes('USE'));
  const cComposer = headers.findIndex(h => h.includes('COMPOSER'));
  const cPublisher = headers.findIndex(h => h.includes('PUBLISHER'));
  const cSociety = headers.findIndex(h => h === 'SOCIETY' || /ASCAP|BMI|SESAC/.test(h));
  if (cTitle === -1) return { meta, cues };
  let seq = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const title = row[cTitle] || '';
    if (!title) continue;
    seq++;
    const society = cSociety !== -1 ? (row[cSociety] || '') : '';
    const societyParts = society.split('/').map(s => s.trim()).filter(Boolean);
    const composerFallback = societyParts[0] || society;
    const publisherFallback = societyParts[societyParts.length - 1] || society;
    const composers = cComposer !== -1 ? parsePartyFreeText(row[cComposer], 'C', composerFallback) : [];
    const publishers = cPublisher !== -1 ? parsePartyFreeText(row[cPublisher], 'E', publisherFallback) : [];
    cues.push({
      seq: String(seq),
      titleRaw: title,
      workNum: '',
      usage: cUse !== -1 ? (row[cUse] || '') : '',
      duration: cLen !== -1 ? (row[cLen] || '') : '',
      parties: [...composers, ...publishers],
    });
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
  else if (format === 'J') ({ meta, cues } = parseFormatJ(filePath));
  else if (format === 'K') ({ meta, cues } = parseFormatK(filePath));
  else if (format === 'L') ({ meta, cues } = parseFormatL(filePath));
  else if (format === 'L2') ({ meta, cues } = parseFormatL2(filePath));
  else if (format === 'M') ({ meta, cues } = parseFormatM(filePath));
  else if (format === 'N') ({ meta, cues } = parseFormatN(filePath));
  else if (format === 'O') ({ meta, cues } = parseFormatO(filePath, origName));
  else if (format === 'H') ({ meta, cues } = parseFormatH(filePath));
  else if (format === 'I') ({ meta, cues } = parseFormatI(filePath));
  else if (format === 'EBR_SKIP') return { format: 'EBR_SKIP', meta: {}, cues: [] };
  else return { format: 'UNKNOWN', meta: {}, cues: [] };

  for (const cue of cues) {
    cue.titleNormalized = normTitle(cue.titleRaw);
    cue.titleNormalizedStrict = normTitleStrict(cue.titleRaw);
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
// 2026-11-04 perf fix: matchCueToTitles used to .filter() the FULL titles
// array (per real-catalog counts, ~33,000 rows) up to 3 times per cue, for
// every cue in a cue sheet -- same O(cues x titles) problem as
// matchLineToTitles in royalty-import.js (see that function's own comment),
// fixed the same way: three Maps (by normTitleStrict / normTitle / camelKey),
// built ONCE per distinct titlesIndex array and cached in a WeakMap, so this
// is transparent to every caller -- same signature, same candidates/order/
// counts, just O(1) lookups instead of an O(n) scan per cue per key.
const _cueTitleIndexCache = new WeakMap();
function _cueTitleIndexFor(titlesIndex) {
  let idx = _cueTitleIndexCache.get(titlesIndex);
  if (!idx) {
    const byStrict = new Map(), byNorm = new Map(), byCamel = new Map();
    for (const t of titlesIndex) {
      if (!byStrict.has(t.normTitleStrict)) byStrict.set(t.normTitleStrict, []);
      byStrict.get(t.normTitleStrict).push(t);
      if (!byNorm.has(t.normTitle)) byNorm.set(t.normTitle, []);
      byNorm.get(t.normTitle).push(t);
      if (!byCamel.has(t.camelKey)) byCamel.set(t.camelKey, []);
      byCamel.get(t.camelKey).push(t);
    }
    idx = { byStrict, byNorm, byCamel };
    _cueTitleIndexCache.set(titlesIndex, idx);
  }
  return idx;
}

function matchCueToTitles(cue, titlesIndex) {
  const { byStrict, byNorm, byCamel } = _cueTitleIndexFor(titlesIndex);
  // Strict pass first: match the cue's title AS WRITTEN against the
  // catalog's title AS WRITTEN (no suffix stripping on either side). Tried
  // before the stripped pass because the catalog can and does contain two
  // genuinely distinct, real songs that differ only by a trailing tag-like
  // word -- e.g. "Thunder" and "Thunder Drums" are separate sku_roots, not
  // a mix-suffix variant of the same song. A strict match resolves both
  // correctly and never reaches the stripped comparison below.
  const strictNorm = cue.titleNormalizedStrict;
  if (strictNorm) {
    const strictExact = byStrict.get(strictNorm) || [];
    if (strictExact.length === 1) return { status: 'matched', candidates: strictExact, confidence: 'exact-strict' };
    if (strictExact.length > 1) return { status: 'ambiguous', candidates: strictExact, confidence: 'exact-strict-multiple' };
  }

  // Stripped pass: only reached when nothing matched the cue's title
  // verbatim -- i.e. the cue's title text carries a mix/version tag the
  // catalog has no literal row for (e.g. a HAUS-shipped filename like
  // "HAUS_Thunder_Dm_R13a1591_MAIN", or a cue sheet literally reading
  // "Thunder MAIN").
  const norm = cue.titleNormalized;
  if (norm) {
    const exact = byNorm.get(norm) || [];
    if (exact.length === 1) return { status: 'matched', candidates: exact, confidence: 'exact' };
    if (exact.length > 1) return { status: 'ambiguous', candidates: exact, confidence: 'exact-multiple' };
  }

  // Fallback for cues whose only title text IS a HAUS-shipped filename
  // (formats D/D2/D3/B2/H/I -- see parseHausFilenameTitle above). Still an
  // exact match -- against a second, precomputed key (titlesIndex[].camelKey,
  // set wherever titlesIndex is built in api.js) -- never a fuzzy guess.
  if (cue.filenameCamelKey) {
    const camelExact = byCamel.get(cue.filenameCamelKey) || [];
    if (camelExact.length === 1) return { status: 'matched', candidates: camelExact, confidence: 'filename-exact' };
    if (camelExact.length > 1) return { status: 'ambiguous', candidates: camelExact, confidence: 'filename-exact-multiple' };
  }

  return { status: 'unmatched', candidates: [] };
}

module.exports = {
  normTitle,
  normTitleStrict,
  titleToCamelKey,
  parseHausFilenameTitle,
  tokenOverlapScore,
  sniffFormat,
  parseCueSheetFile,
  matchCueToTitles,
  classifyCue,
};
