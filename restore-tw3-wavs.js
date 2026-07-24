// restore-tw3-wavs.js
// Downloads 3 missing tracks from B2 back into the Texas Wives 3 shipping folder.
// Run: node restore-tw3-wavs.js

const https = require('https')
const fs    = require('fs')
const path  = require('path')

const KEY_ID  = '0a76021cb5da'
const APP_KEY = '00512129adc584be3490f5e337f63dbc5f2a7c1c66'
const BUCKET  = 'haus-music'
const DEST    = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260708_TEXAS WIVES_3'

const TRACKS = [
  {
    folder: 'R82a8854_Snakeskin Boots',
    b2Dir:  'nimbus/R82_Steve Mayone_NIMBUS/R82a8854_Snakeskin Boots',
    files: [
      'HAUS_SnakeskinBoots_F_R82a_ALT.wav',
      'HAUS_SnakeskinBoots_F_R82a_BUMPER.wav',
      'HAUS_SnakeskinBoots_F_R82a_DNB.wav',
      'HAUS_SnakeskinBoots_F_R82a_FULL.mp3',
      'HAUS_SnakeskinBoots_F_R82a_FULL.wav',
      'HAUS_SnakeskinBoots_F_R82a_NoDNB.wav',
      'HAUS_SnakeskinBoots_F_R82a_STING.wav',
      'HAUS_SnakeskinBoots_F_R82a_STINGa.wav',
    ]
  },
  {
    folder: "S20d1064_Slidin' Into Your EDMs",
    b2Dir:  "nimbus/S20_Bill Maier_NIMBUS/S20d1064_Slidin' Into Your EDMs",
    files: [
      'HAUS_SlidinIntoYourEDMs_B_S20D_BUMPER.wav',
      'HAUS_SlidinIntoYourEDMs_B_S20D_DNB.wav',
      'HAUS_SlidinIntoYourEDMs_B_S20D_FULL.mp3',
      'HAUS_SlidinIntoYourEDMs_B_S20D_FULL.wav',
      'HAUS_SlidinIntoYourEDMs_B_S20D_NoDrums.wav',
      'HAUS_SlidinIntoYourEDMs_B_S20D_NoLead.wav',
      'HAUS_SlidinIntoYourEDMs_B_S20D_STING.wav',
    ]
  },
  {
    folder: 'S20d1074_Texas Trance',
    b2Dir:  'nimbus/S20_Bill Maier_NIMBUS/S20d1074_Texas Trance',
    files: [
      'HAUS_TexasTrance_Em_S20D_BUMPER.wav',
      'HAUS_TexasTrance_Em_S20D_DNB.wav',
      'HAUS_TexasTrance_Em_S20D_FULL.mp3',
      'HAUS_TexasTrance_Em_S20D_FULL.wav',
      'HAUS_TexasTrance_Em_S20D_NoDrums.wav',
      'HAUS_TexasTrance_Em_S20D_NoLead.wav',
      'HAUS_TexasTrance_Em_S20D_STING.wav',
    ]
  }
]

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function authorize() {
  const creds = Buffer.from(`${KEY_ID}:${APP_KEY}`).toString('base64')
  const res = await request({
    hostname: 'api.backblazeb2.com',
    path: '/b2api/v3/b2_authorize_account',
    method: 'GET',
    headers: { Authorization: `Basic ${creds}` }
  })
  const b = JSON.parse(res.body.toString())
  if (res.status !== 200) throw new Error(`Auth failed: ${b.message}`)
  const storageApi = b.apiInfo?.storageApi
  return {
    token:       b.authorizationToken,
    accountId:   b.accountId,
    downloadUrl: storageApi?.downloadUrl || b.downloadUrl,
    apiUrl:      storageApi?.apiUrl || b.apiUrl || 'https://api.backblazeb2.com',
  }
}

async function downloadFile(auth, b2Key, destPath) {
  const url = new URL(`${auth.downloadUrl}/file/${BUCKET}/${b2Key}`)
  const res = await request({
    hostname: url.hostname,
    path:     url.pathname + url.search,
    method:   'GET',
    headers:  { Authorization: auth.token }
  })
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${b2Key}`)
  fs.writeFileSync(destPath, res.body)
}

let _cachedBucketId = null

async function getBucketId(auth) {
  if (_cachedBucketId) return _cachedBucketId
  const apiHost = new URL(auth.apiUrl).hostname
  const res = await request({
    hostname: apiHost,
    path: `/b2api/v3/b2_list_buckets?accountId=${auth.accountId}`,
    method: 'GET',
    headers: { Authorization: auth.token }
  })
  const body = JSON.parse(res.body.toString())
  if (res.status !== 200) throw new Error(`b2_list_buckets failed: ${body.message}`)
  const bucket = (body.buckets || []).find(b => b.bucketName === BUCKET)
  if (!bucket) throw new Error(`Bucket '${BUCKET}' not found. Available: ${(body.buckets||[]).map(b=>b.bucketName).join(', ')}`)
  _cachedBucketId = bucket.bucketId
  return _cachedBucketId
}

async function listFiles(auth, prefix, startFileName) {
  const bucketId = await getBucketId(auth)
  const apiHost = new URL(auth.apiUrl).hostname
  const obj = { bucketId, maxFileCount: 1000 }
  if (prefix) obj.prefix = prefix
  if (startFileName) obj.startFileName = startFileName
  const payload = JSON.stringify(obj)
  const res = await request({
    hostname: apiHost,
    path: '/b2api/v3/b2_list_file_names',
    method: 'POST',
    headers: {
      Authorization: auth.token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload)
  const body = JSON.parse(res.body.toString())
  if (res.status !== 200) throw new Error(`b2_list_file_names failed: ${body.message}`)
  return body
}

// Search across all pages for files matching a pattern
async function searchAllPages(auth, prefix, testFn) {
  let startFileName = null
  let pageCount = 0
  while (true) {
    const result = await listFiles(auth, prefix, startFileName)
    const files = result.files || []
    const matches = files.filter(testFn)
    if (matches.length) return matches
    pageCount++
    if (!result.nextFileName || files.length === 0) break
    startFileName = result.nextFileName
    process.stdout.write(`[page ${pageCount+1}]`)
  }
  return []
}

async function main() {
  console.log('Authorizing with B2…')
  const auth = await authorize()
  console.log('✓ Authorized\n')

  // Search nimbus/ for the 3 tracks across all pages
  const targets = [
    { label: 'R82a8854 (Snakeskin Boots)',       pattern: /R82a8854/i },
    { label: "S20d1064 (Slidin' Into Your EDMs)", pattern: /S20d1064/i },
    { label: 'S20d1074 (Texas Trance)',            pattern: /S20d1074/i },
  ]

  for (const { label, pattern } of targets) {
    console.log(`── Searching nimbus/ for ${label}…`)
    const found = await searchAllPages(auth, 'nimbus/', f => pattern.test(f.fileName))
    if (found.length) {
      console.log(`  ✓ Found ${found.length} files:`)
      found.forEach(f => console.log(`    ${f.fileName}`))
    } else {
      console.log(`  ✗ Not found in nimbus/`)
    }
    console.log()
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
