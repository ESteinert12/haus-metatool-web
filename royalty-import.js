// royalty-import.js
//
// Imports real PRO royalty PAYMENT statements (money actually received) and
// ties each line to our titles catalog. This is a different pipeline from:
//   - EBR export (ebr-lot-export.js / generate-ebr-export.js): sends
//     registration data OUT to ASCAP/BMI via MusicMark so works are on file
//     to earn royalties in the first place. No money.
//   - Cue sheet verification (cue-sheet-import.js): reconciles what a
//     production company/PRO reports AIRED against our catalog/splits. Still
//     no money -- a usage/performance record, not a payment record.
// This module is the one with real financial consequences if it's wrong.
//
// Every format below was built from real statement files, never a guessed
// spec, per this codebase's hard rule (see cue-sheet-import.js's own header
// comment and sniffFormat()). Five real formats confirmed so far:
//   BMI       -- royalty_<participant#>_<YYYYQ>.csv, flat PERIOD/TITLE NAME/
//                ROYALTY AMOUNT columns, COMPANY NAME literally "BMI".
//   SESAC     -- "<affiliate#>.<year>-<qtr>.csv", 4 metadata lines then a
//                blank line then the real header starting "Year,Qtr,Song #,
//                Song Title,...,Earnings".
//   ASCAP_DOM -- ASCAP domestic quarterly distribution. Header starts
//                "DistributionYear,Distribution Quarter,...". Earnings are
//                split across "Dollars" + "Premium Dollars" (sum both).
//   ASCAP_FOR -- ASCAP foreign-society distribution (money ASCAP collected
//                via reciprocal PROs -- APRA/PRS/GEMA/SACEM/etc, named in the
//                "Licensor" column). Header starts "File Type,Statement
//                Recipient Name,...". Earnings are in the single "$ Amount"
//                column.
//   SOCAN     -- direct SOCAN (Canada) statement, one line per (episode,
//                work) pairing. Header starts "RIGHTS OWNER,PERFORMER OR
//                SERIES (FILM),PRODUCT OR EPISODE TITLE,WORK TITLE,...".
//                Has TWO period fields that can diverge -- "PMT SOCIETY
//                PERIOD" (when SOCAN paid) vs "EARNINGS PERIOD" (when the
//                performance happened) -- meta.period uses the payment
//                period, same convention as the other formats. The real
//                amount owed is "PAYMENT DUE" (net, after "CONTRACT RATE"),
//                not "ORIGINAL AMT" (gross, dollar-sign-prefixed, pre-rate).
// Anything that doesn't match one of these four real shapes comes back
// UNKNOWN with nothing imported -- never a best-guess parse. A wrong guess
// here means wrong money, not just a wrong "aired" record.

const fs = require('fs');
const { normTitle, titleToCamelKey } = require('./cue-sheet-import.js');

// Full quote-aware CSV line splitter (same approach as cue-sheet-import.js's
// splitCsvLine -- no embedded newlines inside these statement fields, so the
// simpler single-line splitter is sufficient here, unlike cue sheets' "BEST
// OFs" format which needed the newline-aware parseCsvRecords).
function splitCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function num(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).trim());
  return isNaN(n) ? 0 : n;
}

function stripQuotes(s) {
  return (s || '').replace(/^"|"$/g, '');
}

