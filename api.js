// api.js — HAUS Workspace web server (the entrypoint; see package.json main/start)
// Run with: node api.js
// Then open http://localhost:9999 (or the Cloudflare tunnel, app.hausmusicplayer.com)

// Exit on an uncaught exception rather than logging and carrying on. A failed
// listen() (EADDRINUSE, when a second instance starts) used to be logged and then
// IGNORED: the process kept running, connected to Postgres, and started a SECOND
// staging watcher on the same Dropbox folder, so every drop was processed twice.
// A process that cannot serve should die so it is visibly gone.
process.on('uncaughtException', e => {
  console.error('uncaughtException:', e.message, e.stack)
  process.exit(1)
})
// Rejections stay non-fatal - one failed query should not kill the server - but
// they are logged with a stack so they are traceable.
process.on('unhandledRejection', e => {
  console.error('unhandledRejection:', e && e.stack ? e.stack : e)
})

require("dotenv").config()
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

// ✅ SECURITY: Load session secret from environment variable
const sessionSecret = process.env.SESSION_SECRET || 'haus-workspace-secret-2024'
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  WARNING: SESSION_SECRET not set; using fallback. Set SESSION_SECRET env var for production.')
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, secure: false } // httpOnly prevents JS access; set secure:true if HTTPS
}))

// Disable caching for all files
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  next()
})

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

// Auth guard — only these routes are public; everything else requires session authentication
const PUBLIC_ROUTES = [
  // Auth (needed before login)
  '/auth/login', '/pg/connect', '/pg/status',
  // Config (safe, no credentials)
  '/cfg/server-paths',
  // File ops (needed for file browser before login) — TODO: implement path validation
  '/fs/read-dir', '/fs/count-files', '/fs/path-exists', '/fs/read-file',
  '/fs/write-file', '/fs/folder-stats', '/fs/audio-status', '/fs/audio-meta', '/audio/stream',
  // Shell ops (safe ones only)
  '/shell/app-path', '/shell/home-dir', '/shell/show-in-finder', '/shell/open-external',
  // B2 (mostly audit/recovery operations)
  '/b2/stream', '/b2/authorize', '/b2/status', '/b2/rebuild-stem-keys', '/b2/audit', '/b2/quick-audit', '/b2/db-audit', '/b2/list-buckets', '/b2/get-song-lots'
]
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
    const req = https.request({ hostname, path: urlPath, method, headers: hdrs, rejectUnauthorized: true }, res => {
      if (isBuffer) {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      } else {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }) }
          catch { resolve({ status: res.statusCode, headers: res.headers, body: data }) }
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

const DEFAULT_NEON = 'postgresql://neondb_owner:npg_hiXWAOZ3C0gL@ep-floral-grass-au3l9sen-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

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

  // ksl had no constraints at all, so the INSERT ... ON CONFLICT (ksl_name) in
  // addIntakeTagNew failed every time -- new KSL tags appeared in the dropdown
  // for the session and were never persisted. rmo already had UNIQUE(rmo_name),
  // which is why that half worked. Applied by hand 2026-09-03 (2840 rows, no
  // duplicates); guarded here so a fresh database gets it too.
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ksl'::regclass AND conname = 'ksl_ksl_name_key'
        ) THEN
          ALTER TABLE ksl ADD CONSTRAINT ksl_ksl_name_key UNIQUE (ksl_name);
        END IF;
      END $$;
    `)
    console.log('✅ ksl unique constraint ready')
  } catch (e) { console.warn('[schema] ksl unique constraint:', e.message) }
}

// ─── Neon connection ───────────────────────────────────────────────────────
// Neon serverless computes may sleep after ~5 min of inactivity (30-60s cold start).
// We don't ping proactively — next query wakes compute if needed.

// Auto-connect to Neon on startup — tries saved config first, falls back to default
;(async () => {
  try {
    let connStr = DEFAULT_NEON
    const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      if (cfg.pgConn) connStr = cfg.pgConn
    }

    // Retry logic for initial connection (Neon can reset on cold start)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        pgPool = new Pool({
          connectionString: connStr,
          ssl: { rejectUnauthorized: false },
          keepAlive: true,
          connectionTimeoutMillis: 30000,
          idleTimeoutMillis: 0,
          socket: { timeout: 30000 }
        })
        pgPool.on('error', (err, client) => {
          console.error('[pool] error:', err.message)
        })
        pgPool.on('connect', () => {
          console.log('[pool] client connected')
        })
        pgPool.on('remove', () => {
          console.log('[pool] client removed')
        })
        await pgPool.query('SELECT 1')
        console.log('✅ PostgreSQL connected')
        await runServerMigrations(pgPool)
        await loadFolderTags()   // must precede the watcher — parseFolderDrop reads FOLDER_TAGS
        startStagingWatcher(pgPool).catch(e => console.warn('Watcher start failed:', e.message))
        break  // Success, exit retry loop
      } catch (e) {
        console.log(`⚠ PG auto-connect attempt ${attempt}/3 failed:`, e.message)
        if (pgPool) {
          pgPool.end().catch(() => {})
          pgPool = null
        }
        if (attempt < 3) {
          const delay = 2000 * attempt  // 2s, 4s, 6s
          console.log(`  Retrying in ${delay}ms…`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    if (!pgPool) {
      console.log('⚠ Could not connect to database. Use manual /api/pg/connect to retry.')
    }
  } catch (e) {
    console.error('💥 Startup auto-connect error:', e.message)
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
    const oldPool = pgPool
    pgPool = newPool

    // Async drain old pool in background (don't block reconnect)
    if (oldPool) {
      setTimeout(() => {
        oldPool.end().catch(e => console.warn('[pg] old pool drain error:', e.message))
      }, 5000)  // Give 5 seconds for existing queries to finish
    }
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

// ─── Create lot with folder ────────────────────────────────────────────────
app.post('/api/lot/create', async (req, res) => {
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

// ─── Download lot WAV files for AVID ───────────────────────────────────────
app.post('/api/lot/download-avid-wavs', async (req, res) => {
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

// ─── Shell routes ──────────────────────────────────────────────────────────
// ⚠️ SECURITY: /api/shell/exec moved to authenticated-only (removed from PUBLIC_ROUTES)
// Arbitrary shell execution is dangerous, even for authenticated users
app.post('/api/shell/exec', (req, res) => {
  const { cmd, cwd } = req.body
  // Now requires authentication; user must be logged in
  console.warn(`[security] shell/exec called by ${req.session?.user?.username || 'unknown'}: ${cmd.substring(0, 50)}...`)
  // TODO: Whitelist safe commands, don't allow arbitrary exec
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
const SERVER_PATH_KEYS = ['hausjup', 'staging', 'intake', 'finish', 'gmail', 'pgConn']

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
// ⚠️ SECURITY: /api/applescript moved to authenticated-only (removed from PUBLIC_ROUTES)
// Arbitrary AppleScript execution grants control over macOS — Daylite integration, etc.
app.post('/api/applescript', (req, res) => {
  const { script } = req.body
  // Now requires authentication; user must be logged in
  console.warn(`[security] applescript called by ${req.session?.user?.username || 'unknown'}: ${script.substring(0, 50)}...`)
  // TODO: Whitelist Daylite commands only, don't allow arbitrary AppleScript
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
        let localPath = bodyStr

        // If exact file doesn't exist, search for alternatives (FULL > ALT > STING > BUMPER)
        if (!fs.existsSync(localPath)) {
          const dir = path.dirname(localPath)
          const fileName = path.basename(localPath)
          const baseName = fileName.replace(/_(FULL|ALT|STING|BUMPER)\./i, '_')

          console.log(`[b2/stream] exact path not found: ${localPath}`)
          console.log(`[b2/stream] searching folder: ${dir} for alternatives to ${baseName}`)

          let foundFile = null
          try {
            const files = fs.readdirSync(dir)
            const audioFiles = files.filter(f => /\.(wav|mp3|aif|aiff)$/i.test(f))

            // Try to find FULL, ALT, STING, BUMPER versions in order
            for (const variant of ['_FULL', '_ALT', '_STING', '_BUMPER']) {
              const match = audioFiles.find(f => f.includes(variant))
              if (match) {
                foundFile = path.join(dir, match)
                console.log(`[b2/stream] found alternative: ${foundFile}`)
                break
              }
            }

            // Fall back to any audio file
            if (!foundFile && audioFiles.length) {
              foundFile = path.join(dir, audioFiles[0])
              console.log(`[b2/stream] using first audio file: ${foundFile}`)
            }
          } catch (e) {
            console.error(`[b2/stream] error searching folder: ${e.message}`)
          }

          if (!foundFile) {
            return res.status(404).json({ error: 'Local file and alternatives not found', path: localPath, folder: dir })
          }

          localPath = foundFile
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
        accountId:           b.accountId,
        authorizationToken:  b.authorizationToken,
        apiUrl:              b.apiInfo?.storageApi?.apiUrl      || b.apiUrl,
        downloadUrl:         b.apiInfo?.storageApi?.downloadUrl || b.downloadUrl
      }
      return res.json({ ok: true, downloadUrl: b2Auth.downloadUrl })
    }
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.get('/api/b2/status', (req, res) => {
  res.json({ connected: !!b2Auth })
})

app.post('/api/b2/get-song-lots', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'Not connected to database' })
  const { skus } = req.body
  if (!Array.isArray(skus) || skus.length === 0) {
    return res.json({ ok: false, error: 'skus must be a non-empty array' })
  }

  try {
    const client = await pgPool.connect()

    // Escape SKUs for SQL
    const skuList = skus.map(s => `'${s.replace(/'/g, "''")}'`).join(',')

    const result = await client.query(`
      SELECT t.sku_root, l.lot_name
      FROM titles t
      LEFT JOIN lot_titles lt ON lt.sku_root = t.sku_root
      LEFT JOIN lots l ON l.lot_id = lt.lot_id
      WHERE t.sku_root IN (${skuList})
      ORDER BY t.sku_root
    `)

    client.release()

    // Format results as object for easy lookup
    const songLots = {}
    result.rows.forEach(row => {
      songLots[row.sku_root] = row.lot_name || 'No Lot'
    })

    res.json({ ok: true, songLots })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
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

