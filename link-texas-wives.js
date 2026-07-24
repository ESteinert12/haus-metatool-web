#!/usr/bin/env node
/**
 * link-texas-wives.js
 * Finds all lots and playlists matching "TEXAS WIVES" and links them
 * to the "TEXAS WIVES Season 1" project under Wheelhouse Entertainment.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node link-texas-wives.js [--dry-run]
 */

const { Client } = require('pg')
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  await db.connect()
  console.log('✅  Connected\n')

  // 1. Find the project
  const projRes = await db.query(
    `SELECT p.id, p.name, c.name AS client_name
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE lower(p.name) LIKE '%texas wives%'
     ORDER BY p.id DESC LIMIT 5`
  )
  if (!projRes.rows.length) {
    console.error('❌  No project found matching "TEXAS WIVES". Check the name and try again.')
    await db.end(); process.exit(1)
  }
  console.log('📁  Found project(s):')
  projRes.rows.forEach(r => console.log(`     [${r.id}] ${r.name} (client: ${r.client_name || '—'})`))
  const project = projRes.rows[0]
  console.log(`\n  → Will use: [${project.id}] ${project.name}\n`)

  // 2. Find matching lots (TEXAS WIVES or TEXWIV)
  const lotsRes = await db.query(
    `SELECT lot_id, lot_name, project_id FROM lots
     WHERE lot_name ILIKE '%TEXAS WIVES%' OR lot_name ILIKE '%TEXWIV%'
     ORDER BY lot_name`
  )
  console.log(`🗂   Lots matching TEXAS WIVES / TEXWIV: ${lotsRes.rows.length}`)
  lotsRes.rows.forEach(r => console.log(`     [${r.lot_id}] ${r.lot_name}  (current project_id: ${r.project_id ?? 'none'})`))

  // 3. Known playlists (confirmed by user)
  const knownPlIds = [
    '101c5fbf-82fe-4818-8784-55c2099b177d',
    'd0399563-6b45-4b48-a3fc-b927f5d2d08b',
    'ddc148e2-98cd-4fc1-b3b1-41dc6e8aa045',
    '6143c29f-b740-4341-8814-411e30726549'
  ]
  const plRes = await db.query(
    `SELECT id, name, project_id FROM playlists WHERE id = ANY($1) ORDER BY name`,
    [knownPlIds]
  )
  console.log(`\n🎵  Playlists to move: ${plRes.rows.length}`)
  plRes.rows.forEach(r => console.log(`     [${r.id}] ${r.name}  (current project_id: ${r.project_id ?? 'none'})`))

  if (DRY_RUN) {
    console.log(`\n🔍  DRY RUN — would move ${lotsRes.rows.length} lots + ${plRes.rows.length} playlists to project [${project.id}] ${project.name}`)
    await db.end(); return
  }

  // 4. Update lots
  if (lotsRes.rows.length) {
    const lotIds = lotsRes.rows.map(r => r.lot_id)
    await db.query(`UPDATE lots SET project_id=$1 WHERE lot_id = ANY($2)`, [project.id, lotIds])
    console.log(`\n✓  ${lotIds.length} lot(s) linked to project ${project.id}`)
  }

  // 5. Update playlists
  await db.query(`UPDATE playlists SET project_id=$1 WHERE id = ANY($2)`, [project.id, knownPlIds])
  console.log(`✓  ${plRes.rows.length} playlist(s) linked to project ${project.id}`)

  // 6. Set lot_client on all linked lots
  await db.query(
    `UPDATE lots SET lot_client='Wheelhouse Entertainment' WHERE project_id=$1 AND (lot_client IS NULL OR lot_client='')`,
    [project.id]
  )

  console.log('\n✅  Done. Refresh the app and open TEXAS WIVES Season 1 under Wheelhouse Entertainment.')
  await db.end()
}

main().catch(e => { console.error('❌ ', e.message); process.exit(1) })
