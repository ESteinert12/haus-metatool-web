# B2Service Architecture Design

**For refactor/architecture branch**

This service encapsulates ALL B2 operations, making them testable, reusable, and secure. It handles both current B2 features AND the 30K+ stub recovery work.

---

## Current Architecture (Monolithic)

```
server.js (66 routes, 2787 lines)
├── B2 auth logic scattered in /api/b2/authorize
├── B2 list logic in /api/b2/list-files
├── B2 audit in /api/b2/full-audit (620 lines of inline code)
├── B2 download in /api/audio/stream
├── Stub detection mixed into audit
├── Recovery endpoints in /api/b2/recovery-from-dropbox
└── ❌ Hard to test, audit, or extend
```

---

## Proposed Architecture (Modular)

```
services/
└── B2Service.js (core class, ~400 lines)
    ├── B2 API communication (auth, requests)
    ├── File operations (list, download, upload)
    ├── Stub detection & classification
    ├── Batch operations (resume-able)
    ├── Recovery operations (Phase 1 & 2)
    └── Progress tracking

routes/
└── b2.js (60 lines, just HTTP)
    ├── POST /api/b2/authorize → call B2Service.authorize()
    ├── GET /api/b2/list-buckets → call B2Service.listBuckets()
    ├── GET /api/audio/stream → call B2Service.downloadFile()
    ├── GET /api/b2/full-audit → call B2Service.auditBucket()
    ├── POST /api/b2/upload → call B2Service.uploadFile()
    ├── POST /api/b2/recovery/phase1 → call B2Service.recoverPhase1()
    └── POST /api/b2/recovery/phase2 → call B2Service.recoverPhase2()

tests/
└── B2Service.test.js (unit tests)
    ├── Mock B2 API responses
    ├── Test each method independently
    └── ✅ Easy to run locally
```

---

## B2Service Class Design