// FULL AUDIT: List all files from B2 with sizes, match to database metadata
app.get('/api/b2/full-audit', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected' })

  try {
    console.log('[b2/full-audit] Starting comprehensive B2 audit...')

    // Step 1: Get metadata map from database (single quick query)
    let metadataMap = {}
    if (pgPool) {
      try {
        const client = await pgPool.connect()
        const result = await client.query(`
          SELECT
            ms.b2_key,
            t.sku_root,
            t.title,
            t.composer_id
          FROM mix_stems ms
          LEFT JOIN titles t ON ms.sku_root = t.sku_root
          WHERE ms.b2_key IS NOT NULL AND ms.b2_key != ''
        `)
        client.release()

        result.rows.forEach(row => {
          metadataMap[row.b2_key] = {
            sku: row.sku_root,
            title: row.title,
            composer: row.composer_id
          }
        })
        console.log(`[b2/full-audit] Loaded metadata for ${Object.keys(metadataMap).length} files`)
      } catch (e) {
        console.warn('[b2/full-audit] Database query failed, continuing without metadata:', e.message)
      }
    }

    // Step 2: Get bucket ID (with timeout)
    console.log('[b2/full-audit] Looking up bucket ID...')
    let bucketId = null

    try {
      const apiHostname = b2Auth.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const bucketsPromise = _b2Request({
        method: 'GET',
        hostname: apiHostname,
        urlPath: `/b2api/v3/b2_list_buckets?accountId=${b2Auth.accountId}`,
        headers: { 'Authorization': b2Auth.authorizationToken }
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Bucket lookup timeout')), 10000)
      )

      const bucketsResult = await Promise.race([bucketsPromise, timeoutPromise])

      if (bucketsResult.status !== 200) {
        throw new Error(`B2 returned ${bucketsResult.status}: ${bucketsResult.body?.message}`)
      }

      const hausMusicBucket = (bucketsResult.body.buckets || []).find(b => b.bucketName === 'haus-music')
      if (!hausMusicBucket) {
        throw new Error('Bucket haus-music not found')
      }

      bucketId = hausMusicBucket.bucketId
      console.log(`[b2/full-audit] Found bucketId: ${bucketId}`)
    } catch (e) {
      console.warn(`[b2/full-audit] Bucket lookup failed: ${e.message}, using fallback...`)
      // If bucket lookup fails, we'll try list_file_names without specifying bucket
      // and parse the path prefix instead
    }

    if (!bucketId) {
      return res.json({ ok: false, error: 'Could not determine bucket ID. B2 API may be slow - try again in a moment.' })
    }

    // Step 3: List all files from B2
    console.log('[b2/full-audit] Fetching file listing from B2...')
    const stubs = []
    const realAudio = []
    let allB2Files = []
    let nextFileName = null
    let pageNum = 0

    while (true) {
      pageNum++
      const params = new URLSearchParams({
        bucketId: bucketId,
        maxFileCount: '10000'
      })
      if (nextFileName) params.append('startFileName', nextFileName)

      const apiHostname = b2Auth.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const listResult = await _b2Request({
        method: 'GET',
        hostname: apiHostname,
        urlPath: `/b2api/v3/b2_list_file_names?${params}`,
        headers: { 'Authorization': b2Auth.authorizationToken }
      })

      if (listResult.status !== 200) {
        console.error(`[b2/full-audit] B2 list failed: ${listResult.status}`, listResult.body)
        return res.json({ ok: false, error: `B2 list failed: ${listResult.body?.message || listResult.status}` })
      }

      const files = listResult.body.files || []
      console.log(`[b2/full-audit] Page ${pageNum}: Got ${files.length} files`)
      allB2Files = allB2Files.concat(files)

      nextFileName = listResult.body.nextFileName
      if (!nextFileName) break

      // Delay between pages
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`[b2/full-audit] Total B2 files: ${allB2Files.length}`)

    // Step 4: Classify files
    allB2Files.forEach(file => {
      const size = file.contentLength || 0
      const b2Key = file.fileName
      const meta = metadataMap[b2Key] || {}
      const collection = b2Key.includes('/') ? b2Key.split('/')[0].toUpperCase() : 'OTHER'

      if (size < 1048576 && size > 0) { // < 1MB
        stubs.push({
          b2_key: b2Key,
          sku: meta.sku || '',
          title: meta.title || '',
          composer: meta.composer || '',
          collection: collection,
          size: size
        })
      } else if (size >= 1048576) {
        realAudio.push({
          b2_key: b2Key,
          size: size
        })
      }
    })

    console.log(`[b2/full-audit] Complete: Real: ${realAudio.length}, Stubs: ${stubs.length}`)

    // Step 5: Save CSV
    const csvPath = path.join(os.homedir(), 'Desktop', 'B2_FULL_STUB_AUDIT.csv')
    const csvHeader = 'Composer ID,Song Title,SKU,Collection,File Size (bytes),B2 Path\n'
    const csvRows = stubs.map(s =>
      `"${s.composer || ''}","${s.title || ''}","${s.sku || ''}","${s.collection}",${s.size},"${s.b2_key}"`
    ).join('\n')
    fs.writeFileSync(csvPath, csvHeader + csvRows)
    console.log(`[b2/full-audit] CSV saved to ${csvPath}`)

    res.json({
      ok: true,
      audit: {
        totalB2Files: allB2Files.length,
        realAudio: realAudio.length,
        stubs: stubs.length,
        stubDetails: stubs.slice(0, 100),
        csvPath: csvPath,
        summary: {
          byCollection: Object.fromEntries(
            Object.entries(stubs.reduce((acc, s) => {
              acc[s.collection] = (acc[s.collection] || 0) + 1
              return acc
            }, {}))
          ),
          topComposers: Object.entries(
            stubs.reduce((acc, s) => {
              acc[s.composer] = (acc[s.composer] || 0) + 1
              return acc
            }, {})
          ).sort((a, b) => b[1] - a[1]).slice(0, 15)
        }
      }
    })
  } catch (e) {
    console.error('[b2/full-audit] Error:', e.message)
    res.json({ ok: false, error: e.message })
  }
})

