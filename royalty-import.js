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

// SESAC's Earnings column (both the current-format parseSESAC and the
// true-no-marker-legacy parseSESAC_LEGACY) carries dollar amounts in several
// real shapes confirmed by reading the actual files, not guessed:
//   plain decimal      "0.00456500"   (current-format files from 2018Q4 on)
//   dollar-prefixed     "$1.130"       (current-format files 2016Q1-2018Q3;
//                                       legacy files throughout)
//   parenthesized       "($1.220)"     (negative -- confirmed on real files
//                                       in both current-format 2016Q4/2017Q1
//                                       and legacy SESAC_1709/2017Q2)
//   minus-then-dollar   "-$1.620"      (confirmed on real file SESAC_16Q3)
// num()/parseFloat silently returns 0 (not NaN -- isNaN("$1.13") is true, so
// num() hits its own NaN guard) for any of the first three non-plain shapes,
// which is how this went unnoticed until the first real dry run against
// historical files: statement totals for the affected files looked like
// "$0.00" across the board rather than erroring loudly.
function parseMoneyAmount(s) {
  if (s == null) return 0;
  let v = String(s).trim();
  if (!v) return 0;
  let negative = false;
  const paren = v.match(/^\(([^()]*)\)$/);
  if (paren) { negative = true; v = paren[1].trim(); }
  if (v.startsWith('-')) { negative = true; v = v.slice(1); }
  v = v.replace(/^\$/, '').trim();
  if (v.startsWith('-')) { negative = true; v = v.slice(1); } // handles "$-1.62" too, just in case
  const n = parseFloat(v);
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
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

// 2026-11-11: historical-format gap closed for BMI, ASCAP (domestic +
// international) and SESAC. Verified file-by-file against Erik's real
// ROYALTY STATEMENTS archive (45 BMI, 39 ASCAP domestic, 34 ASCAP
// international, 42 SESAC csvs spanning 2014-2026) before writing any of
// this -- see claude/handoff-2026-11-11-royalty-tracker-historical-formats.md
// for the full per-shape breakdown. Three distinct kinds of drift found:
//
//   1. BMI and ASCAP_DOM: the OLD header is a strict prefix of the new one
//      -- PRO added trailing columns later (BMI: "PERF DATE"; ASCAP_DOM:
//      "Program Code"/"Performance Quarter", and ASCAP_DOM's earliest 2016
//      files are missing "Type Of Right"/"Territory" too). Every column
//      parseBMI/parseASCAP_DOM actually read sits well inside the shorter
//      stable prefix in every real file checked (old and new alike), so
//      checking only that prefix recognizes every era with the SAME parser
//      -- no new parse function needed, just a shorter required header.
//   2. ASCAP international (ASCAP_FOR): a REAL structural difference, not
//      just added columns. Pre-2019 statements report money across five
//      category columns ($ GENERAL/$ RADIO/$ TV/$ TV-FILM/$ CINEMA/$ TOTAL)
//      instead of the current single ($ Amount) column, AND the column
//      order/presence of "StatementDate"/"Type Of Right"/"Territory" varies
//      across the 9 real old files on file (4 distinct sub-shapes seen).
//      Verified against 2 real files (170 + 2,627 + 3,256 rows checked) that
//      $ TOTAL always equals the sum of the 5 category columns (0 mismatches
//      across 6,053 rows) -- safe to use $ TOTAL directly as the amount,
//      same convention as the current format's single $ Amount column.
//      New name-indexed parser (parseASCAP_FOR_LEGACY) handles all 4
//      sub-shapes uniformly by looking up each needed field by header name
//      instead of a hardcoded position, since position drifts between them.
//   3. SESAC: 3 of the 42 real files on file have no identifying "SESAC
//      QUARTERLY Royalty Statement" line at all (the header row IS the first
//      line) -- and those 3 files are not even consistent with EACH OTHER:
//      one has "StatementDate" inserted after "Song #", two have it inserted
//      BEFORE "Song #" instead (one of those two even misspells the column
//      "StatementtDate"). A hardcoded legacy position would silently misread
//      "Song Title" as "StatementDate" or vice versa depending on which of
//      these 3 files it hit. parseSESAC_LEGACY looks up every field by
//      header name instead, which is immune to all three variants.
//      (A 4th file in the same folder, "SESAC_PayConfirmation Table.csv",
//      has NO earnings/dollar column at all -- it isn't a royalty statement,
//      correctly stays UNKNOWN; flagged for Erik to confirm/move it.)
const BMI_HEADER_MIN = EXPECTED_HEADERS.BMI.slice(0, 26) // through 'COMPANY NAME' -- drops trailing 'PERF DATE'
const ASCAP_DOM_HEADER_MIN = EXPECTED_HEADERS.ASCAP_DOM.slice(0, 36) // through 'ROLE TYPE' -- drops trailing Licensor/Type Of Right/Territory/Program Code/Performance Quarter variants

function isAscapForLegacyHeader(headerFields) {
  // Current ASCAP_FOR has '$ AMOUNT'; every legacy sub-shape has '$ TOTAL'
  // instead (plus the 5 category columns) -- distinctive, never collides
  // with the current format or any other PRO's header.
  return headerFields[0] === 'FILE TYPE' && headerFields.includes('WORK TITLE') && headerFields.includes('$ TOTAL')
}

function isSesacLegacyHeader(headerFields) {
  const required = ['YEAR', 'QTR', 'SONG #', 'SONG TITLE', 'EARNINGS']
  return required.every(f => headerFields.includes(f))
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
  if (headerMatches(headerFields, BMI_HEADER_MIN)) return 'BMI';
  if (headerMatches(headerFields, ASCAP_DOM_HEADER_MIN)) return 'ASCAP_DOM';
  if (headerMatches(headerFields, EXPECTED_HEADERS.ASCAP_FOR)) return 'ASCAP_FOR';
  if (headerMatches(headerFields, EXPECTED_HEADERS.SOCAN)) return 'SOCAN';
  if (isAscapForLegacyHeader(headerFields)) return 'ASCAP_FOR_LEGACY';
  if (isSesacLegacyHeader(headerFields)) return 'SESAC_LEGACY';

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
    const amount = parseMoneyAmount(f[31]);
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
  const periodCounts = new Map(); // (year,quarter) pair -> row count, for majority vote below
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    if (f.length < 32) continue;
    if (f[0] && f[1]) {
      const key = `${f[0]}\u0000${f[1]}`;
      periodCounts.set(key, (periodCounts.get(key) || 0) + 1);
    }
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
  // Majority/mode vote: whichever (year,quarter) pair appears on the most
  // rows wins, rather than whichever row happens to come first. See the
  // comment above the loop for the real-data evidence this is safe.
  let year = null, quarter = null, bestCount = -1;
  for (const [key, cnt] of periodCounts) {
    if (cnt > bestCount) {
      bestCount = cnt;
      [year, quarter] = key.split('\u0000');
    }
  }
  return {
    meta: { source: 'ASCAP', period: (year && quarter) ? `${year}Q${quarter}` : null, statementTotal },
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

// Generic header-name index: maps each uppercased header field to its
// column position, first-occurrence-wins. Used by the legacy parsers below
// instead of hardcoded positions, since real legacy files disagree with each
// other on column order/presence (see sniffFormat's comment above) -- a
// fixed position is provably wrong for at least one real file in each
// legacy bucket, a by-name lookup is correct for all of them.
function buildHeaderIndex(headerLine) {
  const headerFields = splitCsvLine(headerLine).map(f => stripQuotes(f).trim().toUpperCase())
  const idx = {}
  headerFields.forEach((h, i) => { if (!(h in idx)) idx[h] = i })
  return idx
}

const ASCAP_FOR_LEGACY_CATEGORY_COLS = ['$ GENERAL', '$ RADIO', '$ TV', '$ TV-FILM', '$ CINEMA']

// Pre-~2019 ASCAP international distribution: money reported across 5
// category columns instead of the current single "$ Amount" -- verified
// against real files that "$ TOTAL" always equals their sum (0 mismatches
// across 6,053 real rows checked, see sniffFormat's comment), so it's used
// directly as the amount, same convention as the current format's $ Amount.
// Column order/presence of StatementDate/Type Of Right/Territory varies
// across real files (4 distinct sub-shapes seen) -- looked up by name, not
// position, so this is correct for all of them without needing to special-
// case each sub-shape.
function parseASCAP_FOR_LEGACY(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const idx = buildHeaderIndex(rows[0] || '')
  const lines = [];
  let statementTotal = 0;
  let distDate = null;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    const g = (name) => (idx[name] != null && idx[name] < f.length) ? f[idx[name]] : null;
    const title = g('WORK TITLE');
    if (!title || !title.trim()) continue; // stray subtotal/footer rows
    distDate = distDate || g('DISTRIBUTION DATE');
    const amount = num(g('$ TOTAL'));
    const activeCats = ASCAP_FOR_LEGACY_CATEGORY_COLS.filter(c => idx[c] != null && num(g(c)) !== 0)
    const seriesName = g('SERIES NAME')
    const programName = g('PROGRAM NAME')
    lines.push({
      titleRaw: title,
      titleNormalized: normTitle(title),
      payeeName: null,
      payeeRole: null,
      amount,
      // Display-only (not used for matching) -- which of the 5 legacy
      // category columns was actually populated for this row, in place of
      // the current format's "Revenue Class Description" column, which this
      // era of export doesn't have.
      usageType: activeCats.length ? activeCats.join('+') : null,
      country: g('COUNTRY NAME'),
      workId: g('WORK ID'),
      foreignSociety: g('LICENSOR'),
      showName: (seriesName && seriesName.trim() && seriesName !== '-') ? seriesName : null,
      episodeName: (programName && programName.trim()) ? programName : null,
    });
    statementTotal += amount;
  }
  return {
    meta: { source: 'ASCAP', period: distDate, isForeignDistribution: true, statementTotal },
    lines,
  };
}

// Pre-2017Q3-ish SESAC exports with no "SESAC QUARTERLY Royalty Statement"
// marker line -- the header row IS the first line. The 3 real files on file
// disagree with EACH OTHER on where "StatementDate" sits relative to "Song
// Title" (one has it before Song Title, two have it after -- one of those
// two even misspells the column "StatementtDate") -- looked up by name, not
// position, so correct regardless of which of the 3 real shapes a given
// file turns out to be.
function parseSESAC_LEGACY(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const idx = buildHeaderIndex(rows[0] || '')
  const lines = [];
  let statementTotal = 0;
  let year = null, qtr = null;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    const g = (name) => (idx[name] != null && idx[name] < f.length) ? f[idx[name]] : null;
    const title = g('SONG TITLE');
    if (!title || !title.trim()) continue; // stray subtotal/footer rows
    year = year || g('YEAR');
    qtr = qtr || g('QTR');
    // Legacy SESAC's Earnings column carries the same $/parens shapes as the
    // current-format parser (confirmed on real file SESAC_1709/2017Q2, which
    // has BOTH "$2.71"-style and "($4.48)"-style values) -- use the same
    // shared parseMoneyAmount() helper rather than a narrower $-only strip,
    // which would have silently zeroed out the parenthesized-negative rows.
    const amount = parseMoneyAmount(g('EARNINGS'));
    const episodeTitle = g('EPISODE TITLE')
    const episodeNumber = g('EPISODE NUMBER')
    lines.push({
      titleRaw: title,
      titleNormalized: normTitle(title),
      payeeName: null,
      payeeRole: null,
      amount,
      usageType: g('PERF TYPE') || g('PERF CATEGORY') || null,
      country: g('SOCIETY COUNTRY'),
      workId: g('SONG #'),
      showName: g('PRODUCTION TITLE'),
      episodeName: [episodeTitle, episodeNumber ? `(Ep ${episodeNumber})` : null].filter(Boolean).join(' ') || null,
    });
    statementTotal += amount;
  }
  return {
    // These legacy files carry no "Affiliate No:"/"Distribution Period:"
    // metadata lines (no metadata lines at all -- the header is line 1), so
    // period falls back to the first data row's own Year/Qtr instead of
    // being left null.
    meta: { source: 'SESAC', period: (year && qtr) ? `${year}Q${qtr}` : null, affiliateNo: null, statementTotal },
    lines,
  };
}

// ─── Manual column mapping (added 2026-11-11) ──────────────────────────────
// sniffFormat() only ever recognizes a FIXED list of known shapes -- a
// genuinely new PRO export (or one that drifts further than BMI/ASCAP_DOM's
// simple added-column case) always comes back UNKNOWN, which previously
// meant the file was refused outright and someone had to wait for a code
// change here before it could be imported at all. Erik's own ask: "how do
// we handle unknown formats if we ever get one, I don't want to have to
// update the app every time." This is the answer -- a human maps the
// columns once, by NAME (not position, same reasoning as every legacy
// parser above: position isn't trustworthy across real-world export
// variance), through the UI, and api.js can save that mapping as a
// royalty_format_templates row keyed by the exact header-row text so the
// NEXT file with the identical header is handled automatically from then
// on, with no further human step and no code change at all.
//
// Reads the first few raw rows of a file so the UI can show them and let a
// human pick which row is the actual header (not always row 0 -- SESAC's
// own marker-line convention is the proof real exports sometimes put
// metadata before the header).
function readRawRowsPreview(filePath, maxRows = 8) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/).filter(r => r.trim().length > 0).slice(0, maxRows);
  return rows.map(r => splitCsvLine(r).map(stripQuotes));
}

