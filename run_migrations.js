#!/usr/bin/env node
/**
 * HAUS DB Migration Runner
 * Run from Terminal: node run_migrations.js
 * Runs all numbered migration_*.sql files in order against haus_music.
 */

const { Client } = require('/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace/node_modules/pg')
const fs   = require('fs')
const path = require('path')

const CONN = 'postgresql://postgres:postgres123@localhost:5432/haus_music'
const DIR  = __dirname

async function run() {
  const client = new Client({ connectionString: CONN })
  await client.connect()
  console.log('Connected to', CONN)

  // Gather numbered migration files in order
  const files = fs.readdirSync(DIR)
    .filter(f => f.match(/^migration_\d+.*\.sql$/))
    .sort()

  console.log(`Found ${files.length} migration files:\n  ` + files.join('\n  '))

  for (const file of files) {
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8')
    console.log(`\n── ${file} ──`)

    // Split on statement boundaries (semicolon + newline)
    const stmts = sql
      .split(/;\s*\n/)
      .map(s => s.replace(/^(\s*(--[^\n]*)?\n)+/, '').trim())
      .filter(s => s.length > 0)

    for (const stmt of stmts) {
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 80)
      try {
        await client.query(stmt)
        console.log(`  OK  ${preview}`)
      } catch (e) {
        // Ignore "already exists" errors — migrations are idempotent
        if (e.message.includes('already exists') || e.message.includes('duplicate')) {
          console.log(`  --  ${preview} (already exists, skipped)`)
        } else {
          console.error(`  ERR ${preview}`)
          console.error(`      ${e.message}`)
        }
      }
    }
  }

  await client.end()
  console.log('\nDone.')
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