// BATCH UPLOAD: Upload 800 fixable stubs from SHIPPING to B2
app.get('/api/b2/batch-upload-shipping', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected' })

  console.log('[b2/batch-upload-shipping] Starting batch upload...')

  try {
    const csvPath = path.join(os.homedir(), 'Documents/Claude/Projects/ATMOSPHERE/B2_FIXABLE_FROM_SHIPPING.csv')
    const shippingRoot = path.join(os.homedir(), 'Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping')

    if (!fs.existsSync(csvPath)) {
      return res.json({ ok: false, error: 'CSV not found' })
    }

    // Get bucket ID
    console.log('[b2/batch-upload-shipping] Looking up bucket ID...')
    const apiHostname = b2Auth.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const bucketsResult = await _b2Request({
      method: 'GET',
      hostname: apiHostname,
      urlPath: `/b2api/v3/b2_list_buckets?accountId=${b2Auth.accountId}`,
      headers: { 'Authorization': b2Auth.authorizationToken }
    })

    if (bucketsResult.status !== 200) {
      return res.json({ ok: false, error: `Failed to list buckets: ${bucketsResult.body?.message}` })
    }

    const hausMusicBucket = (bucketsResult.body.buckets || []).find(b => b.bucketName === 'haus-music')
    if (!hausMusicBucket) {
      return res.json({ ok: false, error: 'Bucket haus-music not found' })
    }

    const bucketId = hausMusicBucket.bucketId
    console.log(`[b2/batch-upload-shipping] Found bucketId: ${bucketId}`)

    const csvContent = fs.readFileSync(csvPath, 'utf8')
    const lines = csvContent.split('\n').filter(l => l.trim())

    const uploadQueue = []
    const skuVersionSeen = new Set()
    let uploadCount = 0
    let errorCount = 0

    // Parse CSV and build upload queue
    for (const line of lines) {
      // Extract fields between quotes: "field1","field2",...
      const fields = []
      let inQuote = false
      let currentField = ''
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuote = !inQuote
        } else if (char === ',' && !inQuote) {
          fields.push(currentField)
          currentField = ''
        } else {
          currentField += char
        }
      }
      fields.push(currentField)

      if (fields.length < 6) continue

      const sku = fields[2].trim()
      const b2Path = fields[5].trim()

      if (!sku || !b2Path) continue

      // Extract version from b2_key: HAUS_..._VERSION.ext
      const versionMatch = b2Path.match(/_([A-Z][A-Za-z0-9]*)\.(?:wav|mp3|aiff)$/i)
      const version = versionMatch ? versionMatch[1] : null
      if (!version) continue

      const key = `${sku}_${version}`
      if (skuVersionSeen.has(key)) continue
      skuVersionSeen.add(key)

      // Find source file in SHIPPING
      const shippingFolders = ['260708_TEXAS WIVES_3', '260729_TEXAS WIVES_6', 'CORRECTIONS', 'MIGRATE']
      let sourceFile = null

      for (const folder of shippingFolders) {
        const folderPath = path.join(shippingRoot, folder)
        if (!fs.existsSync(folderPath)) continue

        const entries = fs.readdirSync(folderPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith(sku)) {
            const skuPath = path.join(folderPath, entry.name)
            const files = fs.readdirSync(skuPath)
            const versionPattern = new RegExp(`_${version}\\.(wav|mp3|aiff)$`, 'i')
            const matchedFile = files.find(f => versionPattern.test(f))

            if (matchedFile) {
              sourceFile = path.join(skuPath, matchedFile)
              break
            }
          }
        }
        if (sourceFile) break
      }

      if (sourceFile) {
        uploadQueue.push({ sku, version, sourceFile, b2Path })
      }
    }

    console.log(`[b2/batch-upload-shipping] Found ${uploadQueue.length} files to upload`)

    // Upload in batches
    const batchSize = 10
    for (let i = 0; i < uploadQueue.length; i += batchSize) {
      const batch = uploadQueue.slice(i, i + batchSize)

      const promises = batch.map(async (item) => {
        try {
          const fileData = fs.readFileSync(item.sourceFile)

          // Use b2_get_upload_url to get the actual upload endpoint
          const urlRes = await _b2Request({
            method: 'POST',
            hostname: apiHostname,
            urlPath: '/b2api/v3/b2_get_upload_url',
            headers: { 'Authorization': b2Auth.authorizationToken },
            body: { bucketId: bucketId }
          })

          if (urlRes.status !== 200) {
            if (errorCount < 3) {
              console.log(`[b2/batch-upload-shipping] Upload URL failed: ${urlRes.status}`, urlRes.body?.message)
            }
            errorCount++
            return
          }

          const uploadUrl = urlRes.body.uploadUrl
          const uploadHostname = uploadUrl.replace(/^https?:\/\//, '').split('/')[0]
          const uploadPath = uploadUrl.replace(/^https?:\/\/[^/]+/, '')

          // Upload to the provided URL
          const uploadRes = await _b2Request({
            method: 'POST',
            hostname: uploadHostname,
            urlPath: uploadPath,
            headers: {
              'Authorization': urlRes.body.authorizationToken,
              'X-Bz-File-Name': item.b2Path,
              'X-Bz-Content-Type': 'application/octet-stream',
              'Content-Length': fileData.length
            },
            body: fileData,
            isBuffer: true
          })

          if (uploadRes.status === 200) {
            uploadCount++
          } else {
            if (errorCount < 3) {
              console.log(`[b2/batch-upload-shipping] Upload failed: ${uploadRes.status}`, uploadRes.body?.message)
            }
            errorCount++
          }
        } catch (e) {
          if (errorCount < 3) {
            console.log(`[b2/batch-upload-shipping] Error: ${e.message}`)
          }
          errorCount++
        }
      })

      await Promise.all(promises)

      console.log(`[b2/batch-upload-shipping] Batch ${Math.floor(i/batchSize)+1}: ${uploadCount} uploaded, ${errorCount} errors`)

      if (i + batchSize < uploadQueue.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    console.log(`[b2/batch-upload-shipping] Complete: ${uploadCount} uploaded, ${errorCount} errors`)
    res.json({
      ok: true,
      uploaded: uploadCount,
      errors: errorCount,
      total: uploadQueue.length
    })

  } catch (e) {
    console.error('[b2/batch-upload-shipping] Error:', e.message)
    res.write(`{"error":"${e.message}"}\n`)
    res.write(']}\n')
    res.end()
  }
})

// RECOVERY: Download real WAV files from old Dropbox, upload to B2 to fix stubs
// Processes composer-by-composer for manageable batches
app.get('/api/b2/recovery-from-dropbox', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected' })

  const dropboxToken = process.env.DROPBOX_OLD_TOKEN
  if (!dropboxToken) return res.json({ ok: false, error: 'DROPBOX_OLD_TOKEN not set' })

  console.log('[b2/recovery] Starting WAV file recovery from old Dropbox (composer-by-composer)...')

  try {
    const csvPath = path.join(os.homedir(), 'Documents/Claude/Projects/ATMOSPHERE/B2_FULL_STUB_AUDIT.csv')
    if (!fs.existsSync(csvPath)) {
      return res.json({ ok: false, error: 'Stub CSV not found' })
    }

    // Parse stubs to get unique composers and their SKUs
    const stubContent = fs.readFileSync(csvPath, 'utf8')
    const composerSkus = {} // { 'R13': [SKUs], 'R46': [SKUs], ... }

    for (const line of stubContent.split('\n')) {
      if (!line.trim()) continue
      const fields = []
      let inQuote = false, current = ''
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') inQuote = !inQuote
        else if (char === ',' && !inQuote) { fields.push(current); current = '' }
        else current += char
      }
      fields.push(current)

      if (fields.length >= 3) {
        const sku = fields[2].trim()
        if (sku && sku.length >= 3) {
          const composerId = sku.substring(0, 3) // R13, R46, S33, etc.
          if (!composerSkus[composerId]) composerSkus[composerId] = new Set()
          composerSkus[composerId].add(sku)
        }
      }
    }

    const composers = Object.keys(composerSkus).sort()
    console.log(`[b2/recovery] Found ${composers.length} composers with stubs to recover`)
    console.log(`[b2/recovery] Sample composers: ${composers.slice(0, 10).join(', ')}`)

    // List composer folders in old Dropbox
    console.log('[b2/recovery] Scanning old Dropbox ARCHIVE folders by composer...')

    let foundCount = 0
    let checkedComposers = 0
    let allFolders = []

    // Check each ARCHIVE collection (with number prefixes)
    const archiveCollections = ['1. ARCHIVE_Stratus', '2. ARCHIVE_Cumulus', '3. ARCHIVE_Cirrus', '4. ARCHIVE_Nimbus']

    for (const collection of archiveCollections) {
      try {
        const listRes = await _b2Request({
          method: 'POST',
          hostname: 'api.dropboxapi.com',
          urlPath: '/2/files/list_folder',
          headers: {
            'Authorization': `Bearer ${dropboxToken}`,
            'Content-Type': 'application/json'
          },
          body: { path: `/${collection}` }
        })

        if (listRes.status === 200 && listRes.body.entries) {
          console.log(`[b2/recovery]   ${collection}: ${listRes.body.entries.length} entries`)
          for (const entry of listRes.body.entries) {
            allFolders.push(`${entry.name} (${entry['.tag']})`)
            if (entry['.tag'] === 'folder' && entry.name) {
              // Extract composer ID from folder name (e.g., "R13_Christos Andreou_STRATUS" -> "R13")
              const match = entry.name.match(/^([A-Z]\d+)/)
              if (match) {
                const composerId = match[1]
                if (composerSkus[composerId]) {
                  foundCount++
                  checkedComposers++
                  if (checkedComposers <= 10) {
                    console.log(`[b2/recovery]     ✓ ${entry.name}`)
                  }
                }
              }
            }
          }
        } else {
          console.log(`[b2/recovery]   ${collection}: list returned ${listRes.status}`)
          console.log(`[b2/recovery]     Error: ${JSON.stringify(listRes.body)}`)
        }
      } catch (e) {
        console.log(`[b2/recovery] List error in ${collection}: ${e.message}`)
      }

      await new Promise(resolve => setTimeout(resolve, 200))
    }

    console.log(`[b2/recovery] Sample folders found: ${allFolders.slice(0, 5).join(', ')}`)

    console.log(`[b2/recovery] Found ${foundCount} composer folders in old Dropbox`)

    res.json({
      ok: true,
      status: 'recovery_ready',
      totalComposers: composers.length,
      foundInDropbox: foundCount,
      skusToRecover: Object.values(composerSkus).reduce((sum, set) => sum + set.size, 0),
      message: `Ready to recover ${Object.values(composerSkus).reduce((sum, set) => sum + set.size, 0)} WAV files from ${foundCount} composer folders`,
      nextStep: 'Call /api/b2/start-recovery to begin downloading and uploading files (runs in background)'
    })

  } catch (e) {
    console.error('[b2/recovery] Error:', e.message)
    res.json({ ok: false, error: e.message })
  }
})

