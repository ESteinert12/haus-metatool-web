// routes/pg.js — PostgreSQL endpoints
const express = require('express')
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const os = require('os')
const router = express.Router()

// Helper to access pgPool from app.locals
function getPgPool(req) {
  return req.app.locals.pgPool
}

// Set pgPool in app.locals
function setPgPool(req, newPool) {
  req.app.locals.pgPool = newPool
}

/**
 * POST /api/pg/connect
 * Connect to a PostgreSQL database
 */
router.post('/connect', async (req, res) => {
  const { connStr } = req.body
  try {
    const newPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      keepAlive: true,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 0,
    })
    // Test the new pool before switching
    const client = await newPool.connect()
    client.release()

    // Switch to new pool WITHOUT ending old one — let connections drain naturally
    // Ending the pool aggressively causes "Cannot use a pool after calling end" errors
    const oldPool = getPgPool(req)
    setPgPool(req, newPool)

    // Async drain old pool in background (don't block reconnect)
    if (oldPool) {
      setTimeout(() => {
        oldPool.end().catch(e => console.warn('[pg] old pool drain error:', e.message))
      }, 5000)  // Give 5 seconds for existing queries to finish
    }
    // Run schema migrations - create tables if they don't exist
    await newPool.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        name TEXT NOT NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {})
    await newPool.query(`
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        sku_root TEXT NOT NULL,
        position INTEGER DEFAULT 1,
        PRIMARY KEY (playlist_id, sku_root)
      )
    `).catch(() => {})
    await newPool.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`).catch(() => {})
    await newPool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`).catch(() => {})
    await newPool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`).catch(() => {})
    // Persist the connection string for auto-connect on restart
    const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
    let cfg = {}
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {}
    cfg.pgConn = connStr
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

/**
 * POST /api/pg/query
 * Execute arbitrary SQL query
 */
router.post('/query', async (req, res) => {
  const pgPool = getPgPool(req)
  const { sql, params } = req.body
  if (!pgPool) return res.json({ ok: false, error: 'Not connected to database' })
  try {
    const result = await pgPool.query(sql, params || [])
    res.json({ ok: true, rows: result.rows, rowCount: result.rowCount })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

/**
 * GET /api/pg/status
 * Check database connection status
 */
router.get('/status', async (req, res) => {
  const pgPool = getPgPool(req)
  if (!pgPool) return res.json({ connected: false })
  try { await pgPool.query('SELECT 1'); res.json({ connected: true }) }
  catch { res.json({ connected: false }) }
})

module.exports = router
