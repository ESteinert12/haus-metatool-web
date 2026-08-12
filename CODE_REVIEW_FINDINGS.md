# HAUS Workspace Code Review — Critical Findings

**Date:** 2026-08-11 | **Reviewer:** Claude Code Analysis

---

## 🚨 CRITICAL ISSUES — FIX BEFORE PRODUCTION

### 1. SQL INJECTION VULNERABILITY
**Location:** `server.js:342-349` — `/api/pg/query` endpoint  
**Severity:** 🔴 CRITICAL — Database compromise possible

```javascript
// VULNERABLE CODE:
app.post('/api/pg/query', async (req, res) => {
  const { sql, params } = req.body
  const result = await pgPool.query(sql, params)  // ❌ Raw SQL from client!
  res.json({ ok: true, rows: result.rows })
})
```

**Attack:** Attacker sends: `{ sql: "DROP TABLE users; --", params: [] }`

**Fix:** Either:
- **Option A (Recommended):** Remove this endpoint entirely. Client should call specific API routes.
- **Option B:** Whitelist only SELECT queries with no JOIN or subquery support
- **Option C:** Use prepared statement cache: reject any query not in pre-defined list

---

### 2. SHELL INJECTION — Multiple Routes
**Location:** `server.js:632, 641, 425`  
**Severity:** 🔴 CRITICAL — Arbitrary command execution

```javascript
// VULNERABLE:
app.post('/api/shell/open-external', (req, res) => {
  const { url } = req.body
  exec(`open "${url}"`)  // ❌ Attacker: url = "x"; rm -rf /"
})

app.post('/api/fs/count-files', (req, res) => {
  const { dirPath, ext } = req.body
  const cmd = `find "${dirPath}" -name "*.${ext}"`  // ❌ Path traversal
  execSync(cmd)
})
```

**Fix:** Use `execFile()` with argument arrays:
```javascript
const { execFile } = require('child_process')
execFile('open', [url], { stdio: 'pipe' }, (err) => {
  // Safe — no shell interpretation
})
```

---

### 3. APPLESCRIPT CODE INJECTION
**Location:** `server.js:745-757` — `/api/applescript` endpoint  
**Severity:** 🔴 CRITICAL — Full system compromise

```javascript
// VULNERABLE:
app.post('/api/applescript', (req, res) => {
  const { script } = req.body  // User-supplied script!
  fs.writeFileSync('/tmp/script.scpt', script)
  exec(`osascript /tmp/script.scpt`)  // ❌ Executes arbitrary code
})
```

**Attack:** Attacker sends AppleScript to delete files, steal data, install malware

**Fix:** Remove this endpoint entirely. If needed, whitelist 5-10 safe AppleScript operations only.

---

### 4. XSS via innerHTML
**Location:** `index.html` — Lines 1201, 1431, 2140, 2312, 2525, 2615, 2740, 3204, 3419+  
**Severity:** 🔴 CRITICAL — Session hijacking, data theft

```javascript
// VULNERABLE PATTERN (appears 50+ times):
listEl.innerHTML = tracks.map(t => 
  `<div>${t.title} / ${t.composerName}</div>`  // ❌ Not escaped!
).join('')

// If t.title = "<img src=x onerror='fetch(/steal/session)'>", XSS fires
```

**Fix:** Use safer alternatives:
```javascript
// Option 1: textContent (for text only)
const div = document.createElement('div')
div.textContent = t.title  // Safe — no HTML parsing
listEl.appendChild(div)

// Option 2: DOMPurify (for rich content)
import DOMPurify from 'dompurify'
listEl.innerHTML = DOMPurify.sanitize(`<div>${t.title}</div>`)

// Option 3: Template + textContent (hybrid)
const template = document.createElement('template')
template.innerHTML = '<div class="track"></div>'
const clone = template.content.cloneNode(true)
clone.querySelector('.track').textContent = t.title
listEl.appendChild(clone)
```

---

### 5. PATH TRAVERSAL — File Serving
**Location:** `server.js:874-947` — B2 stub file serving  
**Severity:** 🔴 CRITICAL — Arbitrary file read

```javascript
// VULNERABLE:
if (bodyStr.startsWith('/')) {
  let localPath = bodyStr  // ❌ Attacker: "/etc/passwd"
  fs.createReadStream(localPath).pipe(res)
}
```

**Attack:** Attacker crafts B2 stub with path = "/Users/HAUS/.env" → reads API keys

**Fix:**
```javascript
const path = require('path')
const expectedBase = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION_UPLOADER'

const resolvedPath = path.resolve(localPath)
if (!resolvedPath.startsWith(expectedBase)) {
  return res.status(403).json({ error: 'Path outside allowed directory' })
}
fs.createReadStream(resolvedPath).pipe(res)
```