```javascript
// services/B2Service.js

class B2Service {
  constructor(appKeyId, appKey, bucketId = 'haus-music') {
    this.appKeyId = appKeyId
    this.appKey = appKey
    this.bucketId = bucketId
    this.auth = null
    this.uploadUrl = null
    this.uploadAuth = null
    this._batchCheckpoint = null  // Resume support
  }

  // ─── AUTH ───────────────────────────────────────────
  async authorize() {
    // Get B2 auth token, expires in 24hrs
    // Store in this.auth
  }

  async refreshAuth() {
    // Re-authorize if token expired
  }

  // ─── FILE OPERATIONS ────────────────────────────────
  async listBuckets() {
    // Return all B2 buckets accessible with this key
    // Used by UI to pick bucket
  }

  async listFiles(prefix = '', maxCount = 1000) {
    // List all files in bucket with optional prefix
    // Returns: [{ fileName, size, uploadTimestamp, b2Key }, ...]
  }

  async uploadFile(localPath, b2FileName) {
    // Upload single file to B2
    // Returns: { b2Key, size, uploadTime }
  }

  async downloadFile(b2Key, destPath) {
    // Download file from B2 to local filesystem
    // Used by /api/audio/stream
  }

  async deleteFile(b2Key) {
    // Delete file from B2 (rarely needed)
  }

  // ─── AUDIT & CLASSIFICATION ─────────────────────────
  async auditBucket() {
    // List ALL files in bucket, classify each
    // Returns summary: { stubs: 30703, real: 152345, analysis: [...] }
    
    const files = await this.listFiles()
    return files.map(f => ({
      ...f,
      type: this._classifyFile(f),
      sku: this._extractSKU(f.fileName),
      composer: this._extractComposer(f.fileName)
    }))
  }

  _classifyFile(file) {
    // Determine if file is STUB or REAL
    if (file.size === 0) return 'STUB_EMPTY'
    if (file.size < 1024 * 1024) return 'STUB_SMALL'  // < 1MB
    return 'REAL_AUDIO'
  }

  _extractSKU(fileName) {
    // Parse B2 filename to extract SKU
    // "HAUS_MoonlightSonata_BbMajor_R48_FULL.wav" → "SKU123"
    const match = fileName.match(/HAUS_.*?_([A-Z]\d+[a-z]?)/)
    return match ? match[1] : null
  }

  _extractComposer(fileName) {
    // Parse filename to extract composer ID
    // "HAUS_MoonlightSonata_BbMajor_R48_FULL.wav" → "R48"
    const match = fileName.match(/_([A-Z]\d+)_/)
    return match ? match[1] : null
  }

  // ─── BATCH OPERATIONS (Resume-able) ─────────────────
  async batchUpload(filePaths, options = {}) {
    // Upload multiple files with resume support
    // Options: { batchSize = 10, resumeFrom = null, onProgress = null }
    
    const results = []
    let startIdx = options.resumeFrom ? this._batchCheckpoint.lastIndex : 0
    
    for (let i = startIdx; i < filePaths.length; i++) {
      try {
        const result = await this.uploadFile(
          filePaths[i],
          path.basename(filePaths[i])
        )
        results.push({ ok: true, ...result })
        
        // Checkpoint every 50 files (resume point if network fails)
        if (i % 50 === 0) {
          this._batchCheckpoint = { lastIndex: i, time: Date.now() }
          options.onProgress?.({ done: i, total: filePaths.length })
        }
      } catch (e) {
        results.push({ ok: false, file: filePaths[i], error: e.message })
      }
    }
    
    return { ok: true, results, checkpoint: this._batchCheckpoint }
  }

  async batchDownload(b2Keys, destDir, options = {}) {
    // Download multiple files in parallel
    // Resume support: skip already-downloaded files
    
    const pLimit = require('p-limit')
    const limit = pLimit(options.concurrency || 5)
    
    const tasks = b2Keys.map(key =>
      limit(async () => {
        const destPath = path.join(destDir, path.basename(key))
        
        // Skip if already downloaded
        if (fs.existsSync(destPath)) return { ok: true, skipped: true }
        
        try {
          await this.downloadFile(key, destPath)
          return { ok: true, key, destPath }
        } catch (e) {
          return { ok: false, key, error: e.message }
        }
      })
    )
    
    return Promise.all(tasks)
  }

  // ─── RECOVERY OPERATIONS ────────────────────────────
  async recoverPhase1(shippingDir) {
    // Phase 1: Upload real files from SHIPPING folder
    // Find matching stubs in B2, replace with real audio
    
    // 1. List all files in SHIPPING folder
    const shippingFiles = await this._walkDir(shippingDir)
    
    // 2. List all stubs in B2
    const stubs = await this._findStubs()
    
    // 3. Match SHIPPING files to stubs by SKU
    const matches = this._matchFilesToStubs(shippingFiles, stubs)
    
    // 4. Upload matches (replace stubs)
    const results = await this.batchUpload(
      matches.map(m => m.localPath),
      { onProgress: this._onPhase1Progress }
    )
    
    return {
      ok: true,
      phase: 1,
      matched: matches.length,
      uploaded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok),
      results
    }
  }

  async recoverPhase2(dropboxCredentials, dropboxAuthToken) {
    // Phase 2: Download from old Dropbox, upload to B2
    
    // 1. List files in old Dropbox (via OAuth token)
    const dropboxFiles = await this._listDropboxFiles(
      dropboxAuthToken,
      ['S33a', 'R13a', 'R46a']  // Top 3 composers needing recovery
    )
    
    // 2. Download from Dropbox to temp dir
    const tempDir = '/tmp/b2-recovery-phase2'
    fs.mkdirSync(tempDir, { recursive: true })
    
    const downloaded = await this.batchDownload(dropboxFiles, tempDir, {
      concurrency: 5,  // Don't overload Dropbox API
      onProgress: (p) => console.log(`Downloaded ${p.done}/${p.total}`)
    })
    
    // 3. Upload from temp to B2
    const uploaded = await this.batchUpload(
      downloaded.filter(d => d.ok).map(d => d.destPath),
      { onProgress: this._onPhase2Progress }
    )
    
    // 4. Cleanup temp dir
    fs.rmSync(tempDir, { recursive: true })
    
    return {
      ok: true,
      phase: 2,
      downloaded: downloaded.filter(d => d.ok).length,
      uploaded: uploaded.filter(r => r.ok).length,
      failed: uploaded.filter(r => !r.ok),
      results: { downloaded, uploaded }
    }
  }

  // ─── PROGRESS TRACKING ──────────────────────────────
  async getRecoveryProgress() {
    // Return current status of recovery operations
    // Used by UI to show progress bar
    
    const stubs = await this._findStubs()
    const phase1Done = stubs.filter(s => !s.isStub).length
    const phase2Done = 0  // Would query database for completed Phase 2
    
    return {
      phase1: { done: phase1Done, total: 800, percent: Math.round(phase1Done / 8) },
      phase2: { done: phase2Done, total: 29903, percent: 0 },
      totalProgress: {
        done: phase1Done + phase2Done,
        total: 30703,
        percent: Math.round((phase1Done + phase2Done) / 307.03)
      }
    }
  }

  // ─── INTERNAL HELPERS ───────────────────────────────
  async _walkDir(dirPath) {
    // Recursively list all files in directory
    // Returns: [{ path, size, name }, ...]
  }

  async _findStubs() {
    // List all stub files in B2 bucket
    // Returns: [{ b2Key, fileName, size, isStub: true }, ...]
  }

  _matchFilesToStubs(localFiles, stubs) {
    // Given local SHIPPING files and B2 stubs,
    // match them by SKU (if possible)
    // Returns: [{ localPath, stubB2Key }, ...]
  }

  async _listDropboxFiles(authToken, composerFilter) {
    // Query old Dropbox API for files by composer
    // Requires: /oauth2/files/list_folder endpoint
  }

  _onPhase1Progress(progress) {
    console.log(`Phase 1: ${progress.done}/${progress.total} uploaded`)
  }

  _onPhase2Progress(progress) {
    console.log(`Phase 2: ${progress.done}/${progress.total} uploaded`)
  }
}

module.exports = B2Service
```

