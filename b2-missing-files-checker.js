/**
 * B2 Missing Files Checker
 *
 * Checks Collection tracks against B2 inventory and auto-flags missing audio files.
 * Designed for robustness: caching, error handling, graceful degradation.
 */

class B2MissingFilesChecker {
  constructor() {
    this.cacheKey = 'haus_b2_file_inventory'
    this.cacheExpiry = 3600000 // 1 hour in ms
    this.isChecking = false
    this.audioExtensions = new Set(['.wav', '.mp3', '.aiff', '.aif', '.flac', '.m4a'])
    this.b2FileMap = new Map() // filename -> b2 path
  }

  /**
   * Get cached B2 inventory or fetch fresh
   */
  async getB2Inventory() {
    const cached = this.getCachedInventory()
    if (cached) {
      console.log('[B2Checker] Using cached inventory')
      return cached
    }

    console.log('[B2Checker] Fetching fresh B2 inventory...')
    return this.fetchB2InventoryFromServer()
  }

  /**
   * Check if we have valid cached inventory
   * Note: Due to browser storage limits (26MB inventory > localStorage capacity),
   * we fetch fresh each time but store metadata for reference
   */
  getCachedInventory() {
    try {
      const stored = localStorage.getItem(this.cacheKey)
      if (!stored) return null

      const data = JSON.parse(stored)

      // We don't cache the full inventory due to size limits
      // Always return null to fetch fresh from server
      if (!data.cached) {
        console.log('[B2Checker] Full inventory not cached (too large for localStorage)')
        return null
      }

      const age = Date.now() - (data.timestamp || 0)
      if (age > this.cacheExpiry) {
        console.log('[B2Checker] Cache expired')
        return null
      }

      console.log(`[B2Checker] Cache valid (${Math.floor(age / 1000)}s old)`)
      return data.inventory
    } catch (e) {
      console.error('[B2Checker] Cache read error:', e)
      return null
    }
  }

  /**
   * Fetch B2 inventory from server
   * Calls a backend endpoint that lists B2 files
   */
  async fetchB2InventoryFromServer() {
    try {
      // Call your backend to list B2 files
      // This assumes you have an API endpoint that returns B2 file listing
      const resp = await fetch('/api/b2/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!resp.ok) {
        throw new Error(`B2 API error: ${resp.status}`)
      }

      const data = await resp.json()
      console.log('[B2Checker] API Response:', JSON.stringify(data).substring(0, 500))

      let filenames = data.filenames || data.files || []

      if (!Array.isArray(filenames)) {
        console.error('[B2Checker] Filenames is not array:', typeof filenames, filenames)
        throw new Error('Invalid B2 inventory response')
      }

      // Cache metadata only (not the full 26MB array)
      // Full caching would exceed localStorage limits
      try {
        localStorage.setItem(this.cacheKey, JSON.stringify({
          timestamp: Date.now(),
          fileCount: filenames.length,
          cached: false  // Don't cache the full array, just metadata
        }))
      } catch (e) {
        console.warn('[B2Checker] Cache write failed:', e)
      }

      return { filenames, fileCount: filenames.length }
    } catch (e) {
      console.error('[B2Checker] Fetch error:', e)
      throw new Error(`Failed to fetch B2 inventory: ${e.message}`)
    }
  }

  /**
   * Check if audio file exists in B2 for given track
   * Constructs the expected FULL filename and searches B2 for it
   * Format: HAUS_{TitleWithNoSpaces}_{KEY}_{COMPOSERID}_FULL
   */
  async checkTrackAudio(track, inventory) {
    if (!track.title || !track.key || !track.composerID) return false

    const { filenames } = inventory

    // Construct the expected filename pattern
    // Remove spaces from title and construct: HAUS_Title_Key_ComposerID_FULL
    const titleNoSpaces = track.title.replace(/\s+/g, '')
    const expectedPattern = `HAUS_${titleNoSpaces}_${track.key}_${track.composerID}_FULL`

    // Search for the filename (could be .wav, .mp3, etc.)
    for (const filename of filenames) {
      if (filename.startsWith(expectedPattern)) {
        return true // Found the FULL version in B2
      }
    }

    return false // No FULL version found
  }

