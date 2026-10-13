// demo-import.js
//
// Local-only sketch/demo of the episodes-aware cue sheet schema. Runs
// entirely against a local SQLite file (node:sqlite, built into Node 22+,
// no package install, no network) -- NOT the live ATMOSPHERE Postgres DB.
// Purpose: prove out the real file landscape against the new `episodes`
// table design before touching the live schema, and let Kyle/Erik actually
// see real counts from the real folders.
//
// What this demo does NOT do: match cues against the real `titles` catalog
// (that only exists in live Postgres, unreachable from this checkout -- see
// standing_rules.md). It stores and groups cues by episode and shows
// classification (is this cue HAUS's own) using the same logic as the real
// importer, with a hardcoded stand-in for deal_publishers since that table
// is also only in live Postgres.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { parseCueSheetFile } = require('./cue-sheet-import.js');

const ROOTS = process.argv.slice(2);
if (!ROOTS.length) {
  console.error('Usage: node demo-import.js <folder1> [folder2 ...]');
  process.exit(1);
}

// Stand-in for the real `deal_publishers` table (HAUS Standard + HAUS+Jupiter
// deals, per index.html's seedDeal calls -- read directly from the live
// schema seed data, not guessed). Sold-to-A&E imprints ("Just Call Me Angel
// Music", "Escape The Ordinary Music") are deliberately NOT here, per Kyle's
// 2026-10 call to leave sold-catalog verification out of scope for now.
const DEMO_HAUS_PUBLISHERS = new Set([
  'haus collection musik', 'sdnyc music', 'sdbk music',
  'code blue cues', 'undercover cues', 'beat street cues',
]);

const DB_PATH = path.join(process.env.HOME, 'demo_cue_sheets.sqlite');
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE episodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    program       TEXT,              -- NULL when not literally stated anywhere (see assignEpisode below)
    episode_title TEXT,
    episode_num   TEXT NOT NULL,     -- the only thing reliably present across formats
    air_date      TEXT,
    UNIQUE(program, episode_num)
  );
  CREATE TABLE cue_sheets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id       INTEGER NOT NULL REFERENCES episodes(id),
    source_filename  TEXT NOT NULL,
    source_path      TEXT NOT NULL,
    format           TEXT NOT NULL,
    imported_at      TEXT NOT NULL
  );
  CREATE TABLE cue_sheet_cues (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    cue_sheet_id        INTEGER NOT NULL REFERENCES cue_sheets(id),
    seq                 TEXT,
    title_raw           TEXT NOT NULL,
    title_normalized    TEXT,
    usage_type          TEXT,
    duration            TEXT,
    classify_reason     TEXT,
    classify_confidence TEXT
  );
  CREATE TABLE cue_sheet_cue_parties (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    cue_id    INTEGER NOT NULL REFERENCES cue_sheet_cues(id),
    name      TEXT,
    role      TEXT,
    pro       TEXT,
    split_pct REAL
  );
