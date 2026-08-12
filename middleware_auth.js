/**
 * middleware/auth.js — Session and authentication guard
 *
 * Handles:
 * - Session setup and configuration
 * - Authentication check for protected routes
 * - PUBLIC_ROUTES bypass for login/status endpoints
 * - CORS and security headers
 */

const session = require('express-session')
const crypto = require('crypto')

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/auth/login',
  '/pg/connect',
  '/pg/status',
  '/cfg/server-paths',
  '/fs/read-dir',
  '/fs/count-files',
  '/fs/path-exists',
  '/fs/read-file',
  '/fs/write-file',
  '/fs/folder-stats',
  '/fs/audio-status',
  '/fs/audio-meta',
  '/audio/stream',
  '/shell/app-path',
  '/shell/home-dir',
  '/shell/show-in-finder',
  '/shell/open-external',
  '/b2/stream',
  '/b2/authorize',
  '/b2/status',
  '/b2/rebuild-stem-keys',
  '/b2/audit',
  '/b2/quick-audit',
  '/b2/db-audit',
  '/b2/full-audit',
  '/b2/batch-upload-shipping',
  '/b2/recovery-from-dropbox',
  '/b2/start-recovery',
  '/b2/list-buckets',
  '/b2/get-song-lots'
]

function getSessionMiddleware() {
  /**
   * Express session middleware
   * Requires: process.env.SESSION_SECRET
   */
  const sessionSecret = process.env.SESSION_SECRET
  if (!sessionSecret) {
    console.error('❌ FATAL: SESSION_SECRET environment variable not set!')
    console.error('Generate one: export SESSION_SECRET=$(openssl rand -base64 32)')
    process.exit(1)
  }

  return session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    }
  })
}

function getCacheControlMiddleware() {
  /**
   * Disable caching for dynamic content
   * Keep index.html and haus-api.js always fresh
   */
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    next()
  }
}

function getAuthGuardMiddleware() {
  /**
   * Check authentication for protected routes
   * Allow PUBLIC_ROUTES to bypass check
   */
  return (req, res, next) => {
    if (PUBLIC_ROUTES.some(r => req.path === r)) {
      return next()
    }

    if (!req.session?.user) {
      return res.status(401).json({ ok: false, error: 'Not logged in' })
    }

    next()
  }
}

function getSecurityHeadersMiddleware() {
  /**
   * Add security headers to all responses
   */
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    next()
  }
}

function getCORSMiddleware() {
  /**
   * Allow CORS for local development
   */
  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }

    next()
  }
}

function hashPassword(password) {
  /**
   * Hash password for comparison
   * Uses: haus-workspace:{password}
   */
  return crypto.createHash('sha256').update('haus-workspace:' + password).digest('hex')
}

// Exported middleware setup function
function setupAuthMiddleware(app) {
  /**
   * Configure all auth-related middleware on Express app
   */
  app.use(getCacheControlMiddleware())
  app.use(getSecurityHeadersMiddleware())
  app.use(getCORSMiddleware())
  app.use(getSessionMiddleware())
  app.use('/api', getAuthGuardMiddleware())
}

module.exports = {
  setupAuthMiddleware,
  getSessionMiddleware,
  getAuthGuardMiddleware,
  getCacheControlMiddleware,
  getSecurityHeadersMiddleware,
  getCORSMiddleware,
  hashPassword,
  PUBLIC_ROUTES
}