// mapping shape: {
//   headerRowIndex: number,
//   columnMap: { title, amount, payeeName?, payeeRole?, usageType?, country?, workId?, showName?, episodeName? } -- values are HEADER NAMES (as shown to the human), title/amount required, rest optional,
//   source: 'BMI'|'SESAC'|'ASCAP'|'SOCAN'|'OTHER',
//   periodMode: 'manual' | 'single_column' | 'year_quarter_columns',
//   periodColumn?, yearColumn?, quarterColumn?, period? (manual mode's typed value, per-import),
// }
// Returns the same { format, meta: {source, period, statementTotal}, lines }
// shape every other parser in this file returns, so the rest of the import
// pipeline (dedupe, matchLineToTitles, _bulkInsert) needs zero special-casing.
function parseWithManualMapping(filePath, mapping) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split(/\r?\n/);
  const headerRowIndex = mapping.headerRowIndex || 0;
  const idx = buildHeaderIndex(rows[headerRowIndex] || '');
  const g = (f, name) => {
    if (!name) return null;
    const i = idx[String(name).trim().toUpperCase()];
    return (i != null && i < f.length) ? f[i] : null;
  };

  const lines = [];
  let statementTotal = 0;
  const periodCounts = new Map(); // majority vote, same approach as parseASCAP_DOM's period fix

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    if (!rows[i] || !rows[i].trim()) continue;
    const f = splitCsvLine(rows[i]).map(stripQuotes);
    const title = g(f, mapping.columnMap.title);
    if (!title || !title.trim()) continue; // stray subtotal/footer rows, same convention as every other parser here

    if (mapping.periodMode === 'single_column' && mapping.periodColumn) {
      const p = g(f, mapping.periodColumn);
      if (p) periodCounts.set(p, (periodCounts.get(p) || 0) + 1);
    } else if (mapping.periodMode === 'year_quarter_columns' && mapping.yearColumn && mapping.quarterColumn) {
      const y = g(f, mapping.yearColumn), q = g(f, mapping.quarterColumn);
      if (y && q) { const key = `${y}\u0000${q}`; periodCounts.set(key, (periodCounts.get(key) || 0) + 1); }
    }

    const amount = parseMoneyAmount(g(f, mapping.columnMap.amount));
    lines.push({
      titleRaw: title,
      titleNormalized: normTitle(title),
      payeeName: g(f, mapping.columnMap.payeeName) || null,
      payeeRole: g(f, mapping.columnMap.payeeRole) || null,
      amount,
      usageType: g(f, mapping.columnMap.usageType) || null,
      country: g(f, mapping.columnMap.country) || null,
      workId: g(f, mapping.columnMap.workId) || null,
      showName: g(f, mapping.columnMap.showName) || null,
      episodeName: g(f, mapping.columnMap.episodeName) || null,
    });
    statementTotal += amount;
  }

  let period = mapping.period || null; // manual mode: whatever was typed for this specific import
  if (mapping.periodMode !== 'manual' && periodCounts.size) {
    let bestKey = null, bestCount = -1;
    for (const [key, cnt] of periodCounts) { if (cnt > bestCount) { bestCount = cnt; bestKey = key; } }
    period = mapping.periodMode === 'year_quarter_columns' ? bestKey.replace('\u0000', 'Q') : bestKey;
  }

  return {
    format: 'CUSTOM',
    meta: { source: mapping.source || 'OTHER', period, statementTotal },
    lines,
  };
}

