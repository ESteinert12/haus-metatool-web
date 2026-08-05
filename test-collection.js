const { Pool } = require('pg')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_hiXWAOZ3C0gL@ep-floral-grass-au3l9sen.c-10.us-east-1.aws.neon.tech/neondb?sslmode=prefer',
  ssl: { rejectUnauthorized: false }
})

const query = `SELECT t.sku_root, t.title, c.full_name
     FROM titles t
     LEFT JOIN composers c ON c.composer_id = regexp_replace(t.composer_id, '[a-z]+$', '')
     WHERE COALESCE(t.status, 'active') = 'active'
     LIMIT 5`

pool.query(query, (err, res) => {
  if (err) {
    console.error('ERROR:', err.message)
  } else {
    console.log('Rows returned:', res.rows.length)
    console.log('Samples:', res.rows)
  }
  pool.end()
})
