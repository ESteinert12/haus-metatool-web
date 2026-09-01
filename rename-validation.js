/**
 * HAUS File Rename Validation Module
 * Shared logic between intake workflow and haus-file-renamer skill
 * Ensures consistent file renaming across the app
 */

/**
 * Detect and normalize the VERSION component from a filename
 * Handles: BUMPER, STING, ALT, DNB, NoDNB, NoDrums, NoLead, NoVox, PIANO, GUITAR, FULL
 */
function detectVersion(filename) {
  const base = filename.replace(/\.[^.]+$/, '')
  const lastUs = base.lastIndexOf('_')
  const rawSuffix = lastUs >= 0 ? base.slice(lastUs + 1).trim() : ''
  const su = rawSuffix.toUpperCase()

  // FULL (and variations like "FULL MIX", "FULL VERSION")
  if (/^FULL\b/i.test(rawSuffix)) return 'FULL'

  // Legacy long/short sting names
  if (/^LONGSTING$/i.test(rawSuffix)) return 'STING'
  if (/^SHORTSTING$/i.test(rawSuffix)) return 'STINGa'

  // NO DNB / NoDNB (preserve mixed case)
  if (/^NO\s*DNB$/i.test(rawSuffix)) return 'NoDNB'

  // DRUMS / DRUMSONLY / DRUMS_ONLY
  if (/^DRUMS$/i.test(rawSuffix)) return 'DRUMS'
  if (/^DRUMS\s*ONLY$/i.test(rawSuffix) || /^DRUMSONLY$/i.test(rawSuffix)) return 'DRUMS'

  // NO DRUMS / NoDrums (preserve mixed case)
  if (/^NO\s*DRUMS?$/i.test(rawSuffix)) return 'NoDrums'

  // NO LEAD / NoLead (preserve mixed case)
  if (/^NO\s*LEAD$/i.test(rawSuffix)) return 'NoLead'

  // NO VOX / NoVox / NOVOX (preserve mixed case)
  if (/^NO\s*VOX$/i.test(rawSuffix)) return 'NoVox'

  // PIANO
  if (/^PIANO$/i.test(rawSuffix)) return 'PIANO'

  // GUITAR / GUITARS
  if (/^GUITARS?$/i.test(rawSuffix)) return 'GUITARS'

  // DNB (all caps)
  if (/^DNB$/i.test(rawSuffix)) return 'DNB'

  // BUMPER variants
  // BUMPER {n} → BUMPER, BUMPERa, BUMPERb (1=base, 2=a, 3=b, …)
  const bumperNum = rawSuffix.match(/^BUMPER\s+(\d+)$/i)
  if (bumperNum) {
    const n = parseInt(bumperNum[1])
    return 'BUMPER' + (n <= 1 ? '' : String.fromCharCode(96 + n - 1))
  }
  // BUMPERa, BUMPERb, etc. (single letter only)
  const bumperLtr = rawSuffix.match(/^BUMPER([a-z]+)$/i)
  if (bumperLtr) {
    return 'BUMPER' + (bumperLtr[1].length === 1 ? bumperLtr[1].toLowerCase() : '')
  }
  // Plain BUMPER
  if (/^BUMPER$/i.test(rawSuffix)) return 'BUMPER'

  // STING variants (same rules as BUMPER)
  const stingNum = rawSuffix.match(/^STING\s+(\d+)$/i)
  if (stingNum) {
    const n = parseInt(stingNum[1])
    return 'STING' + (n <= 1 ? '' : String.fromCharCode(96 + n - 1))
  }
  const stingLtr = rawSuffix.match(/^STING([a-z0-9]+)$/i)
  if (stingLtr) {
    return 'STING' + (stingLtr[1].length === 1 ? stingLtr[1].toLowerCase() : '')
  }
  if (/^STING$/i.test(rawSuffix)) return 'STING'

  // ALT variants (same rules as BUMPER/STING)
  const altNum = rawSuffix.match(/^ALT\s+(\d+)$/i)
  if (altNum) {
    const n = parseInt(altNum[1])
    return 'ALT' + (n <= 1 ? '' : String.fromCharCode(96 + n - 1))
  }
  const altLtr = rawSuffix.match(/^ALT([a-z]+)$/i)
  if (altLtr) {
    return 'ALT' + (altLtr[1].length === 1 ? altLtr[1].toLowerCase() : '')
  }
  if (/^ALT$/i.test(rawSuffix)) return 'ALT'

  // If raw suffix is a composer ID (R13a, S33a) or musical key (D, Gm, Fm) → no version → FULL
  const KEY_RE = /^([A-Ga-g](?:sharp|flat|##?|bb?)?m?)$/i
  const COMP_RE = /^[A-Z]\d{2,3}[a-z]$/i
  if (KEY_RE.test(rawSuffix) || COMP_RE.test(rawSuffix)) return 'FULL'

  // Anything else unrecognized → ALT
  return 'ALT'
}

/**
 * Convert title to CamelCase per HAUS spec
 * Strip punctuation, capitalize each word, no spaces
 */
function titleToCamelCase(title) {
  return title
    .replace(/[^a-zA-Z0-9 _]/g, '') // Remove all punctuation except spaces and underscores
    .split(/[\s_]+/) // Split on spaces/underscores
    .filter(Boolean) // Remove empty segments
    // Capitalize each word. Only flatten the rest of the word when it is entirely
    // uppercase ("DARK" -> "Dark"); mixed-case words keep their shape so name
    // prefixes survive ("McDonald" -> McDonald, not Mcdonald).
    .map(w => w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

/**
 * Build HAUS filename with proper format
 * Format: HAUS_{TitleCamelCase}_{Key}_{ComposerID}_{VERSION}.ext
 */
function buildHausName(filename, title, composerId, key, isJup = false) {
  const ext = filename.split('.').pop().toLowerCase()
  const version = detectVersion(filename)
  const titleCamel = titleToCamelCase(title)
  const prefix = isJup ? 'HAUSJUP' : 'HAUS'

  return `${prefix}_${titleCamel}_${key}_${composerId}_${version}.${ext}`
}

/**
 * Deduplicate HAUS filenames within a batch
 * If two files produce the same VERSION (e.g., two STING files),
 * assign letter suffixes: STING, STINGa, STINGb, etc.
 */
function deduplicateHausNames(nameMap) {
  // Parse a HAUS filename into { prefix, version, ext }
  const parseName = name => {
    const ext = name.match(/\.[^.]+$/)?.[0] || ''
    const noExt = name.slice(0, name.length - ext.length)
    const lastUs = noExt.lastIndexOf('_')
    const version = lastUs >= 0 ? noExt.slice(lastUs + 1) : noExt
    const prefix = lastUs >= 0 ? noExt.slice(0, lastUs + 1) : ''
    return { prefix, version, ext }
  }

  // Strip trailing single-letter variant only for BUMPER/STING/ALT
  // e.g., BUMPERa → BUMPER, STINGb → STING, ALTa → ALT
  const versionBase = v => v.replace(/^(BUMPER|STING|ALT)[a-z]$/i, (_, b) => b)

  // Group by (prefix + versionBase + ext)
  const groups = {}
  for (const item of nameMap) {
    const { prefix, version, ext } = parseName(item.name)
    const vb = versionBase(version)
    const key = prefix + vb + ext
    if (!groups[key]) groups[key] = []
    groups[key].push({ item, version, vb })
  }

  const result = nameMap.map(item => ({ ...item }))

  // Process each group
  for (const group of Object.values(groups)) {
    if (group.length <= 1) continue

    // Sort: base version first (no trailing letter), then letter variants
    group.sort((a, b) => {
      const aBase = a.version === a.vb
      const bBase = b.version === b.vb
      if (aBase && !bBase) return -1
      if (!aBase && bBase) return 1
      return a.version.localeCompare(b.version)
    })

    const { prefix, ext } = parseName(group[0].item.name)
    for (let k = 0; k < group.length; k++) {
      const letter = k === 0 ? '' : String.fromCharCode(96 + k) // '', 'a', 'b', ...
      const newName = prefix + group[k].vb + letter + ext
      const idx = result.findIndex(r => r.orig === group[k].item.orig)
      if (idx >= 0) result[idx].name = newName
    }
  }

  return result
}

/**
 * Validate and parse filename components
 * Returns { title, key, composerId, version, ext, isValid, errors }
 */
function parseFilename(filename) {
  const ext = filename.split('.').pop()
  const base = filename.replace(/\.[^.]+$/, '')
  const parts = base.split('_')

  const result = {
    title: null,
    key: null,
    composerId: null,
    version: null,
    ext,
    isValid: false,
    errors: []
  }

  // Try to extract components
  if (parts.length >= 2) {
    // Look for composerId (pattern: letter + 2-3 digits + letter, e.g., R13a, S33a)
    const compIdx = parts.findIndex(p => /^[A-Z]\d{2,3}[a-z]$/i.test(p))
    if (compIdx >= 0) {
      result.composerId = parts[compIdx]
    }

    // Version is always the last part (before extension)
    result.version = detectVersion(filename)

    // Everything else is title or key
    if (compIdx >= 0) {
      result.title = parts.slice(0, compIdx).join(' ')
      // Key might be between title and composerId, or we need to infer it
      if (parts.length > compIdx + 1) {
        const potentialKey = parts[compIdx + 1]
        if (/^[A-Ga-g](?:sharp|flat|##?|bb?)?m?$/i.test(potentialKey)) {
          result.key = potentialKey
        }
      }
    } else {
      result.title = parts.slice(0, -1).join(' ')
    }
  }

  // Validate
  if (!result.title) result.errors.push('Title is missing')
  if (!result.key) result.errors.push('Key is missing')
  if (!result.composerId) result.errors.push('ComposerID is missing')
  if (!result.ext) result.errors.push('Extension is missing')

  result.isValid = result.errors.length === 0

  return result
}

// Export for use in both app and Node environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectVersion,
    titleToCamelCase,
    buildHausName,
    deduplicateHausNames,
    parseFilename
  }
}
