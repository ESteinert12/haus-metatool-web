/**
 * Intake Validation Module
 * Validates metadata before processing intakes to prevent bad data in database
 *
 * Usage:
 *   const validator = new IntakeValidator(dbConnection, config)
 *   const result = await validator.validateFolder(folderPath, mdContent)
 *   if (!result.valid) {
 *     // Move to _INVALID folder
 *     // Show error to user
 *   }
 */

class IntakeValidator {
  constructor(db, config = {}) {
    this.db = db
    this.config = config

    // SKU pattern: 1-3 letter prefix + 1-2 digits + letter + 4-digit ID
    // Valid: C53a4864, R48a9201, S33b0001, T27a5555
    this.skuPattern = /^[A-Z]{1,3}\d{1,2}[a-z]\d{4}$/

    // Valid music keys
    this.validKeys = [
      'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
      'Cm', 'Dbm', 'Dm', 'Ebm', 'Em', 'Fm', 'Gbm', 'Gm', 'Abm', 'Am', 'Bbm', 'Bm',
      'Csharp', 'Csharpm', 'Dsharp', 'Dsharpm', 'Fsharp', 'Fsharpm', 'Gsharp', 'Gsharpm', 'Asharp', 'Asharpm',
      'TEX', 'SOHOEDM', 'SOHOTENSION', 'SOHOVOCAL', 'VOX', 'ALT', 'FULL', 'BUMPER', 'STING', 'DRUMS', 'NoBrass'
    ]

    // Valid genres/collections
    this.validCollections = ['STRATUS', 'CUMULUS', 'CIRRUS', 'NIMBUS']

    // Required metadata fields
    this.requiredFields = [
      'title', 'composer', 'sku', 'key', 'collection',
      'genres', 'moods', 'tempo', 'ksls', 'lot', 'releaseDate'
    ]

    // Valid tempo values (optional - add common tempos)
    this.validTempos = [
      'Slow', 'Moderate', 'Fast', 'Very Fast',
      '60', '80', '100', '120', '140', '160', '180', '200',
      '60-80', '80-100', '100-120', '120-140', '140-160'
    ]
  }

