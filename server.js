// server.js — HAUS Workspace web server
// Run with: node server.js
// Then open http://localhost:3000 in any browser on the network

const express    = require('express')
const session    = require('express-session')
const crypto     = require('crypto')
const fs         = require('fs')
const path       = require('path')
const os         = require('os')
const https      = require('https')
const http       = require('http')
const { exec, execSync } = require('child_process')
const { Pool }   = require('pg')
const multer     = require('multer')

const app    = express()
const PORT   = process.env.PORT || 3000
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

// Serve static files (index.html, assets, etc.)
app.use(express.static(__dirname))

// Auth guard — all /api routes except /api/auth/login require a session
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next()
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

// Auto-connect to Neon on startup using saved config
;(async () => {
  try {
    const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      if (cfg.pgConn) {
        const { Pool } = require('pg')
        pgPool = new Pool({ connectionString: cfg.pgConn, ssl: { rejectUnauthorized: false } })
        await pgPool.query('SELECT 1')
        console.log('✅ PostgreSQL connected')
      }
    }
  } catch (e) {
    console.log('⚠ PG auto-connect failed:', e.message)
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
    pgPool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
    const client = await pgPool.connect()
    client.release()
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

// ─── Audio streaming ───────────────────────────────────────────────────────
// GET /api/audio/stream?path=/absolute/path/to/file.wav
// Supports range requests so HTML5 <audio> seeking works
app.get('/api/audio/stream', (req, res) => {
  const filePath = req.query.path
  if (!filePath) return res.status(400).json({ error: 'No path' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })

  const stat = fs.statSync(filePath)
  const ext  = path.extname(filePath).toLowerCase()
  const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.aiff' || ext === '.aif' ? 'audio/aiff' : 'audio/wav'
  const total = stat.size

  const range = req.headers.range
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
    const start = parseInt(startStr, 10)
    const end   = endStr ? parseInt(endStr, 10) : total - 1
    const chunkSize = end - start + 1
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   mime
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(filePath).pipe(res)
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
