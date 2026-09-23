#!/usr/bin/env node
// Set a HAUS Workspace password from the server, without going through the app.
//
//   node scripts/set-password.js <username>
//
// Prompts for the new password twice, writes it with the same scrypt scheme api.js
// uses, and clears the must_change_password flag. Needs DATABASE_URL in the
// environment (or .env), the same connection api.js uses.

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
      if (['\n', '\r', ''].includes(char.toString())) process.stdin.removeListener('data', onData)
      else { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); process.stdout.write(question) }
    }
    process.stdin.on('data', onData)
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer) })
  })
}

;(async () => {
  const username = process.argv[2]
  if (!username) { console.error('usage: node scripts/set-password.js <username>'); process.exit(1) }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (put it in .env)'); process.exit(1) }

  const pw1 = await ask(`New password for ${username}: `)
  if (pw1.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1) }
  const pw2 = await ask('Confirm: ')
  if (pw1 !== pw2) { console.error('Passwords do not match.'); process.exit(1) }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const r = await pool.query(
      `UPDATE haus_users SET password_hash=$1, must_change_password=false
        WHERE LOWER(username)=LOWER($2) RETURNING username, role`,
      [hash(pw1), username])
    if (!r.rowCount) { console.error(`No such user: ${username}`); process.exit(1) }
    console.log(`✅ password set for ${r.rows[0].username} (role: ${r.rows[0].role})`)
  } finally { await pool.end() }
})().catch(e => { console.error(e.message); process.exit(1) })
