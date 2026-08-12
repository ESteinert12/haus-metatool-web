# Security Patches — CRITICAL Vulnerabilities

Apply these to BOTH `main` and `refactor/architecture` branches immediately.

---

## Patch 1: Remove SQL Injection Endpoint

**File:** `server.js`  
**Lines:** 342-349  
**Severity:** 🔴 CRITICAL

### Current (VULNERABLE):
```javascript
app.post('/api/pg/query', async (req, res) => {
  const { sql, params } = req.body
  const result = await pgPool.query(sql, params)  // ❌ Raw SQL from client!
  res.json({ ok: true, rows: result.rows })
})
```

### Fix: DELETE THIS ENDPOINT ENTIRELY

This endpoint allows attackers to send any SQL command. There's no safe way to whitelist it.

**Replacement:** Client should call specific API routes (e.g., `/api/composers/list`, `/api/tracks/search`).

```bash
# In server.js, delete lines 342-349 entirely
# Then search for any client code calling this endpoint:
grep -r "pg/query" haus-workspace/index.html
# Update those calls to use specific endpoints instead
```

---

## Patch 2: Fix Shell Injection (3 Routes)

**File:** `server.js`  
**Lines:** 632, 641, 425  
**Severity:** 🔴 CRITICAL

### Problem:
```javascript
// Line 632 - VULNERABLE:
app.post('/api/shell/open-external', (req, res) => {
  const { url } = req.body
  exec(`open "${url}"`)  // ❌ No escaping! Attacker: url = "x\"; rm -rf /"
})

// Line 641 - VULNERABLE:
app.post('/api/shell/show-in-finder', (req, res) => {
  const { filePath } = req.body
  exec(`open -R "${filePath}"`)  // ❌ Path traversal + injection
})

// Line 425 - VULNERABLE:
app.post('/api/fs/count-files', (req, res) => {
  const { dirPath, ext } = req.body
  const cmd = `find "${dirPath}" -name "*.${ext}"`
  execSync(cmd)  // ❌ Directory traversal
})
```

### Fix: Use `execFile()` instead of `exec()`

```javascript
const { execFile } = require('child_process')

// Patch for /api/shell/open-external (line 632):
app.post('/api/shell/open-external', (req, res) => {
  const { url } = req.body
  
  // Validate URL format
  try {
    new URL(url)  // Throws if invalid
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Invalid URL' })
  }
  
  // ✅ Safe: no shell interpretation, URL passed as argument
  execFile('open', [url], { stdio: 'pipe' }, (err) => {
    if (err) res.json({ ok: false, error: err.message })
    else res.json({ ok: true })
  })
})

// Patch for /api/shell/show-in-finder (line 641):
app.post('/api/shell/show-in-finder', (req, res) => {
  const { filePath } = req.body
  
  // Validate path is within allowed directories
  const path = require('path')
  const homeDir = require('os').homedir()
  const resolvedPath = path.resolve(filePath)
  
  if (!resolvedPath.startsWith(homeDir)) {
    return res.status(403).json({ ok: false, error: 'Path outside home directory' })
  }
  
  // ✅ Safe: path passed as argument, not interpolated
  execFile('open', ['-R', resolvedPath], { stdio: 'pipe' }, (err) => {
    if (err) res.json({ ok: false, error: err.message })
    else res.json({ ok: true })
  })
})

// Patch for /api/fs/count-files (line 425):
app.post('/api/fs/count-files', (req, res) => {
  const { dirPath, ext } = req.body
  
  // Validate inputs
  if (typeof dirPath !== 'string' || typeof ext !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid input' })
  }
  if (ext.length > 10 || ext.includes('/')) {
    return res.status(400).json({ ok: false, error: 'Invalid extension' })
  }
  
  // ✅ Safe: no shell command, just Node.js fs operations
  const fs = require('fs')
  const path = require('path')
  let count = 0
  
  try {
    const walkDir = (dir) => {
      const files = fs.readdirSync(dir)
      for (const file of files) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else if (file.endsWith(`.${ext}`)) {
          count++
        }
      }
    }
    walkDir(dirPath)
    res.json({ ok: true, count })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})
```

---

## Patch 3: Remove AppleScript Endpoint

**File:** `server.js`  
**Lines:** 745-757  
**Severity:** 🔴 CRITICAL

### Current (VULNERABLE):
```javascript
app.post('/api/applescript', (req, res) => {
  const { script } = req.body
  fs.writeFileSync('/tmp/script.scpt', script)  // ❌ User controls script!
  exec(`osascript /tmp/script.scpt`)  // ❌ Arbitrary code execution
})
```

### Fix: DELETE THIS ENDPOINT

AppleScript has access to the entire macOS system. There's no safe way to accept user-supplied scripts.

**If you need AppleScript later**, whitelist only 3-5 safe operations:
```javascript
const SAFE_APPLESCRIPT_OPS = {
  'open_url': (url) => `open location "${url}"`,
  'show_in_finder': (path) => `reveal (POSIX file "${path}")`,
  'get_clipboard': () => `return the clipboard`
  // ... only these 3
}

app.post('/api/applescript', (req, res) => {
  const { operation, args } = req.body
  if (!SAFE_APPLESCRIPT_OPS[operation]) {
    return res.status(400).json({ ok: false, error: 'Invalid operation' })
  }
  // ... generate safe script from whitelist
})
```

For now: **DELETE the entire endpoint**.

