# Phase C: Monolithic Refactor Plan

**Branch:** `refactor/architecture`  
**Status:** Starting  
**Duration:** 20-30 hours estimated  
**Goal:** Split 2,787-line server.js → modular 150-line server + services/routes/middleware

---

## Current State

**server.js:** 2,787 lines, single file contains:
- 66 routes (mixed concerns)
- B2 API logic (620 lines inline)
- Database helpers
- Auth logic
- File system operations
- Shell execution
- Session management

**Problems:**
- ❌ Hard to test (no isolation)
- ❌ Hard to audit (security scattered)
- ❌ Hard to extend (circular dependencies)
- ❌ Hard to maintain (logic not grouped)

---

## Target Architecture

```
haus-workspace/
├── server.js (150 lines — setup only)
│
├── middleware/
│   ├── auth.js (session + auth guard)
│   ├── errorHandler.js (centralized error logging)
│   └── validation.js (input validation helpers)
│
├── routes/
│   ├── index.js (register all routes)
│   ├── auth.js (login, logout, session)
│   ├── db.js (pgQ, transactions, helpers)
│   ├── b2.js (B2 API endpoints)
│   ├── fs.js (file system endpoints)
│   ├── shell.js (shell/CLI endpoints)
│   ├── audio.js (audio playback/streaming)
│   ├── intake.js (intake workflow)
│   ├── filemaker.js (FileMaker integration)
│   └── health.js (status, health checks)
│
├── services/
│   ├── B2Service.js (all B2 operations, 400 lines)
│   ├── PostgresService.js (DB connection pool)
│   ├── FileMakerService.js (FileMaker REST API)
│   ├── AudioService.js (audio metadata, detection)
│   └── FileSystemService.js (safe FS operations)
│
├── utils/
│   ├── validation.js (input sanitization)
│   ├── logging.js (structured logging)
│   ├── errors.js (custom error classes)
│   └── helpers.js (common utilities)
│
├── config/
│   ├── constants.js (ports, timeouts, limits)
│   └── environment.js (env var loading)
│
├── index.html (no changes)
└── tests/
    ├── B2Service.test.js
    ├── auth.test.js
    ├── routes/fs.test.js
    └── integration.test.js
```

---

## Refactoring Steps (in order)

### Step 1: Create Directory Structure
- [ ] `mkdir -p middleware routes services utils config tests`
- [ ] Create `package.json` scripts for testing

### Step 2: Extract Services
- [ ] **B2Service.js** — Move all B2 logic from server.js
  - `authorize()`, `listFiles()`, `uploadFile()`, `downloadFile()`
  - `auditBucket()`, `recoverPhase1()`, `recoverPhase2()`
  - Full test coverage
  
- [ ] **PostgresService.js** — Wrap connection pool
  - `pgQ()` helper → `query()`
  - Connection lifecycle
  
- [ ] **FileSystemService.js** — Safe FS operations
  - Validated path access
  - Directory walking
  
- [ ] **AudioService.js** — Audio metadata
  - File detection
  - Metadata extraction

### Step 3: Extract Middleware
- [ ] **auth.js** — Session auth guard
  - Extract session setup from server.js
  - PUBLIC_ROUTES check
  
- [ ] **errorHandler.js** — Centralized error handling
  - 404 handler
  - 500 error logging
  - Request/response timing

### Step 4: Extract Routes
- [ ] **auth.js** — `/auth/*` routes
  - `POST /auth/login`
  - `POST /auth/logout`
  
- [ ] **db.js** — `/api/pg/*` routes
  - `POST /api/pg/query`
  - `GET /api/pg/status`
  
- [ ] **b2.js** — `/api/b2/*` routes (calls B2Service)
  - `POST /api/b2/authorize`
  - `GET /api/b2/list-buckets`
  - `POST /api/b2/upload`
  - `GET /api/b2/full-audit`
  - `POST /api/b2/recovery/phase1`
  - `POST /api/b2/recovery/phase2`
  
- [ ] **fs.js** — `/api/fs/*` routes (calls FileSystemService)
  - `GET /api/fs/read-dir`
  - `GET /api/fs/count-files`
  - `POST /api/fs/write-file`
  
- [ ] **shell.js** — `/api/shell/*` routes
  - `POST /api/shell/open-external`
  - `POST /api/shell/show-in-finder`
  
- [ ] **audio.js** — `/api/audio/*` routes
  - `GET /api/audio/stream`
  - `POST /api/audio/metadata`
  
- [ ] **intake.js** — `/api/intake/*` routes
  - File discovery
  - Metadata extraction
  