// ── Format sniffing ─────────────────────────────────────────────────────
// Same posture as cue-sheet-import.js's sniffFormat(): read structural
// fingerprints from the real header/metadata rows, return a format tag or
// 'UNKNOWN'. Never guessed from the filename alone (BMI/SESAC filenames do
// encode useful metadata -- participant #, period -- but classification
// itself goes by header content, same discipline as cue sheets).
// Full expected header shapes, by exact field name AND position, for every
// confirmed real format. sniffFormat() validates the WHOLE header against
// these -- not just a couple of anchor columns -- because every parser below
// reads fields by fixed position (f[19], f[29], etc). If a PRO ever changes
// their export (adds/reorders/renames a column), checking only 2-3 anchor
// fields would still happily classify the file and then silently read the
// WRONG column for every other field -- wrong money, no error raised. Full-
// header validation turns that into an UNKNOWN (surfaced, nothing imported)
// instead of a silent misread. If a real file ever legitimately changes
// shape, this needs a new format tag (e.g. BMI_V2), never a loosened check.
const EXPECTED_HEADERS = {
  BMI: ['PERIOD', 'W OR P', 'PARTICIPANT NAME', 'PARTICIPANT #', 'IP #', 'TITLE NAME', 'TITLE #',
        'PERF SOURCE', 'COUNTRY OF PERFORMANCE', 'SHOW NAME', 'EPISODE NAME', 'SHOW #', 'USE CODE',
        'TIMING', 'PARTICIPANT %', 'PERF COUNT', 'BONUS LEVEL', 'ROYALTY AMOUNT', 'WITHHOLD',
        'PERF PERIOD', 'CURRENT ACTIVITY AMT', 'HITS SONG OR TV NET SUPER USAGE BONUS',
        'STANDARDS OR TV NET THEME BONUS', 'FOREIGN SOCIETY ADJUSTMENT', 'COMPANY CODE',
        'COMPANY NAME', 'PERF DATE'],
  ASCAP_DOM: ['DISTRIBUTIONYEAR', 'DISTRIBUTION QUARTER', 'STATEMENT RECIPIENT ID',
        'STATEMENT RECIPIENT NAME', 'PARTY ID', 'PARTY NAME', 'LEGAL EARNER PARTY ID',
        'LEGAL EARNER PARTY NAME', 'PERFORMANCE SOURCE/BROADCAST MEDIUM', 'MUSIC USER GENRE',
        'MUSIC USER', 'NETWORK SERVICE', 'PERFORMANCE START DATE', 'PERFORMANCE END DATE',
        'SURVEY TYPE', 'DAY PART CODE', 'SERIES OR FILM/ATTRACTION', 'PROGRAM NAME', 'WORK ID',
        'WORK TITLE', 'CA%', 'CLASSIFICATION CODE', 'NUMBER OF PLAYS', 'PERFORMANCE TYPE (USAGE)',
        'DURATION', 'PERFORMING ARTIST', 'COMPOSER NAME', 'EE SHARE', 'CREDITS', 'DOLLARS',
        'PREMIUM CREDITS', 'PREMIUM DOLLARS', 'ADJUSTMENT INDICATOR', 'ADJUSTMENT REASON CODE',
        'ORIGINAL DISTRIBUTION DATE', 'ROLE TYPE', 'TYPE OF RIGHT', 'TERRITORY', 'LICENSOR',
        'PROGRAM CODE', 'PERFORMANCE QUARTER'],
  ASCAP_FOR: ['FILE TYPE', 'STATEMENT RECIPIENT NAME', 'STATEMENT RECIPIENT ID', 'PARTY NAME',
        'PARTY ID', 'LEGAL EARNER PARTY ID', 'LEGAL EARNER PARTY NAME', 'DISTRIBUTION DATE',
        'COUNTRY NAME', 'LICENSOR', 'LICENSOR CODE', 'PERFORMANCE START DATE',
        'PERFORMANCE END DATE', 'WORK TITLE', 'WORK ID', 'MEMBER SHARE', 'SERIES NAME',
        'PROGRAM NAME', 'REVENUE CLASS CODE', 'REVENUE CLASS DESCRIPTION', '$ AMOUNT',
        'ADJUSTMENT DISTRIBUTION DATE', 'ADJUSTMENT INDICATOR', 'ROLE TYPE', 'TYPE OF RIGHT',
        'TERRITORY'],
  SOCAN: ['RIGHTS OWNER', 'PERFORMER OR SERIES (FILM)', 'PRODUCT OR EPISODE TITLE', 'WORK TITLE',
        'AUTHOR / COMPOSER', 'SHARE COLLECTED', 'PMT SOCIETY', 'PMT SOCIETY PERIOD',
        'EARNINGS PERIOD', 'PERF-COUNT', 'USAGE', 'DURATION', 'PMT SOURCE', 'TERRITORY',
        'ORIGINAL AMT', 'CONTRACT RATE', 'PAYMENT DUE', 'CONVERSION RATE'],
}

