#!/usr/bin/env node
const { Client } = require('/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace/node_modules/pg')
const client = new Client({ connectionString: 'postgresql://postgres:postgres123@localhost:5432/haus_music' })
client.connect().then(async () => {
  // Numeric max — cast the digit suffix to integer for true ordering
  const hi = await client.query(`
    SELECT sku_root,
           CAST(regexp_replace(sku_root, '^[A-Za-z]+[0-9]+[A-Za-z]?', '') AS INTEGER) AS seq
    FROM titles
    WHERE composer_id = 'S33a'
    ORDER BY seq DESC
    LIMIT 10
  `)
  console.log('Top 10 S33a by numeric seq:')
  hi.rows.forEach(r => console.log(' ', r.sku_root, '→ seq', r.seq))

  const lo = await client.query(`
    SELECT sku_root,
           CAST(regexp_replace(sku_root, '^[A-Za-z]+[0-9]+[A-Za-z]?', '') AS INTEGER) AS seq
    FROM titles
    WHERE composer_id = 'S33a'
    ORDER BY seq ASC
    LIMIT 5
  `)
  console.log('Bottom 5 S33a by numeric seq:')
  lo.rows.forEach(r => console.log(' ', r.sku_root, '→ seq', r.seq))

  // Distribution — are the 36xxx numbers real?
  const high = await client.query(`
    SELECT COUNT(*) as cnt FROM titles
    WHERE composer_id = 'S33a'
      AND CAST(regexp_replace(sku_root, '^[A-Za-z]+[0-9]+[A-Za-z]?', '') AS INTEGER) > 9999
  `)
  console.log('\nS33a entries with seq > 9999:', high.rows[0].cnt)

  const seq = await client.query("SELECT next_seq FROM teams WHERE composer_full_id = 'S33a'")
  console.log('Current next_seq in teams:', seq.rows[0]?.next_seq)

  client.end()
})
