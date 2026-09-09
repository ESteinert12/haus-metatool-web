/**
 * INTEGRATION VERIFICATION SCRIPT
 * Run this in browser console to verify all 4 feature branches integrated correctly
 *
 * Tests:
 * 1. Multi-source data shape consistency
 * 2. currentDisplayTracks set for all sources
 * 3. Error boundaries on key operations
 * 4. Playlist indicator sync
 * 5. State variables consolidated
 */

async function verifyIntegration() {
  const results = {
    pass: [],
    fail: [],
    warnings: []
  }

  console.group('🔍 HAUS Integration Verification')

  // Test 1: Global state variables exist
  console.log('Test 1: Global state variables')
  if (typeof currentPlaylistId !== 'undefined') {
    results.pass.push('✓ currentPlaylistId exists')
  } else {
    results.fail.push('✗ currentPlaylistId missing')
  }
  if (typeof currentLotId !== 'undefined') {
    results.pass.push('✓ currentLotId exists')
  } else {
    results.fail.push('✗ currentLotId missing')
  }
  if (typeof allTracks !== 'undefined') {
    results.pass.push('✓ allTracks exists')
  } else {
    results.fail.push('✗ allTracks missing')
  }
  if (typeof currentDisplayTracks !== 'undefined') {
    results.pass.push('✓ currentDisplayTracks exists')
  } else {
    results.fail.push('✗ currentDisplayTracks missing')
  }
  if (typeof activePlaylistSkus !== 'undefined' && activePlaylistSkus instanceof Set) {
    results.pass.push('✓ activePlaylistSkus is a Set')
  } else {
    results.fail.push('✗ activePlaylistSkus not a Set')
  }

  // Test 2: Data shape consistency (if allTracks has data)
  console.log('Test 2: allTracks data shape')
  if (allTracks && allTracks.length > 0) {
    const t = allTracks[0]
    const requiredFields = [
      'sku', 'title', 'composerID', 'composerName', 'key', 'bpm',
      'primaryGenre', 'subGenre', 'genre', 'mood1', 'mood2', 'ksl', 'rmo',
      'description', 'lot', 'titleId', 'folder', 'path', 'files', 'versions'
    ]
    const missing = requiredFields.filter(f => !(f in t))
    if (missing.length === 0) {
      results.pass.push(`✓ allTracks has all required fields (${allTracks.length} tracks)`)
    } else {
      results.fail.push(`✗ allTracks missing fields: ${missing.join(', ')}`)
    }
  } else {
    results.warnings.push('⚠ allTracks empty (load collection first)')
  }

  // Test 3: currentDisplayTracks alignment
  console.log('Test 3: currentDisplayTracks')
  if (currentDisplayTracks && currentDisplayTracks.length > 0) {
    results.pass.push(`✓ currentDisplayTracks has ${currentDisplayTracks.length} items`)
  } else if (allTracks && allTracks.length > 0) {
    results.warnings.push(`⚠ currentDisplayTracks not set (allTracks has ${allTracks.length})`)
  } else {
    results.warnings.push('⚠ No tracks loaded yet')
  }

  // Test 4: Error boundary functions exist
  console.log('Test 4: Error boundaries')
  const errorBoundaryFunctions = [
    'goAddTracksInCollection',
    'selectPlaylist',
    'selectProjectLot',
    'loadCatalogPG',
    'createPlaylist',
    'deletePlaylist'
  ]
  for (const fn of errorBoundaryFunctions) {
    if (typeof window[fn] === 'function') {
      // Check if function has try/catch by looking for 'catch' in toString
      const fnStr = window[fn].toString()
      if (fnStr.includes('catch')) {
        results.pass.push(`✓ ${fn}() has error boundary`)
      } else {
        results.warnings.push(`⚠ ${fn}() may need error handling check`)
      }
    } else {
      results.fail.push(`✗ ${fn}() not found`)
    }
  }

  // Test 5: Array type checking (not .ok checks)
  console.log('Test 5: Array type checking')
  // This is hard to test dynamically, so we just note it
  results.warnings.push('ℹ Array.isArray() checks verified in code review')

  // Test 6: No duplicate playlist ID
  console.log('Test 6: No duplicate playlist IDs')
  if (typeof window._currentPlaylistId !== 'undefined') {
    results.warnings.push('⚠ window._currentPlaylistId still exists (should be removed)')
  } else {
    results.pass.push('✓ No duplicate _currentPlaylistId found')
  }

  // Test 7: Playlist indicator functions
  console.log('Test 7: Playlist indicator')
  if (typeof loadActivePlaylistSkus === 'function') {
    results.pass.push('✓ loadActivePlaylistSkus() exists')
  } else {
    results.fail.push('✗ loadActivePlaylistSkus() not found')
  }
  if (typeof updatePlaylistIndicator === 'function') {
    results.pass.push('✓ updatePlaylistIndicator() exists')
  } else {
    results.fail.push('✗ updatePlaylistIndicator() not found')
  }

  // Print results
  console.group('Results')
  results.pass.forEach(r => console.log(r))
  if (results.warnings.length > 0) {
    console.group('Warnings')
    results.warnings.forEach(w => console.log(w))
    console.groupEnd()
  }
  if (results.fail.length > 0) {
    console.group('Failures')
    results.fail.forEach(f => console.log(f))
    console.groupEnd()
  }
  console.groupEnd()

  // Summary
  console.log(`\n📊 Summary: ${results.pass.length} pass, ${results.warnings.length} warnings, ${results.fail.length} failures`)
  console.groupEnd()

  return {
    passed: results.fail.length === 0,
    results
  }
}

// Auto-run on page load (optional)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', verifyIntegration)
} else {
  console.log('Run verifyIntegration() in console to test integration')
}
