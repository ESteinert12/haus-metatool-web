require('dotenv').config();
const { Pool } = require('pg');
// statement_timeout/query_timeout/connectionTimeoutMillis carried over from the fix applied to
// import-sesac-catalog.js on 2026-09-23 (see engineering_notes.md) -- without these, a query that
// never gets a reply holds its pooled connection forever with no error.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  max: 5,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 0,
  statement_timeout: 20000,
  query_timeout: 25000,
});
pool.on('error', (err) => {
  console.error('[pool] error (handled):', err.message);
});

async function queryWithRetry(sql, params, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await pool.query(sql, params);
    } catch (e) {
      lastErr = e;
      console.log(`\n  (retrying after error: ${e.message}, attempt ${i + 1}/${attempts})`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

function normTitle(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}
function normName(s) {
  const cleaned = (s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.split(' ').filter(Boolean).sort().join(' ');
}

const PRO_NAME = 'SESAC';
// SESAC's role values, as written by import-sesac-catalog.js from the 'Publisher/Writer' column,
// are 'W' (writer) and 'P' (publisher) -- no sub-type breakdown like BMI's P:O/P:S. Only 'W'
// identifies a person for writer-overlap disambiguation here, same as ASCAP/BMI.
const PERSON_ROLES = new Set(['W']);

async function run() {
  console.log('Loading our titles + writers...');
  const { rows: titleRows } = await pool.query(`
    SELECT t.sku_root, t.title, t.team_id
    FROM titles t
  `);
  const { rows: writerRows } = await pool.query(`SELECT team_id, writer_name FROM team_writers`);
  const writersByTeam = new Map();
  for (const w of writerRows) {
    if (!writersByTeam.has(w.team_id)) writersByTeam.set(w.team_id, []);
    writersByTeam.get(w.team_id).push(normName(w.writer_name));
  }

  const { rows: regRows } = await pool.query(`
    SELECT ms.sku_root, pr.pro_name, pr.status
    FROM pro_registrations pr
    JOIN mix_stems ms ON ms.mix_stem_id = pr.mix_stem_id
    WHERE pr.pro_name = $1
  `, [PRO_NAME]);
  const appStatusBySku = new Map();
  for (const r of regRows) {
    if (!appStatusBySku.has(r.sku_root)) appStatusBySku.set(r.sku_root, new Set());
    appStatusBySku.get(r.sku_root).add(r.status);
  }

  console.log('Loading SESAC catalog...');
  const { rows: workRows } = await pool.query(`
    SELECT work_id, work_title, iswc, registration_status, registration_date
    FROM pro_catalog_works WHERE pro_name = $1
  `, [PRO_NAME]);
  const { rows: partyRows } = await pool.query(`
    SELECT work_id, party_name, role FROM pro_catalog_parties WHERE pro_name = $1
  `, [PRO_NAME]);
  const writersByWork = new Map();
  for (const p of partyRows) {
    if (!PERSON_ROLES.has((p.role || '').trim())) continue;
    if (!writersByWork.has(p.work_id)) writersByWork.set(p.work_id, new Set());
    writersByWork.get(p.work_id).add(normName(p.party_name));
  }

  const byTitle = new Map();
  for (const w of workRows) {
    const key = normTitle(w.work_title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(w);
  }

  console.log('Matching', titleRows.length, 'of our titles against', workRows.length, 'SESAC works...');
  const results = [];
  for (const t of titleRows) {
    const key = normTitle(t.title);
    const candidates = byTitle.get(key) || [];
    const ourWriters = new Set(writersByTeam.get(t.team_id) || []);
    const appStatuses = [...(appStatusBySku.get(t.sku_root) || [])].join('/') || null;

    let matchStatus, matchedWork = null, confidence = null;
    if (candidates.length === 0) {
      matchStatus = 'not_found';
    } else if (candidates.length === 1) {
      matchStatus = 'matched';
      matchedWork = candidates[0];
      confidence = 'title_only';
    } else {
      let scored = candidates.map(c => {
        const ws = writersByWork.get(c.work_id) || new Set();
        let overlap = 0;
        for (const w of ourWriters) if (ws.has(w)) overlap++;
        return { c, overlap };
      });
      scored.sort((a, b) => b.overlap - a.overlap);
      const top = scored[0];
      const tiedAtTop = scored.filter(s => s.overlap === top.overlap);
      if (top.overlap > 0 && tiedAtTop.length === 1) {
        matchStatus = 'matched';
        matchedWork = top.c;
        confidence = 'title_plus_writer';
      } else {
        matchStatus = 'ambiguous';
        confidence = `${candidates.length}_candidates_no_clear_writer_match`;
      }
    }

    results.push({
      sku_root: t.sku_root,
      title: t.title,
      app_status: appStatuses,
      match_status: matchStatus,
      matched_work_id: matchedWork ? matchedWork.work_id : null,
      matched_iswc: matchedWork ? matchedWork.iswc : null,
      matched_registration_status: matchedWork ? matchedWork.registration_status : null,
      matched_registration_date: matchedWork ? matchedWork.registration_date : null,
      confidence,
      candidate_count: candidates.length,
    });
  }

  const tally = {};
  for (const r of results) tally[r.match_status] = (tally[r.match_status] || 0) + 1;
  console.log('Match summary:', tally);

  console.log('Writing results table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pro_catalog_matches (
      id SERIAL PRIMARY KEY,
      pro_name TEXT NOT NULL,
      sku_root TEXT NOT NULL,
      title TEXT,
      app_status TEXT,
      match_status TEXT,
      matched_work_id TEXT,
      matched_iswc TEXT,
      matched_registration_status TEXT,
      matched_registration_date DATE,
      confidence TEXT,
      candidate_count INTEGER,
      checked_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query('DELETE FROM pro_catalog_matches WHERE pro_name = $1', [PRO_NAME]);

  const BATCH = 300;
  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    batch.forEach((r, bi) => {
      const base = bi * 10;
      vals.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9}::date,$${base+10})`);
      params.push(PRO_NAME, r.sku_root, r.title, r.app_status, r.match_status, r.matched_work_id, r.matched_iswc, r.matched_registration_status, r.matched_registration_date, r.confidence);
    });
    await queryWithRetry(`
      INSERT INTO pro_catalog_matches (pro_name, sku_root, title, app_status, match_status, matched_work_id, matched_iswc, matched_registration_status, matched_registration_date, confidence)
      VALUES ${vals.join(',')}
    `, params);
    process.stdout.write('.');
  }
  console.log('\nDone. Query pro_catalog_matches WHERE pro_name = \'SESAC\' any time for the current list.');
  await pool.end();
}

run().catch(e => { console.error('MATCH ERROR:', e.message); process.exit(1); });