function headerMatches(headerFields, expected) {
  if (headerFields.length < expected.length) return false
  for (let i = 0; i < expected.length; i++) {
    if (headerFields[i] !== expected[i]) return false
  }
  return true
}

function sniffFormat(filePath) {
  const fullText = fs.readFileSync(filePath, 'utf8');
  const lines = fullText.split(/\r?\n/);
  const firstLine = lines[0] || '';

  // SESAC: starts with a few "Key: Value" metadata lines, including a
  // distinctive literal "SESAC QUARTERLY Royalty Statement" line, before the
  // real CSV header further down -- validate THAT header row fully too, not
  // just the literal metadata line, same reasoning as the other formats.
  if (/^SESAC QUARTERLY Royalty Statement/i.test(firstLine)) {
    const headerLine = lines.find(l => l.startsWith('Year,Qtr,Song #,Song Title'))
    if (!headerLine) return 'UNKNOWN'
    const sesacHeaderFields = splitCsvLine(headerLine).map(f => stripQuotes(f).trim().toUpperCase())
    return headerMatches(sesacHeaderFields, SESAC_HEADER) ? 'SESAC' : 'UNKNOWN'
  }

  const headerFields = splitCsvLine(firstLine).map(f => stripQuotes(f).trim().toUpperCase());
  if (headerMatches(headerFields, EXPECTED_HEADERS.BMI)) return 'BMI';
  if (headerMatches(headerFields, EXPECTED_HEADERS.ASCAP_DOM)) return 'ASCAP_DOM';
  if (headerMatches(headerFields, EXPECTED_HEADERS.ASCAP_FOR)) return 'ASCAP_FOR';
  if (headerMatches(headerFields, EXPECTED_HEADERS.SOCAN)) return 'SOCAN';

  return 'UNKNOWN';
}

const SESAC_HEADER = ['YEAR', 'QTR', 'SONG #', 'SONG TITLE', '%SHARES', 'PRODUCTION TITLE',
  'EPISODE TITLE', 'EPISODE NUMBER', 'PERF/AIR DATE', 'NETWORK', 'ESTABLISHMENT/SOURCE',
  'ALBUM TITLE', 'ARTIST', 'PAYMENT TYPE', 'CHART', 'POSITION', 'PAY #', 'SYND', 'STRIP',
  'END AIR DT', 'MEDIUM', 'COVERAGE', 'PAY CODE', 'DAY PART', 'PERF CATEGORY', 'PERF TYPE',
  'PERF DURATION', 'PERFORMANCE', 'OCCUR', 'SOCIETY ABBRV', 'SOCIETY COUNTRY', 'EARNINGS']

// ── Parsers: each returns { meta, lines } where lines is an array of
// { titleRaw, titleNormalized, payeeName, payeeRole, amount, usageType,
//   periodStart, periodEnd, workId, country } ──────────────────────────────

function parseBMI(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const lines = [];
  let statementTotal = 0;
  let period = null;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    if (f.length < 18) continue;
    period = period || f[0];
    if (!f[5] || !f[5].trim()) continue; // stray subtotal/footer rows
    const amount = num(f[17]);
    lines.push({
      titleRaw: f[5],
      titleNormalized: normTitle(f[5]),
      payeeName: f[2],
      // BMI's "W OR P" column: W = writer share, P = publisher share. This is
      // exactly the split the cue-sheet splitsMismatch() bug taught us to
      // never conflate (see royalty-tracker-handoff.md) -- writer rows can
      // never match team_writers vs publisher rows deal_publishers if mixed.
      payeeRole: f[1] === 'W' ? 'writer' : f[1] === 'P' ? 'publisher' : null,
      amount,
      usageType: f[12] || null,
      country: f[8] || null,
      workId: f[6] || null,
      // Display-only context for a human resolving an unmatched/ambiguous
      // line -- NOT used for matching itself. Often blank for non-TV usage
      // (streaming/digital), which is normal, not a parse failure.
      showName: f[9] || null,
      episodeName: f[10] || null,
      // Captured separately, NOT folded into `amount` -- every real BMI row
      // seen so far (both quarters on file) has these at 0.00, so whether
      // they're additive-on-top-of ROYALTY AMOUNT or already included in it
      // has never actually been observable yet. Guessing wrong here means
      // wrong money the moment a bonus-tier song shows up. Verify with BMI's
      // own statement documentation or Erik before ever adding this into the
      // reconciled total.
      bonusAmount: num(f[21]) + num(f[22]) + num(f[23]),
    });
    statementTotal += amount;
  }
  return {
    meta: { source: 'BMI', period, periodStart: null, periodEnd: null, statementTotal },
    lines,
  };
}