```bash
# In server.js, delete lines 745-757
grep -r "applescript" haus-workspace/index.html  # Check if client uses it
# If used, replace with safe HTTP endpoints
```

---

## Patch 4: Fix XSS Vulnerabilities (innerHTML)

**File:** `index.html`  
**Locations:** 1201, 1431, 2140, 2312, 2525, 2615, 2740, 3204, 3419+ (50+ places)  
**Severity:** 🔴 CRITICAL

### Problem:
```javascript
// ❌ VULNERABLE PATTERN (appears 50+ times):
const div = document.createElement('div')
div.innerHTML = tracks.map(t => `<div>${t.title}</div>`).join('')
// If t.title = "<img src=x onerror='steal_session()'>", XSS fires

// ❌ ANOTHER PATTERN:
element.innerHTML = `<div>${error.message}</div>`
// Attacker: error.message = "<script>steal_data()</script>"
```

### Fix Strategy:

**Option A (Safest): Use textContent for text-only content**
```javascript
const div = document.createElement('div')
const list = document.createElement('ul')
tracks.forEach(t => {
  const li = document.createElement('li')
  li.textContent = t.title  // ✅ No HTML parsing, safe
  list.appendChild(li)
})
div.appendChild(list)
```

**Option B (If you need HTML): Use DOMPurify library**
```javascript
// Add to index.html:
// <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>

const html = tracks.map(t => `<div>${t.title}</div>`).join('')
div.innerHTML = DOMPurify.sanitize(html)  // ✅ Removes malicious scripts
```

**Option C (Hybrid): Template + textContent**
```javascript
const template = document.createElement('template')
template.innerHTML = '<li><span class="title"></span></li>'

tracks.forEach(t => {
  const clone = template.content.cloneNode(true)
  clone.querySelector('.title').textContent = t.title  // ✅ Safe
  list.appendChild(clone)
})
```

### Implementation (Pick ONE approach):
```bash
# Find all innerHTML assignments:
grep -n "\.innerHTML\s*=" haus-workspace/index.html | head -20

# For each, decide:
# - Text only? → Use textContent
# - Rich HTML needed? → Wrap in DOMPurify.sanitize()
# - Complex structure? → Use template + textContent

# Example fix (line 1201):
# BEFORE: listEl.innerHTML = `<div>${t.name}</div>`
# AFTER:  
#   const div = document.createElement('div')
#   div.textContent = t.name
#   listEl.appendChild(div)
```

**Priority:** Start with the 10 most frequently used innerHTML calls (likely in renderComposerRows, renderTrackList, renderLotsSidebar).

---

## Patch 5: Fix Path Traversal

**File:** `server.js`  
**Lines:** 874-947  
**Severity:** 🔴 CRITICAL

### Problem:
```javascript
// Line 874+ - VULNERABLE:
if (bodyStr.startsWith('/')) {
  let localPath = bodyStr  // ❌ No validation!
  // Attacker: localPath = "/etc/passwd" or "/Users/HAUS/.env"
  fs.createReadStream(localPath).pipe(res)
}
```

### Fix:
```javascript
const path = require('path')
const os = require('os')

// Allowed base directory
const ALLOWED_BASE = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER'

if (bodyStr.startsWith('/')) {
  const localPath = bodyStr
  
  // ✅ Validate path is within allowed directory
  const resolvedPath = path.resolve(localPath)
  const resolvedBase = path.resolve(ALLOWED_BASE)
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    return res.status(403).json({ 
      ok: false, 
      error: 'Path outside allowed directory' 
    })
  }
  
  // ✅ Now safe to serve file
  fs.createReadStream(resolvedPath).pipe(res)
}
```

---

## Patch 6: Fix Hardcoded Session Secret

**File:** `server.js`  
**Line:** 28  
**Severity:** 🔴 CRITICAL

### Problem:
```javascript
// ❌ VULNERABLE:
secret: 'haus-workspace-secret-2024'  // Attacker knows this!
// Session forgery: attacker forges cookie as any user
```

### Fix:
```javascript
const crypto = require('crypto')

// ✅ Use environment variable
const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret) {
  console.error('❌ ERROR: SESSION_SECRET not set in environment!')
  console.error('Set it: export SESSION_SECRET=$(openssl rand -base64 32)')
  process.exit(1)
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}))
```

**Before deploying, set environment variable:**
```bash
# Generate random secret
export SESSION_SECRET=$(openssl rand -base64 32)

# Or add to .env file:
echo "SESSION_SECRET=$(openssl rand -base64 32)" >> /Users/HAUS/.haus-workspace.env
source /Users/HAUS/.haus-workspace.env
node server.js
```

---

## Deploy Checklist

- [ ] Delete `/api/pg/query` endpoint (Patch 1)
- [ ] Replace `exec()` with `execFile()` (Patch 2 — 3 routes)
- [ ] Delete `/api/applescript` endpoint (Patch 3)
- [ ] Convert `innerHTML` to `textContent` or DOMPurify (Patch 4 — top 10 calls)
- [ ] Add path validation to B2 stub serving (Patch 5)
- [ ] Move session secret to environment variable (Patch 6)
- [ ] Test all routes still work
- [ ] Commit to `main` branch
- [ ] Cherry-pick to `refactor/architecture` branch

**Total Time:** 2-3 hours  
**Testing:** 30 minutes

After patches deployed, these vulnerabilities are **closed**.

