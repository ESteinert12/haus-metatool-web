// audit-cue-sheets.js
//
// Data-quality survey of the full cue sheet corpus, BEFORE building any more
// parsers or integrating anything live. Groups files into "shape clusters"
// (by header/column signature) instead of listing 500+ files individually,
// and separately flags files that look structurally broken (not just a
// format we don't parse yet) so corrupted source data doesn't get silently
// treated as just another layout to support.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { sniffFormat } = require('./cue-sheet-import.js');

const ROOTS = process.argv.slice(2);
if (!ROOTS.length) { console.error('Usage: node audit-cue-sheets.js <folder1> [folder2 ...]'); process.exit(1); }

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.csv' || ext === '.xlsx' || ext === '.xlsm') out.push(full);
    }
  }
}

// Heuristics for "this file looks broken", not just "a shape we don't parse yet":
//  - a CSV with a very long first/only line relative to file size (records
//    run together with no row breaks)
//  - wildly inconsistent column counts row-to-row (quoting/structure issue)
//  - zero data rows at all
function csvHealthCheck(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.length);
  if (!lines.length) return { broken: true, reason: 'empty file' };
  const longestLine = Math.max(...lines.map(l => l.length));
  if (lines.length <= 2 && longestLine > 500 && raw.length > 1000) {
    return { broken: true, reason: `only ${lines.length} line(s) but ${raw.length} bytes -- records likely run together with no row breaks` };
  }
  // sample column-count consistency on up to 20 lines, using naive comma count
  // (good enough for a health check, not for real parsing)
  const commaCounts = lines.slice(0, 20).map(l => (l.match(/,/g) || []).length);
  const distinct = new Set(commaCounts);
  if (distinct.size > 4) {
    return { broken: true, reason: `comma-count varies wildly across first ${commaCounts.length} lines (${[...distinct].sort((a,b)=>a-b).join(',')}) -- inconsistent row shape` };
  }
  return { broken: false };
}

function csvSignature(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(l => l.length).slice(0, 3);
  if (!lines.length) return '(empty)';
  // first line, collapsed: good proxy for "what columns does this claim to have"
  const first = lines[0];
  const commaCount = (first.match(/,/g) || []).length;
  const looksLikeHeader = /[A-Za-z]/.test(first) && !/^\d/.test(first.split(',')[0] || '');
  return `CSV cols~${commaCount} ${looksLikeHeader ? 'header="' + first.slice(0, 80) + '"' : 'NO-HEADER first-row="' + first.slice(0, 80) + '"'}`;
}

function xlsxSignature(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (let r = 0; r < Math.min(rows.length, 6); r++) {
      const vals = rows[r].map(v => String(v || '').trim()).filter(Boolean);
      if (vals.length >= 2) return `XLSX header(row${r})="${vals.slice(0, 8).join('|')}"`;
    }
    return 'XLSX (no header-like row in first 6)';
  } catch (e) {
    return `XLSX UNREADABLE: ${e.message}`;
  }
}

const clusters = {};       // signature -> { count, examples: [] }
const brokenFiles = [];
const recognizedCount = { A: 0, B: 0, C: 0, D: 0 };
let total = 0;

for (const root of ROOTS) {
  const files = [];
  walk(root, files);
  for (const filePath of files) {
    total++;
    const fmt = sniffFormat(filePath, filePath);
    if (fmt !== 'UNKNOWN') { recognizedCount[fmt] = (recognizedCount[fmt] || 0) + 1; continue; }

    const ext = path.extname(filePath).toLowerCase();
    let sig, health = { broken: false };
    if (ext === '.csv') {
      sig = csvSignature(filePath);
      health = csvHealthCheck(filePath);
    } else {
      sig = xlsxSignature(filePath);
    }
    if (health.broken) brokenFiles.push({ filePath, reason: health.reason });

    if (!clusters[sig]) clusters[sig] = { count: 0, examples: [] };
    clusters[sig].count++;
    if (clusters[sig].examples.length < 3) clusters[sig].examples.push(filePath);
  }
}

console.log(`Total files scanned: ${total}`);
console.log(`Already recognized (formats A-D): ${JSON.stringify(recognizedCount)}`);
console.log(`Unrecognized: ${Object.values(clusters).reduce((s, c) => s + c.count, 0)}`);
console.log(`\n=== Unrecognized-file shape clusters (by header/column signature) ===`);
const sorted = Object.entries(clusters).sort((a, b) => b[1].count - a[1].count);
for (const [sig, info] of sorted) {
  console.log(`\n[${info.count} files] ${sig}`);
  for (const ex of info.examples) console.log(`    e.g. ${ex}`);
}

console.log(`\n=== Files flagged as structurally broken (${brokenFiles.length}) ===`);
for (const b of brokenFiles.slice(0, 40)) console.log(`  ${b.filePath}\n    -> ${b.reason}`);
if (brokenFiles.length > 40) console.log(`  ... and ${brokenFiles.length - 40} more`);
