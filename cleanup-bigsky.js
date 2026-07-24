// cleanup-bigsky.js — removes the duplicate Big Sky intake record
// Usage: node cleanup-bigsky.js
// Run from: haus-workspace/

const { Client } = require('pg')

const CONN = 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function run() {
  const c = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // Find all Big Sky records
  const rows = await c.query(`
    SELECT sku_root, title, composer_id, created_at
    FROM titles
    WHERE lower(title) LIKE '%big sky%'
    ORDER BY created_at ASC
  `)

  if (!rows.rows.length) {
    console.log('No Big Sky records found.')
    await c.end(); return
  }

  console.log('\nFound Big Sky records:')
  rows.rows.forEach((r, i) => {
    console.log(`  [${i}] sku_root=${r.sku_root}  title="${r.title}"  composer=${r.composer_id}  created=${r.created_at}`)
  })

  if (rows.rows.length < 2) {
    console.log('\nOnly one record — nothing to clean up.')
    await c.end(); return
  }

  // Keep the FIRST (oldest), delete the SECOND (duplicate)
  const keep   = rows.rows[0]
  const remove = rows.rows[rows.rows.length - 1]  // newest

  console.log(`\nKeeping:  ${keep.sku_root} — "${keep.title}"`)
  console.log(`Deleting: ${remove.sku_root} — "${remove.title}"`)

  // Delete all junction/child records first
  const sku = remove.sku_root
  await c.query(`DELETE FROM title_moods     WHERE sku_root = $1`, [sku])
  await c.query(`DELETE FROM title_rmo       WHERE sku_root = $1`, [sku])
  await c.query(`DELETE FROM title_cowriters WHERE sku_root = $1`, [sku])
  await c.query(`DELETE FROM mix_stems       WHERE sku_root = $1`, [sku])
  await c.query(`DELETE FROM titles          WHERE sku_root = $1`, [sku])
  console.log(`\n✓ Deleted DB record: ${sku}`)

  // Decrement sku_sequences so the next intake doesn't skip a number
  const composerId = remove.composer_id
  const seq = await c.query(`
    UPDATE sku_sequences
    SET next_seq = next_seq - 1
    WHERE lower(composer_full_id) = lower($1)
    RETURNING composer_full_id, next_seq
  `, [composerId])
  if (seq.rows.length) {
    console.log(`✓ Decremented sequence for ${seq.rows[0].composer_full_id} → next_seq now ${seq.rows[0].next_seq}`)
  }

  // Tell user which Dropbox folder to delete manually
  console.log(`\n⚠️  Also delete this folder from Dropbox manually:`)
  console.log(`   2. ATMOS_Shipping/.../${sku}_*`)
  console.log(`\nDone.`)

  await c.end()
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