---

## Usage in Routes

```javascript
// routes/b2.js

const B2Service = require('../services/B2Service')

// Initialize service (from config)
const b2 = new B2Service(
  process.env.B2_KEY_ID,
  process.env.B2_APP_KEY,
  'haus-music'
)

// ─── Audit ──────────────────────────────────────────
app.get('/api/b2/full-audit', async (req, res) => {
  try {
    const audit = await b2.auditBucket()
    res.json({ ok: true, audit })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Recovery Phase 1 ───────────────────────────────
app.post('/api/b2/recovery/phase1', async (req, res) => {
  try {
    const result = await b2.recoverPhase1('/path/to/SHIPPING')
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Recovery Phase 2 ───────────────────────────────
app.post('/api/b2/recovery/phase2', async (req, res) => {
  const { dropboxAuthToken } = req.body
  
  try {
    const result = await b2.recoverPhase2(
      { /* dropbox creds */ },
      dropboxAuthToken
    )
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Progress ───────────────────────────────────────
app.get('/api/b2/recovery/progress', async (req, res) => {
  try {
    const progress = await b2.getRecoveryProgress()
    res.json({ ok: true, progress })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// All other B2 routes follow the same pattern
```

---

## Testing Strategy

```javascript
// tests/B2Service.test.js

const B2Service = require('../services/B2Service')

describe('B2Service', () => {
  let b2

  beforeEach(() => {
    b2 = new B2Service('test-key', 'test-secret')
    // Mock B2 API responses
  })

  describe('File Classification', () => {
    it('classifies 0-byte files as STUB_EMPTY', () => {
      const result = b2._classifyFile({ size: 0 })
      expect(result).toBe('STUB_EMPTY')
    })

    it('classifies <1MB files as STUB_SMALL', () => {
      const result = b2._classifyFile({ size: 500000 })
      expect(result).toBe('STUB_SMALL')
    })

    it('classifies >1MB files as REAL_AUDIO', () => {
      const result = b2._classifyFile({ size: 50000000 })
      expect(result).toBe('REAL_AUDIO')
    })
  })

  describe('SKU Extraction', () => {
    it('extracts SKU from B2 filename', () => {
      const sku = b2._extractSKU('HAUS_MoonlightSonata_BbMajor_R48_FULL.wav')
      expect(sku).toBe('R48')
    })
  })

  describe('Batch Upload', () => {
    it('uploads multiple files with checkpoint', async () => {
      const files = ['/tmp/file1.wav', '/tmp/file2.wav']
      const result = await b2.batchUpload(files)
      expect(result.results.length).toBe(2)
    })

    it('resumes from checkpoint on error', async () => {
      // Simulate network failure at file 50
      // Resume from checkpoint, continue from file 50
    })
  })

  describe('Phase 1 Recovery', () => {
    it('finds matching SHIPPING files and B2 stubs', async () => {
      // Mock SHIPPING folder with 10 files
      // Mock B2 stubs
      // Verify matches are correct
    })
  })
})
```

---

## File Structure (After Refactor)

```
haus-workspace/
├── server.js (150 lines - just setup, routes, middleware)
├── middleware/
│   ├── auth.js
│   ├── errorHandler.js
│   └── validation.js
├── routes/
│   ├── auth.js
│   ├── fs.js
│   ├── db.js
│   ├── b2.js (60 lines - calls B2Service)
│   ├── filemaker.js
│   └── intake.js
├── services/
│   ├── B2Service.js (400 lines - all B2 logic)
│   ├── PostgresService.js
│   └── FileMakerService.js
├── utils/
│   ├── validation.js
│   ├── logging.js
│   └── errors.js
└── tests/
    ├── B2Service.test.js
    └── auth.test.js
```

---

## Benefits

| Before (Monolithic) | After (Modular) |
|---|---|
| 2787-line server.js | 150-line server.js |
| 620-line audit inline | 50-line route, B2Service handles it |
| Hard to test B2 logic | Unit test B2Service in isolation |
| Security audit difficult | Each service independently reviewable |
| Stub recovery mixed with auth | Dedicated recovery methods |
| N+1 queries scattered | Batch operations in one place |
| Memory leaks hard to find | Clear resource management |

---

## Timeline to Implement

- **Week 1:** Audit + security fixes (2-3 hrs)
- **Week 2-3:** Extract B2Service, move logic from server.js (20 hrs)
- **Week 3-4:** Unit tests for B2Service (10 hrs)
- **Week 4:** Integration testing with real B2 (5 hrs)
- **Week 5:** Deploy refactored version (2 hrs)

**Total:** ~37 hours (adds 1-2 days to 5-week timeline)

Ready to implement?