  /**
   * Check all tracks and flag missing ones
   */
  async checkTracks(tracks, onProgress) {
    if (this.isChecking) {
      console.warn('[B2Checker] Check already in progress')
      return { missing: 0, checked: 0 }
    }

    this.isChecking = true
    let missing = 0
    let checked = 0
    let errors = 0

    try {
      if (!tracks || !tracks.length) {
        throw new Error('No tracks to check')
      }

      // Get B2 inventory
      if (onProgress) onProgress(`Loading B2 inventory...`)
      const inventory = await this.getB2Inventory()
      if (!inventory) {
        throw new Error('Could not load B2 inventory')
      }

      if (onProgress) onProgress(`B2 ready: ${inventory.fileCount} files`)

      // Check each track
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        const sku = track.sku || track.sku_root || track.titleId || ''

        if (onProgress && i % 10 === 0) {
          onProgress(`Checking: ${i}/${tracks.length}`)
        }

        try {
          // Debug: log first few tracks with all properties
          if (i < 3) {
            console.log(`[B2Checker] Track ${i}: ${JSON.stringify(track)}`)
          }

          const hasAudio = await this.checkTrackAudio(track, inventory)

          if (!hasAudio) {
            // Auto-flag missing file
            this.flagTrack(sku)
            missing++
          }

          checked++
        } catch (e) {
          console.error(`[B2Checker] Error checking track ${sku}:`, e)
          errors++
        }
      }

      if (onProgress) {
        onProgress(`Complete: ${checked} checked, ${missing} missing`)
      }

      return { missing, checked, errors }
    } catch (e) {
      console.error('[B2Checker] Check failed:', e)
      if (onProgress) onProgress(`Error: ${e.message}`)
      throw e
    } finally {
      this.isChecking = false
    }
  }

  /**
   * Auto-flag a track as missing audio
   */
  flagTrack(sku) {
    if (!sku) return

    try {
      const flaggedSkus = new Set(JSON.parse(
        localStorage.getItem('haus_flagged_skus') || '[]'
      ))
      flaggedSkus.add(sku)
      localStorage.setItem('haus_flagged_skus', JSON.stringify([...flaggedSkus]))
    } catch (e) {
      console.error('[B2Checker] Flag error:', e)
    }
  }

  /**
   * Clear cached inventory (for manual refresh)
   */
  clearCache() {
    try {
      localStorage.removeItem(this.cacheKey)
      console.log('[B2Checker] Cache cleared')
    } catch (e) {
      console.error('[B2Checker] Cache clear error:', e)
    }
  }

  /**
   * Get cache info for debugging
   */
  getCacheInfo() {
    try {
      const stored = localStorage.getItem(this.cacheKey)
      if (!stored) return { cached: false }

      const data = JSON.parse(stored)
      const age = Date.now() - (data.timestamp || 0)
      const valid = age < this.cacheExpiry

      return {
        cached: true,
        files: data.inventory?.fileCount || 0,
        ageSeconds: Math.floor(age / 1000),
        valid
      }
    } catch (e) {
      return { error: e.message }
    }
  }
}

// Global instance
window.b2Checker = new B2MissingFilesChecker()

/**
 * Wired into Collection view
 * Call this from your "Check B2" button
 */
async function checkB2ForMissingAudio(tracks) {
  const checker = window.b2Checker
  const statusEl = document.getElementById('b2-check-status')
  const btnEl = document.getElementById('b2-check-btn')

  const updateStatus = (msg) => {
    console.log('[B2Check]', msg)
    if (statusEl) statusEl.textContent = msg
  }

  if (btnEl) {
    btnEl.disabled = true
    btnEl.innerHTML = '<i class="ti ti-loader-2"></i> Checking B2…'
  }

  try {
    updateStatus('Initializing B2 check...')
    const result = await checker.checkTracks(tracks, updateStatus)

    updateStatus(`✅ Done: ${result.checked} checked, ${result.missing} missing audio files auto-flagged`)

    if (result.missing > 0) {
      // Update the flagged button to show count
      if (window.updateFlaggedBtn) window.updateFlaggedBtn()

      // Optional: show flagged tracks
      if (window.filterTracks) {
        window.filterTracks('')
      }
    }

    return result
  } catch (e) {
    updateStatus(`❌ Error: ${e.message}`)
    console.error('[B2Check] Error:', e)
  } finally {
    if (btnEl) {
      btnEl.disabled = false
      btnEl.innerHTML = '<i class="ti ti-refresh"></i> Check B2'
    }
  }
}

/**
 * Manual cache refresh
 */
function refreshB2Cache() {
  const checker = window.b2Checker
  checker.clearCache()
  console.log('[B2Check] Cache cleared, will fetch fresh on next check')
  alert('B2 cache cleared. Next check will refresh from B2.')
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { B2MissingFilesChecker, checkB2ForMissingAudio, refreshB2Cache }
}
