#!/usr/bin/env node
/**
 * Recovery script for incomplete intakes
 * Recovers broken intakes where MD files and folders exist but audio files and DB records don't
 *
 * Usage: node recover-incomplete-intake.js <shipping_path> <staging_path> <db_connection_string>
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Simple MD parser
function parseMDMetadata(mdContent) {
  const lines = mdContent.split('\n')
  const result = {
    title: null,
    composer: null,
    key: null,
    genre: null,
    sku: null,
    bpm: null,
    ksl: null,
    mmw: null,
    type: 'Regular',
    files: []
  }

  let inFilesSection = false
  for (const line of lines) {
    if (line.startsWith('# ')) {
      result.title = line.replace(/^#\s+/, '').trim()
    } else if (line.includes('Composer:')) {
      result.composer = line.split(':')[1].trim()
    } else if (line.includes('Key:')) {
      result.key = line.split(':')[1].trim()
    } else if (line.includes('Genre:')) {
      result.genre = line.split(':')[1].trim()
    } else if (line.includes('SKU:')) {
      result.sku = line.split(':')[1].trim()
    } else if (line.includes('BPM:')) {
      result.bpm = parseInt(line.split(':')[1].trim())
    } else if (line.includes('KSL:')) {
      result.ksl = line.split(':')[1].trim()
    } else if (line.includes('MMW:')) {
      result.mmw = line.split(':')[1].trim()
    } else if (line.includes('Type:')) {
      result.type = line.split(':')[1].trim()
    } else if (line === '## Files') {
      inFilesSection = true
    } else if (inFilesSection && line.startsWith('- ')) {
      result.files.push(line.replace('- ', '').trim())
    }
  }

  return result
}

// Extract version from filename (e.g., "HAUS_Title_Key_ID_FULL.wav" → "FULL")
function extractVersion(filename) {
  const base = filename.replace(/\.[^.]+$/, '')
  const parts = base.split('_')
  return parts[parts.length - 1] || 'FULL'
}

// Find matching staging file by title and version
function findStagingFile(stagingPath, title, version, composer) {
  if (!fs.existsSync(stagingPath)) return null

  const files = fs.readdirSync(stagingPath)
  // Look for file containing title, version, and composer ID
  const titleNorm = title.toUpperCase().replace(/\s+/g, '')
  const versionNorm = version.toUpperCase()
  const compNorm = composer.slice(0, 4).toUpperCase()

  return files.find(f => {
    const fNorm = f.toUpperCase()
    return fNorm.includes(compNorm) && fNorm.includes(titleNorm) && fNorm.includes(versionNorm)
  })
}

// Main recovery function
async function recoverIncompleteIntake(shippingBase, stagingBase, dbConnStr) {
  console.log('[recover] Starting incomplete intake recovery...')
  console.log(`[recover] Shipping: ${shippingBase}`)
  console.log(`[recover] Staging: ${stagingBase}`)

  const recoveries = []

  // Recursively find all MD files in shipping
  function findMDFiles(dir) {
    const results = []
    try {
      const items = fs.readdirSync(dir)
      for (const item of items) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          results.push(...findMDFiles(fullPath))
        } else if (item.endsWith('.md')) {
          results.push({ mdPath: fullPath, folder: dir })
        }
      }
    } catch (e) {
      // Skip permission errors
    }
    return results
  }

  const mdFilesFound = findMDFiles(shippingBase)

  // Process each MD file found
  for (const { mdPath, folder: stagingFolderPath } of mdFilesFound) {
    const mdFile = path.basename(mdPath)

    const mdContent = fs.readFileSync(mdPath, 'utf8')
    const meta = parseMDMetadata(mdContent)

    if (!meta.sku || !meta.files || meta.files.length === 0) {
      console.warn(`[recover] Skipping ${mdFile} — incomplete metadata`)
      continue
    }

    // The shipping folder is the parent of the MD file's folder
    const shippingFolder = path.dirname(stagingFolderPath)

    // Check if files already exist in shipping
    const missingFiles = meta.files.filter(f => !fs.existsSync(path.join(shippingFolder, f)))
    if (missingFiles.length === 0) {
      console.log(`[recover] ✓ ${meta.sku} — all files present, skipping`)
      continue
    }

    // Find corresponding staging folder by 4-char SKU prefix
    let stagingFolder = null
    const skuPrefix = meta.sku.slice(0, 4) // e.g., R67a from R67a2784
    const titleNorm = meta.title.toUpperCase().replace(/\s+/g, ' ')

    function findStagingByPrefixRecursive(dir) {
      try {
        const items = fs.readdirSync(dir)
        for (const item of items) {
          const fullPath = path.join(dir, item)
          const stat = fs.statSync(fullPath)
          if (!stat.isDirectory()) continue

          // Debug: show what we're checking
          const itemUpper = item.toUpperCase()
          const matches = item.startsWith(skuPrefix) && itemUpper.includes(titleNorm)
          if (item.includes('67a') || item.includes('ONLY') || item.includes('MAIN')) {
            console.log(`[debug] Checking: ${item} | starts with ${skuPrefix}? ${item.startsWith(skuPrefix)} | includes "${titleNorm}"? ${itemUpper.includes(titleNorm)} | match? ${matches}`)
          }

          // Check if folder name starts with SKU prefix AND contains title
          if (matches) {
            return fullPath
          }
          // Recurse
          const found = findStagingByPrefixRecursive(fullPath)
          if (found) return found
        }
      } catch (e) {
        console.log(`[debug] Error reading ${dir}:`, e.message)
      }
      return null
    }

    stagingFolder = findStagingByPrefixRecursive(stagingBase)

    if (!stagingFolder) {
      console.warn(`[recover] Skipping ${meta.sku} — no matching staging folder found`)
      continue
    }

    console.log(`[recover] Found incomplete: ${meta.sku} (${meta.title}) — ${missingFiles.length} files missing`)
    recoveries.push({
      sku: meta.sku,
      title: meta.title,
      composer: meta.composer,
      key: meta.key,
      genre: meta.genre,
      bpm: meta.bpm,
      ksl: meta.ksl,
      mmw: meta.mmw,
      type: meta.type,
      shippingFolder: shippingFolder,
      stagingFolder: stagingFolder,
      expectedFiles: meta.files,
      missingFiles
    })
  }

  if (recoveries.length === 0) {
    console.log('[recover] No incomplete intakes found.')
    return
  }

  console.log(`\n[recover] Found ${recoveries.length} incomplete intake(s). Proceeding with recovery...\n`)

  // Process each recovery
  for (const recovery of recoveries) {
    console.log(`[recover] Processing: ${recovery.sku} — ${recovery.title}`)
    console.log(`[recover]   Staging: ${path.basename(recovery.stagingFolder)}`)
    console.log(`[recover]   Shipping: ${path.basename(recovery.shippingFolder)}`)

    // Copy files from staging to shipping
    for (const expectedFile of recovery.expectedFiles) {
      const version = extractVersion(expectedFile)
      const sourcePath = path.join(recovery.stagingFolder, findStagingFile(recovery.stagingFolder, recovery.title, version, recovery.composer) || '')

      if (!fs.existsSync(sourcePath)) {
        console.warn(`[recover]   ✗ Source file not found: ${expectedFile}`)
        continue
      }

      const destPath = path.join(recovery.shippingFolder, expectedFile)
      try {
        execSync(`cp "${sourcePath}" "${destPath}"`)
        console.log(`[recover]   ✓ Copied: ${expectedFile}`)
      } catch (e) {
        console.error(`[recover]   ✗ Failed to copy ${expectedFile}:`, e.message)
      }
    }
  }

  console.log('\n[recover] ✓ File recovery complete!')
  console.log('[recover] Next: Run intake in app to register files with database')
}

// Run if called directly
if (require.main === module) {
  const shippingBase = process.argv[2] || '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping'
  const stagingBase = process.argv[3] || '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/1. ATMOS_Staging'

  recoverIncompleteIntake(shippingBase, stagingBase)
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1) })
}

module.exports = { recoverIncompleteIntake, parseMDMetadata }
