// sku-rollback.js
// Reverses the 1,910 sku_root renames made by sku-full-reconcile.js --fix
// Uses full-reconcile.csv as the source of truth for what to undo.
//
//   node sku-rollback.js

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  const csv = fs.readFileSync(path.join(__dirname, 'full-reconcile.csv'), 'utf8')
  const lines = csv.split('\n').filter(Boolean)

  const toRevert = []
  for (const line of lines.slice(1)) {
    const [status, db_sku, correct_sku] = line.split(',')
    if (status === 'CAN_FIX' && db_sku && correct_sku) {
      toRevert.push({ from: correct_sku.trim(), to: db_sku.trim() })
    }
  }

  console.log(`\nReverting ${toRevert.length} sku_root renames...\n`)

  let done = 0
  for (const { from, to } of toRevert) {
    await pool.query(`UPDATE titles      SET sku_root=$1 WHERE sku_root=$2`, [to, from])
    await pool.query(`UPDATE mix_stems   SET sku_root=$1 WHERE sku_root=$2`, [to, from])
    await pool.query(`UPDATE title_moods SET sku_root=$1 WHERE sku_root=$2`, [to, from])
    await pool.query(`UPDATE title_rmo   SET sku_root=$1 WHERE sku_root=$2`, [to, from])
    done++
    if (done % 100 === 0) process.stdout.write(`  ${done} / ${toRevert.length}\r`)
  }

  console.log(`\n✅ Rolled back ${done} renames. DB restored to pre-reconcile state.\n`)
  await pool.end()
}

run().catch(async e => {
  console.error('Error:', e.message)
  await pool.end()
  process.exit(1)
})
