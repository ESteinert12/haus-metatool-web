#!/usr/bin/env node
// seed_rmo_moods.js
// Phase 1: Expands the RMO list using TMDb Discover (top movies + TV shows)
// Phase 2: Maps moods for all untagged RMOs using Claude (no TMDb needed for this step)
// Safe to re-run — skips entries that already exist or already have moods.
//
// SETUP:
//   npm install pg @anthropic-ai/sdk node-fetch   (run from ATMOSPHERE folder)
//   export TMDB_API_KEY=your_tmdb_key
//   export ANTHROPIC_API_KEY=your_anthropic_key
//   node seed_rmo_moods.js

const { Client } = require('pg');
const Anthropic   = require('@anthropic-ai/sdk');
const fetch       = (...args) => import('node-fetch').then(m => m.default(...args));

const DB_URL    = 'postgresql://postgres:postgres123@localhost:5432/haus_music';
const TMDB_KEY  = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

if (!TMDB_KEY)                      { console.error('Missing TMDB_API_KEY');      process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const anthropic = new Anthropic();

// ── TMDb Discover ─────────────────────────────────────────────────────────────
// Pulls the most-popular/highest-rated movies and TV shows from TMDb.
// Returns an array of title strings.

async function fetchTopTitles() {
  const titles = new Set();

  // Movies: top 20 pages = ~400 titles (sorted by popularity)
  for (let page = 1; page <= 20; page++) {
    const url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&sort_by=vote_count.desc&vote_count.gte=1000&page=${page}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.results) break;
    data.results.forEach(m => { if (m.title) titles.add(m.title); });
    await sleep(100);
  }
  console.log(`  TMDb movies fetched: ${titles.size}`);

  // TV: top 20 pages = ~400 shows
  const tvCount = titles.size;
  for (let page = 1; page <= 20; page++) {
    const url = `${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&sort_by=vote_count.desc&vote_count.gte=500&page=${page}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.results) break;
    data.results.forEach(s => { if (s.name) titles.add(s.name); });
    await sleep(100);
  }
  console.log(`  TMDb TV shows fetched: ${titles.size - tvCount}`);

  return [...titles];
}

// ── Claude mood mapper ────────────────────────────────────────────────────────
// No TMDb lookup needed here — Claude knows these titles from training data.

async function mapToMoods(rmoTitle, moodList) {
  const prompt = `You are tagging a professional production/library music catalog.

For the film, TV show, or album titled "${rmoTitle}", select ALL moods from the list below that accurately describe its overall emotional tone and atmosphere. Think like a music supervisor — what moods would the score or soundtrack of this title evoke?

Be specific. Prefer 3-8 accurate tags over many vague ones. If you don't recognize the title, return an empty array.

Return ONLY a valid JSON array of mood name strings, no explanation.

Available moods:
${moodList.join(', ')}`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = msg.content[0].text.trim();
  try {
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
    return parsed.filter(m => moodList.includes(m));
  } catch {
    console.warn(`  Could not parse mood response for "${rmoTitle}": ${text}`);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // ── Phase 1: Expand RMO list from TMDb Discover ──────────────────────────
  console.log('\n── Phase 1: Expanding RMO list from TMDb ──────────────────────');
  const tmdbTitles = await fetchTopTitles();

  // Load existing RMO names for dedup check
  const { rows: existingRows } = await db.query('SELECT name FROM rmo');
  const existing = new Set(existingRows.map(r => r.name.toLowerCase()));

  const newTitles = tmdbTitles.filter(t => !existing.has(t.toLowerCase()));
  console.log(`  ${tmdbTitles.length} TMDb titles — ${existingRows.length} already in DB — ${newTitles.length} new to add`);

  let added = 0;
  for (const title of newTitles) {
    await db.query('INSERT INTO rmo (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [title]);
    added++;
  }
  console.log(`  Added ${added} new RMO entries. Total now: ${existingRows.length + added}\n`);

  // ── Phase 2: Map moods for all untagged RMOs ─────────────────────────────
  console.log('── Phase 2: Mapping moods via Claude ──────────────────────────');

  const { rows: moodRows } = await db.query('SELECT mood_id, mood_name FROM moods ORDER BY mood_name');
  const moodList = moodRows.map(r => r.mood_name);
  const moodMap  = Object.fromEntries(moodRows.map(r => [r.mood_name, r.mood_id]));
  console.log(`  ${moodList.length} moods loaded`);

  const { rows: rmos } = await db.query(`
    SELECT r.rmo_id, r.name
    FROM rmo r
    WHERE NOT EXISTS (SELECT 1 FROM rmo_moods rm WHERE rm.rmo_id = r.rmo_id)
    ORDER BY r.name
  `);
  console.log(`  ${rmos.length} RMOs without mood data\n`);

  let success = 0, skipped = 0, failed = 0;

  for (let i = 0; i < rmos.length; i++) {
    const rmo = rmos[i];
    process.stdout.write(`[${i + 1}/${rmos.length}] ${rmo.name} ... `);

    try {
      const moods = await mapToMoods(rmo.name, moodList);

      if (moods.length === 0) {
        console.log('no moods matched');
        skipped++;
      } else {
        for (const moodName of moods) {
          await db.query(
            'INSERT INTO rmo_moods (rmo_id, mood_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [rmo.rmo_id, moodMap[moodName]]
          );
        }
        console.log(`${moods.length} moods: ${moods.join(', ')}`);
        success++;
      }

      // Haiku is fast but be respectful of rate limits
      await sleep(150);

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
    }
  }

  await db.end();
  console.log(`\n── Done ────────────────────────────────────────────────────────`);
  console.log(`Moods mapped: ${success} | No match: ${skipped} | Errors: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