function parseSESAC(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const headerIdx = rows.findIndex(l => l.startsWith('Year,Qtr,Song #,Song Title'));
  const affiliateLine = rows.find(l => l.startsWith('Affiliate No:')) || '';
  const periodLine = rows.find(l => l.startsWith('Distribution Period:')) || '';
  const lines = [];
  let statementTotal = 0;
  if (headerIdx === -1) {
    return { meta: { source: 'SESAC', period: null, statementTotal: 0 }, lines: [] };
  }
  for (let i = headerIdx + 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    if (f.length < 32) continue;
    if (!f[3] || !f[3].trim()) continue; // stray subtotal/footer rows with enough commas to pass the length check
    const amount = num(f[31]);
    lines.push({
      titleRaw: f[3],
      titleNormalized: normTitle(f[3]),
      payeeName: null, // SESAC per-affiliate statement -- payee is the affiliate itself (see meta)
      // SESAC doesn't report a writer/publisher split per line the way BMI
      // does -- %Shares (f[4]) is the affiliate's registered share of the
      // work, not a writer-vs-publisher role flag. Leave payeeRole null
      // rather than guessing.
      payeeRole: null,
      amount,
      usageType: f[25] || f[24] || null, // Perf Type / Perf Category
      country: f[30] || null, // Society Country
      workId: f[2] || null, // Song #
      // Display-only -- not used for matching. Episode Number (f[7]) folded
      // into episodeName when present since Episode Title alone is often
      // generic/repeated across a series.
      showName: f[5] || null, // Production Title
      episodeName: [f[6], f[7] ? `(Ep ${f[7]})` : null].filter(Boolean).join(' ') || null,
    });
    statementTotal += amount;
  }
  return {
    meta: {
      source: 'SESAC',
      period: periodLine.replace('Distribution Period:', '').trim() || null,
      affiliateNo: affiliateLine.replace('Affiliate No:', '').trim() || null,
      statementTotal,
    },
    lines,
  };
}

function parseASCAP_DOM(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const lines = [];
  let statementTotal = 0;
  let year = null, quarter = null;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    if (f.length < 32) continue;
    year = year || f[0];
    quarter = quarter || f[1];
    if (!f[19] || !f[19].trim()) continue; // stray subtotal/footer rows
    const amount = num(f[29]) + num(f[31]); // Dollars + Premium Dollars
    lines.push({
      titleRaw: f[19],
      titleNormalized: normTitle(f[19]),
      payeeName: f[26] || null, // Composer Name
      // ASCAP's "Role Type" column (f[35], e.g. "OWNER-COLLECTOR") describes
      // the STATEMENT RECIPIENT's role, not a per-line writer/publisher
      // split -- don't repurpose it as payeeRole. Real writer-vs-publisher
      // split isn't present in this export; leave null rather than guess.
      payeeRole: null,
      amount,
      usageType: f[23] || null, // Performance Type (Usage)
      country: f[37] || null, // Territory
      workId: f[18] || null,
      // Display-only -- not used for matching. Often blank for non-TV usage
      // (e.g. Pandora/digital streaming rows), which is normal.
      showName: f[16] && f[16].trim() ? f[16] : null, // Series or Film/Attraction
      episodeName: f[17] && f[17].trim() ? f[17] : null, // Program Name
    });
    statementTotal += amount;
  }
  return {
    meta: { source: 'ASCAP', period: year && quarter ? `${year}Q${quarter}` : null, statementTotal },
    lines,
  };
}

