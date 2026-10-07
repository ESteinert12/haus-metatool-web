#!/usr/bin/env node
// Create a writer_portal_users login for a composer (producer.html's real auth,
// replacing its old fake "pick who you are from a dropdown, no password" login).
// Mirrors scripts/invite-client-portal-user.js exactly, scoped to composers
// instead of clients.
//
//   node scripts/invite-writer-portal-user.js <composer id or name> <email> [display name]
//
// <composer id or name> matches composers.composer_id exactly (e.g. "R13") or
// a case-insensitive substring of composers.full_name; if more than one
// composer matches by name, every match is listed and nothing is created --
// rerun with the exact composer_id instead of guessing.
//
// must_change_password is left TRUE, same reasoning as the client-portal
// script: this password is handed to someone outside the company.
//
// Needs DATABASE_URL in the environment (or .env).

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

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

;(async () => {
  const composerArg = process.argv[2]
  const email = process.argv[3]
  if (!composerArg || !email) {
    console.error('usage: node scripts/invite-writer-portal-user.js <composer id or name> <email> [display name]')
    process.exit(1)
  }
  if (!isEmail(email)) { console.error(`"${email}" doesn't look like an email address.`); process.exit(1) }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (put it in .env)'); process.exit(1) }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    let composer
    const exact = await pool.query(`SELECT composer_id, full_name FROM composers WHERE composer_id = $1`, [composerArg])
    if (exact.rowCount === 1) {
      composer = exact.rows[0]
    } else {
      const r = await pool.query(`SELECT composer_id, full_name FROM composers WHERE full_name ILIKE $1 ORDER BY full_name`, [`%${composerArg}%`])
      if (r.rowCount === 0) { console.error(`No composer matching "${composerArg}".`); process.exit(1) }
      if (r.rowCount > 1) {
        console.error(`"${composerArg}" matches more than one composer -- rerun with the exact composer_id:`)
        r.rows.forEach(row => console.error(`  ${row.composer_id}  ${row.full_name}`))
        process.exit(1)
      }
      composer = r.rows[0]
    }
    const displayName = process.argv[4] || composer.full_name || email.split('@')[0]

    const existing = await pool.query(`SELECT 1 FROM writer_portal_users WHERE LOWER(email)=LOWER($1)`, [email])
    if (existing.rowCount) {
      console.error(`"${email}" already has a writer-portal login -- change their password through the portal's own Settings instead.`)
      process.exit(1)
    }

    const pw1 = await ask(`Temporary password for ${displayName} <${email}> (they'll be forced to change it on first login): `)
    if (pw1.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1) }
    const pw2 = await ask('Confirm: ')
    if (pw1 !== pw2) { console.error('Passwords do not match.'); process.exit(1) }

    const r = await pool.query(
      `INSERT INTO writer_portal_users (composer_id, email, display_name, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, true) RETURNING email, display_name`,
      [composer.composer_id, email, displayName, hash(pw1)])
    console.log(`✅ created writer-portal login for ${r.rows[0].display_name} <${r.rows[0].email}> as composer ${composer.composer_id} (${composer.full_name})`)
    console.log(`   They can sign in at /producer.html once its frontend is wired to the new auth (not done yet -- see handoff notes).`)
  } finally { await pool.end() }
})().catch(e => { console.error(e.message); process.exit(1) })
