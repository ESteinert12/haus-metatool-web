const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
