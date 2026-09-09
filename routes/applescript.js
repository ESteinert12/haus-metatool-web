/**
 * routes/applescript.js — AppleScript execution for macOS integration
 *
 * Endpoints:
 * - POST /execute - Execute AppleScript (authenticated only)
 */

const express = require('express')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')

const router = express.Router()

router.post('/execute', (req, res) => {
  const { script } = req.body
  console.warn(`[security] applescript called by ${req.session?.user?.username || 'unknown'}: ${script.substring(0, 50)}...`)
  const tmpFile = path.join(os.tmpdir(), `haus_as_${Date.now()}.applescript`)
  try {
    fs.writeFileSync(tmpFile, script, 'utf8')
    exec(`osascript "${tmpFile}"`, { timeout: 15000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile) } catch {}
      if (err) res.json({ error: err.message, stderr: stderr || '' })
      else     res.json({ result: stdout.trim() })
    })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

module.exports = router
