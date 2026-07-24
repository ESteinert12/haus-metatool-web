#!/usr/bin/env node
// Search B2 for files matching a keyword anywhere in the path
// Usage: node b2-find.js <search_term>
// e.g.:  node b2-find.js T40l
//        node b2-find.js "Take Me Back"

const https = require('https')

const B2_KEY_ID  = '0050a76021cb5da0000000004'
const B2_APP_KEY = 'K0054dTbDhVLVzQj0WqsE6h2w6QILXo'
const B2_BUCKET  = 'haus-music'
const SEARCH     = process.argv[2] || ''

if (!SEARCH) { console.error('Usage: node b2-find.js <search_term>'); process.exit(1) }

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
    }).on('error', reject)
  })
}

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
    })
    req.on('error', reject)
    req.write(payload); req.end()
  })
}

async function run() {
  const creds = Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64')
  const auth  = await httpsGet('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', { Authorization: `Basic ${creds}` })
  if (!auth.authorizationToken) throw new Error('B2 auth failed')

  const bucketsRes = await httpsPost(`${auth.apiUrl}/b2api/v2/b2_list_buckets`,
    { Authorization: auth.authorizationToken }, { accountId: auth.accountId, bucketName: B2_BUCKET })
  const bucketId = bucketsRes.buckets?.[0]?.bucketId
  if (!bucketId) throw new Error('Bucket not found')

  console.log(`Searching B2 bucket "${B2_BUCKET}" for: "${SEARCH}"\n`)

  const searchLower = SEARCH.toLowerCase()
  let startFileName = null
  let totalScanned  = 0
  const matches     = []

  do {
    const body = { bucketId, maxFileCount: 1000 }
    if (startFileName) body.startFileName = startFileName
    const res = await httpsPost(`${auth.apiUrl}/b2api/v2/b2_list_file_names`,
      { Authorization: auth.authorizationToken }, body)
    if (!res.files) break
    totalScanned += res.files.length
    process.stdout.write(`\rScanned ${totalScanned} files…`)
    for (const f of res.files) {
      if (f.fileName.toLowerCase().includes(searchLower)) matches.push(f.fileName)
    }
    startFileName = res.nextFileName
  } while (startFileName)

  console.log(`\nScanned ${totalScanned} files, found ${matches.length} matches:\n`)
  matches.forEach(m => console.log(' ', m))
}

run().catch(e => { console.error(e.message); process.exit(1) })
