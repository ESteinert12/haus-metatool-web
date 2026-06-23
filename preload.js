const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('haus', {

  // ─── Filesystem ──────────────────────────────────────────
  fs: {
    readDir:     (p)       => ipcRenderer.invoke('read-dir', p),
    countFiles:  (p, ext)  => ipcRenderer.invoke('count-files', p, ext),
    pathExists:  (p)       => ipcRenderer.invoke('path-exists', p),
    readFile:    (p)       => ipcRenderer.invoke('read-file', p),
    writeFile:   (p, c)    => ipcRenderer.invoke('write-file', p, c),
    folderStats: (p)       => ipcRenderer.invoke('folder-stats', p),
  },

  // ─── Shell ───────────────────────────────────────────────
  shell: {
    exec:         (cmd, cwd) => ipcRenderer.invoke('exec-cmd', cmd, cwd),
    showFolderPicker: () => ipcRenderer.invoke('show-folder-picker'),
    showInFinder: (p)        => ipcRenderer.invoke('show-in-finder', p),
    openExternal: (url)      => ipcRenderer.invoke('open-external', url),
    appPath:      ()         => ipcRenderer.invoke('app-path'),
    homeDir:      ()         => ipcRenderer.invoke('home-dir'),
  },

  // ─── AppleScript — Daylite, SoundMiner, etc. ─────────────
  // Returns { result: string } or { error: string }
  applescript: (script) => ipcRenderer.invoke('run-applescript', script),

  // ─── FileMaker Data API ───────────────────────────────────
  fm: {
    login:     (host, db, user, pass)        => ipcRenderer.invoke('fm-login', host, db, user, pass),
    logout:    (db)                          => ipcRenderer.invoke('fm-logout', db),
    databases: (host, user, pass)            => ipcRenderer.invoke('fm-databases', host, user, pass),
    // query(db, layout, filterObj, options) → { ok, records[], total }
    // filterObj: {} = all records, { FieldName: '=*search*' } = find
    // options:   { limit, offset, sort: [{fieldName, sortOrder:'ascend'|'descend'}] }
    query:     (db, layout, filter, opts)    => ipcRenderer.invoke('fm-query', db, layout, filter, opts),
  },

  // ─── PostgreSQL ───────────────────────────────────────────
  pg: {
    connect: (connStr)       => ipcRenderer.invoke('pg-connect', connStr),
    query:   (sql, params)   => ipcRenderer.invoke('pg-query', sql, params),
    status:  ()              => ipcRenderer.invoke('pg-status'),
  },

  // ─── Auth ────────────────────────────────────────────────
  auth: {
    login:          (username, password)                  => ipcRenderer.invoke('auth-login', username, password),
    changePassword: (username, oldPw, newPw)             => ipcRenderer.invoke('auth-change-password', username, oldPw, newPw),
  },

  // ─── Backblaze B2 ────────────────────────────────────────
  b2: {
    authorize:    (keyId, appKey)                              => ipcRenderer.invoke('b2-authorize', keyId, appKey),
    status:       ()                                           => ipcRenderer.invoke('b2-status'),
    listBuckets:  ()                                           => ipcRenderer.invoke('b2-list-buckets'),
    listFiles:    (bucketId, prefix, maxCount)                 => ipcRenderer.invoke('b2-list-files', bucketId, prefix, maxCount),
    getDownloadToken: ()                                              => ipcRenderer.invoke('b2-get-download-token'),
    getUploadUrl: (bucketId)                                   => ipcRenderer.invoke('b2-get-upload-url', bucketId),
    uploadFile:   (uploadUrl, uploadAuth, filePath, name, mime) => ipcRenderer.invoke('b2-upload-file', uploadUrl, uploadAuth, filePath, name, mime),
    downloadFile: (url, destPath)                               => ipcRenderer.invoke('b2-download-file', url, destPath),
  },

})
