const { Pool } = require('pg')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_hiXWAOZ3C0gL@ep-floral-grass-au3l9sen.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require',
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
