// routes/shell.js — Shell/system endpoints
const express = require('express')
const os = require('os')
const { exec } = require('child_process')
const router = express.Router()

/**
 * POST /api/shell/exec
 * Execute a shell command
 */
router.post('/exec', (req, res) => {
  const { cmd, cwd } = req.body
  exec(cmd, { cwd: cwd || os.homedir(), maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
    res.json({ err: err?.message || null, stdout: stdout || '', stderr: stderr || '' })
  })
})

/**
 * GET /api/shell/home-dir
 * Get user's home directory
 */
router.get('/home-dir', (req, res) => {
  res.json(os.homedir())
})

/**
 * GET /api/shell/app-path
 * Get application directory
 */
router.get('/app-path', (req, res) => {
  res.json(req.app.locals.appDir || process.cwd())
})

/**
 * POST /api/shell/open-external
 * Open URL in default browser
 */
router.post('/open-external', (req, res) => {
  const { url } = req.body
  // On macOS server, open in default browser
  exec(`open "${url}"`)
  res.json({ ok: true })
})

/**
 * POST /api/shell/show-in-finder
 * Show file in Finder
 */
router.post('/show-in-finder', (req, res) => {
  const { filePath } = req.body
  exec(`open -R "${filePath}"`)
  res.json({ ok: true })
})

/**
 * GET /api/shell/show-folder-picker
 * Folder picker — returns null in web mode (UI falls back to text input)
 */
router.get('/show-folder-picker', (req, res) => {
  res.json(null)
})

module.exports = router
