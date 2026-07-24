const { Pool } = require('pg')
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require' })
async function run() {
  // Check teams table for JUP stats and duplicates
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(DISTINCT composer_full_id) AS unique_ids,
      SUM(CASE WHEN is_jup THEN 1 ELSE 0 END) AS jup_rows,
      SUM(CASE WHEN NOT is_jup THEN 1 ELSE 0 END) AS reg_rows
    FROM teams
  `)
  console.log('teams table:', stats.rows[0])

  // Sample JUP teams
  const jup = await pool.query(`SELECT composer_full_id, is_jup FROM teams WHERE is_jup = true LIMIT 10`)
  console.log('\nSample JUP teams:', jup.rows.map(r => r.composer_full_id))

  // Check if any composer_full_id has mixed is_jup values across duplicate rows
  const mixed = await pool.query(`
    SELECT composer_full_id, COUNT(*) AS cnt,
           SUM(CASE WHEN is_jup THEN 1 ELSE 0 END) AS jup_count
    FROM teams
    GROUP BY composer_full_id
    HAVING COUNT(*) > 1 AND SUM(CASE WHEN is_jup THEN 1 ELSE 0 END) NOT IN (0, COUNT(*))
    LIMIT 5
  `)
  console.log('\nComposers with MIXED is_jup across duplicate rows:', mixed.rows.length)
  mixed.rows.forEach(r => console.log(`  ${r.composer_full_id}: ${r.jup_count}/${r.cnt} rows are JUP`))

  await pool.end()
}
run().catch(async e => { console.error(e.message); pool.end() })
