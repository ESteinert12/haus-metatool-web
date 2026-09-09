// routes/cfg.js — Configuration endpoints
const express = require('express')
const fs = require('fs')
const path = require('path')
const os = require('os')
const router = express.Router()

// Stores shared folder paths so all users inherit them without local config.
const SERVER_PATH_KEYS = ['hausjup', 'staging', 'intake', 'finish', 'gmail', 'pgConn']

/**
 * GET /api/cfg/server-paths
 * Get all configured server paths
 */
router.get('/server-paths', (req, res) => {
  const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {}
  const paths = {}
  for (const k of SERVER_PATH_KEYS) if (cfg[k]) paths[k] = cfg[k]
  res.json(paths)
})

/**
 * POST /api/cfg/server-paths
 * Update server paths and restart staging watcher
 */
router.post('/server-paths', (req, res, next) => {
  // Hook: restart watcher when staging path changes
  res.on('finish', () => {
    const pgPool = req.app.locals.pgPool
    if (pgPool) {
      const startStagingWatcher = req.app.locals.startStagingWatcher
      if (startStagingWatcher) {
        startStagingWatcher(pgPool).catch(() => {})
      }
    }
  })
  next()
}, (req, res) => {
  const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {}
  for (const k of SERVER_PATH_KEYS) {
    if (req.body[k] !== undefined) cfg[k] = req.body[k]
  }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
  res.json({ ok: true })
})

module.exports = router
