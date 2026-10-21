/**
 * ebr-ftp.js
 *
 * Fetches new MusicMark EBR acknowledgment files from HAUS's own FTP
 * server (NOT the MusicMark *submission* FTP, which is a separate,
 * still-blocked-on-credentials thing — see
 * claude/handoff-2026-10-21-ebr-ack-ftp-autofetch-spec.md in the ATMOSPHERE
 * project docs for the decision record this module implements).
 *
 * Read-only on purpose: this never deletes, moves, or renames anything on
 * the FTP server (Erik's explicit call). "Already imported" is tracked
 * purely by checking each filename against
 * `ebr_acknowledgments.source_file` via ebr-ack-import.js's
 * alreadyImported() — see that file for the accepted limitation (a reused
 * filename with different content would be wrongly skipped).
 *
 * Requires the `basic-ftp` npm package — NOT in package.json yet. Run
 *   npm install basic-ftp
 * in a real terminal before this module will load.
 *
 * Credentials come from environment variables only — never from a request
 * body, never hardcoded here, never typed into a chat session:
 *   FTP_ACK_HOST    - required
 *   FTP_ACK_USER    - required
 *   FTP_ACK_PASS    - required
 *   FTP_ACK_PORT    - optional, default 21
 *   FTP_ACK_DIR     - optional, default "/" (remote directory acknowledgments land in)
 *   FTP_ACK_SECURE  - optional, "true" for explicit FTPS, default plain FTP
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { Client } = require('basic-ftp')
const ebrAckImport = require('./ebr-ack-import')

// Returns null (not a thrown error) if the env vars aren't set, so callers
// can give a clear "not configured" response instead of a stack trace.
function configFromEnv() {
  const host = process.env.FTP_ACK_HOST
  const user = process.env.FTP_ACK_USER
  const password = process.env.FTP_ACK_PASS
  if (!host || !user || !password) return null
  return {
    host,
    port: process.env.FTP_ACK_PORT ? Number(process.env.FTP_ACK_PORT) : 21,
    user,
    password,
    secure: String(process.env.FTP_ACK_SECURE || '').toLowerCase() === 'true',
    remoteDir: process.env.FTP_ACK_DIR || '/'
  }
}

// Connects, lists .xls/.xlsx files in cfg.remoteDir, downloads any whose
// filename isn't already recorded in ebr_acknowledgments, and returns what
// it found. Does NOT import anything — that's a separate, slower, row-by-row
// step (ebr-ack-import.js's importAckFile) so the caller can report
// "found N, M new" quickly before running it.
//
// `client` is a live pg client/pool connection, used only to check
// alreadyImported() per file — the caller owns the connection's lifecycle.
async function fetchNewAckFiles(client, cfg) {
  const ftp = new Client(15000) // 15s timeout
  const downloaded = []
  const skippedAlreadyImported = []
  const errors = []
  let tmpDir = null
  try {
    await ftp.access({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      secure: cfg.secure
    })
    await ftp.cd(cfg.remoteDir)
    const list = await ftp.list()
    const ackFiles = list.filter(f => f.isFile && /\.xlsx?$/i.test(f.name))

    for (const f of ackFiles) {
      const already = await ebrAckImport.alreadyImported(client, f.name)
      if (already) { skippedAlreadyImported.push(f.name); continue }

      if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebr-ack-ftp-'))
      const localPath = path.join(tmpDir, f.name)
      try {
        await ftp.downloadTo(localPath, f.name)
        downloaded.push({ fileName: f.name, localPath })
      } catch (e) {
        errors.push({ fileName: f.name, error: e.message })
      }
    }
  } finally {
    ftp.close()
  }
  return { downloaded, skippedAlreadyImported, errors, tmpDir }
}

module.exports = { configFromEnv, fetchNewAckFiles }
