// seed-cue-sheet-test-db.js
//
// Seeds a TEST Postgres database with synthetic data shaped like the real
// ATMOSPHERE schema, so the cue-sheet-verification branch (episodes table,
// import routes, matching logic) can be tested end-to-end WITHOUT touching
// any real catalog/writer/publisher data.
//
// This does NOT create a database for you -- point DATABASE_URL at an
// empty test database first (a fresh local Postgres, or a disposable Neon
// branch). Refuses to run if `titles` already has rows, so it can't
// accidentally dump fake songs into a real/populated database.
//
// Usage:
//   DATABASE_URL=postgres://... node seed-cue-sheet-test-db.js
//
// What it creates:
//   - teams, titles, team_writers (minimal versions of the real schema,
//     reconstructed from how api.js/index.html query them -- the real
//     tables predate this repo's tracked migrations, so there's no
//     CREATE TABLE to copy verbatim)
//   - deals, deal_publishers, seeded with the REAL HAUS publisher names
//     (HAUS Collection Musik/ASCAP, SDNYC Music/BMI, SDBK Music/SESAC under
//     "HAUS Standard"; Code Blue Cues/Undercover Cues/Beat Street Cues under
//     "HAUS + Jupiter", per index.html's seedDeal())
//   - a handful of titles/team_writers rows matching real cue sheet
//     filenames seen during parser testing, PLUS one deliberately-mismatched
//     title (to exercise the splits-mismatch UI) and one duplicate-titled
//     pair (to exercise the "ambiguous match" path)
//
// It does NOT create the episodes/cue_sheets/cue_sheet_cues/
// cue_sheet_cue_parties tables -- those come from api.js's own
// runServerMigrations() when the server starts up against this DB, which is
// the actual thing this seed script exists to let you test.

const { Pool } = require('pg')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL to a TEST database before running this.')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    const existing = await pool.query(`SELECT COUNT(*) FROM titles`).catch(() => null)
    if (existing && Number(existing.rows[0].count) > 0) {
      console.error(
        `Refusing to seed: "titles" already has ${existing.rows[0].count} row(s). ` +
        `This looks like a real/populated database, not an empty test one. ` +
        `Point DATABASE_URL at an empty test database and re-run.`
      )
      process.exit(1)
    }

    console.log('Creating minimal schema (teams, titles, team_writers, deals, deal_publishers)...')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        team_id    TEXT PRIMARY KEY,
        name       TEXT,
        deal_id    INTEGER,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS titles (
        sku_root   VARCHAR PRIMARY KEY,
        title      TEXT NOT NULL,
        team_id    TEXT REFERENCES teams(team_id),
        mood       TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_writers (
        id         SERIAL PRIMARY KEY,
        team_id    TEXT NOT NULL REFERENCES teams(team_id),
        writer_name TEXT NOT NULL,
        pro        TEXT,
        split_pct  NUMERIC(6,2),
        ipi        TEXT
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deals (
        deal_id    SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        notes      TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deal_publishers (
        id             SERIAL PRIMARY KEY,
        deal_id        INTEGER NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
        publisher_name TEXT NOT NULL,
        pro            TEXT,
        ipi            TEXT,
        split_pct      NUMERIC(6,2)
      )
    `)

    console.log('Seeding deals + deal_publishers (real HAUS publisher names)...')
    const standard = await pool.query(`INSERT INTO deals (name) VALUES ('HAUS Standard') RETURNING deal_id`)
    const jupiter = await pool.query(`INSERT INTO deals (name) VALUES ('HAUS + Jupiter') RETURNING deal_id`)
    const standardId = standard.rows[0].deal_id
    const jupiterId = jupiter.rows[0].deal_id

    await pool.query(`
      INSERT INTO deal_publishers (deal_id, publisher_name, pro, split_pct) VALUES
        ($1, 'HAUS Collection Musik', 'ASCAP', 100),
        ($1, 'SDNYC Music', 'BMI', 100),
        ($1, 'SDBK Music', 'SESAC', 100)
    `, [standardId])
    await pool.query(`
      INSERT INTO deal_publishers (deal_id, publisher_name, pro, split_pct) VALUES
        ($1, 'Code Blue Cues', 'ASCAP', 50),
        ($1, 'Undercover Cues', 'BMI', 50),
        ($1, 'Beat Street Cues', 'SESAC', 50)
    `, [jupiterId])

    console.log('Seeding teams/titles/team_writers...')
    await pool.query(`INSERT INTO teams (team_id, name, deal_id) VALUES
      ('TM001', 'Standard writer team', $1),
      ('TM002', 'Jupiter writer team', $2)
    `, [standardId, jupiterId])

    // Matches real cue sheet file content seen during parser testing
    // (Cuesheet_AP10292.xlsx) -- exercises a clean single-writer match.
    await pool.query(`INSERT INTO titles (sku_root, title, team_id) VALUES ('TEST0001', 'Deep Dive', 'TM001')`)
    await pool.query(`INSERT INTO team_writers (team_id, writer_name, pro, split_pct) VALUES
      ('TM001', 'Peter Cornell', 'ASCAP', 50)`)

    // Matches HAUS CUE SHEET_AP11362.xlsx's multi-writer cue -- exercises a
    // clean multi-party exact match.
    await pool.query(`INSERT INTO titles (sku_root, title, team_id) VALUES ('TEST0002', 'My Pride And Joy', 'TM002')`)
    await pool.query(`INSERT INTO team_writers (team_id, writer_name, pro, split_pct) VALUES
      ('TM002', 'Darren Smith', 'SESAC', 25),
      ('TM002', 'Evan Haymond', 'ASCAP', 25)`)

    // Deliberately WRONG writer on file vs. what a cue sheet would report for
    // the same title -- exercises the splits-mismatch warning in the UI.
    await pool.query(`INSERT INTO titles (sku_root, title, team_id) VALUES ('TEST0003', 'Bourbon Cowboy', 'TM001')`)
    await pool.query(`INSERT INTO team_writers (team_id, writer_name, pro, split_pct) VALUES
      ('TM001', 'Someone Else Entirely', 'ASCAP', 100)`)
    // (real cue sheet for this title reports Tim-Ryan O'Kane/Jonathan Vieira/
    // Stephen Hoevertsz -- none of which match "Someone Else Entirely", so
    // importing Cuesheet_AP11344W.xlsx against this seed should show a
    // reported-vs-on-file mismatch.)

    // Two titles with the SAME normalized name -- exercises the "ambiguous"
    // match path (matchCueToTitles returns status: 'ambiguous' when more
    // than one exact match exists).
    await pool.query(`INSERT INTO titles (sku_root, title, team_id) VALUES ('TEST0004', 'Armor', 'TM001')`)
    await pool.query(`INSERT INTO titles (sku_root, title, team_id) VALUES ('TEST0005', 'Armor', 'TM002')`)

    console.log('\nDone. Seeded:')
    console.log('  2 deals, 6 deal_publishers (HAUS Standard + HAUS + Jupiter, real publisher names)')
    console.log('  2 teams, 5 titles, 5 team_writers rows')
    console.log('\nNext: start the server against this DATABASE_URL (runServerMigrations will')
    console.log('create episodes/cue_sheets/cue_sheet_cues/cue_sheet_cue_parties), then try')
    console.log('importing a few real cue sheet files through the Cue Sheets tab or')
    console.log('POST /api/cue-sheets/import-bulk.')
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
