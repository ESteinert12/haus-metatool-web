#!/usr/bin/env node
// Create a new HAUS Workspace login (haus_users), without going through the app --
// there is no self-signup or in-app "add user" flow by design (see api.js, near
// the /api/auth/login routes: "HAUS is a two-person shop ... there is no per-client
// rep assignment to manage" -- same reasoning applies to accounts: this is an
// internal admin tool, not something that should take open registration).
//
//   node scripts/create-user.js <username> [display name] [role]
//
// role defaults to "user"; pass "admin" explicitly for an admin account. Prompts
// for the new password twice (never pass it as an argument -- that would land in
// shell history), hashes it with the same scrypt scheme api.js uses, and sets
// must_change_password=false since this is a deliberate admin-set password, not
// a seeded placeholder. Needs DATABASE_URL in the environment (or .env), the
// same connection api.js uses.

require('dotenv').config()
const crypto   = require('crypto')
const readline = require('readline')
const { Pool } = require('pg')

const SCRYPT_N = 16384
const hash = pw => {
  const salt = crypto.randomBytes(16)
  const key  = crypto.scryptSync(pw, salt, 64, { N: SCRYPT_N, r: 8, p: 1 })
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${key.toString('hex')}`
}

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const onData = char => {
      if (['\n', '\r', ''].includes(char.toString())) process.stdin.removeListener('data', onData)
      else { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); process.stdout.write(question) }
    }
    process.stdin.on('data', onData)
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer) })
  })
}

;(async () => {
  const username = process.argv[2]
  const displayName = process.argv[3] || username
  const role = process.argv[4] || 'user'
  if (!username) {
    console.error('usage: node scripts/create-user.js <username> [display name] ["admin"|"user"]')
    process.exit(1)
  }
  if (!['admin', 'user'].includes(role)) {
    console.error(`role must be "admin" or "user", got: ${role}`)
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (put it in .env)'); process.exit(1) }

  const pw1 = await ask(`New password for ${username}: `)
  if (pw1.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1) }
  const pw2 = await ask('Confirm: ')
  if (pw1 !== pw2) { console.error('Passwords do not match.'); process.exit(1) }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    const existing = await pool.query(`SELECT 1 FROM haus_users WHERE LOWER(username)=LOWER($1)`, [username])
    if (existing.rowCount) {
      console.error(`"${username}" already exists -- use scripts/set-password.js to change their password instead.`)
      process.exit(1)
    }
    const r = await pool.query(
      `INSERT INTO haus_users (username, display_name, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, false) RETURNING username, display_name, role`,
      [username, displayName, hash(pw1), role])
    console.log(`✅ created ${r.rows[0].username} (${r.rows[0].display_name}), role: ${r.rows[0].role}`)
  } finally { await pool.end() }
})().catch(e => { console.error(e.message); process.exit(1) })
