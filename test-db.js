const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name', (err, res) => {
  if (err) {
    console.error('ERROR:', err.message)
  } else {
    console.log('TABLES:')
    res.rows.forEach(r => console.log('  -', r.table_name))
  }
  pool.end()
})