- [ ] **filemaker.js** — FileMaker integration
  - REST API calls

### Step 5: Refactor server.js
- [ ] Remove all route handlers (move to routes/)
- [ ] Remove all B2 logic (move to services/B2Service.js)
- [ ] Remove all FS logic (move to services/FileSystemService.js)
- [ ] Keep only:
  - Express app setup
  - Middleware registration
  - Route mounting
  - Port listening
  - Error handlers

**New server.js will be:**
```javascript
const express = require('express')
const app = express()

// Middleware
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(require('./middleware/auth'))
app.use(require('./middleware/errorHandler'))

// Routes
app.use('/api', require('./routes'))

// Static files
app.use(express.static(__dirname))

// Start server
const PORT = process.env.PORT || 9999
app.listen(PORT, () => console.log(`🎵 HAUS running on ${PORT}`))
```

### Step 6: Write Tests
- [ ] **B2Service.test.js** — Mock B2 API, test upload/download
- [ ] **FileSystemService.test.js** — Test path validation
- [ ] **auth.test.js** — Test login, session, guards
- [ ] **routes/fs.test.js** — Test FS endpoints

### Step 7: Integration Testing
- [ ] Start server, test all routes
- [ ] Verify B2 audit works
- [ ] Verify audio streaming works
- [ ] Verify intake workflow works

### Step 8: Commit & Document
- [ ] Commit refactored code to `refactor/architecture`
- [ ] Create ARCHITECTURE.md documenting new structure
- [ ] Update README with setup/testing instructions

---

## File-by-File Breakdown

### middleware/auth.js (~50 lines)
```javascript
const session = require('express-session')

module.exports = (req, res, next) => {
  // Session setup
  // Auth guard logic
  // PUBLIC_ROUTES check
}
```

### services/B2Service.js (~400 lines)
```javascript
class B2Service {
  constructor(keyId, appKey, bucketId) { }
  async authorize() { }
  async listFiles() { }
  async uploadFile(localPath, b2Key) { }
  async downloadFile(b2Key, destPath) { }
  async auditBucket() { }
  async recoverPhase1(shippingDir) { }
  async recoverPhase2(dropboxToken) { }
}
module.exports = B2Service
```

### routes/b2.js (~60 lines)
```javascript
const express = require('express')
const B2Service = require('../services/B2Service')

const router = express.Router()
const b2 = new B2Service(process.env.B2_KEY_ID, process.env.B2_APP_KEY)

router.post('/authorize', async (req, res) => {
  try {
    await b2.authorize()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ... other routes
module.exports = router
```

---

## Benefits After Refactoring

| Aspect | Before | After |
|--------|--------|-------|
| Main file | 2,787 lines | 150 lines |
| B2 logic | Scattered | B2Service.js (testable) |
| Route count | 66 in 1 file | 66 across 10 files |
| Test coverage | Hard to test | Unit testable |
| Security audit | Difficult | Clear flow per service |
| Onboarding | 1-2 days | Few hours |
| Error handling | Ad-hoc | Centralized |
| Code reuse | Limited | High (services) |

---

## Testing Strategy

**Unit tests:**
- B2Service (mock B2 API)
- FileSystemService (test path validation)
- Auth (test login flows)

**Integration tests:**
- Start server
- Test full routes: B2 audit → upload → verify

**Performance tests:**
- Batch upload timing (Phase 1 recovery)
- Concurrent requests handling

---

## Risk Mitigation

**Risk:** Breaking changes in refactoring  
**Mitigation:** 
- Keep `refactor/architecture` separate from `fix/composers-management`
- Test thoroughly before merge
- Cherry-pick individual route refactors if needed

**Risk:** Performance regression  
**Mitigation:**
- Profile before/after with load test
- Monitor memory usage in services

**Risk:** Security regression  
**Mitigation:**
- Audit auth middleware carefully
- Keep security patches from Phase A active
- Test path validation in FileSystemService

---

## Success Criteria

✅ All 66 routes working with same behavior  
✅ B2Service fully extracted and tested  
✅ No performance regression  
✅ 95%+ code coverage on services  
✅ server.js under 200 lines  
✅ Clean separation of concerns  
✅ All tests pass  

---

## Next Steps

1. **Today:** Create directory structure + start B2Service extraction
2. **Tomorrow:** Extract remaining services + middleware
3. **Later this week:** Refactor routes + write tests
4. **End of week:** Integration testing + merge to `refactor/architecture`
5. **Following week:** Merge `refactor/architecture` to `main` for production

---

**Estimated completion:** Week of 2026-08-18
