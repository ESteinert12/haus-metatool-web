// migrate-to-neon.js — run with: node migrate-to-neon.js
const { Pool } = require('pg')

const LOCAL = 'postgresql://postgres:postgres123@localhost:5432/haus_music'
const NEON  = 'postgresql://neondb_owner:npg_jP9W8hvVAoGn@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'

const src = new Pool({ connectionString: LOCAL })
const dst = new Pool({ connectionString: NEON, ssl: { rejectUnauthorized: false } })

async function migrate() {
  process.stdout.write('Connecting to local DB... ')
  const S = await src.connect()
  console.log('OK')
  process.stdout.write('Connecting to Neon... ')
  const D = await dst.connect()
  console.log('OK\n')

  // ── 1. Get table list ──────────────────────────────────────
  const { rows: tables } = await S.query(`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  `)
  console.log(`Found ${tables.length} tables\n`)

  // ── 2. Create tables on Neon ───────────────────────────────
  for (const { tablename } of tables) {
    process.stdout.write(`Creating ${tablename}... `)

    // Get columns with type info
    const { rows: cols } = await S.query(`
      SELECT
        column_name,
        udt_name,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position
    `, [tablename])

    const colDefs = cols.map(c => {
      let type = c.udt_name
      // Map pg internal type names to SQL types
      if (type === 'int4') type = 'INTEGER'
      else if (type === 'int8') type = 'BIGINT'
      else if (type === 'int2') type = 'SMALLINT'
      else if (type === 'float8') type = 'DOUBLE PRECISION'
      else if (type === 'float4') type = 'REAL'
      else if (type === 'bool') type = 'BOOLEAN'
      else if (type === 'text') type = 'TEXT'
      else if (type === 'varchar') type = c.character_maximum_length ? `VARCHAR(${c.character_maximum_length})` : 'TEXT'
      else if (type === 'numeric') type = c.numeric_precision ? `NUMERIC(${c.numeric_precision},${c.numeric_scale||0})` : 'NUMERIC'
      else if (type === 'timestamptz') type = 'TIMESTAMPTZ'
      else if (type === 'timestamp') type = 'TIMESTAMP'
      else if (type === 'date') type = 'DATE'
      else if (type === 'uuid') type = 'UUID'
      else if (type === 'jsonb') type = 'JSONB'
      else if (type === 'json') type = 'JSON'
      else type = type.toUpperCase()

      // Detect SERIAL columns (default is nextval(...))
      const isSerial = c.column_default && c.column_default.startsWith('nextval(')
      let def = ''
      if (isSerial) {
        // Use SERIAL shorthand instead of sequence reference
        if (type === 'INTEGER') { type = 'SERIAL'; def = '' }
        else if (type === 'BIGINT') { type = 'BIGSERIAL'; def = '' }
        else if (type === 'SMALLINT') { type = 'SMALLSERIAL'; def = '' }
        else def = ''
      } else if (c.column_default !== null) {
        // Skip complex defaults that reference local objects; keep simple ones
        const skip = c.column_default.includes('::') && !c.column_default.match(/^'.*'::|^true$|^false$|^\d/)
        if (!skip) def = ` DEFAULT ${c.column_default}`
      }

      const nullable = c.is_nullable === 'YES' ? '' : ' NOT NULL'
      return `"${c.column_name}" ${type}${nullable}${def}`
    }).join(', ')

    try {
      await D.query(`CREATE TABLE IF NOT EXISTS "${tablename}" (${colDefs})`)
      console.log('✓')
    } catch (e) {
      console.log(`⚠ ${e.message.split('\n')[0]}`)
    }
  }

  // ── 3. Copy data ───────────────────────────────────────────
  console.log('\nCopying data...\n')
  for (const { tablename } of tables) {
    const { rows } = await S.query(`SELECT * FROM "${tablename}"`)
    if (!rows.length) { console.log(`  ${tablename}: empty`); continue }

    const cols = Object.keys(rows[0])
    const colList = cols.map(c => `"${c}"`).join(', ')
    let ok = 0, skip = 0

    // Insert in batches of 100
    const BATCH = 100
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      // Build multi-row insert
      const valueClauses = []
      const allVals = []
      let paramIdx = 1
      for (const row of batch) {
        const vals = cols.map(c => row[c])
        valueClauses.push(`(${vals.map(() => `$${paramIdx++}`).join(', ')})`)
        allVals.push(...vals)
      }
      try {
        const res = await D.query(
          `INSERT INTO "${tablename}" (${colList}) VALUES ${valueClauses.join(', ')} ON CONFLICT DO NOTHING`,
          allVals
        )
        ok += res.rowCount
      } catch (e) {
        // Fall back to row-by-row for this batch
        for (const row of batch) {
          const vals = cols.map(c => row[c])
          const placeholders = vals.map((_, i) => `$${i+1}`).join(', ')
          try {
            await D.query(`INSERT INTO "${tablename}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals)
            ok++
          } catch { skip++ }
        }
      }
      process.stdout.write(`\r  ${tablename}: ${Math.min(i+BATCH, rows.length)}/${rows.length} rows...`)
    }
    console.log(`\r  ${tablename}: ${ok} copied, ${skip} skipped          `)
  }

  // ── 4. Reset sequences ─────────────────────────────────────
  console.log('\nResetting sequences...')
  const { rows: seqs } = await S.query(`
    SELECT sequencename, last_value FROM pg_sequences WHERE schemaname='public'
  `)
  for (const { sequencename, last_value } of seqs) {
    try {
      await D.query(`SELECT setval('${sequencename}', $1, true)`, [last_value])
      console.log(`  ${sequencename} → ${last_value}`)
    } catch { /* sequence may not exist under same name */ }
  }

  S.release(); D.release()
  await src.end(); await dst.end()
  console.log('\n✅ Migration complete!')
}

migrate().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1) })
