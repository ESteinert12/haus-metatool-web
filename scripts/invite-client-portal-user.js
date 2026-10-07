#!/usr/bin/env node
// Create a portal_users login for a client contact (client-portal.html), the
// counterpart to scripts/create-user.js for haus_users. There is currently no
// in-app "invite a client" flow -- portal_users has a full, working backend
// (briefs/pitches/licenses/library/playlists, all scoped by client_id so one
// client never sees another's data) but no way at all to create a row in it
// short of raw SQL. This fills that gap the same safe way create-user.js did:
// password prompted twice (never passed as an argument), hashed with the same
// scrypt scheme as every other password table in this app.
//
//   node scripts/invite-client-portal-user.js <client name or id> <email> [display name]
//
// <client name or id> matches against clients.id (if numeric) or a
// case-insensitive substring of clients.name; if more than one client
// matches, every match is listed and nothing is created -- rerun with the
// numeric id instead of guessing. must_change_password is left TRUE (the
// portal_users default) since, unlike scripts/create-user.js, this password
// is being handed to someone outside the company -- they should be forced to
// set their own on first login rather than keep whatever Erik or Kyle typed
// for them here.
//
// Also flips clients.portal_enabled to true for that client, since that
// column exists for exactly this and nothing else currently sets it.
//
// Needs DATABASE_URL in the environment (or .env), same as create-user.js.

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
  const clientArg = process.argv[2]
  const email = process.argv[3]
  if (!clientArg || !email) {
    console.error('usage: node scripts/invite-client-portal-user.js <client name or id> <email> [display name]')
    process.exit(1)
  }
  if (!isEmail(email)) { console.error(`"${email}" doesn't look like an email address.`); process.exit(1) }
  const displayName = process.argv[4] || email.split('@')[0]
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (put it in .env)'); process.exit(1) }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    let client
    if (/^\d+$/.test(clientArg)) {
      const r = await pool.query(`SELECT id, name FROM clients WHERE id = $1`, [Number(clientArg)])
      client = r.rows[0]
      if (!client) { console.error(`No client with id ${clientArg}.`); process.exit(1) }
    } else {
      const r = await pool.query(`SELECT id, name FROM clients WHERE name ILIKE $1 ORDER BY name`, [`%${clientArg}%`])
      if (r.rowCount === 0) { console.error(`No client matching "${clientArg}".`); process.exit(1) }
      if (r.rowCount > 1) {
        console.error(`"${clientArg}" matches more than one client -- rerun with the numeric id:`)
        r.rows.forEach(row => console.error(`  ${row.id}  ${row.name}`))
        process.exit(1)
      }
      client = r.rows[0]
    }

    const existing = await pool.query(`SELECT 1 FROM portal_users WHERE LOWER(email)=LOWER($1)`, [email])
    if (existing.rowCount) {
      console.error(`"${email}" already has a portal login -- use scripts/set-portal-password.js to reset it instead.`)
      process.exit(1)
    }

    const pw1 = await ask(`Temporary password for ${displayName} <${email}> (they'll be forced to change it on first login): `)
    if (pw1.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1) }
    const pw2 = await ask('Confirm: ')
    if (pw1 !== pw2) { console.error('Passwords do not match.'); process.exit(1) }

    await pool.query(`UPDATE clients SET portal_enabled = true WHERE id = $1`, [client.id])
    const r = await pool.query(
      `INSERT INTO portal_users (client_id, email, display_name, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, true) RETURNING email, display_name`,
      [client.id, email, displayName, hash(pw1)])
    console.log(`✅ created portal login for ${r.rows[0].display_name} <${r.rows[0].email}> on client "${client.name}" (id ${client.id})`)
    console.log(`   They can sign in at /client-portal.html with the temporary password above.`)
  } finally { await pool.end() }
})().catch(e => { console.error(e.message); process.exit(1) })
