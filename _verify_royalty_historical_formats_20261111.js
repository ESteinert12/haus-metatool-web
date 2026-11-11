// Dry-run, read-only verification: parses every real CSV in Erik's ROYALTY
// STATEMENTS archive with the patched royalty-import.js and reports per-
// format/per-file line counts, statement totals, and any NaN/zero-line/
// crashed file -- no DB writes, nothing committed. Written 2026-11-11 to
// verify the historical-format fix against real data before telling Erik
// it works.
const fs = require('fs');
const path = require('path');
const { sniffFormat, parseRoyaltyStatementFile } = require('./royalty-import.js');

const ROOT = process.argv[2];
const DIRS = ['1. ASCAP', '2. BMI', '3. SESAC', '4. ASCAP_International', '5. SOCAN'];

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

const byFormat = {};
const problems = [];
let totalFiles = 0, totalLines = 0;

for (const d of DIRS) {
  const files = [];
  walk(path.join(ROOT, d), files);
  for (const f of files) {
    const base = path.basename(f);
    if (base.startsWith('.') || path.extname(f).toLowerCase() !== '.csv') continue;
    totalFiles++;
    let result;
    try {
      result = parseRoyaltyStatementFile(f);
    } catch (e) {
      problems.push(`CRASH ${f} :: ${e.message}`);
      continue;
    }
    const fmt = result.format;
    byFormat[fmt] = byFormat[fmt] || { files: 0, lines: 0, total: 0 };
    byFormat[fmt].files++;
    if (fmt === 'UNKNOWN') continue;
    byFormat[fmt].lines += result.lines.length;
    byFormat[fmt].total += result.meta.statementTotal || 0;
    totalLines += result.lines.length;
    if (!result.lines.length) {
      problems.push(`ZERO LINES (recognized as ${fmt}) ${f}`);
    }
    const nanLines = result.lines.filter(l => Number.isNaN(l.amount)).length;
    if (nanLines) problems.push(`${nanLines} NaN amounts in ${f} (${fmt})`);
    if (!result.meta.period) problems.push(`NULL period (recognized as ${fmt}) ${f}`);
  }
}

console.log('=== Per-format summary ===');
for (const [fmt, s] of Object.entries(byFormat).sort((a,b) => b[1].files - a[1].files)) {
  console.log(`  ${fmt}: ${s.files} files, ${s.lines} lines, $${s.total.toFixed(2)} total`);
}
console.log(`\nTOTAL: ${totalFiles} csv files scanned, ${totalLines} lines parsed`);
console.log(`\n=== Problems (${problems.length}) ===`);
problems.forEach(p => console.log('  ' + p));