  /**
   * Main validation entry point
   * Returns Promise resolving to validation result
   */
  async validateFolder(folderPath, mdContent) {
    const errors = []
    const warnings = []

    try {
      // Parse metadata from .md file
      const metadata = this.parseMetadata(mdContent)

      if (!metadata) {
        return {
          valid: false,
          reason: 'PARSE_ERROR',
          errors: ['Could not parse metadata from .md file. Check format.'],
          metadata: null
        }
      }

      // Check required fields
      for (const field of this.requiredFields) {
        if (!metadata[field] || metadata[field].trim() === '') {
          errors.push(`Missing required field: ${field}`)
        }
      }

      // Validate SKU format
      if (metadata.sku && !this.skuPattern.test(metadata.sku)) {
        errors.push(`Invalid SKU format: "${metadata.sku}" (expected format: C53a4864, R48a9201, S33b0001, etc.)`)
      }

      // Validate key
      if (metadata.key && !this.isValidKey(metadata.key)) {
        warnings.push(`Unusual key: "${metadata.key}" (check if correct)`)
      }

      // Validate collection
      if (metadata.collection && !this.validCollections.includes(metadata.collection)) {
        errors.push(`Invalid collection: "${metadata.collection}" (must be: ${this.validCollections.join(', ')})`)
      }

      // Validate genres (comma-separated list)
      if (metadata.genres) {
        const genreList = metadata.genres.split(',').map(g => g.trim())
        if (genreList.length === 0) {
          errors.push(`Genres cannot be empty`)
        }
        genreList.forEach(genre => {
          if (genre.length < 2) {
            errors.push(`Invalid genre: "${genre}" (too short)`)
          }
        })
      }

      // Validate moods (comma-separated list)
      if (metadata.moods) {
        const moodList = metadata.moods.split(',').map(m => m.trim())
        if (moodList.length === 0) {
          errors.push(`Moods cannot be empty`)
        }
        moodList.forEach(mood => {
          if (mood.length < 2) {
            errors.push(`Invalid mood: "${mood}" (too short)`)
          }
        })
      }

      // Validate tempo (accepts BPM numbers or tempo names)
      if (metadata.tempo) {
        const tempoStr = metadata.tempo.trim()
        // Check if it's a number or matches tempo pattern
        const isValidTempo = /^\d+(\-\d+)?(\s*BPM)?$/.test(tempoStr) ||
                            this.validTempos.includes(tempoStr)
        if (!isValidTempo) {
          warnings.push(`Unusual tempo format: "${tempoStr}" (expected: number, range, or name)`)
        }
      }

      // Validate KSLS (should be alphanumeric identifier)
      if (metadata.ksls) {
        const kslStr = metadata.ksls.trim()
        if (!/^[A-Z0-9\-]+$/.test(kslStr)) {
          warnings.push(`KSLS format unusual: "${kslStr}" (expected alphanumeric)`)
        }
      }

      // Validate lot (should be alphanumeric)
      if (metadata.lot) {
        const lotStr = metadata.lot.trim()
        if (!/^[A-Z0-9\-]+$/.test(lotStr)) {
          warnings.push(`Lot format unusual: "${lotStr}" (expected alphanumeric)`)
        }
      }

      // Validate release date (YYYY-MM-DD or similar)
      if (metadata.releaseDate) {
        const dateStr = metadata.releaseDate.trim()
        // Accept various date formats: YYYY-MM-DD, MM/DD/YYYY, etc.
        const isValidDate = /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$|^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$|^\d{4}$/.test(dateStr)
        if (!isValidDate) {
          warnings.push(`Release date format unusual: "${dateStr}" (expected YYYY-MM-DD or MM/DD/YYYY)`)
        }
      }

      // Check for invalid characters in title
      if (metadata.title) {
        const invalidChars = this.findInvalidChars(metadata.title)
        if (invalidChars.length > 0) {
          warnings.push(`Title contains unusual characters: ${invalidChars.join(', ')}`)
        }
      }

      // Check for duplicate SKU in database
      if (metadata.sku) {
        const isDuplicate = await this.checkDuplicate(metadata.sku)
        if (isDuplicate) {
          warnings.push(`SKU already exists in database: ${metadata.sku}`)
        }
      }

      // Validate filename compatibility
      const filename = this.generateExpectedFilename(metadata)
      if (filename) {
        metadata.expectedFilename = filename
      }

      return {
        valid: errors.length === 0,
        reason: errors.length > 0 ? 'VALIDATION_FAILED' : 'VALID',
        errors,
        warnings,
        metadata
      }

    } catch (error) {
      return {
        valid: false,
        reason: 'EXCEPTION',
        errors: [`Validation error: ${error.message}`],
        metadata: null
      }
    }
  }

