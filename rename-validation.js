/**
 * File Rename Validation Module
 *
 * Parses incoming composer files (with inconsistent naming) and validates/normalizes them
 * for the HAUS naming convention: HAUS_{Title}_{Key}_{ComposerID}_{VERSION}.ext
 *
 * Key insight: Composers ignore delimiters (use hyphens, spaces, underscores inconsistently)
 * Solution: Parse BACKWARD from filename end using pattern matching for known components
 */

/**
 * BACKWARD PARSING: Extract components from right to left
 *
 * Example: Main Character-Hyper_Dm_R13a_FULL.wav
 * 1. Last part (FULL) → VERSION
 * 2. Before that (R13a) → ComposerID
 * 3. Before that (Dm) → KEY
 * 4. Everything else (Main Character-Hyper) → TITLE
 */

const VERSION_PATTERNS = {
  FULL: /^FULL(\s|_|$)/i,
  STING: /^STING(\s|_|$)/i,
  BUMPER: /^BUMPER(\s|_|$)/i,
  ALT: /^ALT(\s|_|$)/i,
  DNB: /^DNB(\s|_|$)/i,
  NoDNB: /^NO[\s_-]?DNB(\s|_|$)/i,
}

const COMPOSER_ID_PATTERN = /^[A-Z]{1,3}\d{2,3}[a-z]$/i
const KEY_PATTERN = /^[A-G](?:sharp|flat|b|#)?m?$/i

/**
 * Parse filename backward to extract: title, key, composerID, version
 * Handles inconsistent delimiters (hyphens, spaces, underscores)
 *
 * @param {string} filename - e.g., "Main Character-Hyper_Dm_R13a_FULL.wav"
 * @returns {object} {title, key, composerID, version, error}
 */
function parseFilename(filename) {
  if (!filename) return { error: 'No filename provided', title: null, key: null, composerID: null, version: null }

  // Remove extension
  const withoutExt = filename.replace(/\.[^.]+$/, '')

  // Split on any delimiter (space, underscore, hyphen)
  const parts = withoutExt.split(/[\s_-]+/).filter(p => p.length > 0)

  if (parts.length < 2) {
    return { error: 'Filename too short', title: withoutExt, key: null, composerID: null, version: null }
  }

  const result = {
    title: null,
    key: null,
    composerID: null,
    version: null,
    error: null
  }

  // STEP 1: Extract VERSION from last part(s)
  // Try combining last 2 parts first (for "BUMPER 1", "LITE MIX", "NO DNB", "FULL MIX")
  let detectedVersion = null
  if (parts.length >= 2) {
    const lastTwo = parts[parts.length - 2] + ' ' + parts[parts.length - 1]
    detectedVersion = detectVersion(lastTwo)
    if (detectedVersion) {
      parts.pop()
      parts.pop()
    }
  }

  // If not found, try just the last part
  if (!detectedVersion && parts.length > 0) {
    const lastPart = parts[parts.length - 1]
    detectedVersion = detectVersion(lastPart)
    if (detectedVersion) {
      parts.pop()
    }
  }

  result.version = detectedVersion || 'FULL' // Default if no version found

  // STEP 2: Extract COMPOSER_ID from what's now the last part
  if (parts.length > 0) {
    const potentialComposer = parts[parts.length - 1]
    if (COMPOSER_ID_PATTERN.test(potentialComposer)) {
      result.composerID = potentialComposer
      parts.pop()
    }
  }

  // STEP 3: Extract KEY from what's now the last part
  if (parts.length > 0) {
    const potentialKey = parts[parts.length - 1]
    if (isValidKey(potentialKey)) {
      result.key = normalizeKey(potentialKey)
      parts.pop()
    }
  }

  // STEP 4: Everything else is TITLE
  if (parts.length > 0) {
    result.title = parts.join(' ').trim()
  } else {
    result.error = 'No title found after parsing'
  }

  return result
}

/**
 * Detect version suffix from a string
 * Handles: FULL, FULL MIX, STING, STING 1, BUMPER 2, ALT, DNB, NO DNB, etc.
 * Returns normalized version (FULL, STING, STINGa, BUMPERb, etc.)
 */
function detectVersion(text) {
  if (!text) return null

  const upper = text.toUpperCase()

  // Check exact patterns
  if (upper.startsWith('FULL')) return 'FULL'
  if (upper.startsWith('DNB')) return 'DNB'
  if (upper.startsWith('NODMB') || upper === 'NO DNB') return 'NoDNB'

  // STING: can be "STING", "STING 1", "STING 2", "LongSting", "ShortSting"
  if (upper.includes('STING')) {
    const match = text.match(/STING\s*(\d+)?/i)
    if (match) {
      if (!match[1] || match[1] === '1') return 'STING'
      if (match[1] === '2') return 'STINGa'
      if (match[1] === '3') return 'STINGb'
      return `STING${String.fromCharCode(96 + parseInt(match[1]))}`
    }
  }

  // BUMPER: can be "BUMPER", "BUMPER 1", "BUMPER 2", etc.
  if (upper.includes('BUMPER')) {
    const match = text.match(/BUMPER\s*(\d+)?/i)
    if (match) {
      if (!match[1] || match[1] === '1') return 'BUMPER'
      if (match[1] === '2') return 'BUMPERa'
      if (match[1] === '3') return 'BUMPERb'
      return `BUMPER${String.fromCharCode(96 + parseInt(match[1]))}`
    }
  }

  // ALT, LITE MIX, or unrecognized
  if (upper === 'ALT' || upper.includes('LITE')) return 'ALT'

  return null
}

/**
 * Check if a string is a valid musical key
 */
function isValidKey(text) {
  return KEY_PATTERN.test(text)
}

/**
 * Normalize key format: D# → Dsharp, Dbm → Dbm, etc.
 */
function normalizeKey(key) {
  if (!key) return null

  let normalized = key

  // Convert # to 'sharp'
  if (normalized.includes('#')) {
    normalized = normalized.replace(/#/g, 'sharp')
  }

  // Convert b to 'flat' (unless it's already part of note like Bb)
  // Only if there's a note before it
  if (normalized.match(/^[A-G]b/)) {
    normalized = normalized.replace(/b/g, 'flat')
  }

  // Ensure proper case: first letter uppercase, rest lowercase, m at end
  const isMajor = !normalized.toLowerCase().endsWith('m')
  const withoutM = normalized.toLowerCase().replace(/m$/, '')

  return withoutM.charAt(0).toUpperCase() + withoutM.slice(1) + (isMajor ? '' : 'm')
}

/**
 * Build the final HAUS filename
 * Format: HAUS_{TitleCamelCase}_{Key}_{ComposerID}_{VERSION}
 */
function buildHausName(parsed, isJup = false) {
  if (!parsed.title || !parsed.composerID || !parsed.version) {
    return { error: 'Missing required fields for filename', filename: null }
  }

  const camelTitle = titleToCamelCase(parsed.title)
  const composer = parsed.composerID
  const version = parsed.version

  // Build: HAUS_Title_ComposerID_VERSION or HAUS_Title_Key_ComposerID_VERSION
  let parts = ['HAUS', camelTitle]

  if (parsed.key) {
    parts.push(parsed.key)
  }

  parts.push(composer)
  parts.push(version)

  return parts.join('_')
}

/**
 * Convert title to CamelCase (no spaces, no punctuation)
 * "Main Character" → "MainCharacter"
 * "Don't Stop" → "DontStop"
 */
function titleToCamelCase(title) {
  if (!title) return ''

  return title
    .split(/[\s\-_]+/) // Split on spaces, hyphens, underscores
    .filter(word => word.length > 0)
    .map(word => {
      // Remove punctuation
      const clean = word.replace(/[^\w]/g, '')
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
    })
    .join('')
}

/**
 * Handle file collisions: if STING already exists, next one is STINGa
 * This prevents two STING files getting the same name
 */
function deduplicateHausNames(existingNames, proposedName) {
  if (!existingNames.includes(proposedName)) {
    return proposedName
  }

  // Split extension: HAUS_Track_FULL.wav → ['HAUS_Track_FULL', 'wav']
  const lastDotIndex = proposedName.lastIndexOf('.')
  let base, ext
  if (lastDotIndex > 0) {
    base = proposedName.substring(0, lastDotIndex)
    ext = proposedName.substring(lastDotIndex) // includes the dot
  } else {
    base = proposedName
    ext = ''
  }

  for (let i = 0; i < 26; i++) {
    const suffix = String.fromCharCode(97 + i) // a, b, c, ...
    const candidate = `${base}${suffix}${ext}`
    if (!existingNames.includes(candidate)) {
      return candidate
    }
  }

  return proposedName // Fallback if somehow 26 variants exist
}

/**
 * Main validation: parse filename and return structured result
 */
function validateFilename(filename) {
  const parsed = parseFilename(filename)

  if (parsed.error && !parsed.title) {
    return {
      valid: false,
      filename: filename,
      error: parsed.error,
      parsed: parsed
    }
  }

  // Check for missing required fields
  if (!parsed.composerID) {
    return {
      valid: false,
      filename: filename,
      error: 'Missing composer ID (pattern: R13a, S33a, etc.)',
      parsed: parsed
    }
  }

  if (!parsed.title) {
    return {
      valid: false,
      filename: filename,
      error: 'Missing title',
      parsed: parsed
    }
  }

  return {
    valid: true,
    filename: filename,
    parsed: parsed,
    error: null
  }
}


