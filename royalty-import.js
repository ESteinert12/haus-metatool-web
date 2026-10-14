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
function sniffFormat(filePath) {
  const fullText = fs.readFileSync(filePath, 'utf8');
  const lines = fullText.split(/\r?\n/);
  const firstLine = lines[0] || '';

  // SESAC: starts with a few "Key: Value" metadata lines, including a
  // distinctive literal "SESAC QUARTERLY Royalty Statement" line, before the
  // real CSV header further down.
  if (/^SESAC QUARTERLY Royalty Statement/i.test(firstLine)) return 'SESAC';

  // BMI: flat CSV, header starts with PERIOD,W OR P,PARTICIPANT NAME,...
  const headerFields = splitCsvLine(firstLine).map(f => stripQuotes(f).trim().toUpperCase());
  if (headerFields[0] === 'PERIOD' && headerFields[1] === 'W OR P' && headerFields.includes('ROYALTY AMOUNT')) {
    return 'BMI';
  }

  // ASCAP domestic: header starts DistributionYear,Distribution Quarter,...
  if (headerFields[0] === 'DISTRIBUTIONYEAR' && headerFields[1] === 'DISTRIBUTION QUARTER') {
    return 'ASCAP_DOM';
  }

  // ASCAP foreign: header starts File Type,Statement Recipient Name,... and
  // carries a Licensor column (the reciprocal foreign PRO -- APRA/PRS/GEMA/etc)
  if (headerFields[0] === 'FILE TYPE' && headerFields.includes('LICENSOR') && headerFields.includes('$ AMOUNT')) {
    return 'ASCAP_FOR';
  }

  // SOCAN: direct Canadian PRO statement, header starts RIGHTS OWNER,
  // PERFORMER OR SERIES (FILM),PRODUCT OR EPISODE TITLE,WORK TITLE,...
  if (headerFields[0] === 'RIGHTS OWNER' && headerFields.includes('WORK TITLE') && headerFields.includes('PAYMENT DUE')) {
    return 'SOCAN';
  }

  return 'UNKNOWN';
}

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

module.exports = {
  sniffFormat,
  parseRoyaltyStatementFile,
  matchLineToTitles,
  normTitle,
  titleToCamelKey,
};
