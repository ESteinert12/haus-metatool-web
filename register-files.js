#!/usr/bin/env node
/**
 * Register audio files in mix_stems after manual recovery
 * Usage: node register-files.js <db_connection_string>
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// Extract stem name from filename (same logic as in app)
function detectStemName(filename) {
  const base = filename.replace(/\.[^.]+$/, '')
  const lastUs = base.lastIndexOf('_')
  const version = (lastUs >= 0 ? base.slice(lastUs + 1) : base).toUpperCase()

  if (/^NODNB$/i.test(version)) return 'NoDNB'
  if (/^DNB$/.test(version)) return 'DNB'
  if (/^ALT/.test(version)) return 'ALT'
  if (/^BUMPER/.test(version)) return 'BUMPER'
  if (/^STINGA$/i.test(version)) return 'STINGa'
  if (/^STING/.test(version)) return 'STING'
  if (/^NODRUMS?$/i.test(version)) return 'NoDrums'
  if (/^DRUMS$/i.test(version)) return 'DRUMS'
  if (/^DRUMS\s*ONLY$/i.test(version) || /^DRUMSONLY$/i.test(version)) return 'DRUMS'
  if (/^NOVOX$/i.test(version)) return 'NoVox'
  if (/^NOLEAD$/i.test(version)) return 'NoLead'
  if (/^PIANO$/i.test(version)) return 'PIANO'
  if (/^GUITARS?$/i.test(version)) return 'GUITARS'
  return 'FULL'
}

// Main registration function
async function registerFiles(connectionString) {
  const shippingBase = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260720_TEXAS WIVES_5_Heartland'

  const toRegister = [
    { sku: 'R67a2774', folder: 'R67a2774_Main Character' },
    { sku: 'R67a2784', folder: 'R67a2784_Only Girl' }
  ]

  const client = new Client({ connectionString })
  await client.connect()

  console.log('[register] Starting file registration...\n')

  for (const track of toRegister) {
    const trackPath = path.join(shippingBase, track.folder)

    if (!fs.existsSync(trackPath)) {
      console.warn(`[register] ✗ ${track.sku} folder not found: ${trackPath}`)
      continue
    }

    const files = fs.readdirSync(trackPath)
      .filter(f => /\.(wav|mp3|aif|aiff)$/i.test(f))

    if (files.length === 0) {
      console.warn(`[register] ✗ ${track.sku} no audio files found`)
      continue
    }

    console.log(`[register] ${track.sku} — registering ${files.length} files`)

    for (const file of files) {
      const stemName = detectStemName(file)
      try {
        await client.query(
          `INSERT INTO mix_stems (sku_root, stem_name, filename, b2_key)
           VALUES ($1, $2, $3, NULL)
           ON CONFLICT (sku_root, filename) DO UPDATE SET stem_name = EXCLUDED.stem_name`,
          [track.sku, stemName, file]
        )
        console.log(`  ✓ ${file} → ${stemName}`)
      } catch (e) {
        console.error(`  ✗ Failed to register ${file}:`, e.message)
      }
    }
  }

  await client.end()
  console.log('\n[register] ✓ File registration complete!')
}

// Run
const connStr = process.argv[2] || process.env.DATABASE_URL
if (!connStr) {
  console.error('Usage: node register-files.js <postgres_connection_string>')
  console.error('Or set DATABASE_URL environment variable')
  process.exit(1)
}

registerFiles(connStr)
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1) })
