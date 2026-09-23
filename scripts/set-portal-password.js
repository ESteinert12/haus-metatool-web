#!/usr/bin/env node
// Create or reset a Client Portal login (a producer/licensee, not a HAUS admin).
//
//   node scripts/set-portal-password.js <client-id-or-fm-pk> <email> ["Display Name"]
//
// <client-id-or-fm-pk> is the clients.id (integer) or clients.fm_pk (e.g. CL074)
// of the org this login belongs to — see CLIENTS.csv or `SELECT id, fm_pk, name
// FROM clients` for the list. Prompts for the new password twice, writes it with
// the same scrypt scheme api.js uses, and sets must_change_password=true so the
// client is forced to pick their own password on first login. Needs DATABASE_URL
// in the environment (or .env), the same connection api.js uses.

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
  const [clientRef, email, displayName] = process.argv.slice(2)
  if (!clientRef || !email) {
    console.error('usage: node scripts/set-portal-password.js <client-id-or-fm-pk> <email> ["Display Name"]')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (put it in .env)'); process.exit(1) }

  const pw1 = await ask('New password: ')
  if (pw1.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1) }
  const pw2 = await ask('Confirm: ')
  if (pw1 !== pw2) { console.error('Passwords do not match.'); process.exit(1) }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    const isNumeric = /^\d+$/.test(clientRef)
    const client = await pool.query(
      isNumeric ? `SELECT id, name FROM clients WHERE id=$1` : `SELECT id, name FROM clients WHERE fm_pk=$1`,
      [clientRef]
    )
    if (!client.rowCount) { console.error(`No such client: ${clientRef}`); process.exit(1) }
    const { id: clientId, name: clientName } = client.rows[0]

    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT false`)
    await pool.query(`UPDATE clients SET portal_enabled=true WHERE id=$1`, [clientId])

    const r = await pool.query(
      `INSERT INTO portal_users (client_id, email, display_name, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE SET password_hash=$4, must_change_password=true, display_name=$3
       RETURNING email, display_name`,
      [clientId, email, displayName || email.split('@')[0], hash(pw1)]
    )
    console.log(`✅ portal login set for ${r.rows[0].email} (${clientName})`)
  } finally { await pool.end() }
})().catch(e => { console.error(e.message); process.exit(1) })