---

### 6. HARDCODED SESSION SECRET
**Location:** `server.js:28`  
**Severity:** 🔴 CRITICAL — Session forgery

```javascript
secret: 'haus-workspace-secret-2024'  // ❌ Attacker knows this!
```

Attacker can forge sessions, impersonate any user.

**Fix:**
```javascript
const sessionSecret = process.env.SESSION_SECRET || (() => {
  console.error('⚠️ SESSION_SECRET not set! Using random fallback.')
  return crypto.randomBytes(32).toString('hex')
})()

app.use(session({ secret: sessionSecret, ... }))
```

Set in `.env` or deploy environment:
```
SESSION_SECRET=<32-char random string>
```

---

## 🔥 HIGH PRIORITY (Performance & Stability)

### 7. Memory Leaks — Uncleaned Event Listeners
**Location:** `index.html:1897, 2032, 2041` (and others)  
**Impact:** Memory grows over time; app slows down after hours of use

```javascript
// VULNERABLE (setInterval never stopped):
let interval = setInterval(() => {
  loadComposers()
}, 5000)

// When user switches sections, interval keeps running!
```

**Fix:** Store and clear intervals:
```javascript
let composersInterval = null

function startComposerRefresh() {
  if (composersInterval) clearInterval(composersInterval)
  composersInterval = setInterval(() => loadComposers(), 5000)
}

function stopComposerRefresh() {
  if (composersInterval) clearInterval(composersInterval)
  composersInterval = null
}

// Call stopComposerRefresh() when leaving section
```

---

### 8. N+1 Database Queries
**Location:** `server.js:2198+` — Batch operations  
**Impact:** 100 records = 100 DB round-trips instead of 1

```javascript
// SLOW (N+1):
for (const sku of skus) {
  const res = await pgPool.query(
    'UPDATE mix_stems SET b2_key=$1 WHERE sku_root=$2',
    [b2Key, sku]
  )  // ❌ One query per SKU!
}
```

**Fix:** Batch update:
```javascript
if (skus.length === 0) return
const placeholders = skus.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(',')
const values = skus.flatMap(sku => [b2Key, sku])
await pgPool.query(`
  UPDATE mix_stems SET b2_key = data.b2_key
  FROM (VALUES ${placeholders}) AS data(b2_key, sku_root)
  WHERE mix_stems.sku_root = data.sku_root
`, values)  // ✅ One query for 100 records
```

---

### 9. Monolithic Architecture
**Location:** `server.js` (2787 lines) + `index.html` (13,816 lines)  
**Impact:** Unmaintainable, untestable, security risks multiply

**Current structure:**
```
server.js
├── Auth routes (28 lines)
├── Filesystem routes (400 lines)
├── PostgreSQL routes (800 lines)
├── B2/Backblaze routes (1200 lines)
├── FileMaker routes (100 lines)
└── Intake/staging routes (300 lines)
```

**Recommended refactor:**
```
server/
├── index.js (50 lines — just setup)
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
├── routes/
│   ├── auth.js
│   ├── fs.js (filesystem)
│   ├── db.js (PostgreSQL)
│   ├── b2.js (Backblaze)
│   ├── filemaker.js
│   └── intake.js
├── services/
│   ├── B2Service.js
│   ├── PostgresService.js
│   └── FileMakerService.js
└── utils/
    ├── validation.js
    └── logging.js

client/
├── index.html (structure only)
├── components/
│   ├── IntakeForm.js
│   ├── ComposerTable.js
│   └── PlaylistPane.js
├── services/
│   └── api.js
└── utils/
    ├── db.js
    └── ui.js
```

**Timeline:** 1-2 weeks to refactor, huge payoff in maintainability.

---

## ⚠️ MEDIUM PRIORITY (Code Quality)

### 10. No Input Validation
**Issue:** All routes accept `req.body` without type-checking or length limits

```javascript
// Vulnerable to:
// - Type confusion: { dirPath: 12345 }
// - Denial of service: { sql: 'SELECT' + 'x'.repeat(1000000) }
// - Format mismatch: { fileCount: "not a number" }
```

**Fix:** Add validation middleware (e.g., Joi, Zod):
```javascript
const schema = Joi.object({
  dirPath: Joi.string().required().max(1000),
  ext: Joi.string().max(10)
})
app.post('/api/fs/count-files', validateRequest(schema), (req, res) => {
  // ✅ req.body guaranteed safe
})
```

---

### 11. Inconsistent Error Responses
Routes return different formats:
- `{ ok: false, error: "msg" }`
- `{ error: "msg" }` (missing ok field)
- HTTP 500 with plaintext body
- Unhandled promise rejections

