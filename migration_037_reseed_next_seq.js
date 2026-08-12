#!/usr/bin/env node
/**
 * migration_037_reseed_next_seq.js
 *
 * Sets next_seq for every team to MAX(sequence used in titles) + 1.
 * Derived entirely from the titles table — no CSV needed.
 *
 * Safe to run multiple times.
 * Usage:
 *   node migration_037_reseed_next_seq.js --dry-run
 *   node migration_037_reseed_next_seq.js
 */

const { Client } = require('/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace/node_modules/pg')

const CONN    = 'postgresql://postgres:postgres123@localhost:5432/haus_music'
const DRY_RUN = process.argv.includes('--dry-run')

async function run() {
  const client = new Client({ connectionString: CONN })
  await client.connect()
  console.log(DRY_RUN ? '=== DRY RUN ===\n' : 'Connected.\n')

  // For each team, find the highest sequence number already used in titles.
  // sku_root format: {composerFullId}{digits}  e.g.  S33a1234 → seq 1234
  // regexp_replace strips the leading alpha/digit/alpha composerId prefix.
  const preview = await client.query(`
    SELECT
      t.composer_full_id,
      t.next_seq AS current_next_seq,
      COALESCE(
        (SELECT MAX(
           CAST(
             regexp_replace(ti.sku_root, '^[A-Za-z]+[0-9]+[A-Za-z]?', '', 'g')
             AS INTEGER
           )
         )
         FROM titles ti
         WHERE ti.composer_id = t.composer_full_id
           AND ti.sku_root ~ ('^' || t.composer_full_id || '[0-9]+$')
        ) + 1,
        t.next_seq
      ) AS new_next_seq
    FROM teams t
    ORDER BY t.composer_full_id
  `)

  let changed = 0
  for (const r of preview.rows) {
    if (r.new_next_seq !== r.current_next_seq) {
      console.log(`  ${r.composer_full_id}: ${r.current_next_seq} → ${r.new_next_seq}`)
      changed++
    }
  }

  console.log(`\n${changed} teams need updating (${preview.rows.length - changed} already correct)`)

  if (DRY_RUN) {
    console.log('\nDry run — no changes made. Run without --dry-run to apply.')
    await client.end()
    return
  }

  // Apply in one shot
  const result = await client.query(`
    UPDATE teams t
    SET next_seq = COALESCE(
      (SELECT MAX(
           CAST(
             regexp_replace(ti.sku_root, '^[A-Za-z]+[0-9]+[A-Za-z]?', '', 'g')
             AS INTEGER
           )
         )
       FROM titles ti
       WHERE ti.composer_id = t.composer_full_id
         AND ti.sku_root ~ ('^' || t.composer_full_id || '[0-9]+$')
      ) + 1,
      t.next_seq
    )
    WHERE (
      SELECT MAX(
           CAST(
             regexp_replace(ti.sku_root, '^[A-Za-z]+[0-9]+[A-Za-z]?', '', 'g')
             AS INTEGER
           )
         )
       FROM titles ti
       WHERE ti.composer_id = t.composer_full_id
         AND ti.sku_root ~ ('^' || t.composer_full_id || '[0-9]+$')
    ) IS NOT NULL
  `)

  await client.end()
  console.log(`\nDone. ${result.rowCount} teams updated.`)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
