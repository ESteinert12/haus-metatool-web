// server.js — HAUS Workspace web server
// Run with: node server.js
// Then open http://localhost:3001 in any browser on the network

process.on('uncaughtException',  e => console.error('💥 uncaughtException:', e.message, e.stack))
process.on('unhandledRejection', e => console.error('💥 unhandledRejection:', e))

const express    = require('express')
const session    = require('express-session')
const crypto     = require('crypto')
const fs         = require('fs')
const path       = require('path')
const os         = require('os')
const https      = require('https')
const http       = require('http')
const { exec, execSync, spawn } = require('child_process')
const { Pool }   = require('pg')
const multer     = require('multer')

const app    = express()
const PORT   = process.env.PORT || 9999 
const upload = multer({ dest: os.tmpdir() })

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(session({
  secret: 'haus-workspace-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}))

// Never cache index.html or haus-api.js so changes are always picked up
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(__dirname, 'index.html'))
})
app.get('/index.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(__dirname, 'index.html'))
})
app.get('/haus-api.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(__dirname, 'haus-api.js'))
})

// Serve static files (index.html, assets, etc.)
app.use(express.static(__dirname))

// Auth guard — pg/connect, pg/status, and auth/login are public (needed before login)
const PUBLIC_ROUTES = ['/auth/login', '/pg/connect', '/pg/status', '/pg/query',
  '/fs/read-dir', '/fs/count-files', '/fs/path-exists', '/fs/read-file',
  '/fs/write-file', '/fs/folder-stats', '/fs/audio-status', '/fs/audio-meta', '/audio/stream',
  '/shell/app-path', '/shell/home-dir', '/shell/show-in-finder', '/shell/open-external',
  '/b2/stream']
app.use('/api', (req, res, next) => {
  if (PUBLIC_ROUTES.some(r => req.path === r)) return next()
  if (!req.session?.user) return res.status(401).json({ ok: false, error: 'Not logged in' })
  next()
})

// ─── Helpers ──────────────────────────────────────────────────────────────
function _hashPassword(pw) {
  return crypto.createHash('sha256').update('haus-workspace:' + pw).digest('hex')
}

function _b2Request(opts) {
  return new Promise((resolve, reject) => {
    const { method, hostname, urlPath, headers, body, isBuffer } = opts
    const bodyData = isBuffer ? body : (body ? JSON.stringify(body) : null)
    const hdrs = { ...headers }
    if (bodyData) hdrs['Content-Length'] = Buffer.byteLength(bodyData)
    const req = https.request({ hostname, path: urlPath, method, headers: hdrs, rejectUnauthorized: false }, res => {
      if (isBuffer) {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
      } else {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
          catch { resolve({ status: res.statusCode, body: data }) }
        })
      }
    })
    req.on('error', reject)
    if (bodyData) req.write(bodyData)
    req.end()
  })
}

function fmHttp(opts) {
  return new Promise((resolve, reject) => {
    const { method, host, urlPath, body, token, user, pass } = opts
    const bodyStr = body ? JSON.stringify(body) : ''
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    if (token)     headers['Authorization'] = `Bearer ${token}`
    else if (user) headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
    const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const useHttps  = !host.startsWith('http://')
    const lib       = useHttps ? https : http
    const req = lib.request(
      { hostname: cleanHost.split(':')[0],
        port: cleanHost.includes(':') ? +cleanHost.split(':')[1] : (useHttps ? 443 : 80),
        path: urlPath, method, headers, rejectUnauthorized: false },
      res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
          catch { resolve({ status: res.statusCode, body: data }) }
        })
      }
    )
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// ─── State ────────────────────────────────────────────────────────────────
let pgPool    = null
let b2Auth    = null
const fmSessions = {}

const DEFAULT_NEON = 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

