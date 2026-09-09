// routes/audio.js — Audio streaming endpoints
const express = require('express')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const router = express.Router()

/**
 * GET /api/audio/stream
 * Stream audio file with range request support
 * Supports: MP3, WAV, AIFF/AIF
 * AIFF files are transcoded to WAV via FFmpeg on the fly
 * Query params: path=/absolute/path/to/file.wav or h=hex-encoded-path
 */
router.get('/stream', async (req, res) => {
  console.log('[audio/stream] HIT', new Date().toISOString())
  // Accept hex-encoded path (?h=...) or legacy plain path (?path=...)
  let filePath = req.query.path
  if (req.query.h) {
    try { filePath = Buffer.from(req.query.h, 'hex').toString('utf8') } catch {}
  }
  if (!filePath) return res.status(400).json({ error: 'No path', receivedQuery: req.query })
  let stat
  try { stat = await fs.promises.stat(filePath) } catch { return res.status(404).json({ error: 'File not found' }) }

  const ext   = path.extname(filePath).toLowerCase()
  const isAif = ext === '.aiff' || ext === '.aif'
  const mime  = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav'
  const total = stat.size

  // Tell Cloudflare/nginx not to buffer or cache — stream directly to client
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('CF-Cache-Status', 'BYPASS')

  // AIF/AIFF: Chromium can't decode natively — pipe through ffmpeg → WAV on the fly
  if (isAif) {
    const ffmpegBin = ['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg','/usr/bin/ffmpeg'].find(p => { try { return fs.existsSync(p) } catch { return false } }) || 'ffmpeg'
    console.log(`[audio/stream] AIF→WAV via ${ffmpegBin}: ${filePath}`)
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Transfer-Encoding': 'chunked' })
    const ff = spawn(ffmpegBin, ['-y', '-i', filePath, '-f', 'wav', '-acodec', 'pcm_s16le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] })
    ff.stdout.pipe(res)
    ff.stderr.on('data', d => console.log('[ffmpeg]', d.toString().trim()))
    ff.on('error', err => { console.error('[audio/stream] ffmpeg spawn error:', err.message); if (!res.writableEnded) res.end() })
    ff.on('close', code => { if (code !== 0) console.warn('[audio/stream] ffmpeg exited', code); if (!res.writableEnded) res.end() })
    req.on('close', () => { try { ff.kill() } catch {} })
    return
  }

  const range = req.headers.range
  try {
    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
      const start = parseInt(startStr, 10) || 0
      const end   = endStr ? parseInt(endStr, 10) : total - 1
      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${total}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': end - start + 1,
        'Content-Type':   mime
      })
      const stream = fs.createReadStream(filePath, { start, end })
      stream.on('error', err => { console.error('[audio/stream] range error:', err.message); if (!res.writableEnded) res.end() })
      req.on('close', () => stream.destroy())
      stream.pipe(res)
    } else {
      res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime, 'Accept-Ranges': 'bytes' })
      const stream = fs.createReadStream(filePath)
      stream.on('error', err => { console.error('[audio/stream] error:', err.message); if (!res.writableEnded) res.end() })
      req.on('close', () => stream.destroy())
      stream.pipe(res)
    }
  } catch (e) {
    console.error('[audio/stream] unexpected error:', e.message)
    if (!res.headersSent) res.status(500).json({ error: e.message })
    else res.end()
  }
})

module.exports = router
