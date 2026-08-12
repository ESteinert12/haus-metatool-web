#!/usr/bin/env node
/**
 * Generate Dropbox Recovery Manifest
 * Parses audit-stubs.csv and identifies which Dropbox folders to recover
 */

const fs = require('fs')
const path = require('path')

// Read the audit stubs CSV
const csvContent = fs.readFileSync('audit-stubs.csv', 'utf-8')
const lines = csvContent.trim().split('\n')

// Parse CSV (skip header)
const stubs = []
for (let i = 1; i < lines.length; i++) {
  // Simple CSV parsing - handle quoted fields
  const match = lines[i].match(/"([^"]+)","?(\d+)"?,(\d+)/)
  if (match) {
    const [, fileName, size, uploadTime] = match
    stubs.push({ fileName, size: parseInt(size), uploadTime: parseInt(uploadTime) })
  }
}

console.log(`Parsed ${stubs.length} stub files from audit-stubs.csv\n`)

// Filter to only AUDIO stubs (not metadata like .txt, .url, .textClipping)
const audioStubs = stubs.filter(s => {
  const ext = path.extname(s.fileName).toLowerCase()
  return ext === '.wav' || ext === '.mp3' || ext === '.aiff'
})

const metadataStubs = stubs.filter(s => !audioStubs.includes(s))

console.log(`Audio stubs: ${audioStubs.length}`)
console.log(`Metadata stubs (can ignore): ${metadataStubs.length}`)
console.log('')

// Group audio stubs by composer/song folder
// Path format: nimbus/C27_Aaron Saloman_NIMBUS/C27a2844_Desert Drone/HAUS_...
const folderMap = new Map()

for (const stub of audioStubs) {
  // Extract folder path (everything except filename)
  const parts = stub.fileName.split('/')
  if (parts.length >= 4) {
    const bucketName = parts[0] // nimbus, cumulus, etc
    const composerFolder = parts[1] // C27_Aaron Saloman_NIMBUS
    const songFolder = parts[2] // C27a2844_Desert Drone
    const folderPath = `${bucketName}/${composerFolder}/${songFolder}`

    if (!folderMap.has(folderPath)) {
      folderMap.set(folderPath, [])
    }
    folderMap.get(folderPath).push(stub)
  }
}

console.log(`Unique composer/song folders needing recovery: ${folderMap.size}\n`)

// Estimate based on upload timestamps
const timestamps = audioStubs.map(s => s.uploadTime)
const oldestTime = Math.min(...timestamps)
const newestTime = Math.max(...timestamps)
const oldestDate = new Date(oldestTime)
const newestDate = new Date(newestTime)

console.log(`Upload date range: ${oldestDate.toISOString().split('T')[0]} to ${newestDate.toISOString().split('T')[0]}`)
console.log('')

// Generate recovery manifest
const manifest = {
  timestamp: new Date().toISOString(),
  totalAudioStubs: audioStubs.length,
  totalFoldersToRecover: folderMap.size,
  uploadDateRange: {
    oldest: oldestDate.toISOString(),
    newest: newestDate.toISOString()
  },
  foldersToRecover: Array.from(folderMap.entries()).map(([folderPath, files]) => ({
    folderPath,
    audioFileCount: files.length,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    files: files.map(f => ({
      name: path.basename(f.fileName),
      size: f.size,
      uploadTime: new Date(f.uploadTime).toISOString()
    }))
  }))
}

// Save manifest
fs.writeFileSync('recovery-manifest.json', JSON.stringify(manifest, null, 2))
console.log('✓ Saved detailed recovery manifest to: recovery-manifest.json')

// Generate simple folder list for Dropbox recovery
const dropboxPaths = Array.from(folderMap.keys()).sort()
const dropboxList = [
  '# Dropbox Recovery Paths',
  '# Copy these folders from your Dropbox backup to recover stub files',
  '# Source: 2. COLLECTION UPLOADER/2. ATMOS_Shipping/',
  ''
]

// Group by bucket for easier navigation
const byBucket = new Map()
for (const folderPath of dropboxPaths) {
  const bucket = folderPath.split('/')[0]
  if (!byBucket.has(bucket)) {
    byBucket.set(bucket, [])
  }
  byBucket.get(bucket).push(folderPath)
}

for (const [bucket, paths] of byBucket.entries()) {
  dropboxList.push(`## ${bucket.toUpperCase()} (${paths.length} folders)`)
  paths.forEach(p => dropboxList.push(p))
  dropboxList.push('')
}

fs.writeFileSync('recovery-dropbox-paths.txt', dropboxList.join('\n'))
console.log('✓ Saved Dropbox recovery paths to: recovery-dropbox-paths.txt')

// Create a summary report
const report = []
report.push('=' .repeat(70))
report.push('STUB RECOVERY SUMMARY')
report.push('='.repeat(70))
report.push('')
report.push(`Total stubs found: ${stubs.length}`)
report.push(`  - Audio stubs (need recovery): ${audioStubs.length}`)
report.push(`  - Metadata cruft (can ignore): ${metadataStubs.length}`)
report.push('')
report.push(`Unique composer/song folders: ${folderMap.size}`)
report.push('')
report.push(`Upload date range: ${oldestDate.toLocaleDateString()} to ${newestDate.toLocaleDateString()}`)
report.push('')
report.push('Files by bucket:')
for (const [bucket, paths] of byBucket.entries()) {
  report.push(`  ${bucket}: ${paths.length} folders`)
}
report.push('')
report.push('RECOVERY PROCESS:')
report.push('1. Open your Dropbox backup at: 2. COLLECTION UPLOADER/2. ATMOS_Shipping/')
report.push('2. For each folder in recovery-dropbox-paths.txt, download the entire folder')
report.push('3. Place all folders in: /Users/HAUS/Desktop/STUB_RECOVERY/')
report.push('4. Run backfill script to upload all recovered files to B2')
report.push('')
report.push('See recovery-manifest.json for detailed file list')
report.push('See recovery-dropbox-paths.txt for Dropbox folder paths to recover')
report.push('='.repeat(70))

const reportText = report.join('\n')
console.log('\n' + reportText)

fs.writeFileSync('recovery-summary.txt', reportText)
console.log('\n✓ Saved recovery summary to: recovery-summary.txt')