// ─── Server-side migrations ────────────────────────────────────────────────
async function runServerMigrations(pool) {
  // haus_users: must exist before any login attempt
  await pool.query(`
    CREATE TABLE IF NOT EXISTS haus_users (
      user_id       SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `)
  // Default password: haus2024  (sha256 of 'haus-workspace:haus2024')
  const defaultHash = 'b306649bab59e11eea165a339f03855f9a1d9290364f0187f49294a3555a5f5b'
  await pool.query(`
    INSERT INTO haus_users (username, display_name, password_hash) VALUES
      ('erik', 'Erik', $1),
      ('kyle', 'Kyle', $1)
    ON CONFLICT (username) DO NOTHING
  `, [defaultHash])
  console.log('✅ haus_users ready')

  // staged_files: pre-scraped metadata for files waiting in the staging folder
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staged_files (
      id            SERIAL PRIMARY KEY,
      filename      TEXT NOT NULL,
      filepath      TEXT NOT NULL UNIQUE,
      title         TEXT,
      composer_id   TEXT,
      version       TEXT,
      key           TEXT,
      bpm           NUMERIC(6,2),
      duration_sec  NUMERIC(8,3),
      album         TEXT,
      artist        TEXT,
      genre         TEXT,
      year          INTEGER,
      raw_tags      JSONB,
      arrived_at    TIMESTAMPTZ DEFAULT NOW(),
      status        TEXT NOT NULL DEFAULT 'pending'
    )
  `)
  console.log('✅ staged_files ready')
}

// ─── Neon keep-alive ───────────────────────────────────────────────────────
// Neon serverless computes sleep after ~5 min of inactivity → 30-60s cold start.
// Pinging every 4 min keeps the compute warm so connections are instant.
let _keepAliveTimer = null
function startNeonKeepAlive() {
  if (_keepAliveTimer) clearInterval(_keepAliveTimer)
  _keepAliveTimer = setInterval(async () => {
    if (!pgPool) return
    try { await pgPool.query('SELECT 1') }
    catch (e) { console.warn('[keep-alive] ping failed:', e.message) }
  }, 4 * 60 * 1000) // every 4 minutes
  _keepAliveTimer.unref() // don't prevent process exit
}

// Auto-connect to Neon on startup — tries saved config first, falls back to default
;(async () => {
  try {
    let connStr = DEFAULT_NEON
    const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      if (cfg.pgConn) connStr = cfg.pgConn
    }
    pgPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      keepAlive: true,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 0,  // never drop idle connections — keeps Neon warm
    })
    await pgPool.query('SELECT 1')
    console.log('✅ PostgreSQL connected')
    startNeonKeepAlive()
    await runServerMigrations(pgPool)
    startStagingWatcher(pgPool).catch(e => console.warn('Watcher start failed:', e.message))
  } catch (e) {
    console.log('⚠ PG auto-connect failed:', e.message)
    pgPool = null
  }
})()

// ─── Auth routes ──────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  try {
    const hash   = _hashPassword(password)
    const result = await pgPool.query(
      `SELECT user_id, username, display_name FROM haus_users WHERE LOWER(username)=LOWER($1) AND password_hash=$2`,
      [username, hash]
    )
    if (!result.rows.length) return res.json({ ok: false, error: 'Invalid username or password' })
    req.session.user = result.rows[0]
    res.json({ ok: true, user: result.rows[0] })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy()
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session?.user || null })
})

app.post('/api/auth/change-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  try {
    const oldHash = _hashPassword(oldPassword)
    const newHash = _hashPassword(newPassword)
    const result  = await pgPool.query(
      `UPDATE haus_users SET password_hash=$1 WHERE LOWER(username)=LOWER($2) AND password_hash=$3 RETURNING user_id`,
      [newHash, username, oldHash]
    )
    if (!result.rowCount) return res.json({ ok: false, error: 'Current password incorrect' })
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// ─── PostgreSQL routes ─────────────────────────────────────────────────────
app.post('/api/pg/connect', async (req, res) => {
  const { connStr } = req.body
  try {
    if (pgPool) { try { await pgPool.end() } catch {} }
    pgPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      keepAlive: true,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 0,
    })
    const client = await pgPool.connect()
    client.release()
    // Run schema migrations - create tables if they don't exist
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        name TEXT NOT NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {})
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        sku_root TEXT NOT NULL,
        position INTEGER DEFAULT 1,
        PRIMARY KEY (playlist_id, sku_root)
      )
    `).catch(() => {})
    await pgPool.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`).catch(() => {})
    await pgPool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`).catch(() => {})
    await pgPool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`).catch(() => {})
    startNeonKeepAlive()
    // Persist the connection string for auto-connect on restart
    const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
    let cfg = {}
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {}
    cfg.pgConn = connStr
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.post('/api/pg/query', async (req, res) => {
  const { sql, params } = req.body
  if (!pgPool) return res.json({ ok: false, error: 'Not connected to database' })
  try {
    const result = await pgPool.query(sql, params || [])
    res.json({ ok: true, rows: result.rows, rowCount: result.rowCount })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.get('/api/pg/status', async (req, res) => {
  if (!pgPool) return res.json({ connected: false })
  try { await pgPool.query('SELECT 1'); res.json({ connected: true }) }
  catch { res.json({ connected: false }) }
})

// ─── Filesystem routes ─────────────────────────────────────────────────────
app.post('/api/fs/read-dir', (req, res) => {
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
app.post('/api/fs/audio-meta', async (req, res) => {
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
app.post('/api/fs/audio-status', async (req, res) => {
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

app.post('/api/fs/count-files', (req, res) => {
  const { dirPath, ext } = req.body
  try {
    const cmd = ext ? `find "${dirPath}" -name "*.${ext}" | wc -l` : `find "${dirPath}" -type f | wc -l`
    const result = execSync(cmd).toString().trim()
    res.json(parseInt(result, 10))
  } catch { res.json(0) }
})

app.post('/api/fs/path-exists', (req, res) => {
  const { filePath } = req.body
  res.json(fs.existsSync(filePath))
})

app.post('/api/fs/read-file', (req, res) => {
  const { filePath } = req.body
  try { res.json(fs.readFileSync(filePath, 'utf8')) }
  catch { res.json(null) }
})

app.post('/api/fs/write-file', (req, res) => {
  const { filePath, content } = req.body
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    res.json(true)
  } catch { res.json(false) }
})

app.post('/api/fs/mkdir', (req, res) => {
  const { dirPath } = req.body
  if (!dirPath) return res.json({ ok: false, error: 'No dirPath provided' })
  try {
    fs.mkdirSync(dirPath, { recursive: true })
    res.json({ ok: true, path: dirPath })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.post('/api/fs/folder-stats', (req, res) => {
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

// ─── Shell routes ──────────────────────────────────────────────────────────
app.post('/api/shell/exec', (req, res) => {
  const { cmd, cwd } = req.body
  exec(cmd, { cwd: cwd || os.homedir(), maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
    res.json({ err: err?.message || null, stdout: stdout || '', stderr: stderr || '' })
  })
})

app.get('/api/shell/home-dir', (req, res) => {
  res.json(os.homedir())
})

app.get('/api/shell/app-path', (req, res) => {
  res.json(__dirname)
})

app.post('/api/shell/open-external', (req, res) => {
  const { url } = req.body
  // On macOS server, open in default browser
  exec(`open "${url}"`)
  res.json({ ok: true })
})

app.post('/api/shell/show-in-finder', (req, res) => {
  const { filePath } = req.body
  exec(`open -R "${filePath}"`)
  res.json({ ok: true })
})

// Folder picker — returns null in web mode (UI falls back to text input)
app.get('/api/shell/show-folder-picker', (req, res) => {
  res.json(null)
})

// ─── Server-side canonical paths ───────────────────────────────────────────
// Stores shared folder paths so all users inherit them without local config.
const SERVER_PATH_KEYS = ['hausjup', 'staging', 'intake', 'finish', 'gmail']

app.get('/api/cfg/server-paths', (req, res) => {
  const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {}
  const paths = {}
  for (const k of SERVER_PATH_KEYS) if (cfg[k]) paths[k] = cfg[k]
  res.json(paths)
})

app.post('/api/cfg/server-paths', (req, res) => {
  const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {}
  for (const k of SERVER_PATH_KEYS) {
    if (req.body[k] !== undefined) cfg[k] = req.body[k]
  }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
  res.json({ ok: true })
})

// ─── Audio streaming ───────────────────────────────────────────────────────
// GET /api/audio/stream?path=/absolute/path/to/file.wav
// Supports range requests so HTML5 <audio> seeking works
app.get('/api/audio/stream', async (req, res) => {
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

// ─── AppleScript route ─────────────────────────────────────────────────────
app.post('/api/applescript', (req, res) => {
  const { script } = req.body
  const tmpFile = path.join(os.tmpdir(), `haus_as_${Date.now()}.applescript`)
  try {
    fs.writeFileSync(tmpFile, script, 'utf8')
    exec(`osascript "${tmpFile}"`, { timeout: 15000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile) } catch {}
      if (err) res.json({ error: err.message, stderr: stderr || '' })
      else     res.json({ result: stdout.trim() })
    })
  } catch (e) { res.json({ error: e.message }) }
})

// ─── FileMaker routes ──────────────────────────────────────────────────────
app.post('/api/fm/login', async (req, res) => {
  const { host, database, user, pass } = req.body
  try {
    const r = await fmHttp({ method: 'POST', host,
      urlPath: `/fmi/data/v1/databases/${encodeURIComponent(database)}/sessions`,
      body: {}, user, pass })
    if (r.status === 200 && r.body?.response?.token) {
      fmSessions[database] = { token: r.body.response.token, host }
      res.json({ ok: true, token: r.body.response.token })
    } else {
      res.json({ ok: false, error: r.body?.messages?.[0]?.message || `HTTP ${r.status}` })
    }
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.post('/api/fm/query', async (req, res) => {
  const { database, layout, query, options = {} } = req.body
  const session = fmSessions[database]
  if (!session) return res.json({ ok: false, error: 'Not logged in — connect in Settings → FileMaker.' })
  try {
    const { limit = 200, offset = 1, sort } = options
    let urlPath, method, body
    if (query && Object.keys(query).length > 0) {
      method  = 'POST'
      urlPath = `/fmi/data/v1/databases/${encodeURIComponent(database)}/layouts/${encodeURIComponent(layout)}/_find`
      body    = { query: Array.isArray(query) ? query : [query], limit, offset }
      if (sort) body.sort = sort
    } else {
      method  = 'GET'
      const p = new URLSearchParams({ _limit: limit, _offset: offset })
      if (sort) p.set('_sort', JSON.stringify(sort))
      urlPath = `/fmi/data/v1/databases/${encodeURIComponent(database)}/layouts/${encodeURIComponent(layout)}/records?${p}`
    }
    const r = await fmHttp({ method, host: session.host, urlPath, body, token: session.token })
    if (r.status === 200) return res.json({ ok: true, records: r.body?.response?.data || [], total: r.body?.response?.totalRecordCount || 0 })
    if (r.status === 401) { delete fmSessions[database]; return res.json({ ok: false, error: 'Session expired — reconnect in Settings.' }) }
    if (r.body?.messages?.[0]?.code === '401') return res.json({ ok: true, records: [], total: 0 })
    res.json({ ok: false, error: r.body?.messages?.[0]?.message || `HTTP ${r.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.post('/api/fm/logout', async (req, res) => {
  const { database } = req.body
  const session = fmSessions[database]
  if (!session) return res.json({ ok: true })
  try {
    await fmHttp({ method: 'DELETE', host: session.host,
      urlPath: `/fmi/data/v1/databases/${encodeURIComponent(database)}/sessions/${session.token}`,
      token: session.token })
  } catch {}
  delete fmSessions[database]
  res.json({ ok: true })
})

app.post('/api/fm/databases', async (req, res) => {
  const { host, user, pass } = req.body
  try {
    const r = await fmHttp({ method: 'GET', host, urlPath: '/fmi/data/v1/databases', user, pass })
    if (r.status === 200) return res.json({ ok: true, databases: r.body?.response?.databases || [] })
    res.json({ ok: false, error: r.body?.messages?.[0]?.message || `HTTP ${r.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// GET /api/b2/stream?key=path/in/bucket
// Downloads the entire B2 file into memory first, then serves it with full
// Range request support. Buffering avoids Cloudflare tunnel truncation of
// long-running streaming responses.
app.get('/api/b2/stream', async (req, res) => {
  if (!b2Auth) return res.status(503).json({ error: 'B2 not authorized' })
  const key = req.query.key
  if (!key) return res.status(400).json({ error: 'Missing key' })

  const downloadHost = b2Auth.downloadUrl.replace(/^https?:\/\//, '')
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const urlPath = `/file/haus-music/${encodedKey}`

  const ext  = path.extname(key).toLowerCase()
  const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.aiff' || ext === '.aif' ? 'audio/aiff' : 'audio/wav'

  console.log(`[b2/stream] fetching host:${downloadHost} path:${urlPath}`)

  try {
    const buf = await new Promise((resolve, reject) => {
      const b2Req = https.request(
        { hostname: downloadHost, path: urlPath, method: 'GET',
          headers: { 'Authorization': b2Auth.authorizationToken } },
        b2Res => {
          const status = b2Res.statusCode
          console.log(`[b2/stream] B2 responded ${status}`)
          if (status !== 200 && status !== 206) {
            let body = ''
            b2Res.on('data', d => body += d)
            b2Res.on('end', () => reject(Object.assign(new Error(`B2 returned ${status}`), { status, detail: body.slice(0, 200) })))
            return
          }
          console.log(`[b2/stream] response headers:`, JSON.stringify(b2Res.headers))
          const chunks = []
          b2Res.on('data', chunk => chunks.push(chunk))
          b2Res.on('end', () => {
            const full = Buffer.concat(chunks)
            if (full.length < 1000) console.log(`[b2/stream] small body:`, full.toString('utf8'))
            resolve(full)
          })
          b2Res.on('error', reject)
        }
      )
      b2Req.on('error', reject)
      b2Req.end()
    })

    const total = buf.length
    console.log(`[b2/stream] downloaded ${total} bytes, serving`)

    // Detect stub files: B2 contains a local path instead of real audio data
    if (total < 1000) {
      const bodyStr = buf.toString('utf8').trim()
      if (bodyStr.startsWith('/')) {
        console.log(`[b2/stream] stub detected — serving local file: ${bodyStr}`)
        const localPath = bodyStr
        if (!fs.existsSync(localPath)) {
          return res.status(404).json({ error: 'Local file not found', path: localPath })
        }
        const stat = fs.statSync(localPath)
        const localMime = path.extname(localPath).toLowerCase() === '.mp3' ? 'audio/mpeg'
          : path.extname(localPath).toLowerCase() === '.aiff' || path.extname(localPath).toLowerCase() === '.aif' ? 'audio/aiff'
          : 'audio/wav'
        const rangeHeader = req.headers.range
        if (rangeHeader) {
          const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
          const start = m && m[1] ? parseInt(m[1]) : 0
          const end   = m && m[2] ? Math.min(parseInt(m[2]), stat.size - 1) : stat.size - 1
          const chunkSize = end - start + 1
          res.writeHead(206, {
            'Content-Type':   localMime,
            'Content-Range':  `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges':  'bytes',
            'Content-Length': chunkSize,
            'Cache-Control':  'no-cache'
          })
          fs.createReadStream(localPath, { start, end }).pipe(res)
        } else {
          res.writeHead(200, {
            'Content-Type':   localMime,
            'Accept-Ranges':  'bytes',
            'Content-Length': stat.size,
            'Cache-Control':  'no-cache'
          })
          fs.createReadStream(localPath).pipe(res)
        }
        return
      }
    }

    const rangeHeader = req.headers.range
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      const start = m && m[1] ? parseInt(m[1]) : 0
      const end   = m && m[2] ? Math.min(parseInt(m[2]), total - 1) : total - 1
      const chunkSize = end - start + 1
      res.writeHead(206, {
        'Content-Type':   mime,
        'Content-Range':  `bytes ${start}-${end}/${total}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Cache-Control':  'no-cache'
      })
      res.end(buf.slice(start, end + 1))
    } else {
      res.writeHead(200, {
        'Content-Type':   mime,
        'Accept-Ranges':  'bytes',
        'Content-Length': total,
        'Cache-Control':  'no-cache'
      })
      res.end(buf)
    }
  } catch (e) {
    console.error('[b2/stream] error:', e.message, e.detail || '')
    if (!res.headersSent) res.status(e.status || 502).json({ error: e.message, detail: e.detail })
  }
})

// ─── Backblaze B2 routes ───────────────────────────────────────────────────
app.post('/api/b2/authorize', async (req, res) => {
  const { keyId, appKey } = req.body
  try {
    const creds = Buffer.from(`${keyId}:${appKey}`).toString('base64')
    const result = await _b2Request({
      method: 'GET', hostname: 'api.backblazeb2.com',
      urlPath: '/b2api/v3/b2_authorize_account',
      headers: { 'Authorization': `Basic ${creds}` }
    })
    if (result.status === 200) {
      const b = result.body
      b2Auth = {
        authorizationToken: b.authorizationToken,
        apiUrl:      b.apiInfo?.storageApi?.apiUrl      || b.apiUrl,
        downloadUrl: b.apiInfo?.storageApi?.downloadUrl || b.downloadUrl
      }
      return res.json({ ok: true, downloadUrl: b2Auth.downloadUrl })
    }
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.get('/api/b2/status', (req, res) => {
  res.json({ connected: !!b2Auth })
})

app.get('/api/b2/list-buckets', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const result  = await _b2Request({
      method: 'GET', hostname: apiHost, urlPath: '/b2api/v3/b2_list_buckets',
      headers: { 'Authorization': b2Auth.authorizationToken }
    })
    if (result.status === 200) return res.json({ ok: true, buckets: result.body.buckets || [] })
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.post('/api/b2/list-files', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { bucketId, prefix, maxCount } = req.body
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const params  = new URLSearchParams({ bucketId, maxFileCount: maxCount || 1000 })
    if (prefix) params.set('prefix', prefix)
    const result = await _b2Request({
      method: 'GET', hostname: apiHost,
      urlPath: `/b2api/v3/b2_list_file_names?${params}`,
      headers: { 'Authorization': b2Auth.authorizationToken }
    })
    if (result.status === 200) return res.json({ ok: true, files: result.body.files || [], nextFileName: result.body.nextFileName })
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.get('/api/b2/download-token', (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  res.json({ ok: true, token: b2Auth.authorizationToken })
})

app.post('/api/b2/get-upload-url', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { bucketId } = req.body
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const result  = await _b2Request({
      method: 'POST', hostname: apiHost, urlPath: '/b2api/v3/b2_get_upload_url',
      headers: { 'Authorization': b2Auth.authorizationToken, 'Content-Type': 'application/json' },
      body: { bucketId }
    })
    if (result.status === 200) return res.json({ ok: true, uploadUrl: result.body.uploadUrl, uploadAuthToken: result.body.authorizationToken })
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// Upload: browser sends file to server, server pushes to B2
app.post('/api/b2/upload-file', upload.single('file'), async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { uploadUrl, uploadAuthToken, b2FileName, mimeType } = req.body
  const tempPath = req.file?.path
  if (!tempPath) return res.json({ ok: false, error: 'No file received' })
  try {
    const fileBuffer = fs.readFileSync(tempPath)
    const sha1       = crypto.createHash('sha1').update(fileBuffer).digest('hex')
    const uploadHost = uploadUrl.replace(/^https?:\/\/([^/]+).*/, '$1')
    const uploadPath = uploadUrl.replace(/^https?:\/\/[^/]+/, '')
    const result     = await _b2Request({
      method: 'POST', hostname: uploadHost, urlPath: uploadPath, isBuffer: true,
      body: fileBuffer,
      headers: {
        'Authorization':    uploadAuthToken,
        'X-Bz-File-Name':   encodeURIComponent(b2FileName).replace(/%2F/g, '/'),
        'Content-Type':     mimeType || 'application/octet-stream',
        'X-Bz-Content-Sha1': sha1
      }
    })
    try { fs.unlinkSync(tempPath) } catch {}
    const parsed = JSON.parse(result.body.toString())
    if (result.status === 200) {
      const downloadUrl = `${b2Auth.downloadUrl}/file/${parsed.bucketName}/${parsed.fileName}`
      return res.json({ ok: true, fileId: parsed.fileId, fileName: parsed.fileName, downloadUrl })
    }
    res.json({ ok: false, error: parsed?.message || `HTTP ${result.status}` })
  } catch (e) {
    try { fs.unlinkSync(tempPath) } catch {}
    res.json({ ok: false, error: e.message })
  }
})

app.post('/api/b2/download-file', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not authorized' })
  const { url, destPath } = req.body
  try {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    const parsedUrl = new URL(url)
    const result    = await _b2Request({
      method: 'GET', hostname: parsedUrl.hostname,
      urlPath: parsedUrl.pathname + parsedUrl.search,
      headers: { 'Authorization': b2Auth.authorizationToken },
      isBuffer: true
    })
    if (result.status !== 200) return res.json({ ok: false, error: `HTTP ${result.status}` })
    fs.writeFileSync(destPath, result.body)
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// ─── Intake API ────────────────────────────────────────────────────────────

// Current album digit: 4 = Nimbus (bump to 5 when Nimbus reaches 10,000 titles)
const CURRENT_ALBUM_DIGIT = 4

// generateSku — atomic: reads + increments sku_sequences in one transaction.
// Also keeps teams.next_seq in sync.
// Padding rules:
//   seq < 1000  → 3-digit pad  (e.g. R25a0014 = seq 1 + album 4)
//   seq ≥ 1000  → 4-digit pad  (e.g. R13a10513 = seq 1051 + album 3)
async function generateSku(composerFullId, albumDigit = CURRENT_ALBUM_DIGIT) {
  if (!pgPool) throw new Error('Database not connected')
  const client = await pgPool.connect()
  try {
    await client.query('BEGIN')

    const result = await client.query(`
      UPDATE sku_sequences
      SET next_seq = next_seq + 1
      WHERE composer_full_id = $1
      RETURNING next_seq - 1 AS seq
    `, [composerFullId])

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      throw new Error(`Unknown team: ${composerFullId}`)
    }

    const seq    = parseInt(result.rows[0].seq)
    const padded = seq < 1000
      ? String(seq).padStart(3, '0')
      : String(seq).padStart(4, '0')
    const skuRoot = `${composerFullId}${padded}${albumDigit}`

    // Keep teams.next_seq in sync (best-effort — won't fail the transaction)
    await client.query(`
      UPDATE teams SET next_seq = next_seq + 1
      WHERE composer_full_id = $1
    `, [composerFullId])

    await client.query('COMMIT')
    return { skuRoot, seq }
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    throw e
  } finally {
    client.release()
  }
}

// GET /api/intake/teams — list all active teams for the team picker
app.get('/api/intake/teams', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  try {
    const result = await pgPool.query(`
      SELECT t.team_id, t.composer_full_id, t.composer_prefix,
             t.has_cowriters, t.is_jup, t.status,
             s.next_seq
      FROM   teams t
      LEFT JOIN sku_sequences s ON s.composer_full_id = t.composer_full_id
      WHERE  t.status = 'active'
        AND  t.composer_full_id IS NOT NULL
        AND  t.composer_full_id != ''
      ORDER BY t.composer_full_id
    `)
    res.json({ ok: true, teams: result.rows })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// POST /api/intake/generate-sku — atomically reserve the next SKU for a team
// Body: { composerFullId, albumDigit? }
// Returns: { ok, skuRoot, seq }
app.post('/api/intake/generate-sku', async (req, res) => {
  const { composerFullId, albumDigit } = req.body
  if (!composerFullId) return res.json({ ok: false, error: 'composerFullId required' })
  try {
    const { skuRoot, seq } = await generateSku(
      composerFullId,
      albumDigit ?? CURRENT_ALBUM_DIGIT
    )
    res.json({ ok: true, skuRoot, seq })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// POST /api/intake/save-title — write a completed intake to the titles table
// Body: {
//   skuRoot, composerFullId, teamId?,
//   title, key?, bpm?, description?,
//   mood1Id?, mood2Id?, kslId?,
//   primaryGenreId?, secondaryGenreId?,
//   isJup?
// }
// Returns: { ok, skuRoot }
app.post('/api/intake/save-title', async (req, res) => {
  const {
    skuRoot, composerFullId, teamId,
    title, key, bpm, description,
    mood1Id, mood2Id, kslId,
    primaryGenreId, secondaryGenreId,
    isJup
  } = req.body

  if (!skuRoot)        return res.json({ ok: false, error: 'skuRoot required' })
  if (!title)          return res.json({ ok: false, error: 'title required' })
  if (!composerFullId) return res.json({ ok: false, error: 'composerFullId required' })

  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  try {
    // Guard: refuse to overwrite an existing title
    const existing = await pgPool.query(
      `SELECT 1 FROM titles WHERE sku_root = $1`, [skuRoot]
    )
    if (existing.rows.length > 0) {
      return res.json({ ok: false, error: `SKU ${skuRoot} already exists in titles` })
    }

    await pgPool.query(`
      INSERT INTO titles (
        sku_root, composer_id, team_id,
        title, key, bpm, description,
        mood_1_id, mood_2_id, ksl_id,
        primary_genre_id, secondary_genre_id,
        is_jup, created_at, updated_at
      ) VALUES (
        $1,  $2,  $3,
        $4,  $5,  $6,  $7,
        $8,  $9,  $10,
        $11, $12,
        $13, now(), now()
      )
    `, [
      skuRoot,              composerFullId,        teamId        || null,
      title,                key           || null, bpm           || null, description || null,
      mood1Id       || null, mood2Id      || null, kslId         || null,
      primaryGenreId || null, secondaryGenreId || null,
      isJup ?? false
    ])

    res.json({ ok: true, skuRoot })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// ─── Staged-file watcher ──────────────────────────────────────────────────
// Watches for composer DROP FOLDERS in staging (e.g. R13a_SongTitle_Cm/)
// and caches their metadata so Intake loads instantly from DB.

const IS_DROP_FOLDER = /^[A-Z]\d{2}[a-zA-Z]/i
const AUDIO_EXT      = /\.(wav|mp3|aiff?|flac|m4a)$/i

// Musical key regex — matches Ab, Bbm, C#, Dmaj, etc. (same as client-side KEY_RE)
const KEY_RE_SERVER = /^([A-Ga-g](?:sharp|flat|##?|bb?)?m?)$/i

function parseFolderDrop(folderName) {
  // Folder name format: {ComposerID}_{TitleWords}_{Key}[_tag...]
  // e.g. R13a_TensionRise_Cm  or  R63p_SkyWalker_Gmaj_COUNTRY
  // Search backwards for the musical key so trailing genre tags (COUNTRY, COMEDY, etc.)
  // don't get absorbed into the title or mistaken for the key.
  const parts      = folderName.split('_')
  const composerID = parts[0]
  const rest       = parts.slice(1)           // everything after composerID

  let keyIdx = -1
  for (let i = rest.length - 1; i >= 0; i--) {
    if (KEY_RE_SERVER.test(rest[i])) { keyIdx = i; break }
  }

  let key, titleParts
  if (keyIdx >= 0) {
    key        = rest[keyIdx]
    titleParts = rest.slice(0, keyIdx)
    // rest.slice(keyIdx + 1) = trailing genre tags — ignored (not part of title or key)
  } else {
    // No musical key found — fall back to old behaviour: last segment = key
    key        = rest[rest.length - 1] || null
    titleParts = rest.slice(0, rest.length - 1)
  }

  return {
    composer_id: composerID,
    title:       titleParts.join(' '),
    key:         key || null,
  }
}

async function processDrop(_pool, mm, dropPath, lotFolder) {
  const pool = pgPool  // always use current global pool, not the captured startup reference
  const folderName = path.basename(dropPath)
  if (!IS_DROP_FOLDER.test(folderName)) return

  // Wait a moment for all files to finish syncing
  await new Promise(r => setTimeout(r, 3000))
  if (!fs.existsSync(dropPath)) return

  let allFiles
  try { allFiles = fs.readdirSync(dropPath) } catch { return }
  const audioFiles = allFiles.filter(f => AUDIO_EXT.test(f))
  if (!audioFiles.length) return

  const parsed = parseFolderDrop(folderName)

  // Use the FULL file for tag scraping; fall back to first audio file
  const fullFile = audioFiles.find(f => /_FULL\./i.test(f)) || audioFiles[0]
  const fullPath = path.join(dropPath, fullFile)

  let bpm = null, key = parsed.key, duration_sec = null, album = null
  if (mm) {
    try {
      const meta = await mm.parseFile(fullPath, { duration: true, skipCovers: true })
      const c = meta.common
      bpm          = c.bpm || null
      key          = c.key || parsed.key
      duration_sec = meta.format.duration || null
      album        = c.album || null
    } catch {}
  }

  try {
    await pool.query(`
      INSERT INTO staged_files
        (filename, filepath, title, composer_id, version, key, bpm, duration_sec, album, raw_tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (filepath) DO UPDATE SET
        title        = EXCLUDED.title,
        key          = EXCLUDED.key,
        bpm          = EXCLUDED.bpm,
        duration_sec = EXCLUDED.duration_sec,
        album        = EXCLUDED.album,
        raw_tags     = EXCLUDED.raw_tags,
        status       = 'pending'
    `, [
      folderName, dropPath,
      parsed.title, parsed.composer_id, null,
      key, bpm, duration_sec, album,
      JSON.stringify({ audioFiles, lotFolder: lotFolder || null })
    ])
    console.log(`🎵 Staged drop: ${folderName} (${audioFiles.length} files)`)
  } catch (e) {
    console.warn(`⚠ Failed to stage drop ${folderName}:`, e.message)
  }
}

let _watcher = null

async function startStagingWatcher(pool) {
  const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
  let stagingDir = null
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    stagingDir = cfg.staging
  } catch {}
  if (!stagingDir || !fs.existsSync(stagingDir)) {
    console.log('⚠ Staging watcher: no staging folder configured, skipping')
    return
  }

  let mm = null
  try { mm = require('music-metadata') } catch {
    console.log('⚠ Staging watcher: music-metadata not installed — run: npm install music-metadata@7 chokidar@3')
  }
  let chokidar
  try { chokidar = require('chokidar') } catch {
    console.log('⚠ Staging watcher: chokidar not installed — run: npm install chokidar@3')
    return
  }

  if (_watcher) { try { _watcher.close() } catch {} }

  // Watch depth:2 to catch drops inside lot subfolders too
  _watcher = chokidar.watch(stagingDir, {
    persistent:      true,
    ignoreInitial:   true,   // don't re-process existing folders on startup
    depth:           2,
    ignored:         /(^|[\/\\])(\.|Icon\r|\.dropbox)/,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
  })

  _watcher.on('addDir', async dirPath => {
    if (dirPath === stagingDir) return
    const folderName = path.basename(dirPath)
    if (!IS_DROP_FOLDER.test(folderName)) return
    // Determine if inside a lot subfolder
    const parent = path.dirname(dirPath)
    const lotFolder = parent !== stagingDir ? path.basename(parent) : null
    await processDrop(pool, mm, dirPath, lotFolder)
  })

  console.log(`👁 Staging watcher started: ${stagingDir}`)
}

// ─── Staged-files API ──────────────────────────────────────────────────────
app.get('/api/staged-files', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  try {
    const r = await pgPool.query(
      `SELECT * FROM staged_files WHERE status='pending' ORDER BY arrived_at ASC`
    )
    res.json({ ok: true, files: r.rows })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.delete('/api/staged-files/:id', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  try {
    await pgPool.query(`DELETE FROM staged_files WHERE id=$1`, [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// Delete by filepath — fallback for drops that came from live disk scan (no id)
app.delete('/api/staged-files/by-path', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  const { path: filePath } = req.query
  if (!filePath) return res.json({ ok: false, error: 'path required' })
  try {
    await pgPool.query(`DELETE FROM staged_files WHERE filepath=$1`, [filePath])
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// Restart watcher when staging path changes
app.post('/api/cfg/server-paths', async (req, res, next) => {
  // handled by original route below — we just hook to restart watcher
  res.on('finish', () => { if (pgPool) startStagingWatcher(pgPool).catch(() => {}) })
  next()
})

// ─── Clients import ────────────────────────────────────────────────────────
app.post('/api/clients/import-csv', upload.single('file'), async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  if (!req.file) return res.json({ ok: false, error: 'No file provided' })

  try {
    // Ensure fm_pk has a unique constraint
    await pgPool.query(`ALTER TABLE clients ADD CONSTRAINT clients_fm_pk_unique UNIQUE (fm_pk)`).catch(() => {})

    const csv = fs.readFileSync(req.file.path, 'utf8')
    const lines = csv.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim())

    let inserted = 0
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')
      const obj = {}
      headers.forEach((h, idx) => { obj[h] = (parts[idx] || '').trim() })

      const { PK, CLIENT, CITY, State, Country, Contact } = obj
      if (!PK || !CLIENT) continue

      await pgPool.query(
        `INSERT INTO clients (fm_pk, name, city, state, country, contact, active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (fm_pk) DO NOTHING`,
        [PK, CLIENT, CITY || null, State || null, Country || null, Contact || null]
      )
      inserted++
    }

    fs.unlinkSync(req.file.path)
    res.json({ ok: true, count: inserted })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// ─── Schema migration: Add client_id to playlists, lots, projects ──────────
app.post('/api/db/migrate-client-ids', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  try {
    await pgPool.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`)
    await pgPool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`)
    await pgPool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`)
    res.json({ ok: true, message: 'Schema updated' })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const ifaces = os.networkInterfaces()
  let localIP  = 'localhost'
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIP = addr.address; break }
    }
    if (localIP !== 'localhost') break
  }
  console.log(`\n🎵 HAUS Workspace running`)
  console.log(`   Local:   http://localhost:${PORT}`)
  console.log(`   Network: http://${localIP}:${PORT}`)
  console.log(`\n   Share the Network URL with Kyle\n`)
})
