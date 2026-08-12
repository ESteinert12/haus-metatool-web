#!/usr/bin/env node
/**
 * Complete B2 Stub Audit
 * Queries entire haus-music bucket, finds all stub files (<1KB)
 * Saves results to audit-results.json and audit-stubs.json
 */

const https = require('https')
const fs = require('fs')

// Get credentials from command line or environment
const keyId = process.argv[2] || process.env.B2_KEY_ID
const appKey = process.argv[3] || process.env.B2_APP_KEY

if (!keyId || !appKey) {
  console.error('Usage: node audit-b2-complete.js <keyId> <appKey>')
  console.error('Or set B2_KEY_ID and B2_APP_KEY environment variables')
  process.exit(1)
}

let b2Auth = null
let bucketId = null

async function b2Request(opts) {
  return new Promise((resolve, reject) => {
    const { method, hostname, urlPath, headers, body } = opts
    const bodyData = body ? JSON.stringify(body) : null
    const hdrs = { ...headers }
    if (bodyData) hdrs['Content-Length'] = Buffer.byteLength(bodyData)

    const req = https.request(
      { hostname, path: urlPath, method, headers: hdrs, rejectUnauthorized: false },
      res => {
        let data = ''
        res.on('data', c => (data += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: data })
          }
        })
      }
    )
    req.on('error', reject)
    if (bodyData) req.write(bodyData)
    req.end()
  })
}

async function authorize() {
  console.log('Authorizing with B2...')
  const creds = Buffer.from(`${keyId}:${appKey}`).toString('base64')
  const result = await b2Request({
    method: 'GET',
    hostname: 'api.backblazeb2.com',
    urlPath: '/b2api/v3/b2_authorize_account',
    headers: { Authorization: `Basic ${creds}` }
  })

  if (result.status !== 200) {
    throw new Error(`Authorization failed: ${result.body.message}`)
  }

  const b = result.body
  b2Auth = {
    accountId: b.accountId,
    authorizationToken: b.authorizationToken,
    apiUrl: b.apiInfo?.storageApi?.apiUrl || b.apiUrl,
    downloadUrl: b.apiInfo?.storageApi?.downloadUrl || b.downloadUrl
  }
  console.log(`✓ Authorized. API URL: ${b2Auth.apiUrl}`)
}

async function getBucketId() {
  console.log('Finding haus-music bucket...')
  const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
  const params = new URLSearchParams({ accountId: b2Auth.accountId })

  const result = await b2Request({
    method: 'GET',
    hostname: apiHost,
    urlPath: `/b2api/v3/b2_list_buckets?${params}`,
    headers: { Authorization: b2Auth.authorizationToken }
  })

  if (result.status !== 200) {
    throw new Error(`Failed to list buckets: ${result.body.message}`)
  }

  const bucket = result.body.buckets.find(b => b.bucketName === 'haus-music')
  if (!bucket) {
    throw new Error('haus-music bucket not found')
  }

  bucketId = bucket.bucketId
  console.log(`✓ Found bucket: ${bucketId}`)
}

