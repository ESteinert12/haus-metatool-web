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

// Routes and prefixes that don't require authentication
// These match the original server.js PUBLIC_ROUTES + prefix-based rules
const PUBLIC_ROUTES = [
  // Auth & DB connection (needed before login)
  '/auth/login',
  '/pg/connect',
  '/pg/status',
  '/pg/query',

  // File system (public read operations)
  '/fs/read-dir',
  '/fs/count-files',
  '/fs/path-exists',
  '/fs/read-file',
  '/fs/write-file',
  '/fs/folder-stats',
  '/fs/audio-status',
  '/fs/audio-meta',

  // Audio streaming
  '/audio/stream',

  // Shell operations (app discovery)
  '/shell/app-path',
  '/shell/home-dir',
  '/shell/show-in-finder',
  '/shell/open-external',

  // B2 cloud storage
  '/b2/stream',
  '/b2/authorize',
  '/b2/status',
  '/b2/list-buckets',
  '/b2/rebuild-stem-keys',
  '/b2/audit',
  '/b2/quick-audit',
  '/b2/db-audit',
  '/b2/download-token',
  '/b2/get-song-lots',
  '/b2/full-audit',
  '/b2/recovery-from-dropbox',
  '/b2/start-recovery',

  // Config
  '/cfg/server-paths'
]

// Prefixes that allow all subpaths without authentication
const PUBLIC_PREFIXES = [
  '/titles',     // All composer/title operations are public
  '/intake',     // All intake operations are public
  '/audio'       // Already covered but included for clarity
]

function getSessionMiddleware() {
  /**
   * Express session middleware
   * Uses SESSION_SECRET from environment, fallback to default for dev
   */
  const sessionSecret = process.env.SESSION_SECRET || 'haus-workspace-secret-2024-dev'

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
   * Match original server.js logic exactly
   */
  return (req, res, next) => {
    // Check if exact route is in PUBLIC_ROUTES
    if (PUBLIC_ROUTES.some(r => req.path === r)) {
      return next()
    }

    // Check if path starts with any PUBLIC_PREFIX
    if (PUBLIC_PREFIXES.some(prefix => req.path === prefix || req.path.startsWith(prefix + '/'))) {
      return next()
    }

    // Require authentication for all other routes
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

// Exported middleware setup function
function setupAuthMiddleware(app) {
  /**
   * Configure all auth-related middleware on Express app
   * Order matters: cache control → security headers → CORS → session → auth guard
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
  PUBLIC_ROUTES,
  PUBLIC_PREFIXES
}
