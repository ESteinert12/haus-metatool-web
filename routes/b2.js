/**
 * routes/b2.js — Backblaze B2 cloud storage operations
 */

const express = require('express')
const https = require('https')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

module.exports = function createB2Router(upload) {
  const router = express.Router()

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

async function updateMixStemsBatch(client, batch, retries = 3) {
  if (!batch.length) return 0
  let updated = 0
  for (const item of batch) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await client.query(
          `UPDATE mix_stems SET b2_key = $1 WHERE filename = $2 AND b2_key IS NULL RETURNING mix_stem_id`,
          [item.b2Key, item.fileName]
        )
        if (result.rowCount) updated++
        break
      } catch (e) {
        if (attempt < retries) {
          const delay = 500 * attempt
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          console.error(`[b2-rebuild] failed to update ${item.fileName}: ${e.message}`)
        }
      }
    }
  }
  return updated
}

router.get('/stream', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
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
      const b2Req = https.request({ hostname: downloadHost, path: urlPath, method: 'GET', headers: { 'Authorization': b2Auth.authorizationToken } }, b2Res => {
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
      })
      b2Req.on('error', reject)
      b2Req.end()
    })
    const total = buf.length
    console.log(`[b2/stream] downloaded ${total} bytes, serving`)
    if (total < 1000) {
      const bodyStr = buf.toString('utf8').trim()
      if (bodyStr.startsWith('/')) {
        console.log(`[b2/stream] stub detected — serving local file: ${bodyStr}`)
        let localPath = bodyStr
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
            for (const variant of ['_FULL', '_ALT', '_STING', '_BUMPER']) {
              const match = audioFiles.find(f => f.includes(variant))
              if (match) {
                foundFile = path.join(dir, match)
                console.log(`[b2/stream] found alternative: ${foundFile}`)
                break
              }
            }
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
        const localMime = path.extname(localPath).toLowerCase() === '.mp3' ? 'audio/mpeg' : path.extname(localPath).toLowerCase() === '.aiff' || path.extname(localPath).toLowerCase() === '.aif' ? 'audio/aiff' : 'audio/wav'
        const rangeHeader = req.headers.range
        if (rangeHeader) {
          const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
          const start = m && m[1] ? parseInt(m[1]) : 0
          const end   = m && m[2] ? Math.min(parseInt(m[2]), stat.size - 1) : stat.size - 1
          const chunkSize = end - start + 1
          res.writeHead(206, { 'Content-Type': localMime, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunkSize, 'Cache-Control': 'no-cache' })
          fs.createReadStream(localPath, { start, end }).pipe(res)
        } else {
          res.writeHead(200, { 'Content-Type': localMime, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' })
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
      res.writeHead(206, { 'Content-Type': mime, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunkSize, 'Cache-Control': 'no-cache' })
      res.end(buf.slice(start, end + 1))
    } else {
      res.writeHead(200, { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': total, 'Cache-Control': 'no-cache' })
      res.end(buf)
    }
  } catch (e) {
    console.error('[b2/stream] error:', e.message, e.detail || '')
    if (!res.headersSent) res.status(e.status || 502).json({ error: e.message, detail: e.detail })
  }
})

router.post('/authorize', async (req, res) => {
  const { keyId, appKey } = req.body
  try {
    const creds = Buffer.from(`${keyId}:${appKey}`).toString('base64')
    const result = await _b2Request({ method: 'GET', hostname: 'api.backblazeb2.com', urlPath: '/b2api/v3/b2_authorize_account', headers: { 'Authorization': `Basic ${creds}` } })
    if (result.status === 200) {
      const b = result.body
      const authData = { accountId: b.accountId, authorizationToken: b.authorizationToken, apiUrl: b.apiInfo?.storageApi?.apiUrl || b.apiUrl, downloadUrl: b.apiInfo?.storageApi?.downloadUrl || b.downloadUrl }
      req.app.b2Auth = authData
      req.app.locals.b2Auth = authData
      return res.json({ ok: true, downloadUrl: authData.downloadUrl })
    }
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.get('/status', (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  res.json({ connected: !!b2Auth })
})

router.post('/get-song-lots', async (req, res) => {
  const pgPool = req.app.locals.pgPool
  if (!pgPool) return res.json({ ok: false, error: 'Not connected to database' })
  const { skus } = req.body
  if (!Array.isArray(skus) || skus.length === 0) return res.json({ ok: false, error: 'skus must be a non-empty array' })
  try {
    const client = await pgPool.connect()
    const skuList = skus.map(s => `'${s.replace(/'/g, "''")}'`).join(',')
    const result = await client.query(`SELECT t.sku_root, l.lot_name FROM titles t LEFT JOIN lot_titles lt ON lt.sku_root = t.sku_root LEFT JOIN lots l ON l.lot_id = lt.lot_id WHERE t.sku_root IN (${skuList}) ORDER BY t.sku_root`)
    client.release()
    const songLots = {}
    result.rows.forEach(row => { songLots[row.sku_root] = row.lot_name || 'No Lot' })
    res.json({ ok: true, songLots })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.get('/list-buckets', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const result  = await _b2Request({ method: 'GET', hostname: apiHost, urlPath: '/b2api/v3/b2_list_buckets', headers: { 'Authorization': b2Auth.authorizationToken } })
    if (result.status === 200) return res.json({ ok: true, buckets: result.body.buckets || [] })
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.post('/list-files', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { bucketId, prefix, maxCount } = req.body
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const params  = new URLSearchParams({ bucketId, maxFileCount: maxCount || 1000 })
    if (prefix) params.set('prefix', prefix)
    const result = await _b2Request({ method: 'GET', hostname: apiHost, urlPath: `/b2api/v3/b2_list_file_names?${params}`, headers: { 'Authorization': b2Auth.authorizationToken } })
    if (result.status === 200) return res.json({ ok: true, files: result.body.files || [], nextFileName: result.body.nextFileName })
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.get('/db-audit', async (req, res) => {
  const pgPool = req.app.locals.pgPool
  const b2Auth = req.app.locals.b2Auth
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected' })
  try {
    const client = await pgPool.connect()
    const countResult = await client.query(`SELECT COUNT(*) as cnt FROM mix_stems WHERE b2_key IS NOT NULL AND b2_key != ''`)
    const totalCount = parseInt(countResult.rows[0].cnt)
    const sampleSize = Math.min(2000, totalCount)
    const result = await client.query(`SELECT b2_key FROM mix_stems WHERE b2_key IS NOT NULL AND b2_key != '' ORDER BY RANDOM() LIMIT $1`, [sampleSize])
    client.release()
    const files = result.rows
    console.log(`[b2/db-audit] Found ${files.length} files in mix_stems table`)
    const realAudio = []
    const stubs = []
    const errors = []
    let checked = 0
    for (const file of files) {
      try {
        const encodedPath = `/file/haus-music/${file.b2_key.split('/').map(p => encodeURIComponent(p)).join('/')}`
        const headResult = await _b2Request({ method: 'HEAD', hostname: b2Auth.downloadUrl.replace(/^https?:\/\//, ''), urlPath: encodedPath, headers: { 'Authorization': b2Auth.authorizationToken } })
        const size = headResult.headers?.['content-length'] ? parseInt(headResult.headers['content-length']) : (headResult.body?.['content-length'] ? parseInt(headResult.body['content-length']) : 0)
        if (checked < 5) console.log(`[b2/db-audit] File ${checked}: ${file.b2_key.substring(0, 50)}... status=${headResult.status} size=${size}`)
        checked++
        if (size < 1000 && size > 0) stubs.push({ name: file.b2_key, size })
        else if (size >= 1000000) realAudio.push({ name: file.b2_key, size })
      } catch (e) {
        if (errors.length < 10) {
          console.log(`[b2/db-audit] Error checking ${file.b2_key}: ${e.message}`)
          errors.push({ b2_key: file.b2_key, error: e.message })
        }
      }
    }
    console.log(`[b2/db-audit] Checked ${checked} files. Real: ${realAudio.length}, Stubs: ${stubs.length}, Errors: ${errors.length}`)
    const avgRealAudioPercent = files.length > 0 ? (realAudio.length / files.length) : 0
    const avgStubPercent = files.length > 0 ? (stubs.length / files.length) : 0
    const estimatedRealAudio = Math.round(totalCount * avgRealAudioPercent)
    const estimatedStubs = Math.round(totalCount * avgStubPercent)
    res.json({ ok: true, audit: { totalTracked: totalCount, sampledFiles: files.length, realAudio: { count: realAudio.length, estimatedCount: estimatedRealAudio, totalSize: realAudio.reduce((s, f) => s + f.size, 0), avgSize: realAudio.length > 0 ? Math.round(realAudio.reduce((s, f) => s + f.size, 0) / realAudio.length) : 0, examples: realAudio.slice(0, 5) }, stubs: { count: stubs.length, estimatedCount: estimatedStubs, totalSize: stubs.reduce((s, f) => s + f.size, 0), details: stubs.slice(0, 50) }, errors: errors.slice(0, 20) } })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.get('/quick-audit', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not connected. Click "Connect B2" in the app first.' })
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    console.log('[b2/quick-audit] apiUrl:', b2Auth.apiUrl)
    const bucketsParams = new URLSearchParams({ accountId: b2Auth.accountId })
    const bucketsResult = await _b2Request({ method: 'GET', hostname: apiHost, urlPath: `/b2api/v3/b2_list_buckets?${bucketsParams}`, headers: { 'Authorization': b2Auth.authorizationToken } })
    if (bucketsResult.status !== 200) return res.json({ ok: false, error: bucketsResult.body?.message || `HTTP ${bucketsResult.status}: ${JSON.stringify(bucketsResult.body)}` })
    const hausBucket = bucketsResult.body.buckets.find(b => b.bucketName === 'haus-music')
    if (!hausBucket) return res.json({ ok: false, error: 'haus-music bucket not found' })
    const bucketId = hausBucket.bucketId
    const allFiles = []
    let startFileName = null
    let startFileId = null
    while (true) {
      const params = new URLSearchParams({ bucketId, maxFileCount: 10000 })
      if (startFileName) params.set('startFileName', startFileName)
      if (startFileId) params.set('startFileId', startFileId)
      const result = await _b2Request({ method: 'GET', hostname: apiHost, urlPath: `/b2api/v3/b2_list_file_versions?${params}`, headers: { 'Authorization': b2Auth.authorizationToken } })
      if (result.status !== 200) return res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
      const latestFiles = (result.body.files || []).filter(f => !f.action || f.action === 'upload')
      allFiles.push(...latestFiles)
      if (!result.body.nextFileName) break
      startFileName = result.body.nextFileName
      startFileId = result.body.nextFileId || null
    }
    const stubs = allFiles.filter(f => f.size < 1000)
    const realAudio = allFiles.filter(f => f.size >= 1000000)
    const other = allFiles.filter(f => f.size >= 1000 && f.size < 1000000)
    const stubDetails = stubs.map(f => ({ name: f.fileName, size: f.size, uploadTime: f.uploadTimestamp }))
    res.json({ ok: true, audit: { totalFiles: allFiles.length, realAudio: { count: realAudio.length, totalSize: realAudio.reduce((s, f) => s + f.size, 0), avgSize: realAudio.length > 0 ? Math.round(realAudio.reduce((s, f) => s + f.size, 0) / realAudio.length) : 0 }, stubs: { count: stubs.length, totalSize: stubs.reduce((s, f) => s + f.size, 0), details: stubDetails.slice(0, 100) }, other: { count: other.length, totalSize: other.reduce((s, f) => s + f.size, 0) } } })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.get('/audit', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { bucketId } = req.query
  if (!bucketId) return res.json({ ok: false, error: 'bucketId required' })
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const allFiles = []
    let startFileName = null
    let startFileId = null
    while (true) {
      const params = new URLSearchParams({ bucketId, maxFileCount: 10000 })
      if (startFileName) params.set('startFileName', startFileName)
      if (startFileId) params.set('startFileId', startFileId)
      const result = await _b2Request({ method: 'GET', hostname: apiHost, urlPath: `/b2api/v3/b2_list_file_versions?${params}`, headers: { 'Authorization': b2Auth.authorizationToken } })
      if (result.status !== 200) return res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
      const latestFiles = (result.body.files || []).filter(f => !f.action || f.action === 'upload')
      allFiles.push(...latestFiles)
      if (!result.body.nextFileName) break
      startFileName = result.body.nextFileName
      startFileId = result.body.nextFileId || null
    }
    const stubs = allFiles.filter(f => f.size < 1000)
    const realAudio = allFiles.filter(f => f.size >= 1000000)
    const other = allFiles.filter(f => f.size >= 1000 && f.size < 1000000)
    const stubDetails = stubs.map(f => ({ name: f.fileName, size: f.size, uploadTime: f.uploadTimestamp }))
    res.json({ ok: true, audit: { totalFiles: allFiles.length, realAudio: { count: realAudio.length, totalSize: realAudio.reduce((s, f) => s + f.size, 0), avgSize: realAudio.length > 0 ? Math.round(realAudio.reduce((s, f) => s + f.size, 0) / realAudio.length) : 0 }, stubs: { count: stubs.length, totalSize: stubs.reduce((s, f) => s + f.size, 0), details: stubDetails.slice(0, 100) }, other: { count: other.length, totalSize: other.reduce((s, f) => s + f.size, 0) } } })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.get('/download-token', (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  res.json({ ok: true, token: b2Auth.authorizationToken })
})

router.post('/get-upload-url', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { bucketId } = req.body
  try {
    const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
    const result  = await _b2Request({ method: 'POST', hostname: apiHost, urlPath: '/b2api/v3/b2_get_upload_url', headers: { 'Authorization': b2Auth.authorizationToken, 'Content-Type': 'application/json' }, body: { bucketId } })
    if (result.status === 200) return res.json({ ok: true, uploadUrl: result.body.uploadUrl, uploadAuthToken: result.body.authorizationToken })
    res.json({ ok: false, error: result.body?.message || `HTTP ${result.status}` })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.post('/upload-file', upload.single('file'), async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'Not authorized' })
  const { uploadUrl, uploadAuthToken, b2FileName, mimeType } = req.body
  const tempPath = req.file?.path
  if (!tempPath) return res.json({ ok: false, error: 'No file received' })
  try {
    const fileBuffer = fs.readFileSync(tempPath)
    const sha1       = crypto.createHash('sha1').update(fileBuffer).digest('hex')
    const uploadHost = uploadUrl.replace(/^https?:\/\/([^/]+).*/, '$1')
    const uploadPath = uploadUrl.replace(/^https?:\/\/[^/]+/, '')
    const result     = await _b2Request({ method: 'POST', hostname: uploadHost, urlPath: uploadPath, isBuffer: true, body: fileBuffer, headers: { 'Authorization': uploadAuthToken, 'X-Bz-File-Name': encodeURIComponent(b2FileName).replace(/%2F/g, '/'), 'Content-Type': mimeType || 'application/octet-stream', 'X-Bz-Content-Sha1': sha1 } })
    try { fs.unlinkSync(tempPath) } catch {}
    const parsed = JSON.parse(result.body.toString())
    if (result.status === 200) {
      const downloadUrl = `${b2Auth.downloadUrl}/file/${parsed.bucketName}/${parsed.fileName}`
      return res.json({ ok: true, fileId: parsed.fileId, fileName: parsed.fileName, downloadUrl })
    }
    res.json({ ok: false, error: parsed?.message || `HTTP ${result.status}` })
  } catch (e) { try { fs.unlinkSync(tempPath) } catch {} res.json({ ok: false, error: e.message }) }
})

router.post('/download-file', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.json({ ok: false, error: 'B2 not authorized' })
  const { url, destPath } = req.body
  try {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    const parsedUrl = new URL(url)
    const result    = await _b2Request({ method: 'GET', hostname: parsedUrl.hostname, urlPath: parsedUrl.pathname + parsedUrl.search, headers: { 'Authorization': b2Auth.authorizationToken }, isBuffer: true })
    if (result.status !== 200) return res.json({ ok: false, error: `HTTP ${result.status}` })
    fs.writeFileSync(destPath, result.body)
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.post('/rebuild-stem-keys', async (req, res) => {
  const b2Auth = req.app.locals.b2Auth
  if (!b2Auth) return res.status(503).json({ error: 'B2 not authorized' })
  let client = null
  try {
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
    while (true) {
      const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
      const bucketId = req.body.bucketId || '707a97f6e032b16c9be50d1a'
      const urlPath = `/b2api/v3/b2_list_file_versions?bucketId=${encodeURIComponent(bucketId)}&maxFileCount=10000${startFileName ? `&startFileName=${encodeURIComponent(startFileName)}` : ''}`
      const result = await _b2Request({ method: 'GET', hostname: apiHost, urlPath, headers: { 'Authorization': b2Auth.authorizationToken } })
      if (result.status !== 200) {
        console.error('[b2-rebuild] B2 list error:', result.status, result.body)
        if (client) client.release()
        return res.json({ ok: false, error: `B2 API error: ${result.status}` })
      }
      const files = result.body.files || []
      if (!files.length) break
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
      if (batch.length) {
        const updateCount = await updateMixStemsBatch(client, batch)
        updated += updateCount
      }
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

  return router
}
