// routes/fs.js — Filesystem endpoints
const express = require('express')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const router = express.Router()

// Read directory contents
router.post('/read-dir', (req, res) => {
  const { dirPath } = req.body
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
    const result = items
      .filter(item => !item.name.startsWith('.'))
      .map(item => {
        const fullPath = path.join(dirPath, item.name)
        let size = 0
        try { if (!item.isDirectory()) size = fs.statSync(fullPath).size } catch {}
        return { name: item.name, isDirectory: item.isDirectory(), path: fullPath, size, ext: path.extname(item.name).toLowerCase() }
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    res.json(result)
  } catch (e) { res.json({ error: e.message }) }
})

// Read BPM/key from audio file tags (same music-metadata library used by staging watcher)
router.post('/audio-meta', async (req, res) => {
  const { filePath } = req.body
  if (!filePath) return res.json({ ok: false, error: 'No path' })
  try {
    let mm = null
    try { mm = require('music-metadata') } catch { return res.json({ ok: false, error: 'music-metadata not installed' }) }
    const meta = await mm.parseFile(filePath, { skipCovers: true, duration: false })
    // common.bpm is populated by music-metadata when it finds a TBPM tag.
    // Some DAW exporters write TBPM as a native tag only — check native ID3 as fallback.
    let bpmRaw = meta.common.bpm
    if (!bpmRaw) {
      const natives = meta.native || {}
      for (const [, tags] of Object.entries(natives)) {
        const found = tags.find(t => t.id === 'TBPM' || t.id === 'BPM')
        if (found?.value) { bpmRaw = found.value; break }
      }
    }
    res.json({
      ok:  true,
      bpm: bpmRaw ? Math.round(parseFloat(bpmRaw)) : null,
      key: meta.common.key || null
    })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// Check whether _FULL audio files are locally available or cloud-only (Dropbox SmartSync)
router.post('/audio-status', async (req, res) => {
  const { folderPath } = req.body
  try {
    const names = await fs.promises.readdir(folderPath).catch(() => [])
    const checkFile = async (pattern) => {
      const name = names.find(n => new RegExp(pattern, 'i').test(n))
      if (!name) return 'missing'
      try {
        const stat = await fs.promises.stat(path.join(folderPath, name))
        if (stat.size === 0) return 'empty'
        // blocks===0 with size>0 means cloud-only placeholder (Dropbox SmartSync)
        if (stat.blocks === 0) return 'cloud'
        return 'local'
      } catch { return 'error' }
    }
    const [mp3, wav] = await Promise.all([checkFile('_FULL\\.mp3$'), checkFile('_FULL\\.wav$')])
    res.json({ mp3, wav })
  } catch (e) { res.json({ mp3: 'error', wav: 'error' }) }
})

// Count files in directory
router.post('/count-files', (req, res) => {
  const { dirPath, ext } = req.body
  try {
    const cmd = ext ? `find "${dirPath}" -name "*.${ext}" | wc -l` : `find "${dirPath}" -type f | wc -l`
    const result = execSync(cmd).toString().trim()
    res.json(parseInt(result, 10))
  } catch { res.json(0) }
})

// Check if path exists
router.post('/path-exists', (req, res) => {
  const { filePath } = req.body
  res.json(fs.existsSync(filePath))
})

// Read file contents
router.post('/read-file', (req, res) => {
  const { filePath } = req.body
  try { res.json(fs.readFileSync(filePath, 'utf8')) }
  catch { res.json(null) }
})

// Write file
router.post('/write-file', (req, res) => {
  const { filePath, content } = req.body
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    res.json(true)
  } catch { res.json(false) }
})

// Create directory
router.post('/mkdir', (req, res) => {
  const { dirPath } = req.body
  if (!dirPath) return res.json({ ok: false, error: 'No dirPath provided' })
  try {
    fs.mkdirSync(dirPath, { recursive: true })
    res.json({ ok: true, path: dirPath })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// Get folder statistics
router.post('/folder-stats', (req, res) => {
  const { dirPath } = req.body
  try {
    const audioExts = ['.wav', '.mp3', '.aiff', '.aif']
    let audioCount = 0, totalCount = 0, folderCount = 0
    const walk = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name.startsWith('.')) continue
        const full = path.join(dir, item.name)
        if (item.isDirectory()) { folderCount++; walk(full) }
        else { totalCount++; if (audioExts.includes(path.extname(item.name).toLowerCase())) audioCount++ }
      }
    }
    walk(dirPath)
    res.json({ audioCount, totalCount, folderCount })
  } catch { res.json({ audioCount: 0, totalCount: 0, folderCount: 0 }) }
})

module.exports = router
