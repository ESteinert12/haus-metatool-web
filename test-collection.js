const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