**Fix:** Standardize:
```javascript
const apiResponse = {
  success: (res, data = null, status = 200) => 
    res.status(status).json({ ok: true, data }),
  error: (res, message, status = 400) => 
    res.status(status).json({ ok: false, error: message }),
  serverError: (res, err) => 
    res.status(500).json({ ok: false, error: 'Internal server error' })
}

// Usage:
app.post('/api/intake/generate-sku', (req, res) => {
  try {
    const sku = generateSku(...)
    apiResponse.success(res, { sku })
  } catch (e) {
    apiResponse.error(res, 'Failed to generate SKU')
  }
})
```

---

### 12. Hardcoded Paths
**Locations:** `server.js:1264, 1265, 1585, 2128`  
**Issue:** Tied to specific user directory structure

```javascript
const DROP BOX_OLD = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION_UPLOADER'
const STAGING = cfg.staging  // Sometimes config, sometimes hardcoded
```

**Fix:** Use environment variables:
```
DROPBOX_OLD_PATH=/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION_UPLOADER
STAGING_DIR=/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION_UPLOADER/1. ATMOS_Staging
SHIPPING_DIR=/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION_UPLOADER/2. ATMOS_Shipping
```

---

### 13. No Request Timeouts
**Location:** `server.js:78-101` — `_b2Request()`  
**Issue:** Requests can hang indefinitely

```javascript
https.request({ hostname, path, method, headers }, callback)  // ❌ No timeout
```

**Fix:**
```javascript
const req = https.request({...}, callback)
req.setTimeout(30000)  // 30 second timeout
req.on('timeout', () => req.abort())
```

---

### 14. Manual CSV Parsing
**Location:** `server.js:1302-1318, 1474-1484`  
**Issue:** Brittle quote-handling logic

```javascript
// ❌ Breaks on CSV with quoted commas:
// "Smith, John","123 Main St, Apt 5"
const values = line.split(',')  // Splits wrong!
```

**Fix:** Use library:
```bash
npm install csv-parse
```

```javascript
const { parse } = require('csv-parse/sync')
const records = parse(csvData, { columns: true })
```

---

## 📊 SUMMARY TABLE

| Severity | Issue | File | Line | Risk | Fix Time |
|----------|-------|------|------|------|----------|
| 🔴 CRITICAL | SQL injection | server.js | 342 | DB compromise | 30min |
| 🔴 CRITICAL | Shell injection (3 places) | server.js | 632, 641, 425 | Arbitrary code | 1hr |
| 🔴 CRITICAL | AppleScript injection | server.js | 745 | System compromise | 15min (delete) |
| 🔴 CRITICAL | XSS (50+ locations) | index.html | 1201+ | Session theft | 4-6hrs |
| 🔴 CRITICAL | Path traversal | server.js | 874 | Credential theft | 30min |
| 🔴 CRITICAL | Hardcoded session secret | server.js | 28 | Session forgery | 15min |
| 🔥 HIGH | Memory leaks | index.html | 1897+ | Slowdown | 2hrs |
| 🔥 HIGH | N+1 queries | server.js | 2198 | Performance | 2hrs |
| 🔥 HIGH | Monolithic architecture | both | all | Unmaintainable | 1-2 weeks |
| ⚠️ MEDIUM | No input validation | server.js | all routes | Type confusion | 3hrs |
| ⚠️ MEDIUM | Inconsistent errors | server.js | all routes | Debugging hard | 1hr |
| ⚠️ MEDIUM | Hardcoded paths | server.js | 1264+ | Not portable | 30min |
| ⚠️ MEDIUM | No request timeouts | server.js | 78 | Hangs | 15min |

---

## 🎯 ACTION PLAN

**PHASE 1 — This Week (Block Production Deployment)**
1. Remove `/api/pg/query` endpoint
2. Fix shell injection: use `execFile()` instead of `exec()`
3. Remove `/api/applescript` endpoint
4. Add XSS sanitization to innerHTML calls (top 10 locations)
5. Validate all path parameters
6. Move session secret to env var

**PHASE 2 — Next Week (Deploy to Production)**
7. Add input validation middleware
8. Standardize error responses
9. Fix memory leaks (cleanup intervals)
10. Optimize N+1 queries

**PHASE 3 — Sprint (Long-term Improvement)**
11. Refactor monolithic server/client architecture (1-2 weeks)
12. Add comprehensive logging
13. Write unit tests for critical functions
14. Set up security scanning in CI/CD

---

## Questions?

Review these findings and let me know:
1. Which issues do you want me to fix first?
2. Should I create pull requests with patches?
3. Do you want to refactor the architecture now or defer to 2.0?
