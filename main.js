const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { execSync, exec } = require('child_process')
const https  = require('https')
const http   = require('http')
const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const os     = require('os')

function _hashPassword(pw) {
  return crypto.createHash('sha256').update('haus-workspace:' + pw).digest('hex')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f5f4f0',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })
  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Read directory contents
ipcMain.handle('read-dir', async (event, dirPath) => {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
    return items
      .filter(item => !item.name.startsWith('.'))
      .map(item => {
        const fullPath = path.join(dirPath, item.name)
        let size = 0
        try {
          if (!item.isDirectory()) {
            size = fs.statSync(fullPath).size
          }
        } catch {}
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          path: fullPath,
          size,
          ext: path.extname(item.name).toLowerCase()
        }
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (e) {
    return { error: e.message }
  }
})

// Count files recursively
ipcMain.handle('count-files', async (event, dirPath, ext) => {
  try {
    const cmd = ext
      ? `find "${dirPath}" -name "*.${ext}" | wc -l`
      : `find "${dirPath}" -type f | wc -l`
    const result = execSync(cmd).toString().trim()
    return parseInt(result, 10)
  } catch {
    return 0
  }
})

// Run a shell command
ipcMain.handle('exec-cmd', async (event, cmd, cwd) => {
  return new Promise(resolve => {
    exec(cmd, { cwd: cwd || process.env.HOME, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      resolve({ err: err?.message || null, stdout: stdout || '', stderr: stderr || '' })
    })
  })
})

// Open path in Finder
ipcMain.handle('show-in-finder', async (event, filePath) => {
  shell.showItemInFolder(filePath)
})

// Open URL or app
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url)
})

// App directory (for bundled scripts)
ipcMain.handle('app-path', async () => __dirname)
ipcMain.handle('home-dir', async () => os.homedir())

// Check path exists
ipcMain.handle('path-exists', async (event, filePath) => {
  return fs.existsSync(filePath)
})

// Read text file
ipcMain.handle('read-file', async (event, filePath) => {
  try { return fs.readFileSync(filePath, 'utf8') } catch { return null }
})

// Write text file
ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    return true
  } catch { return false }
})

// Get folder size
ipcMain.handle('folder-stats', async (event, dirPath) => {
  try {
    const audioExts = ['.wav', '.mp3', '.aiff', '.aif']
    let audioCount = 0, totalCount = 0, folderCount = 0
    const walk = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name.startsWith('.')) continue
        const full = path.join(dir, item.name)
        if (item.isDirectory()) { folderCount++; walk(full) }
        else {
          totalCount++
          if (audioExts.includes(path.extname(item.name).toLowerCase())) audioCount++
        }
      }
    }
    walk(dirPath)
    return { audioCount, totalCount, folderCount }
  } catch { return { audioCount: 0, totalCount: 0, folderCount: 0 } }
})

// ─── AppleScript — Daylite, SoundMiner, etc. ───────────────
ipcMain.handle('run-applescript', async (_, script) => {
  return new Promise(resolve => {
    const tmpFile = path.join(app.getPath('temp'), `haus_as_${Date.now()}.applescript`)
    try {
      fs.writeFileSync(tmpFile, script, 'utf8')
      exec(`osascript "${tmpFile}"`, { timeout: 15000 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile) } catch {}
        if (err) resolve({ error: err.message, stderr: stderr || '' })
        else     resolve({ result: stdout.trim() })
      })
    } catch (e) { resolve({ error: e.message }) }
  })
})

// ─── FileMaker Data API ────────────────────────────────────
const fmSessions = {}  // database → { token, host }