  /**
   * Parse metadata from .md content
   * Expects format:
   * # Title
   * SKU: C53a4864
   * Composer: James Sheehan
   * Key: Am
   * Collection: NIMBUS
   * Genres: Electronic, Dance
   * Moods: Energetic, Dark
   * Tempo: 120 BPM
   * KSLS: KSL001
   */
  parseMetadata(mdContent) {
    try {
      const metadata = {
        title: null,
        composer: null,
        sku: null,
        key: null,
        collection: null,
        genres: null,
        moods: null,
        tempo: null,
        ksls: null,
        lot: null,
        releaseDate: null
      }

      // Extract title from first heading
      const titleMatch = mdContent.match(/^#\s+(.+)$/m)
      if (titleMatch) metadata.title = titleMatch[1].trim()

      // Extract key-value pairs
      const skuMatch = mdContent.match(/SKU:\s*(.+?)(?:\n|$)/i)
      if (skuMatch) metadata.sku = skuMatch[1].trim()

      const composerMatch = mdContent.match(/Composer:\s*(.+?)(?:\n|$)/i)
      if (composerMatch) metadata.composer = composerMatch[1].trim()

      const keyMatch = mdContent.match(/Key:\s*(.+?)(?:\n|$)/i)
      if (keyMatch) metadata.key = keyMatch[1].trim()

      const collectionMatch = mdContent.match(/Collection:\s*(.+?)(?:\n|$)/i)
      if (collectionMatch) metadata.collection = collectionMatch[1].trim()

      const genresMatch = mdContent.match(/Genres?:\s*(.+?)(?:\n|$)/i)
      if (genresMatch) metadata.genres = genresMatch[1].trim()

      const moodsMatch = mdContent.match(/Moods?:\s*(.+?)(?:\n|$)/i)
      if (moodsMatch) metadata.moods = moodsMatch[1].trim()

      const tempoMatch = mdContent.match(/Tempo:\s*(.+?)(?:\n|$)/i)
      if (tempoMatch) metadata.tempo = tempoMatch[1].trim()

      const kslsMatch = mdContent.match(/KSLS?:\s*(.+?)(?:\n|$)/i)
      if (kslsMatch) metadata.ksls = kslsMatch[1].trim()

      const lotMatch = mdContent.match(/Lot:\s*(.+?)(?:\n|$)/i)
      if (lotMatch) metadata.lot = lotMatch[1].trim()

      const releaseDateMatch = mdContent.match(/Release\s*Date:\s*(.+?)(?:\n|$)/i)
      if (releaseDateMatch) metadata.releaseDate = releaseDateMatch[1].trim()

      return metadata
    } catch (error) {
      console.error('[parseMetadata] Error:', error)
      return null
    }
  }

  /**
   * Check if key is in the valid list or similar to one
   */
  isValidKey(key) {
    if (!key) return false

    // Exact match
    if (this.validKeys.includes(key)) return true

    // Check if it looks like a valid key pattern
    // Allow major and minor keys: C, Cm, C#, C#m, etc.
    const keyPattern = /^([A-G])(#{0,1}|b)?(m)?$/
    return keyPattern.test(key)
  }

  /**
   * Find invalid characters in a string
   */
  findInvalidChars(str) {
    const allowedPattern = /^[a-zA-Z0-9\s\-\(\)\'\.\,\&]*/
    const invalid = []

    for (let i = 0; i < str.length; i++) {
      const char = str[i]
      if (!/[a-zA-Z0-9\s\-\(\)\'\.\,\&]/.test(char)) {
        if (!invalid.includes(char)) {
          invalid.push(`'${char}'`)
        }
      }
    }

    return invalid
  }

  /**
   * Check if SKU already exists in database
   */
  async checkDuplicate(sku) {
    if (!this.db) return false

    try {
      const result = await this.db.query(
        `SELECT COUNT(*) as count FROM songs WHERE sku = $1`,
        [sku]
      )
      return result && result.rows && result.rows.length > 0 && result.rows[0].count > 0
    } catch (error) {
      console.error('[checkDuplicate] Error:', error)
      return false
    }
  }

  /**
   * Generate expected HAUS filename from metadata
   * Format: HAUS_{Title}_{Key}_{SKU}_{VERSION}.ext
   */
  generateExpectedFilename(metadata) {
    if (!metadata.title || !metadata.key || !metadata.sku) {
      return null
    }

    // Convert title to CamelCase
    const titleCamel = metadata.title
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')

    // Remove spaces and special chars from key
    const keyClean = metadata.key.replace(/[^a-zA-Z0-9]/g, '')

    return `HAUS_${titleCamel}_${keyClean}_${metadata.sku}_{VERSION}.wav`
  }

  /**
   * Get a human-readable summary of validation results
   */
  getSummary(result) {
    if (result.valid) {
      return {
        status: 'VALID',
        message: `Ready to intake: ${result.metadata.title} (${result.metadata.sku})`,
        details: result.warnings.length > 0 ? result.warnings : []
      }
    }

    return {
      status: 'INVALID',
      message: `Cannot intake: ${result.errors.length} error(s)`,
      errors: result.errors,
      warnings: result.warnings
    }
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntakeValidator
}