function parseRoyaltyStatementFile(filePath) {
  const format = sniffFormat(filePath);
  if (format === 'UNKNOWN') return { format, meta: {}, lines: [] };
  const parsed = {
    BMI: parseBMI,
    SESAC: parseSESAC,
    SESAC_LEGACY: parseSESAC_LEGACY,
    ASCAP_DOM: parseASCAP_DOM,
    ASCAP_FOR: parseASCAP_FOR,
    ASCAP_FOR_LEGACY: parseASCAP_FOR_LEGACY,
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
// 2026-11-04 perf fix: matchLineToTitles used to .filter() the FULL titles
// array (per real-catalog counts, ~33,000 rows) on every single call, and a
// real statement runs 30,000-80,000 lines -- a worst case over a billion
// string comparisons for one import, run synchronously on Node's single
// thread (blocking every other request on the server for the duration).
// Fixed with a Map keyed by normTitle, built ONCE per distinct titlesIndex
// array (cached in a WeakMap so it's transparent to every caller -- nothing
// about the public matchLineToTitles(line, titlesIndex) signature changed,
// same inputs/outputs, same candidates/order/counts, just O(1) lookups
// instead of an O(n) scan per line). Verified against the real catalog after
// this change: identical matched/ambiguous/unmatched counts as before
// (31744/27/3010 on the same real BMI file used in prior live verification).
const _royaltyTitleIndexCache = new WeakMap()
function _royaltyTitleIndexFor(titlesIndex) {
  let idx = _royaltyTitleIndexCache.get(titlesIndex)
  if (!idx) {
    idx = new Map()
    for (const t of titlesIndex) {
      if (!idx.has(t.normTitle)) idx.set(t.normTitle, [])
      idx.get(t.normTitle).push(t)
    }
    _royaltyTitleIndexCache.set(titlesIndex, idx)
  }
  return idx
}

function matchLineToTitles(line, titlesIndex) {
  const byNorm = _royaltyTitleIndexFor(titlesIndex)
  const norm = line.titleNormalized
  if (norm) {
    const exact = byNorm.get(norm) || []
    if (exact.length === 1) return { status: 'matched', candidates: exact, confidence: 'exact' }
    if (exact.length > 1) return { status: 'ambiguous', candidates: exact, confidence: 'exact-multiple' }

    // BMI (and apparently other PROs) routinely drop a leading "The" that
    // the HAUS catalog keeps on the title (e.g. "Duke Of Dumbass" vs "The
    // Duke Of Dumbass") -- confirmed against a real statement: 928 of 4,063
    // previously-unmatched lines in one BMI file resolve uniquely this way,
    // zero of them ambiguous (see
    // handoff-2026-10-28-titles-usage-count-and-royalty-tracker-rebase.md).
    // Deliberately NOT added to the shared normTitle() -- see that
    // function's own comment on this -- cue sheets show zero evidence of
    // this pattern, so this stays scoped to royalty matching, where the
    // evidence actually is. Still exact-match only, never fuzzy -- a wrong
    // guess here means wrong money, same posture as every other match tier
    // in this file.
    const withThe = normTitle('THE ' + (line.titleRaw || ''))
    if (withThe && withThe !== norm) {
      const withTheMatches = byNorm.get(withThe) || []
      if (withTheMatches.length === 1) return { status: 'matched', candidates: withTheMatches, confidence: 'exact-with-article' }
      if (withTheMatches.length > 1) return { status: 'ambiguous', candidates: withTheMatches, confidence: 'exact-with-article-multiple' }
    }
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

  // Path 2: American Pickers "MUSIC FINAL" filename stem, reconstructing the
  // real SKU directly rather than fuzzy-matching a stripped title. Kyle
  // confirmed the SKU grammar directly: AP + season + 3-digit episode, no
  // separator (e.g. "AP10314" = season 10, episode 314). Verified against
  // all 23 real plain-format filenames in Kyle's Downloads: season/episode
  // decode cleanly for every one (season range 7-13, all real), and 21 of
  // 23 reconstructed SKUs find an exact title match in episode_reference
  // (the other 2 are just episodes not yet in Kyle's reference list, not a
  // parsing miss -- confirmed by eye). Deliberately does NOT match the
  // "SFP" short-form-promo filename variant (e.g. real file "AP12 SFP
  // 403_32_Smokin Find_FINAL MUSIC.xlsx") -- that has a different, not-yet-
  // understood numbering (the "32" doesn't correspond to anything in
  // episode_reference) and it's a product question whether a promo clip
  // should even link to the same episode row, not something to guess here.
  const apMusicFinal = /^AP(\d{1,2})\s+(\d{3})\s+.+?\s+MUSIC\s*FINAL$/i.exec(trimmed);
  if (apMusicFinal) {
    const [, season, ep] = apMusicFinal;
    const reconstructedCode = `AP${season}${ep}`;
    const candidates = referenceRows.filter(r => r.showCode === reconstructedCode);
    if (candidates.length) return { strategy: 'ap-filename-sku', candidates, reconstructedCode };
  }

  // Path 3: any other stored-filename shape -- fall back to stripping the
  // MUSIC FINAL marker and leading code tokens, matching what's left as a
  // normalized title. Weaker than path 2 (no code to cross-check against),
  // same exact-match-only posture as matchLineToTitles.
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
  readRawRowsPreview,
  parseWithManualMapping,
};