`);

const insEpisode = db.prepare(`INSERT INTO episodes (program, episode_title, episode_num, air_date) VALUES (?,?,?,?)`);
const findEpisode = db.prepare(`SELECT id FROM episodes WHERE (program IS ? OR program = ?) AND episode_num = ?`);
const insSheet = db.prepare(`INSERT INTO cue_sheets (episode_id, source_filename, source_path, format, imported_at) VALUES (?,?,?,?,?)`);
const insCue = db.prepare(`INSERT INTO cue_sheet_cues (cue_sheet_id, seq, title_raw, title_normalized, usage_type, duration, classify_reason, classify_confidence) VALUES (?,?,?,?,?,?,?,?)`);
const insParty = db.prepare(`INSERT INTO cue_sheet_cue_parties (cue_id, name, role, pro, split_pct) VALUES (?,?,?,?,?)`);

// Episode identity: use whatever the file itself states (meta.program /
// meta.episodeNum). When the format gives no program name (true for most of
// what's on disk -- these internal logs just use a code), fall back to the
// immediate parent folder name ONLY when that folder is clearly a show name
// (observed structure Kyle created, e.g. "SNAPPED", "FATAL ATTRACTION" --
// not a guess, it's the literal folder he filed it under). A bare episode
// code with no folder context and no stated program stays program=NULL
// rather than inventing a show name.
const GENERIC_FOLDER_NAMES = new Set(['haus cue sheets', 'cue sheets from ascap', '_cue_parser_poc', 'ap8clips imported', 'ap11 cue sheets', 'ap12 cue sheets', 'edls from kh formatted', 'best of cue sheets', 'best ofs']);

function assignEpisode(meta, filePath, rootPath) {
  let program = (meta.program || '').trim() || null;
  const episodeNum = (meta.episodeNum || '').trim() || path.basename(filePath, path.extname(filePath));
  if (!program) {
    const rel = path.relative(rootPath, filePath);
    const parts = rel.split(path.sep);
    if (parts.length > 1) {
      const folder = parts[0].trim();
      if (!GENERIC_FOLDER_NAMES.has(folder.toLowerCase())) program = folder;
    }
  }
  const existing = findEpisode.get(program, program, episodeNum);
  if (existing) return existing.id;
  const r = insEpisode.run(program, meta.episode || null, episodeNum, meta.airDate || null);
  return Number(r.lastInsertRowid);
}

const SKIP_EXT = new Set(['.ds_store', '.numbers']);
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

let filesSeen = 0, filesUnknown = 0, filesErrored = 0, filesImported = 0;
let totalCues = 0, totalHausCues = 0;
const episodeSourceCounts = {};
const unknownFiles = [];
const erroredFiles = [];

for (const root of ROOTS) {
  const files = [];
  walk(root, files);
  for (const filePath of files) {
    filesSeen++;
    const origName = path.basename(filePath);
    let parsed;
    try {
      parsed = parseCueSheetFile(filePath, origName, DEMO_HAUS_PUBLISHERS);
    } catch (e) {
      filesErrored++;
      erroredFiles.push(`${filePath} :: ${e.message}`);
      continue;
    }
    if (parsed.format === 'UNKNOWN') {
      filesUnknown++;
      unknownFiles.push(filePath);
      continue;
    }

    const episodeId = assignEpisode(parsed.meta, filePath, root);
    const sheetId = Number(insSheet.run(episodeId, origName, filePath, parsed.format, new Date().toISOString()).lastInsertRowid);
    episodeSourceCounts[episodeId] = (episodeSourceCounts[episodeId] || 0) + 1;

    const hausCues = parsed.cues.filter(c => c.isHaus);
    totalCues += parsed.cues.length;
    totalHausCues += hausCues.length;

    for (const cue of hausCues) {
      const cueId = Number(insCue.run(sheetId, cue.seq || null, cue.titleRaw, cue.titleNormalized, cue.usage || null, cue.duration || null, cue.classifyReason || null, cue.classifyConfidence || null).lastInsertRowid);
      for (const p of cue.parties) {
        insParty.run(cueId, p.name || null, p.role || null, p.pro || null, p.pct ? (parseFloat(p.pct) || null) : null);
      }
    }
    filesImported++;
  }
}

const multiSourceEpisodes = db.prepare(`
  SELECT e.id, e.program, e.episode_num, COUNT(cs.id) AS source_count
  FROM episodes e JOIN cue_sheets cs ON cs.episode_id = e.id
  GROUP BY e.id HAVING COUNT(cs.id) > 1 ORDER BY source_count DESC
`).all();

const episodeCount = db.prepare(`SELECT COUNT(*) AS n FROM episodes`).get().n;

console.log('=== Demo cue sheet import (local SQLite, not live Postgres) ===');
console.log(`DB file: ${DB_PATH}`);
console.log(`Files seen:        ${filesSeen}`);
console.log(`Imported:          ${filesImported}`);
console.log(`Unrecognized fmt:  ${filesUnknown}`);
console.log(`Errored:           ${filesErrored}`);
console.log(`Episodes created:  ${episodeCount}`);
console.log(`Total cue rows (all cues incl. non-HAUS): ${totalCues}`);
console.log(`HAUS cue rows stored: ${totalHausCues}`);
console.log(`Episodes with >1 cue sheet source: ${multiSourceEpisodes.length}`);
if (multiSourceEpisodes.length) {
  console.log('  ' + multiSourceEpisodes.slice(0, 15).map(e => `${e.program || '(no program)'} ${e.episode_num} (${e.source_count} sources)`).join('\n  '));
}
if (unknownFiles.length) {
  console.log(`\nUnrecognized files (format sniff came back UNKNOWN, not imported):`);
  console.log('  ' + unknownFiles.slice(0, 30).join('\n  '));
  if (unknownFiles.length > 30) console.log(`  ... and ${unknownFiles.length - 30} more`);
}
if (erroredFiles.length) {
  console.log(`\nErrored files:`);
  console.log('  ' + erroredFiles.slice(0, 30).join('\n  '));
}
db.close();
