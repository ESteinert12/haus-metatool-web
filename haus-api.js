// haus-api.js — window.haus fetch shim
// Mirrors the Electron preload.js API exactly, but uses fetch() → Express server.
// Loaded as a <script> in index.html when running in web mode.

;(function () {

  async function _post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return r.json()
  }

  async function _get(path) {
    const r = await fetch(path)
    return r.json()
  }

  // ── Filesystem ──────────────────────────────────────────────────────────
  const fs = {
    readDir:     (p)       => _post('/api/fs/read-dir',     { dirPath: p }),
    countFiles:  (p, ext)  => _post('/api/fs/count-files',  { dirPath: p, ext }),
    pathExists:  (p)       => _post('/api/fs/path-exists',  { filePath: p }),
    readFile:    (p)       => _post('/api/fs/read-file',    { filePath: p }),
    writeFile:   (p, c)    => _post('/api/fs/write-file',   { filePath: p, content: c }),
    folderStats: (p)       => _post('/api/fs/folder-stats', { dirPath: p }),
  }

  // ── Shell ───────────────────────────────────────────────────────────────
  const shell = {
    exec:             (cmd, cwd) => _post('/api/shell/exec',             { cmd, cwd }),
    showInFinder:     (p)        => _post('/api/shell/show-in-finder',   { filePath: p }),
    openExternal:     (url)      => _post('/api/shell/open-external',    { url }),
    appPath:          ()         => _get('/api/shell/app-path'),
    homeDir:          ()         => _get('/api/shell/home-dir'),
    // In web mode the server can't open a native dialog — returns null so
    // the Settings UI falls back to a text input for the path.
    showFolderPicker: ()         => _get('/api/shell/show-folder-picker'),
  }

  // ── AppleScript ─────────────────────────────────────────────────────────
  // Note: only runs on the server machine. Kyle's browser calls go to the
  // server, which runs the script locally — this is intentional.
  async function applescript(script) {
    return _post('/api/applescript', { script })
  }

  // ── FileMaker ───────────────────────────────────────────────────────────
  const fm = {
    login:     (host, db, user, pass)     => _post('/api/fm/login',     { host, database: db, user, pass }),
    logout:    (db)                       => _post('/api/fm/logout',    { database: db }),
    databases: (host, user, pass)         => _post('/api/fm/databases', { host, user, pass }),
    query:     (db, layout, filter, opts) => _post('/api/fm/query',     { database: db, layout, query: filter, options: opts }),
  }

  // ── PostgreSQL ──────────────────────────────────────────────────────────
  const pg = {
    connect: (connStr) => _post('/api/pg/connect', { connStr }),
    query:   (sql, params) => _post('/api/pg/query', { sql, params }),
    status:  ()            => _get('/api/pg/status'),
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = {
    login:          (username, password)            => _post('/api/auth/login',           { username, password }),
    changePassword: (username, oldPw, newPw)        => _post('/api/auth/change-password', { username, oldPassword: oldPw, newPassword: newPw }),
  }

  // ── Backblaze B2 ────────────────────────────────────────────────────────
  const b2 = {
    authorize:        (keyId, appKey)                              => _post('/api/b2/authorize',       { keyId, appKey }),
    status:           ()                                           => _get('/api/b2/status'),
    listBuckets:      ()                                           => _get('/api/b2/list-buckets'),
    listFiles:        (bucketId, prefix, maxCount)                 => _post('/api/b2/list-files',      { bucketId, prefix, maxCount }),
    getDownloadToken: ()                                           => _get('/api/b2/download-token'),
    getUploadUrl:     (bucketId)                                   => _post('/api/b2/get-upload-url',  { bucketId }),
    downloadFile:     (url, destPath)                              => _post('/api/b2/download-file',   { url, destPath }),

    // uploadFile: in web mode the browser must send the file as multipart form data
    // Caller still passes (uploadUrl, uploadAuth, filePath, b2FileName, mimeType) —
    // but filePath here is a File object (from an <input type="file"> or drag-drop).
    uploadFile: async (uploadUrl, uploadAuthToken, fileOrPath, b2FileName, mimeType) => {
      const fd = new FormData()
      fd.append('uploadUrl',        uploadUrl)
      fd.append('uploadAuthToken',  uploadAuthToken)
      fd.append('b2FileName',       b2FileName)
      fd.append('mimeType',         mimeType || 'application/octet-stream')
      // fileOrPath is a File/Blob in web mode
      fd.append('file', fileOrPath instanceof Blob ? fileOrPath : new Blob([fileOrPath]))
      const r = await fetch('/api/b2/upload-file', { method: 'POST', body: fd })
      return r.json()
    }
  }

  // ── Audio streaming helper ───────────────────────────────────────────────
  // Returns a URL the browser can use directly in <audio src="">
  // instead of reading the file from disk.
  function audioUrl(filePath) {
    return `/api/audio/stream?path=${encodeURIComponent(filePath)}`
  }

  // ── Expose as window.haus ───────────────────────────────────────────────
  window.haus = { fs, shell, applescript, fm, pg, auth, b2, audioUrl }

  // ── Session check on load ───────────────────────────────────────────────
  // The login screen logic in index.html calls window.haus.auth.login().
  // On page load we check if there's already a server-side session active
  // and expose it so the app can skip the login screen.
  window.__hausCheckSession = async function () {
    try {
      const r = await fetch('/api/auth/me')
      const { user } = await r.json()
      return user || null
    } catch { return null }
  }

})()
