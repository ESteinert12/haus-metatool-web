const { Pool } = require('pg')
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require' })
async function run() {
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='titles' ORDER BY ordinal_position`)
  console.log('titles columns:\n ', cols.rows.map(r => r.column_name).join('\n  '))

  // Show a few rows sharing the same sku_root to see what differentiates them
  const dups = await pool.query(`
    SELECT sku_root, title, variant, lot_id, composer_id FROM titles
    WHERE sku_root IN (
      SELECT sku_root FROM titles GROUP BY sku_root HAVING COUNT(*) > 1 LIMIT 3
    )
    ORDER BY sku_root, variant LIMIT 15
  `)
  console.log('\nSample rows sharing sku_root:')
  dups.rows.forEach(r => console.log(`  ${r.sku_root} | variant=${r.variant} | lot=${r.lot_id} | composer=${r.composer_id} | ${r.title}`))

  // How many total vs unique sku_root
  const counts = await pool.query(`SELECT COUNT(*) as total, COUNT(DISTINCT sku_root) as unique_skus FROM titles`)
  console.log(`\nTotal rows: ${counts.rows[0].total}`)
  console.log(`Unique sku_roots: ${counts.rows[0].unique_skus}`)
  console.log(`Avg copies per sku: ${(counts.rows[0].total / counts.rows[0].unique_skus).toFixed(2)}`)
  await pool.end()
}
run().catch(async e => { console.error(e.message); pool.end() })
