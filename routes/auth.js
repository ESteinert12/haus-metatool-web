// routes/auth.js — Authentication endpoints
const express = require('express')
const crypto = require('crypto')
const router = express.Router()

// Helper function
function _hashPassword(pw) {
  return crypto.createHash('sha256').update('haus-workspace:' + pw).digest('hex')
}

// pgPool passed via middleware or req.app.locals
function getPgPool(req) {
  return req.app.locals.pgPool
}

router.post('/login', async (req, res) => {
  const pgPool = getPgPool(req)
  const { username, password } = req.body
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  try {
    const hash = _hashPassword(password)
    const result = await pgPool.query(
      `SELECT user_id, username, display_name FROM haus_users WHERE LOWER(username)=LOWER($1) AND password_hash=$2`,
      [username, hash]
    )
    if (!result.rows.length) {
      return res.json({ ok: false, error: 'Invalid username or password' })
    }
    req.session.user = result.rows[0]
    res.json({ ok: true, user: result.rows[0] })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

router.post('/logout', (req, res) => {
  req.session.destroy()
  res.json({ ok: true })
})

router.get('/me', (req, res) => {
  res.json({ user: req.session?.user || null })
})

router.post('/change-password', async (req, res) => {
  const pgPool = getPgPool(req)
  const { username, oldPassword, newPassword } = req.body
  if (!pgPool) return res.json({ ok: false, error: 'Database not connected' })
  try {
    const oldHash = _hashPassword(oldPassword)
    const newHash = _hashPassword(newPassword)
    const result = await pgPool.query(
      `UPDATE haus_users SET password_hash=$1 WHERE LOWER(username)=LOWER($2) AND password_hash=$3 RETURNING user_id`,
      [newHash, username, oldHash]
    )
    if (!result.rowCount) {
      return res.json({ ok: false, error: 'Current password incorrect' })
    }
    res.json({ ok: true })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

module.exports = router