function parseASCAP_FOR(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const lines = [];
  let statementTotal = 0;
  let distDate = null;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    if (f.length < 21) continue;
    distDate = distDate || f[7];
    if (!f[13] || !f[13].trim()) continue; // stray subtotal/footer rows
    const amount = num(f[20]);
    lines.push({
      titleRaw: f[13],
      titleNormalized: normTitle(f[13]),
      payeeName: null,
      payeeRole: null,
      amount,
      usageType: f[19] || null, // Revenue Class Description
      country: f[8] || null, // Country Name
      workId: f[14] || null,
      // the reciprocal foreign PRO that actually collected this (APRA/PRS/
      // GEMA/SACEM/etc) -- distinct from "source" (ASCAP), which is who's
      // passing it through to us.
      foreignSociety: f[9] || null,
      // Display-only -- not used for matching.
      showName: f[16] && f[16].trim() && f[16] !== '-' ? f[16] : null, // Series Name
      episodeName: f[17] && f[17].trim() ? f[17] : null, // Program Name (seen holding a date range, not always a real episode title)
    });
    statementTotal += amount;
  }
  return {
    meta: { source: 'ASCAP', period: distDate, isForeignDistribution: true, statementTotal },
    lines,
  };
}

function parseSOCAN(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const lines = [];
  let statementTotal = 0;
  let period = null;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    if (f.length < 17) continue;
    period = period || f[7]; // PMT SOCIETY PERIOD (when SOCAN paid, not when earned)
    // PAYMENT DUE is the net amount actually owed (ORIGINAL AMT x CONTRACT
    // RATE, already converted) -- ORIGINAL AMT is gross/pre-rate and would
    // overstate what HAUS is actually due.
    if (!f[3] || !f[3].trim()) continue; // stray subtotal/footer rows
    const amount = num(f[16]);
    lines.push({
      titleRaw: f[3], // WORK TITLE -- distinct from f[2] PRODUCT OR EPISODE TITLE
      titleNormalized: normTitle(f[3]),
      payeeName: f[4] || null, // AUTHOR / COMPOSER
      // SHARE COLLECTED (f[5]) is the registered writer's share SOCAN is
      // paying on, not a writer/publisher role flag -- same caution as
      // SESAC's %Shares. Leave payeeRole null rather than guess.
      payeeRole: null,
      amount,
      usageType: f[10] || null, // USAGE
      country: f[13] || null, // TERRITORY
      workId: null, // SOCAN doesn't carry its own work ID in this export
      earningsPeriod: f[8] || null, // can differ from the payment period above
      // Display-only -- not used for matching.
      showName: f[1] || null, // PERFORMER OR SERIES (FILM)
      episodeName: f[2] || null, // PRODUCT OR EPISODE TITLE
    });
    statementTotal += amount;
  }
  return {
    meta: { source: 'SOCAN', period, statementTotal },
    lines,
  };
}

function parseRoyaltyStatementFile(filePath) {
  const format = sniffFormat(filePath);
  if (format === 'UNKNOWN') return { format, meta: {}, lines: [] };
  const parsed = {
    BMI: parseBMI,
    SESAC: parseSESAC,
    ASCAP_DOM: parseASCAP_DOM,
    ASCAP_FOR: parseASCAP_FOR,
    SOCAN: parseSOCAN,
  }[format](filePath);
  return { format, ...parsed };
}