// START RECOVERY: Download from old Dropbox, upload to B2 (runs in background)
app.get('/api/b2/start-recovery', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected' })

  const dropboxToken = process.env.DROPBOX_OLD_TOKEN
  if (!dropboxToken) return res.json({ ok: false, error: 'DROPBOX_OLD_TOKEN not set' })

  // Return immediately - recovery runs in background
  res.json({ ok: true, status: 'recovery_started', message: 'Download/upload started. Check server logs for progress.' })

  // Run recovery in background (no await)
  ;(async () => {
    console.log('\n' + '='.repeat(70))
    console.log('[RECOVERY] WAV File Recovery - Download from Old Dropbox, Upload to B2')
    console.log('='.repeat(70))

    try {
      const tmpDir = path.join(os.tmpdir(), 'haus-recovery')
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

      const archiveCollections = ['1. ARCHIVE_Stratus', '2. ARCHIVE_Cumulus', '3. ARCHIVE_Cirrus', '4. ARCHIVE_Nimbus']
      let uploadedCount = 0
      let errorCount = 0

      for (const collection of archiveCollections) {
        console.log(`\n[RECOVERY] Processing ${collection}...`)

        try {
          // List composer folders
          const listRes = await _b2Request({
            method: 'POST',
            hostname: 'api.dropboxapi.com',
            urlPath: '/2/files/list_folder',
            headers: {
              'Authorization': `Bearer ${dropboxToken}`,
              'Content-Type': 'application/json'
            },
            body: { path: `/${collection}` }
          })

          if (listRes.status !== 200 || !listRes.body.entries) {
            console.log(`[RECOVERY] Failed to list ${collection}`)
            continue
          }

          const composerFolders = listRes.body.entries.filter(e => e['.tag'] === 'folder')
          console.log(`[RECOVERY] Found ${composerFolders.length} composer folders`)

          // Process each composer
          for (const composer of composerFolders) {
            const composerPath = `/${collection}/${composer.name}`

            try {
              // List files in composer folder
              const filesRes = await _b2Request({
                method: 'POST',
                hostname: 'api.dropboxapi.com',
                urlPath: '/2/files/list_folder',
                headers: {
                  'Authorization': `Bearer ${dropboxToken}`,
                  'Content-Type': 'application/json'
                },
                body: { path: composerPath }
              })

              if (filesRes.status !== 200 || !filesRes.body.entries) continue

              // Find WAV files in subfolders
              const wavFiles = []
              for (const entry of filesRes.body.entries) {
                if (entry['.tag'] === 'folder') {
                  // List files in song folder
                  const songFilesRes = await _b2Request({
                    method: 'POST',
                    hostname: 'api.dropboxapi.com',
                    urlPath: '/2/files/list_folder',
                    headers: {
                      'Authorization': `Bearer ${dropboxToken}`,
                      'Content-Type': 'application/json'
                    },
                    body: { path: entry.path_display }
                  })

                  if (songFilesRes.status === 200 && songFilesRes.body.entries) {
                    for (const file of songFilesRes.body.entries) {
                      if (file.name && file.name.endsWith('.wav')) {
                        wavFiles.push(file)
                      }
                    }
                  }
                }
              }

              if (wavFiles.length === 0) continue

              console.log(`[RECOVERY]   ${composer.name}: ${wavFiles.length} WAV files`)

              // Download and upload each WAV file
              for (const wavFile of wavFiles) {
                try {
                  // Download from Dropbox
                  const dlRes = await _b2Request({
                    method: 'POST',
                    hostname: 'content.dropboxapi.com',
                    urlPath: '/2/files/download',
                    headers: {
                      'Authorization': `Bearer ${dropboxToken}`,
                      'Dropbox-API-Arg': JSON.stringify({ path: wavFile.path_display })
                    }
                  })

                  if (dlRes.status !== 200) {
                    errorCount++
                    continue
                  }

                  // Save locally
                  const localPath = path.join(tmpDir, wavFile.name)
                  fs.writeFileSync(localPath, dlRes.body)

                  // Upload to B2
                  const uploadUrl = `${collection}/${composer.name}/${wavFile.name}`

                  const urlRes = await _b2Request({
                    method: 'POST',
                    hostname: b2Auth.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''),
                    urlPath: '/b2api/v3/b2_get_upload_url',
                    headers: { 'Authorization': b2Auth.authorizationToken },
                    body: { bucketId: b2Auth.allowed?.bucketId }
                  })

                  if (urlRes.status === 200) {
                    const uploadUrlStr = urlRes.body.uploadUrl
                    const uploadHostname = uploadUrlStr.replace(/^https?:\/\//, '').split('/')[0]
                    const uploadPath = uploadUrlStr.replace(/^https?:\/\/[^/]+/, '')
                    const fileData = fs.readFileSync(localPath)

                    const uploadRes = await _b2Request({
                      method: 'POST',
                      hostname: uploadHostname,
                      urlPath: uploadPath,
                      headers: {
                        'Authorization': urlRes.body.authorizationToken,
                        'X-Bz-File-Name': uploadUrl,
                        'X-Bz-Content-Type': 'application/octet-stream',
                        'Content-Length': fileData.length
                      },
                      body: fileData,
                      isBuffer: true
                    })

                    if (uploadRes.status === 200) {
                      uploadedCount++
                    } else {
                      errorCount++
                    }
                  }

                  // Clean up
                  try { fs.unlinkSync(localPath) } catch (e) {}
                } catch (e) {
                  errorCount++
                }
              }
            } catch (e) {
              console.log(`[RECOVERY]   Error processing ${composer.name}: ${e.message}`)
            }

            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } catch (e) {
          console.log(`[RECOVERY] Error with ${collection}: ${e.message}`)
        }
      }

      console.log('\n' + '='.repeat(70))
      console.log(`[RECOVERY] COMPLETE: ${uploadedCount} uploaded, ${errorCount} errors`)
      console.log('='.repeat(70) + '\n')
    } catch (e) {
      console.error('[RECOVERY] Fatal error:', e.message)
    }
  })()
})