async function auditAllFiles() {
  const apiHost = b2Auth.apiUrl.replace(/^https?:\/\//, '')
  const downloadHost = b2Auth.downloadUrl.replace(/^https?:\/\//, '')

  const stubs = []
  const realAudio = []
  const errors = []

  let startFileName = null
  let startFileId = null
  let totalChecked = 0
  let batchNum = 0

  console.log('\nAuditing all files in haus-music bucket...\n')

  while (true) {
    batchNum++
    const params = new URLSearchParams({ bucketId, maxFileCount: 10000 })
    if (startFileName) params.set('startFileName', startFileName)
    if (startFileId) params.set('startFileId', startFileId)

    console.log(`[Batch ${batchNum}] Fetching file list...`)
    const result = await b2Request({
      method: 'GET',
      hostname: apiHost,
      urlPath: `/b2api/v3/b2_list_file_versions?${params}`,
      headers: { Authorization: b2Auth.authorizationToken }
    })

    if (result.status !== 200) {
      throw new Error(`Failed to list files: ${result.body.message}`)
    }

    const batchFiles = (result.body.files || []).filter(f => !f.action || f.action === 'upload')
    console.log(`[Batch ${batchNum}] Found ${batchFiles.length} files. Checking sizes...`)

    for (const file of batchFiles) {
      try {
        const encodedPath = `/file/haus-music/${file.fileName
          .split('/')
          .map(p => encodeURIComponent(p))
          .join('/')}`

        const headResult = await b2Request({
          method: 'HEAD',
          hostname: downloadHost,
          urlPath: encodedPath,
          headers: { Authorization: b2Auth.authorizationToken }
        })

        const size = headResult.headers['content-length'] ? parseInt(headResult.headers['content-length']) : 0
        totalChecked++

        if (size < 1000 && size > 0) {
          stubs.push({ fileName: file.fileName, size, uploadTime: file.uploadTimestamp })
          if (stubs.length % 100 === 0) {
            console.log(`  Found ${stubs.length} stubs so far...`)
          }
        } else if (size >= 1000000) {
          realAudio.push({ fileName: file.fileName, size })
        }

        if (totalChecked % 1000 === 0) {
          console.log(`  Checked ${totalChecked} files. Stubs: ${stubs.length}`)
        }
      } catch (e) {
        errors.push({ fileName: file.fileName, error: e.message })
      }
    }

    console.log(`[Batch ${batchNum}] Done. Total checked: ${totalChecked}. Stubs found: ${stubs.length}`)

    if (!result.body.nextFileName) {
      console.log('\n✓ Reached end of bucket.')
      break
    }

    startFileName = result.body.nextFileName
    startFileId = result.body.nextFileId || null
  }

  return { stubs, realAudio, errors, totalChecked }
}

async function main() {
  try {
    await authorize()
    await getBucketId()

    const startTime = Date.now()
    const { stubs, realAudio, errors, totalChecked } = await auditAllFiles()
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    // Calculate stats
    const realSize = realAudio.reduce((s, f) => s + f.size, 0)
    const stubSize = stubs.reduce((s, f) => s + f.size, 0)

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('B2 AUDIT COMPLETE')
    console.log('='.repeat(60))
    console.log(`Total files checked: ${totalChecked}`)
    console.log(`Real audio files: ${realAudio.length} (${(realSize / 1024 / 1024 / 1024).toFixed(2)} GB)`)
    console.log(`Stub files: ${stubs.length} (${(stubSize / 1024).toFixed(0)} KB)`)
    console.log(`Errors: ${errors.length}`)
    console.log(`Time elapsed: ${elapsed}s`)
    console.log('='.repeat(60) + '\n')

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      totalChecked,
      realAudio: {
        count: realAudio.length,
        totalSize: realSize,
        avgSize: realAudio.length > 0 ? Math.round(realSize / realAudio.length) : 0
      },
      stubs: {
        count: stubs.length,
        totalSize: stubSize,
        avgSize: stubs.length > 0 ? Math.round(stubSize / stubs.length) : 0
      },
      errors: errors.length
    }

    fs.writeFileSync('audit-results.json', JSON.stringify(results, null, 2))
    console.log('✓ Saved audit summary to: audit-results.json')

    // Save stub details
    const stubsSorted = stubs.sort((a, b) => a.fileName.localeCompare(b.fileName))
    fs.writeFileSync(
      'audit-stubs.json',
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalStubs: stubs.length,
          stubs: stubsSorted
        },
        null,
        2
      )
    )
    console.log('✓ Saved stub details to: audit-stubs.json')

    // Also save as CSV for easy import
    const csvLines = ['fileName,size,uploadTime']
    stubsSorted.forEach(s => {
      csvLines.push(`"${s.fileName}",${s.size},${s.uploadTime}`)
    })
    fs.writeFileSync('audit-stubs.csv', csvLines.join('\n'))
    console.log('✓ Saved stub list to: audit-stubs.csv')

    console.log(`\n🎯 Ready to recover ${stubs.length} stub files from Dropbox backup.\n`)
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exit(1)
  }
}

main()
