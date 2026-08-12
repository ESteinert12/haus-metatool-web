#!/usr/bin/env node

/**
 * Lot Recovery Skill
 * Scans a lot and reports missing/broken songs vs shipping folder
 * Usage: node lot-recovery-skill.js <lot_id>
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_VWPl7U3kYwJb@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
})

const SHIPPING_ROOT = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping'

async function getLotInfo(lotId) {
  const res = await pool.query('SELECT lot_id, lot_name FROM lots WHERE lot_id = $1', [lotId])
  return res.rows[0]
}

async function getTitlesInLot(lotId) {
  const res = await pool.query(
    'SELECT sku_root, title, lot_id FROM titles WHERE lot_id = $1 ORDER BY sku_root',
    [lotId]
  )
  return res.rows
}

async function getTitlesWithNullLot(lotName) {
  // Find songs that might belong to this lot based on shipping folders
  const res = await pool.query(
    'SELECT sku_root, title, lot_id FROM titles WHERE lot_id IS NULL ORDER BY sku_root'
  )
  return res.rows
}

function getShippingFolders(lotName) {
  // Look for lot folders in shipping directory
  const shipPath = SHIPPING_ROOT
  if (!fs.existsSync(shipPath)) {
    return []
  }

  const folders = fs.readdirSync(shipPath)
    .filter(f => {
      const fullPath = path.join(shipPath, f)
      return fs.statSync(fullPath).isDirectory() && f.includes(lotName)
    })

  const songs = []
  folders.forEach(folder => {
    const folderPath = path.join(shipPath, folder)
    const contents = fs.readdirSync(folderPath)
    contents.forEach(item => {
      const itemPath = path.join(folderPath, item)
      if (fs.statSync(itemPath).isDirectory()) {
        // Extract SKU from folder name (format: SKUXXXX_SongTitle)
        const match = item.match(/^([A-Z0-9]{2,3}[a-z0-9]{1,5}\d{4})/i)
        if (match) {
          songs.push(match[1])
        }
      }
    })
  })

  return songs
}

async function run() {
  try {
    const lotId = parseInt(process.argv[2])
    if (!lotId) {
      console.error('Usage: node lot-recovery-skill.js <lot_id>')
      process.exit(1)
    }

    const lot = await getLotInfo(lotId)
    if (!lot) {
      console.error(`Lot ${lotId} not found`)
      process.exit(1)
    }

    console.log(`\n${'='.repeat(70)}`)
    console.log(`LOT RECOVERY REPORT`)
    console.log(`${'='.repeat(70)}`)
    console.log(`Lot ID: ${lot.lot_id}`)
    console.log(`Lot Name: ${lot.lot_name}`)
    console.log(`${'='.repeat(70)}\n`)

    // Get songs in database for this lot
    const dbSongs = await getTitlesInLot(lotId)
    console.log(`📊 DATABASE: ${dbSongs.length} songs in lot`)
    if (dbSongs.length > 0) {
      console.log('  SKUs:', dbSongs.map(s => s.sku_root).join(', '))
    }

    // Get songs in shipping folder
    const shippingSongs = getShippingFolders(lot.lot_name)
    console.log(`\n📁 SHIPPING: ${shippingSongs.length} song folders found`)
    if (shippingSongs.length > 0) {
      console.log('  SKUs:', shippingSongs.join(', '))
    }

    // Compare
    const dbSet = new Set(dbSongs.map(s => s.sku_root))
    const shipSet = new Set(shippingSongs)

    const inShippingNotDb = shippingSongs.filter(s => !dbSet.has(s))
    const inDbNotShipping = dbSongs.filter(s => !shipSet.has(s.sku_root))
    const orphanedInDb = dbSongs.filter(s => s.lot_id === null)

    console.log(`\n${'='.repeat(70)}`)
    console.log(`ANALYSIS`)
    console.log(`${'='.repeat(70)}`)

    if (inShippingNotDb.length > 0) {
      console.log(`\n⚠️  IN SHIPPING BUT NOT IN DATABASE (${inShippingNotDb.length})`)
      inShippingNotDb.forEach(sku => {
        console.log(`  ✗ ${sku}`)
      })
    }

    if (inDbNotShipping.length > 0) {
      console.log(`\n⚠️  IN DATABASE BUT NOT IN SHIPPING (${inDbNotShipping.length})`)
      inDbNotShipping.forEach(s => {
        console.log(`  ✗ ${s.sku_root}: ${s.title}`)
      })
    }

    if (orphanedInDb.length > 0) {
      console.log(`\n⚠️  ORPHANED (lot_id=null, ${orphanedInDb.length})`)
      orphanedInDb.forEach(s => {
        console.log(`  ✗ ${s.sku_root}: ${s.title}`)
      })
    }

    if (inShippingNotDb.length === 0 && inDbNotShipping.length === 0 && orphanedInDb.length === 0) {
      console.log(`\n✓ ALL GOOD - ${dbSongs.length} songs match shipping folder`)
    }

    console.log(`\n${'='.repeat(70)}\n`)

    await pool.end()
  } catch (err) {
    console.error('ERROR:', err.message)
    process.exit(1)
  }
}

run()
