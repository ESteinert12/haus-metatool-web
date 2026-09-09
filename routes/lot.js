// routes/lot.js — Lot management endpoints
const express = require('express')
const fs = require('fs')
const path = require('path')
const os = require('os')
const router = express.Router()

// Helper to get pgPool from app.locals
function getPgPool(req) {
  return req.app.locals.pgPool
}

/**
 * POST /api/lot/create
 * Create a lot in the database and filesystem
 */
router.post('/create', async (req, res) => {
  const pgPool = getPgPool(req)
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })

  const { lotName, limit, projectId, clientName } = req.body
  if (!lotName) return res.json({ ok: false, error: 'Lot name required' })

  try {
    // Insert lot into database
    const result = await pgPool.query(
      `INSERT INTO lots (lot_name, lot_type, status, track_limit, project_id, client)
       VALUES ($1, 'client', 'active', $2, $3, $4) RETURNING lot_id`,
      [lotName, limit || null, projectId || null, clientName || null]
    )

    if (!result.rows.length) {
      return res.json({ ok: false, error: 'Failed to create lot' })
    }

    const lotId = result.rows[0].lot_id

    // Create folder in shipping directory
    let shippingBase = process.env.HAUS_SHIPPING
    let folderCreated = false
    let folderPath = null
    let folderError = null

    if (!shippingBase) {
      try {
        const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
        console.log(`[lot/create] Checking config at: ${cfgPath}`)
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
          console.log(`[lot/create] Config loaded, hausjup: ${cfg.hausjup}`)
          if (cfg.hausjup) shippingBase = cfg.hausjup
        } else {
          console.warn(`[lot/create] Config file not found at ${cfgPath}`)
        }
      } catch (e) {
        console.warn('[lot/create] Could not read shipping path from config:', e.message)
        folderError = e.message
      }
    }

    if (shippingBase) {
      folderPath = path.join(shippingBase, lotName)
      console.log(`[lot/create] Creating folder at: ${folderPath}`)
      try {
        fs.mkdirSync(folderPath, { recursive: true })
        folderCreated = true
        console.log(`✅ [lot/create] Created lot folder: ${folderPath}`)
      } catch (e) {
        console.error(`❌ [lot/create] Could not create lot folder ${folderPath}:`, e.message)
        folderError = e.message
      }
    } else {
      console.warn('[lot/create] No shipping base path found')
      folderError = 'No shipping path configured'
    }

    res.json({ ok: true, lotId, folderCreated, folderPath, folderError })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

/**
 * POST /api/lot/download-avid-wavs
 * Download WAV files from a lot for AVID editing
 */
router.post('/download-avid-wavs', async (req, res) => {
  const pgPool = getPgPool(req)
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })

  const { lotId, lotName, safeName } = req.body
  try {
    // Get lot details from DB
    const lotRows = await pgPool.query('SELECT * FROM lots WHERE lot_id = $1', [lotId])
    const lot = lotRows?.rows?.[0]
    if (!lot) return res.json({ ok: false, error: 'Lot not found' })

    // Create AVID folder in user's Downloads
    const avidDir = path.resolve(path.join(os.homedir(), 'Downloads', `AVID_${safeName}`))
    if (!fs.existsSync(avidDir)) fs.mkdirSync(avidDir, { recursive: true })

    // Find lot folder in shipping directory (read from config)
    let shippingBase = process.env.HAUS_SHIPPING

    if (!shippingBase) {
      try {
        const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
        if (fs.existsSync(cfgPath)) {
          const cfgData = fs.readFileSync(cfgPath, 'utf8')
          const cfg = JSON.parse(cfgData)
          if (cfg.hausjup) shippingBase = cfg.hausjup
        }
      } catch (e) {
        console.warn('Could not read config for shipping path:', e.message)
      }
    }

    if (!shippingBase) {
      return res.json({ ok: false, error: 'Shipping path not configured. Set HAUS_SHIPPING env var or configure in app settings.' })
    }

    const lotFolder = path.resolve(path.join(shippingBase, lotName))
    console.log('[AVID] Looking for lot folder:', lotFolder)

    if (!fs.existsSync(lotFolder)) {
      return res.json({ ok: false, error: `Lot folder not found: ${lotFolder}. Checked shipping path: ${shippingBase}` })
    }

    // Recursively find all WAV files and copy them
    let wavCount = 0
    const copyWavs = (srcDir) => {
      try {
        const items = fs.readdirSync(srcDir, { withFileTypes: true })
        for (const item of items) {
          if (item.name.startsWith('.')) continue
          const srcPath = path.join(srcDir, item.name)
          if (item.isDirectory()) {
            copyWavs(srcPath)
          } else if (item.name.toLowerCase().endsWith('.wav')) {
            const destPath = path.join(avidDir, item.name)
            fs.copyFileSync(srcPath, destPath)
            wavCount++
          }
        }
      } catch (e) {
        console.error('Error copying WAVs:', e.message)
      }
    }

    copyWavs(lotFolder)
    res.json({ ok: true, count: wavCount, folder: avidDir })
  } catch (e) {
    console.error('AVID download error:', e)
    res.json({ ok: false, error: e.message })
  }
})

module.exports = router
