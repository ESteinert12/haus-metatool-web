#!/usr/bin/env node
// Add lot_type, client, web_visible, excl_until, brief columns to lots table
// Usage:
//   node migrate-lots.js          — dry run (checks current columns)
//   node migrate-lots.js --apply  — runs the migration

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const APPLY = process.argv.includes('--apply')

async function run() {
  console.log(`\n── Lots Table Migration ───────────────────────────────────`)
  console.log(`Mode: ${APPLY ? '⚠️  APPLY' : '🔍 DRY RUN'}`)

  // Check current columns
  const cols = await pool.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'lots'
    ORDER BY ordinal_position
  `)
  console.log('\nCurrent columns:')
  cols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(20)} ${r.data_type}${r.column_default ? ' DEFAULT ' + r.column_default : ''}`))

  const existing = cols.rows.map(r => r.column_name)
  const toAdd = [
    { name: 'lot_type',    sql: `ADD COLUMN lot_type TEXT NOT NULL DEFAULT 'client'` },
    { name: 'client',      sql: `ADD COLUMN client TEXT` },
    { name: 'web_visible', sql: `ADD COLUMN web_visible BOOLEAN NOT NULL DEFAULT false` },
    { name: 'excl_until',  sql: `ADD COLUMN excl_until DATE` },
    { name: 'brief',       sql: `ADD COLUMN brief TEXT` },
  ].filter(c => !existing.includes(c.name))

  if (!toAdd.length) {
    console.log('\n✅ All columns already exist — nothing to do.')
    await pool.end(); return
  }

  console.log('\nColumns to add:')
  toAdd.forEach(c => console.log(`  ALTER TABLE lots ${c.sql}`))

  if (!APPLY) {
    console.log('\n── DRY RUN — run with --apply to execute ──')
    await pool.end(); return
  }

  for (const col of toAdd) {
    await pool.query(`ALTER TABLE lots ${col.sql}`)
    console.log(`  ✅ Added: ${col.name}`)
  }

  // Set gen_pop lot type + web_visible=true for GEN_POP lot if it exists
  await pool.query(`
    UPDATE lots SET lot_type='gen_pop', web_visible=true
    WHERE lot_name='GEN_POP' OR lot_name ILIKE 'gen%pop%'
  `)

  // Mark existing staging-named lots
  await pool.query(`UPDATE lots SET lot_type='staging' WHERE status='staging'`)

  console.log('\n✅ Migration complete.')
  console.log('\nVerify:')
  const verify = await pool.query(`SELECT lot_id, lot_name, lot_type, client, web_visible, status FROM lots ORDER BY lot_name`)
  console.table(verify.rows)

  await pool.end()
}

run().catch(async e => {
  console.error('Error:', e.message)
  await pool.end()
  process.exit(1)
})