// ─── Episode reference import (added 2026-10) ──────────────────────────────
// A separate, explicit import -- NOT part of sniffFormat()/the PRO-statement
// pipeline above. This is Kyle's own maintained cross-show episode master
// list (confirmed on the real file: 1,040 rows spanning many shows by code
// prefix -- AP = American Pickers, SN = Snapped, BOAP, ZOO, FA, etc. --
// not an American-Pickers-only list, verified by checking the code prefixes
// and cross-referencing SN-prefixed titles against the existing
// "BMI episode ids.csv" Snapped name list already in Kyle's Downloads).
// Used ONLY to SUGGEST an episode match next to an unresolved royalty line
// for a human to confirm -- never auto-linked. Verified against real BMI
// American Pickers statement data: ~78.5% of 317 distinct episode names
// matched exactly, another ~7% were near-misses from BMI dropping a leading
// "A"/"The" article, and ~5% were "Best of ..." clip/compilation episodes
// with no original air date to match. No format has ever been guessed here.
//
// Known real quirk: the raw file arrives with CR-only line endings (no \n
// at all) -- a plain .split('\n') treats the whole file as one line.
function parseAirDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || '').trim());
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseEpisodeReferenceFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rawLines = raw.split(/\r\n|\r|\n/).filter(l => l.trim().length);
  const rows = [];
  for (const line of rawLines) {
    const f = splitCsvLine(line).map(stripQuotes);
    const title = (f[0] || '').trim();
    if (!title) continue; // blank-title guard, same principle as every PRO parser above
    rows.push({
      titleRaw: title,
      titleNormalized: normTitle(title),
      showCode: (f[1] || '').trim() || null,
      airDate: parseAirDate(f[2]),
      month: f[3] ? (parseInt(f[3], 10) || null) : null,
      season: (f[4] || '').trim() || null,
      year: f[5] ? (parseInt(f[5], 10) || null) : null,
    });
  }
  return { rows };
}

// Same posture as cue-sheet-import.js's matchCueToTitles(): exact
// normalized-title match only, never fuzzy. Multiple candidates -> ambiguous,
// human picks; zero -> unmatched, human can search/override. A wrong
// automatic match here means money attributed to the wrong song.
function matchLineToTitles(line, titlesIndex) {
  const norm = line.titleNormalized
  if (norm) {
    const exact = titlesIndex.filter(t => t.normTitle === norm)
    if (exact.length === 1) return { status: 'matched', candidates: exact, confidence: 'exact' }
    if (exact.length > 1) return { status: 'ambiguous', candidates: exact, confidence: 'exact-multiple' }
  }
  return { status: 'unmatched', candidates: [] }
}

// ─── Episode join key: episode_reference <-> live `episodes` table ─────────
// (verified 2026-10-20, against real artifacts, not guessed)
//
// Kyle's hypothesis: the show_code values already in episode_reference
// (e.g. "SN3021", "AP12385") should line up with episode_num in the live
// `episodes` table, since both ultimately come from the same real cue
// sheets. Checked this against real files on Kyle's machine before writing
// anything:
//
//   - SESAC cue sheets (Cue_Sheet_Details_*.csv) report a clean numeric
//     "Episode Number" field. Real example: Episode Title "Patricia Brown",
//     Episode Number 3021, Program "Snapped", Air Date 06/20/2021 --
//     matches episode_reference's "PATRICIA BROWN" / "SN3021" row EXACTLY
//     (title + the numeric suffix of show_code + air date). Checked a
//     second one too: "Georgina Misener" / Episode Number 3125 / Snapped ->
//     episode_reference's "SN3125" -- exact again. So for SESAC-sourced
//     shows, episode_num IS the numeric tail of show_code.
//
//   - Production "MUSIC FINAL" xlsx cue sheets -- the American Pickers
//     format, and the dominant show in the royalty data -- are different.
//     cue-sheet-import.js's parseFormatB() leaves episodeNum blank, so
//     importOneCueSheet()'s fallback stores the RAW FILENAME STEM as
//     episode_num in the live DB (e.g. "AP12 385 Evel Empire MUSIC
//     FINAL"), not a clean code. Checked 4 real filenames on Kyle's machine
//     ("AP12 385 Evel Empire MUSIC FINAL.xlsx", "AP12 390 Speedway Thrills
//     MUSIC FINAL.xlsx", etc.) against episode_reference: the TITLE
//     embedded in each filename matches an episode_reference row exactly
//     ("Evel Empire" -> AP12385, "Speedway Thrills" -> AP12390), but there
//     is no clean number to match directly -- the join for this format has
//     to go through the title, not a number.
//
// Different real formats, different real join strategies. This tries the
// numeric path first (only when episode_num is a bare integer), then the
// filename-title path (only when it looks like a stored filename), and
// returns 'none' rather than guessing when neither fits. Always a
// candidate for a human to confirm -- same posture as every other match in
// this pipeline, never an automatic write.
// Show-code prefix -> real program name, but ONLY for prefixes actually
// confirmed against a real cue sheet this session (never extrapolated to
// the ~20 other prefixes in the file -- that would be exactly the kind of
// guess this codebase's rule is against). Each entry here has a real
// Cue_Sheet_Details_*.csv backing it:
//   SN   -> "Snapped"                (Patricia Brown/3021, Georgina Misener/3125)
//   SBB  -> "Snapped: Behind Bars"   (Traci Wolfe/103)
// Add a prefix here only once it's been checked against a real cue sheet
// the same way -- see royalty-tracker handoff doc for how to verify one.
// Keys are the program name run through the SAME normalization as titles
// (normTitle strips punctuation/case) so "Snapped: Behind Bars" and
// "SNAPPED BEHIND BARS" are the same key -- program names arrive from
// different real sources (cue sheet metadata lines, xlsx fields) with
// inconsistent punctuation, confirmed when "Snapped: Behind Bars" first
// failed to match this literally.
const VERIFIED_PREFIX_PROGRAMS = {
  SN: normTitle('Snapped'),
  SBB: normTitle('Snapped: Behind Bars'),
};