function fmHttp(opts) {
  return new Promise((resolve, reject) => {
    const { method, host, urlPath, body, token, user, pass } = opts
    const bodyStr = body ? JSON.stringify(body) : ''
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    if (token)       headers['Authorization'] = `Bearer ${token}`
    else if (user)   headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

    const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const useHttps  = !host.startsWith('http://')
    const lib       = useHttps ? https : http
    const req = lib.request(
      { hostname: cleanHost.split(':')[0], port: cleanHost.includes(':') ? +cleanHost.split(':')[1] : (useHttps ? 443 : 80),
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

ipcMain.handle('fm-login', async (_, host, database, user, pass) => {
  try {
    const r = await fmHttp({ method: 'POST', host,
      urlPath: `/fmi/data/v1/databases/${encodeURIComponent(database)}/sessions`,
      body: {}, user, pass })
    if (r.status === 200 && r.body?.response?.token) {
      fmSessions[database] = { token: r.body.response.token, host }
      return { ok: true, token: r.body.response.token }
    }
    return { ok: false, error: r.body?.messages?.[0]?.message || `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('fm-query', async (_, database, layout, query, options = {}) => {
  const session = fmSessions[database]
  if (!session) return { ok: false, error: 'Not logged in — connect in Settings → FileMaker.' }
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
    if (r.status === 200) return { ok: true, records: r.body?.response?.data || [], total: r.body?.response?.totalRecordCount || 0 }
    if (r.status === 401) { delete fmSessions[database]; return { ok: false, error: 'Session expired — reconnect in Settings.' } }
    // FileMaker returns 401 code inside body when no records match
    if (r.body?.messages?.[0]?.code === '401') return { ok: true, records: [], total: 0 }
    return { ok: false, error: r.body?.messages?.[0]?.message || `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('fm-logout', async (_, database) => {
  const session = fmSessions[database]
  if (!session) return { ok: true }
  try {
    await fmHttp({ method: 'DELETE', host: session.host,
      urlPath: `/fmi/data/v1/databases/${encodeURIComponent(database)}/sessions/${session.token}`,
      token: session.token })
  } catch {}
  delete fmSessions[database]
  return { ok: true }
})

ipcMain.handle('fm-databases', async (_, host, user, pass) => {
  try {
    const r = await fmHttp({ method: 'GET', host, urlPath: '/fmi/data/v1/databases', user, pass })
    if (r.status === 200) return { ok: true, databases: r.body?.response?.databases || [] }
    return { ok: false, error: r.body?.messages?.[0]?.message || `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

// ─── PostgreSQL ────────────────────────────────────────────
let pgPool = null

ipcMain.handle('pg-connect', async (_, connStr) => {
  try {
    const { Pool } = require('pg')
    if (pgPool) { try { await pgPool.end() } catch {} }
    pgPool = new Pool({ connectionString: connStr || 'postgresql://postgres:postgres123@localhost:5432/haus_music' })
    const client = await pgPool.connect()
    client.release()
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('pg-query', async (_, sql, params) => {
  if (!pgPool) return { ok: false, error: 'Not connected to database' }
  try {
    const result = await pgPool.query(sql, params || [])
    return { ok: true, rows: result.rows, rowCount: result.rowCount }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('pg-status', async () => {
  if (!pgPool) return { connected: false }
  try { await pgPool.query('SELECT 1'); return { connected: true } }
  catch { return { connected: false } }
})

// ─── Backblaze B2 ──────────────────────────────────────────
let b2Auth = null

ipcMain.handle('b2-authorize', async (_, keyId, appKey) => {
  try {
    const creds = Buffer.from(`${keyId}:${appKey}`).toString('base64')
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.backblazeb2.com',
        path: '/b2api/v3/b2_authorize_account',
        method: 'GET',
        headers: { 'Authorization': `Basic ${creds}` }
      }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
      })
      req.on('error', reject)
      req.end()
    })
    if (result.status === 200) {
      const b = result.body
      b2Auth = {
        authorizationToken: b.authorizationToken,
        apiUrl: b.apiInfo?.storageApi?.apiUrl || b.apiUrl,
        downloadUrl: b.apiInfo?.storageApi?.downloadUrl || b.downloadUrl
      }
      return { ok: true, downloadUrl: b2Auth.downloadUrl }
    }
    return { ok: false, error: result.body?.message || `HTTP ${result.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('b2-list-buckets', async () => {
  if (!b2Auth) return { ok: false, error: 'Not authorized' }
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: apiHost,
        path: '/b2api/v3/b2_list_buckets',
        method: 'GET',
        headers: { 'Authorization': b2Auth.authorizationToken }
      }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
      })
      req.on('error', reject)
      req.end()
    })
    if (result.status === 200) return { ok: true, buckets: result.body.buckets || [] }
    return { ok: false, error: result.body?.message || `HTTP ${result.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('b2-list-files', async (_, bucketId, prefix, maxCount) => {
  if (!b2Auth) return { ok: false, error: 'Not authorized' }
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const params = new URLSearchParams({ bucketId, maxFileCount: maxCount || 1000 })
    if (prefix) params.set('prefix', prefix)
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: apiHost,
        path: `/b2api/v3/b2_list_file_names?${params}`,
        method: 'GET',
        headers: { 'Authorization': b2Auth.authorizationToken }
      }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
      })
      req.on('error', reject)
      req.end()
    })
    if (result.status === 200) return { ok: true, files: result.body.files || [], nextFileName: result.body.nextFileName }
    return { ok: false, error: result.body?.message || `HTTP ${result.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('show-folder-picker', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('b2-get-download-token', async () => {
  if (!b2Auth) return { ok: false, error: 'Not authorized' }
  return { ok: true, token: b2Auth.authorizationToken }
})

ipcMain.handle('b2-get-upload-url', async (_, bucketId) => {
  if (!b2Auth) return { ok: false, error: 'Not authorized' }
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const bodyStr = JSON.stringify({ bucketId })
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: apiHost,
        path: '/b2api/v3/b2_get_upload_url',
        method: 'POST',
        headers: { 'Authorization': b2Auth.authorizationToken, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
      }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
      })
      req.on('error', reject)
      req.write(bodyStr)
      req.end()
    })
    if (result.status === 200) return { ok: true, uploadUrl: result.body.uploadUrl, uploadAuthToken: result.body.authorizationToken }
    return { ok: false, error: result.body?.message || `HTTP ${result.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('b2-upload-file', async (_, uploadUrl, uploadAuthToken, filePath, b2FileName, mimeType) => {
  try {
    const crypto = require('crypto')
    const fileBuffer = fs.readFileSync(filePath)
    const sha1 = crypto.createHash('sha1').update(fileBuffer).digest('hex')
    const uploadHost = uploadUrl.replace(/^https?:\/\/([^/]+).*/, '$1')
    const uploadPath = uploadUrl.replace(/^https?:\/\/[^/]+/, '')
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: uploadHost, path: uploadPath, method: 'POST',
        headers: {
          'Authorization': uploadAuthToken,
          'X-Bz-File-Name': encodeURIComponent(b2FileName).replace(/%2F/g, '/'),
          'Content-Type': mimeType || 'application/octet-stream',
          'Content-Length': fileBuffer.length,
          'X-Bz-Content-Sha1': sha1
        }
      }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
      })
      req.on('error', reject)
      req.write(fileBuffer)
      req.end()
    })
    if (result.status === 200) {
      const downloadUrl = `${b2Auth.downloadUrl}/file/${result.body.bucketName}/${result.body.fileName}`
      return { ok: true, fileId: result.body.fileId, fileName: result.body.fileName, downloadUrl }
    }
    return { ok: false, error: result.body?.message || `HTTP ${result.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('b2-status', async () => ({ connected: !!b2Auth }))

// ─── Auth ─────────────────────────────────────────────────
ipcMain.handle('auth-login', async (_, username, password) => {
  if (!pgPool) return { ok: false, error: 'Database not connected' }
  try {
    const hash = _hashPassword(password)
    const result = await pgPool.query(
      `SELECT user_id, username, display_name FROM haus_users WHERE LOWER(username)=LOWER($1) AND password_hash=$2`,
      [username, hash]
    )
    if (!result.rows.length) return { ok: false, error: 'Invalid username or password' }
    return { ok: true, user: result.rows[0] }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('auth-change-password', async (_, username, oldPassword, newPassword) => {
  if (!pgPool) return { ok: false, error: 'Database not connected' }
  try {
    const oldHash = _hashPassword(oldPassword)
    const newHash = _hashPassword(newPassword)
    const result = await pgPool.query(
      `UPDATE haus_users SET password_hash=$1 WHERE LOWER(username)=LOWER($2) AND password_hash=$3 RETURNING user_id`,
      [newHash, username, oldHash]
    )
    if (!result.rowCount) return { ok: false, error: 'Current password incorrect' }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('b2-download-file', async (_, url, destPath) => {
  if (!b2Auth) return { ok: false, error: 'B2 not authorized' }
  try {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    const result = await new Promise((resolve, reject) => {
      const parsedUrl = new URL(url)
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: { 'Authorization': b2Auth.authorizationToken }
      }
      const req = https.request(options, res => {
        if (res.statusCode !== 200) {
          let errBody = ''
          res.on('data', c => errBody += c)
          res.on('end', () => resolve({ ok: false, error: `HTTP ${res.statusCode}: ${errBody.slice(0,200)}` }))
          return
        }
        const fileStream = fs.createWriteStream(destPath)
        res.pipe(fileStream)
        fileStream.on('finish', () => { fileStream.close(); resolve({ ok: true }) })
        fileStream.on('error', e => resolve({ ok: false, error: e.message }))
      })
      req.on('error', e => resolve({ ok: false, error: e.message }))
      req.end()
    })
    return result
  } catch (e) { return { ok: false, error: e.message } }
})
