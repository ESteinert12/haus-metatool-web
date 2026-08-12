#!/usr/bin/env node
const { Client } = require('/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace/node_modules/pg')
const client = new Client({ connectionString: 'postgresql://postgres:postgres123@localhost:5432/haus_music' })
client.connect().then(async () => {
  const sg = await client.query('SELECT * FROM secondary_genres LIMIT 5')
  console.log('secondary_genres columns:', Object.keys(sg.rows[0] || {}))
  console.log('sample:', sg.rows)

  const m2 = await client.query('SELECT * FROM mood_2 LIMIT 5')
  console.log('\nmood_2 columns:', Object.keys(m2.rows[0] || {}))
  console.log('sample:', m2.rows)

  const m2count = await client.query('SELECT COUNT(*) FROM mood_2')
  console.log('mood_2 count:', m2count.rows[0].count)

  client.end()
})
