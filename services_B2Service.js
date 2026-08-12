/**
 * B2Service.js — Encapsulates all Backblaze B2 operations
 *
 * Handles:
 * - Authentication (authorize, refresh tokens)
 * - File operations (list, upload, download, delete)
 * - Batch operations (upload/download multiple files)
 * - Stub detection and recovery (Phase 1 & 2)
 * - Progress tracking and checkpointing
 *
 * Usage:
 *   const b2 = new B2Service(keyId, appKey, 'haus-music')
 *   await b2.authorize()
 *   const files = await b2.listFiles('stratus/')
 *   await b2.uploadFile('/local/file.wav', 'stratus/file.wav')
 */

const https = require('https')
const fs = require('fs').promises
const path = require('path')

class B2Service {
  constructor(appKeyId, appKey, bucketName = 'haus-music') {
    this.appKeyId = appKeyId
    this.appKey = appKey
    this.bucketName = bucketName

    // Auth state
    this.authToken = null
    this.apiUrl = null
    this.bucketId = null
    this.uploadUrl = null
    this.uploadAuthToken = null

    // Retry config
    this.maxRetries = 3
    this.retryDelay = 5000 // ms
  }

  // ─── Authentication ─────────────────────────────────────────────────────

  async authorize() {
    /**
     * Get B2 auth token and discover API URL
     * Called once per session, token valid for 24 hours
     */
    try {
      const auth = Buffer.from(`${this.appKeyId}:${this.appKey}`).toString('base64')
      const response = await this._httpsRequest({
        hostname: 'api.backblazeb2.com',
        path: '/b2api/v3/b2_authorize_account',
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` }
      })

      if (response.status !== 200) {
        throw new Error(`B2 auth failed: ${response.status}`)
      }

      this.authToken = response.body.authorizationToken
      this.apiUrl = response.body.apiUrl
      this.bucketId = await this._getBucketId()

      console.log('✅ B2 authorization successful')
      return { authToken: this.authToken, apiUrl: this.apiUrl }
    } catch (e) {
      console.error('❌ B2 authorization failed:', e.message)
      throw e
    }
  }

  async _ensureAuth() {
    /**
     * Ensure we have valid auth token (re-authorize if needed)
     */
    if (!this.authToken || !this.apiUrl) {
      await this.authorize()
    }
  }

  // ─── Bucket Operations ──────────────────────────────────────────────────

  async _getBucketId() {
    /**
     * Resolve bucket name to bucket ID
     */
    const response = await this._apiRequest('GET', '/b2api/v3/buckets', {
      bucketName: this.bucketName
    })

    const bucket = response.buckets?.find(b => b.bucketName === this.bucketName)
    if (!bucket) {
      throw new Error(`Bucket '${this.bucketName}' not found`)
    }
    return bucket.bucketId
  }

  // ─── File Listing ──────────────────────────────────────────────────────

  async listFiles(prefix = '', maxCount = 1000) {
    /**
     * List all files in bucket with optional prefix
     * Returns: [{ fileName, size, uploadTimestamp, b2Key }, ...]
     */
    await this._ensureAuth()

    const files = []
    let startFileName = null

    try {
      while (true) {
        const params = {
          bucketId: this.bucketId,
          maxFileCount: Math.min(maxCount, 10000),
        }
        if (prefix) params.prefix = prefix
        if (startFileName) params.startFileName = startFileName

        const response = await this._apiRequest('POST', '/b2api/v3/b2_list_file_versions', params)

        if (response.files) {
          files.push(...response.files)
        }

        if (!response.nextFileName) break
        startFileName = response.nextFileName
      }

      console.log(`Listed ${files.length} files (prefix: "${prefix}")`)
      return files
    } catch (e) {
      console.error('Failed to list files:', e.message)
      throw e
    }
  }

  // ─── File Upload ───────────────────────────────────────────────────────

  async uploadFile(localPath, b2FileName, retryCount = 0) {
    /**
     * Upload single file to B2
     * Returns: { b2Key, size, uploadTime }
     */
    await this._ensureAuth()

    try {
      const fileData = await fs.readFile(localPath)
      const response = await this._uploadFile(b2FileName, fileData)

      console.log(`✓ Uploaded ${b2FileName} (${fileData.length} bytes)`)
      return {
        b2Key: response.fileName,
        size: fileData.length,
        uploadTime: new Date().toISOString()
      }
    } catch (e) {
      if (retryCount < this.maxRetries) {
        console.warn(`Retry ${retryCount + 1}/${this.maxRetries} for ${b2FileName}...`)
        await this._sleep(this.retryDelay)
        return this.uploadFile(localPath, b2FileName, retryCount + 1)
      }
      console.error(`✗ Failed to upload ${b2FileName}:`, e.message)
      throw e
    }
  }

  async _uploadFile(fileName, fileData) {
    /**
     * Low-level file upload to B2
     * Gets upload URL first, then uploads
     */
    // Get fresh upload URL
    const urlResponse = await this._apiRequest('POST', '/b2api/v3/b2_get_upload_url', {
      bucketId: this.bucketId
    })
    const uploadUrl = urlResponse.uploadUrl
    const uploadAuth = urlResponse.authorizationToken

    // Upload file
    const response = await this._httpsRequest({
      url: uploadUrl,
      method: 'POST',
      headers: {
        Authorization: uploadAuth,
        'X-Bz-File-Name': fileName,
        'Content-Type': 'application/octet-stream',
        'X-Bz-Content-Sha1': 'unverified:0'
      },
      body: fileData,
      isBuffer: true
    })

    if (response.status !== 200) {
      throw new Error(`Upload failed: ${response.status}`)
    }

    return response.body
  }

  // ─── File Download ─────────────────────────────────────────────────────

  async downloadFile(b2Key, destPath, retryCount = 0) {
    /**
     * Download file from B2 to local filesystem
     * Returns: { destPath, size, downloadTime }
     */
    await this._ensureAuth()

    try {
      // Build download URL
      const downloadUrl = `${this.apiUrl}/file/${this.bucketName}/${b2Key}`

      const response = await this._httpsRequest({
        url: downloadUrl,
        method: 'GET',
        headers: { Authorization: this.authToken },
        isBuffer: true
      })

      if (response.status !== 200) {
        throw new Error(`Download failed: ${response.status}`)
      }

      // Write to disk
      await fs.writeFile(destPath, response.body)

      console.log(`✓ Downloaded ${b2Key} (${response.body.length} bytes)`)
      return {
        destPath,
        size: response.body.length,
        downloadTime: new Date().toISOString()
      }
    } catch (e) {
      if (retryCount < this.maxRetries) {
        console.warn(`Retry ${retryCount + 1}/${this.maxRetries} for ${b2Key}...`)
        await this._sleep(this.retryDelay)
        return this.downloadFile(b2Key, destPath, retryCount + 1)
      }
      console.error(`✗ Failed to download ${b2Key}:`, e.message)
      throw e
    }
  }

  // ─── Batch Operations ──────────────────────────────────────────────────

  async batchUpload(filePaths, options = {}) {
    /**
     * Upload multiple files with progress tracking
     * Options: { batchSize = 10, resumeFrom = null, onProgress = null }
     *
     * Returns: { ok: true, results: [...], checkpoint: {...} }
     */
    const batchSize = options.batchSize || 10
    const startIdx = options.resumeFrom || 0
    const results = []
    let checkpoint = null

    for (let i = startIdx; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize)

      for (const filePath of batch) {
        try {
          const result = await this.uploadFile(filePath, path.basename(filePath))
          results.push({ ok: true, ...result })
        } catch (e) {
          results.push({ ok: false, file: filePath, error: e.message })
        }
      }

      // Checkpoint every N files
      checkpoint = { lastIndex: i + batch.length, time: new Date().toISOString() }
      if (options.onProgress) {
        options.onProgress({
          done: checkpoint.lastIndex,
          total: filePaths.length,
          percent: Math.round((checkpoint.lastIndex / filePaths.length) * 100)
        })
      }
    }

    return { ok: true, results, checkpoint }
  }

  async batchDownload(b2Keys, destDir, options = {}) {
    /**
     * Download multiple files in parallel
     * Options: { concurrency = 5, onProgress = null }
     *
     * Returns: [{ ok: true, key, destPath }, { ok: false, key, error }, ...]
     */
    const concurrency = options.concurrency || 5
    const results = []
    let completed = 0

    // Simple concurrency control
    const queue = [...b2Keys]
    const workers = Array(Math.min(concurrency, queue.length))

    const worker = async () => {
      while (queue.length > 0) {
        const key = queue.shift()
        const destPath = path.join(destDir, path.basename(key))

        try {
          // Skip if already downloaded
          try {
            await fs.access(destPath)
            results.push({ ok: true, key, destPath, skipped: true })
            completed++
            continue
          } catch {
            // File doesn't exist, proceed with download
          }

          await this.downloadFile(key, destPath)
          results.push({ ok: true, key, destPath })
        } catch (e) {
          results.push({ ok: false, key, error: e.message })
        }

        completed++
        if (options.onProgress) {
          options.onProgress({ done: completed, total: b2Keys.length })
        }
      }
    }

    // Start workers
    await Promise.all(workers.map(() => worker()))
    return results
  }

  // ─── Stub Detection & Audit ────────────────────────────────────────────

  async auditBucket() {
    /**
     * Comprehensive audit of bucket
     * Classifies files as STUB or REAL
     * Returns: [{ fileName, size, type, sku, composer }, ...]
     */
    console.log('Auditing bucket...')
    const files = await this.listFiles()

    return files.map(f => ({
      ...f,
      type: this._classifyFile(f),
      sku: this._extractSKU(f.fileName),
      composer: this._extractComposer(f.fileName)
    }))
  }

  _classifyFile(file) {
    /**
     * Determine if file is STUB or REAL
     * STUB: empty (0 bytes) or small (< 1MB)
     * REAL: >= 1MB
     */
    if (file.size === 0) return 'STUB_EMPTY'
    if (file.size < 1024 * 1024) return 'STUB_SMALL'
    return 'REAL_AUDIO'
  }

  _extractSKU(fileName) {
    /**
     * Extract SKU from filename
     * HAUS_Title_Key_R48_FULL.wav → R48
     */
    const parts = fileName.split('_')
    if (parts.length >= 4 && parts[0] === 'HAUS') {
      return parts[3] // ComposerID
    }
    return null
  }

  _extractComposer(fileName) {
    /**
     * Extract composer ID from filename
     * HAUS_Title_Key_R48_FULL.wav → R (base) + 48 (number)
     */
    const sku = this._extractSKU(fileName)
    if (!sku) return null
    return sku.replace(/\d+[a-z]?$/, '') // Remove numbers and variant
  }

  // ─── HTTP Helpers ────────────────────────────────────────────────────

  async _apiRequest(method, path, body) {
    /**
     * Make API request to B2
     */
    const response = await this._httpsRequest({
      hostname: this.apiUrl?.split('/').pop(),
      path,
      method,
      headers: {
        Authorization: this.authToken,
        'Content-Type': 'application/json'
      },
      body
    })

    if (response.status >= 400) {
      throw new Error(`B2 API error ${response.status}: ${JSON.stringify(response.body)}`)
    }

    return response.body
  }

  async _httpsRequest(opts) {
    /**
     * Low-level HTTPS request helper
     */
    return new Promise((resolve, reject) => {
      const { hostname, path, method, headers, body, url, isBuffer } = opts

      const options = {
        method,
        headers: { ...headers },
        rejectUnauthorized: false
      }

      if (body && !isBuffer) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
        options.headers['Content-Length'] = Buffer.byteLength(bodyStr)
      } else if (body && isBuffer) {
        options.headers['Content-Length'] = body.length
      }

      const finalUrl = url || `https://${hostname}${path}`
      const req = https.request(finalUrl, options, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const data = Buffer.concat(chunks)
          try {
            const bodyData = isBuffer ? data : JSON.parse(data.toString())
            resolve({ status: res.statusCode, headers: res.headers, body: bodyData })
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, body: data })
          }
        })
      })

      req.on('error', reject)

      if (body) {
        req.write(isBuffer ? body : JSON.stringify(body))
      }
      req.end()
    })
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = B2Service