// ─── B2 Missing Files Checker API ──────────────────────────────────────────
app.get('/api/b2/inventory', (req, res) => {
  try {
    const fs = require('fs')
    const path = require('path')

    // Try multiple possible locations for the inventory file
    const possiblePaths = [
      path.join(__dirname, 'b2-all-collections-inventory-2026-08-25T08-27-53.json'),
      path.join(__dirname, 'b2-all-collections-inventory-2026-08-25T08-27-53.json'),
      // Fallback to any b2-all-collections-inventory file
      ...(() => {
        try {
          const files = fs.readdirSync(__dirname)
            .filter(f => f.startsWith('b2-all-collections-inventory') && f.endsWith('.json'))
            .sort()
            .reverse()
            .map(f => path.join(__dirname, f))
          return files
        } catch { return [] }
      })()
    ]

    let inventoryFile = null
    for (const filePath of possiblePaths) {
      try {
        if (fs.existsSync(filePath)) {
          inventoryFile = filePath
          break
        }
      } catch { }
    }

    if (!inventoryFile) {
      throw new Error(`No inventory file found. Checked: ${possiblePaths.join(', ')}`)
    }

    console.log(`[B2Inventory] Loading from ${inventoryFile}`)
    const fileContent = fs.readFileSync(inventoryFile, 'utf8')
    const data = JSON.parse(fileContent)

    // Validate structure
    if (!data.collections || !Array.isArray(data.collections)) {
      throw new Error(`Invalid JSON structure: collections is not an array`)
    }

    // Extract just the filenames for matching
    const filenames = []
    for (const collection of data.collections || []) {
      for (const folder of collection.folders || []) {
        // Add audio files
        for (const audio of folder.audioFiles || []) {
          filenames.push(audio.name)
        }

        // Add stub files too (for completeness)
        for (const stub of folder.stubFiles || []) {
          filenames.push(stub.name)
        }
      }
    }

    console.log(`[B2Inventory] Serving ${filenames.length} files from ${path.basename(inventoryFile)}`)

    // Double-check response format before sending
    if (!Array.isArray(filenames)) {
      throw new Error(`Invalid filenames array construction`)
    }

    res.json({ filenames })
  } catch (error) {
    console.error('[B2Inventory] Error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// DATABASE AUDIT: Query mix_stems for all b2_keys and check file sizes in B2
app.get('/api/b2/db-audit', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected' })

  try {
    const client = await pgPool.connect()
    // Get ALL b2_keys to get total count
    const countResult = await client.query(`SELECT COUNT(*) as cnt FROM mix_stems WHERE b2_key IS NOT NULL AND b2_key != ''`)
    const totalCount = parseInt(countResult.rows[0].cnt)

    // Sample strategy: first 1000 + random sample of remaining
    const sampleSize = Math.min(2000, totalCount)
    const result = await client.query(`
      SELECT b2_key FROM mix_stems
      WHERE b2_key IS NOT NULL AND b2_key != ''
      ORDER BY RANDOM()
      LIMIT $1
    `, [sampleSize])
    client.release()

    const files = result.rows
    console.log(`[b2/db-audit] Found ${files.length} files in mix_stems table`)

    const realAudio = []
    const stubs = []
    const errors = []

    // Check each file's size in B2 using HEAD request
    let checked = 0
    for (const file of files) {
      try {
        // URL-encode the path
        const encodedPath = `/file/haus-music/${file.b2_key.split('/').map(p => encodeURIComponent(p)).join('/')}`
        const headResult = await _b2Request({
          method: 'HEAD', hostname: b2Auth.downloadUrl.replace(/^https?:\/\//, ''),
          urlPath: encodedPath,
          headers: { 'Authorization': b2Auth.authorizationToken }
        })

        // Get size from response headers
        const size = headResult.headers?.['content-length']
          ? parseInt(headResult.headers['content-length'])
          : (headResult.body?.['content-length'] ? parseInt(headResult.body['content-length']) : 0)

        if (checked < 5) {
          console.log(`[b2/db-audit] File ${checked}: ${file.b2_key.substring(0, 50)}... status=${headResult.status} size=${size}`)
        }
        checked++

        if (size < 1000 && size > 0) {
          stubs.push({ name: file.b2_key, size })
        } else if (size >= 1000000) {
          realAudio.push({ name: file.b2_key, size })
        }
      } catch (e) {
        if (errors.length < 10) {
          console.log(`[b2/db-audit] Error checking ${file.b2_key}: ${e.message}`)
          errors.push({ b2_key: file.b2_key, error: e.message })
        }
      }
    }
    console.log(`[b2/db-audit] Checked ${checked} files. Real: ${realAudio.length}, Stubs: ${stubs.length}, Errors: ${errors.length}`)

    // Extrapolate results from sample to total
    const avgRealAudioPercent = files.length > 0 ? (realAudio.length / files.length) : 0
    const avgStubPercent = files.length > 0 ? (stubs.length / files.length) : 0
    const estimatedRealAudio = Math.round(totalCount * avgRealAudioPercent)
    const estimatedStubs = Math.round(totalCount * avgStubPercent)

    res.json({
      ok: true,
      audit: {
        totalTracked: totalCount,
        sampledFiles: files.length,
        realAudio: {
          count: realAudio.length,
          estimatedCount: estimatedRealAudio,
          totalSize: realAudio.reduce((s, f) => s + f.size, 0),
          avgSize: realAudio.length > 0 ? Math.round(realAudio.reduce((s, f) => s + f.size, 0) / realAudio.length) : 0,
          examples: realAudio.slice(0, 5)
        },
        stubs: {
          count: stubs.length,
          estimatedCount: estimatedStubs,
          totalSize: stubs.reduce((s, f) => s + f.size, 0),
          details: stubs.slice(0, 50)
        },
        errors: errors.slice(0, 20)
      }
    })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// QUICK AUDIT: Check if B2 is authorized, then audit if it is
app.get('/api/b2/quick-audit', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected. Click "Connect B2" in the app first.' })

  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    console.log('[b2/quick-audit] apiUrl:', b2Auth.apiUrl)
    console.log('[b2/quick-audit] apiHost:', apiHost)

    // Get buckets to find haus-music
    const bucketsParams = new URLSearchParams({ accountId: b2Auth.accountId })
    const bucketsResult = await _b2Request({
      method: 'GET', hostname: apiHost, urlPath: `/b2api/v3/b2_list_buckets?${bucketsParams}`,
      headers: { 'Authorization': b2Auth.authorizationToken }
    })

    console.log('[b2/quick-audit] bucketsResult status:', bucketsResult.status)
    console.log('[b2/quick-audit] bucketsResult body:', JSON.stringify(bucketsResult.body))

    if (bucketsResult.status !== 200) {
      return res.json({ ok: false, error: bucketsResult.body?.message || `HTTP ${bucketsResult.status}: ${JSON.stringify(bucketsResult.body)}` })
    }

    const hausBucket = bucketsResult.body.buckets.find(b => b.bucketName === 'haus-music')
    if (!hausBucket) {
      return res.json({ ok: false, error: 'haus-music bucket not found' })
    }

    // Now fetch from the audit endpoint internally
    const bucketId = hausBucket.bucketId
    const allFiles = []
    let startFileName = null
    let startFileId = null

    // Paginate through all file versions
    while (true) {
      const params = new URLSearchParams({ bucketId, maxFileCount: 10000 })
      if (startFileName) params.set('startFileName', startFileName)
      if (startFileId) params.set('startFileId', startFileId)

      const result = await _b2Request({
        method: 'GET', hostname: apiHost,
        urlPath: `/b2api/v3/b2_list_file_versions?${params}`,
        headers: { 'Authorization': b2Auth.authorizationToken }
      })

      if (result.status !== 200) {
        return res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
      }

      // Only count latest version (hide=false or action=upload)
      const latestFiles = (result.body.files || []).filter(f => !f.action || f.action === 'upload')
      allFiles.push(...latestFiles)

      if (!result.body.nextFileName) break
      startFileName = result.body.nextFileName
      startFileId = result.body.nextFileId || null
    }

    // Categorize by size
    const stubs = allFiles.filter(f => f.size < 1000)
    const realAudio = allFiles.filter(f => f.size >= 1000000)
    const other = allFiles.filter(f => f.size >= 1000 && f.size < 1000000)

    // List stub files for inspection
    const stubDetails = stubs.map(f => ({
      name: f.fileName,
      size: f.size,
      uploadTime: f.uploadTimestamp
    }))

    res.json({
      ok: true,
      audit: {
        totalFiles: allFiles.length,
        realAudio: {
          count: realAudio.length,
          totalSize: realAudio.reduce((s, f) => s + f.size, 0),
          avgSize: realAudio.length > 0 ? Math.round(realAudio.reduce((s, f) => s + f.size, 0) / realAudio.length) : 0
        },
        stubs: {
          count: stubs.length,
          totalSize: stubs.reduce((s, f) => s + f.size, 0),
          details: stubDetails.slice(0, 100) // First 100 stubs for inspection
        },
        other: {
          count: other.length,
          totalSize: other.reduce((s, f) => s + f.size, 0)
        }
      }
    })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// AUDIT: List all files with sizes to detect stubs vs real audio
app.get('/api/b2/audit', async (req, res) => {
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { bucketId } = req.query
  if (!bucketId) return res.json({ ok: false, error: 'bucketId required' })

  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const allFiles = []
    let startFileName = null
    let startFileId = null

    // Paginate through all file versions
    while (true) {
      const params = new URLSearchParams({ bucketId, maxFileCount: 10000 })
      if (startFileName) params.set('startFileName', startFileName)
      if (startFileId) params.set('startFileId', startFileId)

      const result = await _b2Request({
        method: 'GET', hostname: apiHost,
        urlPath: `/b2api/v3/b2_list_file_versions?${params}`,
        headers: { 'Authorization': b2Auth.authorizationToken }
      })

      if (result.status !== 200) {
        return res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
      }

      // Only count latest version (hide=false)
      const latestFiles = (result.body.files || []).filter(f => !f.action || f.action === 'upload')
      allFiles.push(...latestFiles)

      if (!result.body.nextFileName) break
      startFileName = result.body.nextFileName
      startFileId = result.body.nextFileId || null
    }

    // Categorize by size
    const stubs = allFiles.filter(f => f.size < 1000)
    const realAudio = allFiles.filter(f => f.size >= 1000000)
    const other = allFiles.filter(f => f.size >= 1000 && f.size < 1000000)

    // List stub files for inspection
    const stubDetails = stubs.map(f => ({
      name: f.fileName,
      size: f.size,
      uploadTime: f.uploadTimestamp
    }))

    res.json({
      ok: true,
      audit: {
        totalFiles: allFiles.length,
        realAudio: {
          count: realAudio.length,
          totalSize: realAudio.reduce((s, f) => s + f.size, 0),
          avgSize: realAudio.length > 0 ? Math.round(realAudio.reduce((s, f) => s + f.size, 0) / realAudio.length) : 0
        },
        stubs: {
          count: stubs.length,
          totalSize: stubs.reduce((s, f) => s + f.size, 0),
          details: stubDetails.slice(0, 100) // First 100 stubs for inspection
        },
        other: {
          count: other.length,
          totalSize: other.reduce((s, f) => s + f.size, 0)
        }
      }
    })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
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
  const { uploadUrl, uploadAuthToken, b2FileName, mimeType, filePath } = req.body
  const tempPath = req.file?.path
  // Two shapes: a multipart upload (browser drag-and-drop) leaves a temp file,
  // or an absolute path (intake) which we read in place -- the audio is already
  // on this machine, so there is no reason to push it through the browser.
  let sourcePath = tempPath
  if (!sourcePath && filePath) {
    if (!path.isAbsolute(filePath)) return res.json({ ok: false, error: 'filePath must be absolute' })
    if (!fs.existsSync(filePath))   return res.json({ ok: false, error: `file not found: ${filePath}` })
    sourcePath = filePath
  }
  if (!sourcePath) return res.json({ ok: false, error: 'No file received' })
  try {
    const fileBuffer = fs.readFileSync(sourcePath)
    // Refuse implausibly small audio. This is the check that would have caught
    // the path-as-payload bug on the first upload instead of after the fact.
    if (/\.(wav|mp3|aif|aiff)$/i.test(b2FileName || '') && fileBuffer.length < 1024) {
      if (tempPath) { try { fs.unlinkSync(tempPath) } catch {} }
      return res.json({ ok: false, error: `refusing to upload ${fileBuffer.length}-byte audio file (${b2FileName}) — source looks empty or is a placeholder` })
    }
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
    if (tempPath) { try { fs.unlinkSync(tempPath) } catch {} }
    const parsed = JSON.parse(result.body.toString())
    if (result.status === 200) {
      const downloadUrl = `${b2Auth.downloadUrl}/file/${parsed.bucketName}/${parsed.fileName}`
      return res.json({ ok: true, fileId: parsed.fileId, fileName: parsed.fileName, downloadUrl })
    }
    res.json({ ok: false, error: parsed?.message || `HTTP ${result.status}` })
  } catch (e) {
    if (tempPath) { try { fs.unlinkSync(tempPath) } catch {} }
    res.json({ ok: false, error: e.message })
  }
})

// --- B2 verification -------------------------------------------------------
// Nothing here has ever checked that what mix_stems claims is in B2 actually is.
// That is how intake could store ~130 bytes of file path instead of audio for
// weeks unnoticed: the player streams from the LOCAL disk (audioUrl ->
// /api/audio/stream), never from B2.
//   ok / stub (present but <1KB) / missing (row has a key, bucket has nothing)
app.get('/api/b2/verify', async (req, res) => {
  if (!b2Auth)  return res.json({ ok: false, error: 'B2 not authorized' })
  if (!pgPool)  return res.json({ ok: false, error: 'DB not connected' })
  const bucketId = req.query.bucketId
  if (!bucketId) return res.json({ ok: false, error: 'bucketId required' })
  const since  = req.query.since  || null
  const prefix = req.query.prefix || ''
  const STUB_LIMIT = 1024
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const sizes = new Map()
    let startFileName = null, pages = 0
    do {
      const params = new URLSearchParams({ bucketId, maxFileCount: '10000' })
      if (prefix)        params.set('prefix', prefix)
      if (startFileName) params.set('startFileName', startFileName)
      const r = await _b2Request({
        method: 'GET', hostname: apiHost,
        urlPath: `/b2api/v3/b2_list_file_names?${params}`,
        headers: { 'Authorization': b2Auth.authorizationToken }
      })
      const body = JSON.parse(r.body.toString())
      if (r.status !== 200) return res.json({ ok: false, error: body?.message || `list failed HTTP ${r.status}` })
      for (const f of body.files || []) sizes.set(f.fileName, f.contentLength)
      startFileName = body.nextFileName
      pages++
    } while (startFileName && pages < 100)

    const q = since
      ? `SELECT m.sku_root, m.filename, m.b2_key, t.title
           FROM mix_stems m JOIN titles t ON t.sku_root = m.sku_root
          WHERE m.b2_key IS NOT NULL AND t.created_at >= $1`
      : `SELECT m.sku_root, m.filename, m.b2_key, t.title
           FROM mix_stems m JOIN titles t ON t.sku_root = m.sku_root
          WHERE m.b2_key IS NOT NULL`
    const rows = (await pgPool.query(q, since ? [since] : [])).rows

    const bad = []
    let ok = 0, stub = 0, missing = 0
    for (const row of rows) {
      const size = sizes.get(row.b2_key)
      if (size === undefined)     { missing++; bad.push({ ...row, problem: 'missing', b2_size: null }) }
      else if (size < STUB_LIMIT) { stub++;    bad.push({ ...row, problem: 'stub',    b2_size: size }) }
      else ok++
    }

    const report = { generated: new Date().toISOString(), bucketId, prefix, since,
                     b2_objects_listed: sizes.size, rows_checked: rows.length, ok, stub, missing, bad }
    let reportPath = null
    try {
      reportPath = path.join(__dirname, `b2-verify-${Date.now()}.json`)
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    } catch (e) { console.warn('[b2-verify] could not write report:', e.message) }

    console.log(`[b2-verify] ${ok} ok, ${stub} stub, ${missing} missing (of ${rows.length} rows, ${sizes.size} objects)`)
    res.json({ ok: true, b2_objects_listed: sizes.size, rows_checked: rows.length,
               counts: { ok, stub, missing }, reportPath, sample: bad.slice(0, 200) })
  } catch (e) {
    console.error('[b2-verify] error:', e.message)
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

// ─── B2 Rebuild Stem Keys (server-side) ───────────────────────────────────
app.post('/api/b2/rebuild-stem-keys', async (req, res) => {
  if (!b2Auth) return res.status(503).json({ error: 'B2 not authorized' })

  let client = null
  try {
    // Create pooled connection for rebuild (pooler is better for concurrent connections)
    const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
    let connStr = process.env.DATABASE_URL
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      if (cfg.pgConn) connStr = cfg.pgConn
    }
    if (!connStr) throw new Error('No database connection string found')

    const { Client } = require('pg')
    console.log('[b2-rebuild] Using connection string:', connStr.slice(0, 50) + '...')
    client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
    await client.connect()
    console.log('[b2-rebuild] Connected via pooled client')

    const BATCH_SIZE = 100
    let scanned = 0, updated = 0, errors = 0
    let startFileName = null

    console.log('[b2-rebuild] Starting scan of haus-music bucket…')
    res.setHeader('Content-Type', 'application/json')
    res.write('{"status":"Scanning B2 for audio files…","progress":0}\n')

    // Paginate through all files in bucket
    while (true) {
      const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
      // Get bucket ID from request or use hardcoded (should match your bucket)
      const bucketId = req.body.bucketId || '707a97f6e032b16c9be50d1a'
      const urlPath = `/b2api/v3/b2_list_file_versions?bucketId=${encodeURIComponent(bucketId)}&maxFileCount=10000${startFileName ? `&startFileName=${encodeURIComponent(startFileName)}` : ''}`

      const result = await _b2Request({
        method: 'GET',
        hostname: apiHost,
        urlPath,
        headers: { 'Authorization': b2Auth.authorizationToken }
      })

      if (result.status !== 200) {
        console.error('[b2-rebuild] B2 list error:', result.status, result.body)
        if (client) client.release()
        return res.json({ ok: false, error: `B2 API error: ${result.status}` })
      }

      const files = result.body.files || []
      if (!files.length) break

      // Process files in batches
      const batch = []
      for (const f of files) {
        if (!/\.(wav|mp3|aif|aiff)$/i.test(f.fileName)) continue
        const fileName = f.fileName.split('/').pop()
        if (!/^HAUS_/i.test(fileName)) continue

        scanned++
        batch.push({ b2Key: f.fileName, fileName })

        if (batch.length >= BATCH_SIZE) {
          const updateCount = await updateMixStemsBatch(client, batch)
          updated += updateCount
          batch.length = 0
          res.write(`{"status":"Processed ${scanned} files, updated ${updated}…","progress":${Math.min(100, Math.round(scanned / 100))}}\n`)
        }
      }

      // Process remaining batch
      if (batch.length) {
        const updateCount = await updateMixStemsBatch(client, batch)
        updated += updateCount
      }

      // Check for next page
      startFileName = result.body.nextFileName
      if (!startFileName) break
    }

    console.log(`[b2-rebuild] Complete: scanned ${scanned}, updated ${updated}`)
    res.write(`{"ok":true,"scanned":${scanned},"updated":${updated},"errors":${errors}}\n`)
    res.end()
  } catch (e) {
    console.error('[b2-rebuild] error:', e.message)
    res.json({ ok: false, error: e.message })
  } finally {
    if (client) {
      try {
        await client.end()
      } catch (e) {
        console.error('[b2-rebuild] client close error:', e.message)
      }
    }
  }
})

async function updateMixStemsBatch(pool, batch, retries = 3) {
  if (!batch.length) return 0

  let updated = 0
  // Update one file at a time to avoid overwhelming Neon pool
  for (const item of batch) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await pool.query(
          `UPDATE mix_stems SET b2_key = $1 WHERE filename = $2 AND b2_key IS NULL RETURNING mix_stem_id`,
          [item.b2Key, item.fileName]
        )
        if (result.rowCount) updated++
        break  // Success, move to next file
      } catch (e) {
        if (attempt < retries) {
          const delay = 500 * attempt
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          // After retries fail, skip this file and continue
          console.error(`[b2-rebuild] failed to update ${item.fileName}: ${e.message}`)
        }
      }
    }
  }
  return updated
}

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
// Accepts C, Cm, Csharp, Cb and the spelled forms Cmaj / Eminor / Fmin, which the
// previous pattern missed — those segments fell through and polluted the title.
const KEY_RE_SERVER = /^([A-Ga-g](?:sharp|flat|##?|bb?)?(?:m|min|minor|maj|major)?)$/i

// Known genre/collection tags, loaded from the folder_tags table. Folder names put
// tags on either side of the key (R48a_AGAVE FEVER_TEX_DESERT_D as well as
// R48a_TITLE_D_HEARTLAND), so position alone cannot separate tag from title.
let FOLDER_TAGS = new Set()
async function loadFolderTags() {
  if (!pgPool) return
  try {
    const r = await pgPool.query('SELECT tag FROM folder_tags')
    FOLDER_TAGS = new Set(r.rows.map(x => String(x.tag).trim().toUpperCase()))
    console.log(`[tags] loaded ${FOLDER_TAGS.size} folder tags`)
  } catch (e) {
    console.warn('[tags] could not load folder_tags:', e.message)
  }
}

function parseFolderDrop(folderName) {
  // Folder name format: {ComposerID}_{TitleWords}_{Key}[_tag...]
  // e.g. R13a_TensionRise_Cm  or  R63p_SkyWalker_Gmaj_COUNTRY
  // Search backwards for the musical key so trailing genre tags (COUNTRY, COMEDY, etc.)
  // don't get absorbed into the title or mistaken for the key.
  const parts      = folderName.split('_')
  const composerID = parts[0]
  const rest       = parts.slice(1)           // everything after composerID

  // Classify every segment independently instead of by position. Taking
  // rest.slice(0, keyIdx) as the title absorbed any tag that appeared BEFORE the
  // key, e.g. R48a_AMERICAN MADE_HEARTLAND_Bb -> "AMERICAN MADE HEARTLAND".
  // A segment is the key if it matches KEY_RE_SERVER, a tag if it is in
  // folder_tags, otherwise part of the title. Unknown segments fall through to
  // the title deliberately: a visible extra word is recoverable, a silently
  // truncated title is not.
  let key = null
  const titleParts = [], tagParts = []
  for (const raw of rest) {
    const seg = String(raw).trim()
    if (!seg) continue
    if (!key && KEY_RE_SERVER.test(seg)) { key = seg; continue }
    if (FOLDER_TAGS.has(seg.toUpperCase())) { tagParts.push(seg); continue }
    titleParts.push(seg)
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
    ignored:         /(^|[\/\\])(\.|Icon\r|\.dropbox|_deleted)/,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
  })

  _watcher.on('addDir', async dirPath => {
    if (dirPath === stagingDir) return
    const folderName = path.basename(dirPath)
    if (!IS_DROP_FOLDER.test(folderName)) return
    // Determine if inside a lot subfolder
    const parent = path.dirname(dirPath)
    const lotFolder = parent !== stagingDir ? path.basename(parent) : null
    // Read the live pool, never the one captured when the watcher started.
    // reconnectPg() swaps pgPool and ends the old one 5s later, so a captured
    // reference goes dead on the first reconnect and every drop after that
    // fails with "Cannot use a pool after calling end on the pool" -- silently,
    // in the addDir case, which meant new drops stopped being staged at all.
    if (!pgPool) { console.warn('[staging] no pg pool, skipping drop:', folderName); return }
    await processDrop(pgPool, mm, dirPath, lotFolder)
  })

  // Removal is the other half. Without this the table only ever grows and the
  // intake sidebar accumulates every folder that has ever passed through.
  _watcher.on('unlinkDir', async dirPath => {
    if (dirPath === stagingDir) return
    if (!IS_DROP_FOLDER.test(path.basename(dirPath))) return
    if (!pgPool) return
    try {
      const r = await pgPool.query(
        `UPDATE staged_files SET status='gone' WHERE filepath=$1 AND status='pending'`, [dirPath])
      if (r.rowCount) console.log(`[staging] ${path.basename(dirPath)} left staging - row retired`)
    } catch (e) { console.warn('[staging] unlinkDir update failed:', e.message) }
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
    // Reconcile against disk. The watcher is add-only (chokidar addDir), so a
    // folder that left staging -- archived after intake, or moved by hand --
    // leaves its row 'pending' forever and the intake sidebar keeps showing it.
    // Anything whose filepath no longer exists is a ghost: retire it here so
    // the list is always what is actually sitting in staging right now.
    const live = [], ghosts = []
    for (const row of r.rows) {
      let exists = false
      try { exists = !!row.filepath && fs.existsSync(row.filepath) } catch { exists = false }
      if (exists) live.push(row); else ghosts.push(row.id)
    }
    if (ghosts.length) {
      try {
        await pgPool.query(
          `UPDATE staged_files SET status='gone' WHERE id = ANY($1::int[])`, [ghosts])
        console.log(`[staging] retired ${ghosts.length} stale staged_files row(s) (folder no longer on disk)`)
      } catch (e) { console.warn('[staging] could not retire stale rows:', e.message) }
    }
    res.json({ ok: true, files: live, retired: ghosts.length })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.delete('/api/staged-files/:id', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  try {
    // Soft delete: mark imported rather than removing the row, so staging history
    // survives and a failed cleanup is diagnosable. The listing endpoint filters
    // status='pending', so the effect for the UI is identical.
    const r = await pgPool.query(
      `UPDATE staged_files SET status='imported' WHERE id=$1`, [req.params.id])
    res.json({ ok: true, updated: r.rowCount })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// Delete by filepath — fallback for drops that came from live disk scan (no id)
app.delete('/api/staged-files/by-path', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  const { path: filePath } = req.query
  if (!filePath) return res.json({ ok: false, error: 'path required' })
  try {
    // Soft delete — see the :id handler above.
    const r = await pgPool.query(
      `UPDATE staged_files SET status='imported' WHERE filepath=$1`, [filePath])
    res.json({ ok: true, updated: r.rowCount })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// GET /api/intake/metadata — fetch all metadata for intake form (genres, moods, composers, etc.)
app.get('/api/intake/metadata', async (req, res) => {
  if (!pgPool) return res.status(503).json({ error: 'Database not connected' })

  try {
    // Fetch all metadata in parallel
    const [genres, subgenres, moods, mood1, composers, rmo, ksl, cowriters] = await Promise.all([
      pgPool.query(`
        SELECT DISTINCT ON (primary_genre_name)
               primary_genre_id, primary_genre_name
        FROM primary_genres
        ORDER BY primary_genre_name
      `),
      pgPool.query(`
        SELECT DISTINCT ON (sg.primary_genre_id, sg.secondary_genre_name)
               sg.secondary_genre_id, sg.primary_genre_id, sg.secondary_genre_name
        FROM secondary_genres sg
        ORDER BY sg.primary_genre_id, sg.secondary_genre_name
      `),
      pgPool.query(`
        SELECT DISTINCT ON (mood_name)
               mood_id, mood_name
        FROM moods
        ORDER BY mood_name
      `),
      pgPool.query(`
        SELECT DISTINCT ON (mood_1_name)
               mood_1_id, mood_1_name
        FROM mood_1
        ORDER BY mood_1_name
      `),
      pgPool.query(`
        SELECT DISTINCT ON (t.composer_full_id)
               t.composer_full_id, t.team_id, t.writer_detail, t.pub_detail, t.has_cowriters, t.is_jup,
               c.full_name
        FROM teams t
        LEFT JOIN composers c ON c.composer_id = t.composer_prefix
        WHERE t.composer_full_id IS NOT NULL AND t.composer_full_id != ''
        ORDER BY t.composer_full_id, t.team_id
      `),
      pgPool.query(`
        SELECT DISTINCT ON (rmo_name)
               rmo_id, rmo_name
        FROM rmo
        ORDER BY rmo_name
      `),
      pgPool.query(`
        SELECT DISTINCT ON (ksl_name)
               ksl_id, ksl_name
        FROM ksl
        ORDER BY ksl_name
      `),
      pgPool.query(`
        SELECT cowriter_id, cowriter_name, pro
        FROM cowriters
        ORDER BY cowriter_name
      `)
    ])

    // Reorganize subgenres into nested structure
    const subgenresByGenre = {}
    for (const row of subgenres.rows) {
      if (!subgenresByGenre[row.primary_genre_id]) {
        subgenresByGenre[row.primary_genre_id] = []
      }
      subgenresByGenre[row.primary_genre_id].push(row.secondary_genre_name)
    }

    res.json({
      genres: genres.rows,
      subgenres: subgenresByGenre,
      moods: moods.rows,
      mood1: mood1.rows,
      composers: composers.rows,
      rmo: rmo.rows,
      ksl: ksl.rows,
      cowriters: cowriters.rows
    })
  } catch (e) {
    console.error('[intake/metadata] error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Import metadata from .md file and move to shipping
app.post('/api/staged-files/:id/import-metadata', async (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'DB not connected' })
  if (!intakeIntegration) return res.json({ ok: false, error: 'Intake system not initialized' })

  try {
    const { id } = req.params

    // Get the staged file record
    const r = await pgPool.query(`SELECT * FROM staged_files WHERE id=$1`, [id])
    if (!r.rows.length) return res.json({ ok: false, error: 'Staged file not found' })
    const record = r.rows[0]
    const stagingPath = record.filepath

    // Find the .md file in the folder
    let mdFile = null
    let files = []
    try {
      files = fs.readdirSync(stagingPath)
      mdFile = files.find(f => f.endsWith('.md'))
    } catch (e) {
      console.warn('[import] Could not read folder:', stagingPath, e.message)
      return res.json({ ok: false, error: 'Could not read staging folder' })
    }

    if (!mdFile) {
      console.warn('[import] No .md file found. Files in folder:', files)
      return res.json({ ok: false, error: 'No .md file found in folder' })
    }

    // Read the .md file
    const mdPath = path.join(stagingPath, mdFile)
    let mdContent = ''
    try {
      mdContent = fs.readFileSync(mdPath, 'utf8')
    } catch (e) {
      return res.json({ ok: false, error: 'Could not read .md file: ' + e.message })
    }

    // Use the intake integration system (validates → quarantines if needed → moves → updates DB)
    const intakeResult = await intakeIntegration.processIntake(id, stagingPath, mdContent)

    if (intakeResult.success) {
      // Success response
      const metadata = intakeResult.metadata || {}

      // Insert or update titles table (matched by SKU - unique ID)
      try {
        await pgPool.query(`
          INSERT INTO titles (sku_root, title, composer_id, key, bpm, primary_genre_id, mood_1_id, ksl_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          ON CONFLICT (sku_root) DO UPDATE SET
            title = EXCLUDED.title,
            composer_id = EXCLUDED.composer_id,
            key = EXCLUDED.key,
            bpm = EXCLUDED.bpm,
            primary_genre_id = EXCLUDED.primary_genre_id,
            mood_1_id = EXCLUDED.mood_1_id,
            ksl_id = EXCLUDED.ksl_id,
            updated_at = NOW()
        `, [
          intakeResult.sku,
          metadata.title || null,
          metadata.composer || null,
          metadata.key || null,
          intakeIntegration.extractBPM(metadata.tempo),
          metadata.genres || null,
          metadata.moods || null,
          metadata.ksls || null
        ])
      } catch (dbErr) {
        console.warn('[intake] Could not insert/update titles:', dbErr.message)
      }

      res.json({
        ok: true,
        sku: intakeResult.sku,
        newPath: intakeResult.newPath,
        genre: metadata.genres,
        key: metadata.key,
        bpm: intakeIntegration.extractBPM(metadata.tempo),
        warnings: intakeResult.warnings || []
      })
    } else {
      // Failure response
      res.status(400).json({
        ok: false,
        error: intakeResult.reason,
        errors: intakeResult.errors || [],
        warnings: intakeResult.warnings || [],
        quarantined: intakeResult.quarantined || false
      })
    }
  } catch (e) {
    console.error('[import] Unexpected error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
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

// ─── Intake Draft Save/Load ────────────────────────────────────────────────
const intakeDrafts = {} // In-memory store: { clientName_dropIndex: { clientName, dropIndex, dropName, formData, timestamp } }

app.post('/api/intake/draft', (req, res) => {
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  const { clientName, dropIndex, dropName, formData } = req.body
  if (!clientName || dropIndex === undefined) return res.json({ ok: false, error: 'Missing clientName or dropIndex' })

  const key = `${clientName}_${dropIndex}`
  intakeDrafts[key] = {
    clientName,
    dropIndex,
    dropName,
    formData,
    timestamp: Date.now()
  }
  console.log(`[intake/draft] Saved draft for ${clientName} drop ${dropIndex}`)
  res.json({ ok: true, message: 'Draft saved' })
})

app.get('/api/intake/draft', (req, res) => {
  // Return the most recent draft (typically the last one the user was working on)
  const drafts = Object.values(intakeDrafts).sort((a, b) => b.timestamp - a.timestamp)
  if (drafts.length === 0) return res.json(null)
  res.json(drafts[0])
})

app.delete('/api/intake/draft/:key', (req, res) => {
  const { key } = req.params
  delete intakeDrafts[key]
  res.json({ ok: true })
})

// ─── Start ─────────────────────────────────────────────────────────────────
// Bind to loopback by default. cloudflared runs on this machine and reaches
// the server at http://localhost:9999 (see ~/.cloudflared/config.yml), so the
// tunnel is unaffected. Set HOST=0.0.0.0 to expose the port on the network.
const HOST = process.env.HOST || '127.0.0.1'
app.listen(PORT, HOST, () => {
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
  console.log(`   Tunnel:  https://app.hausmusicplayer.com`)
  if (HOST !== '127.0.0.1') console.log(`   Network: http://${localIP}:${PORT}  (exposed — HOST=${HOST})`)
  console.log(`\n   Share the Tunnel URL with Kyle\n`)

  // ─── Auto-authorize B2 on startup ───────────────────────────────────────
  if (process.env.B2_APP_KEY_ID && process.env.B2_APP_KEY) {
    (async () => {
      try {
        console.log('[startup] Authorizing B2...')
        const creds = Buffer.from(`${process.env.B2_APP_KEY_ID}:${process.env.B2_APP_KEY}`).toString('base64')
        const result = await _b2Request({
          method: 'GET', hostname: 'api.backblazeb2.com',
          urlPath: '/b2api/v3/b2_authorize_account',
          headers: { 'Authorization': `Basic ${creds}` }
        })
        if (result.status === 200) {
          const b = result.body
          b2Auth = {
            accountId:           b.accountId,
            authorizationToken:  b.authorizationToken,
            apiUrl:              b.apiInfo?.storageApi?.apiUrl      || b.apiUrl,
            downloadUrl:         b.apiInfo?.storageApi?.downloadUrl || b.downloadUrl
          }
          console.log('[startup] ✓ B2 authorized successfully')
          console.log(`[startup]   Download URL: ${b2Auth.downloadUrl}`)
        } else {
          console.error('[startup] ✗ B2 authorization failed:', result.body?.message || `HTTP ${result.status}`)
        }
      } catch (e) {
        console.error('[startup] ✗ B2 authorization error:', e.message)
      }
    })()
  } else {
    console.warn('[startup] ⚠ B2 credentials not found in environment (B2_APP_KEY_ID, B2_APP_KEY)')
  }
})