function suggestEpisodeJoin(episodeNum, referenceRows, program) {
  const trimmed = (episodeNum || '').trim();
  if (!trimmed) return { strategy: 'none', candidates: [] };

  // Path 1: SESAC-style -- episode_num is already a bare integer. A short
  // numeric ID collides across shows (confirmed on real data: "103" alone
  // matches 11 different shows in the reference list -- SN, SBB, ZOOSD,
  // AQUA, TEN, etc. all happen to have an episode numbered 103) -- so a raw
  // numeric suffix match is NEVER returned as a single confident answer
  // without the real episodes.program value narrowing it to a prefix
  // that's actually been verified to mean that program. Without a usable
  // program hint, every numeric match is 'ambiguous' and a human picks.
  if (/^\d+$/.test(trimmed)) {
    const allNumericCandidates = referenceRows.filter(r => r.showCode && new RegExp(`${trimmed}$`).test(r.showCode) && /\d/.test(r.showCode));
    const programNorm = normTitle((program || '').trim());
    const verifiedPrefix = programNorm
      ? Object.keys(VERIFIED_PREFIX_PROGRAMS).find(p => VERIFIED_PREFIX_PROGRAMS[p] === programNorm)
      : null;
    if (verifiedPrefix) {
      const narrowed = allNumericCandidates.filter(r => r.showCode.startsWith(verifiedPrefix));
      if (narrowed.length === 1) return { strategy: 'numeric-suffix', candidates: narrowed };
      if (narrowed.length > 1) return { strategy: 'ambiguous', candidates: narrowed };
      // program given but didn't match a verified prefix's candidates -- fall through to title path below
    } else if (allNumericCandidates.length) {
      return { strategy: 'ambiguous', candidates: allNumericCandidates };
    }
  }

  // Path 2: MUSIC-FINAL-style -- episode_num is actually a stored filename
  // stem. Strip the leading show/episode code tokens and the MUSIC FINAL
  // marker (in either word order, as seen in real filenames), match what's
  // left as a normalized title -- same exact-match-only posture as
  // matchLineToTitles.
  const stripped = trimmed
    .replace(/\bMUSIC\s*FINAL\b/i, '')
    .replace(/\bFINAL\s*MUSIC\b/i, '')
    .replace(/^[A-Z]+\d*\s+(SFP\s+)?\d+[_\s]*\d*[_\s]*/i, '')
    .trim();
  if (stripped) {
    const norm = normTitle(stripped);
    const candidates = referenceRows.filter(r => r.titleNormalized === norm);
    if (candidates.length) return { strategy: 'filename-title', candidates };
  }

  return { strategy: 'none', candidates: [] };
}

module.exports = {
  sniffFormat,
  parseRoyaltyStatementFile,
  parseEpisodeReferenceFile,
  matchLineToTitles,
  suggestEpisodeJoin,
  normTitle,
  titleToCamelKey,
};
