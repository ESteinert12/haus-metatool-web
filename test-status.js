const { Pool } = require('pg')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_hiXWAOZ3C0gL@ep-floral-grass-au3l9sen.c-10.us-east-1.aws.neon.tech/neondb?sslmode=prefer',
  ssl: { rejectUnauthorized: false }
})

pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN status = \'active\' THEN 1 END) as active FROM titles', (err, res) => {
  if (err) {
    console.error('ERROR:', err.message)
  } else {
    console.log('Total titles:', res.rows[0].total)
    console.log('Active titles:', res.rows[0].active)
  }
  pool.end()
})
