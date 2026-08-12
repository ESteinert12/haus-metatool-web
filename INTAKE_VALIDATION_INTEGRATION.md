# Intake Validation Integration Guide

## Overview
Two new modules for the intake flow:
- `intake-validation.js` — Validates metadata before processing
- `intake-error-handler.js` — Quarantines bad intakes and generates reports

## What Gets Validated

### Required Fields
- `title` — Song title
- `composer` — Composer name
- `sku` — SKU (e.g., C53a, R48a)
- `key` — Musical key (C, Am, Db, etc.)
- `collection` — STRATUS/CUMULUS/CIRRUS/NIMBUS
- `genres` — Comma-separated genres (e.g., "Electronic, Dance, House")
- `moods` — Comma-separated moods (e.g., "Energetic, Dark, Uplifting")
- `tempo` — Tempo in BPM or tempo name (e.g., "120 BPM" or "Fast")
- `ksls` — KSLS identifier (alphanumeric, e.g., "KSL001")
- `lot` — Lot number/identifier (alphanumeric, e.g., "LOT-2026-08")
- `release_date` — Release date (YYYY-MM-DD, MM/DD/YYYY, or year only)
- `lot` — Lot identifier (alphanumeric, e.g., "LOT-001")
- `releaseDate` — Release date (YYYY-MM-DD or MM/DD/YYYY, e.g., "2026-08-12")

### Format Checks
- **SKU format:** Must match `[A-Z]{1,3}\d{1,2}[a-z]` (e.g., C53a, R48a, S33b)
- **Key validation:** Checks against valid music keys or key-like patterns
- **Collection:** Only STRATUS, CUMULUS, CIRRUS, NIMBUS allowed
- **Title characters:** Warns on unusual punctuation or special characters
- **Duplicate detection:** Checks if SKU already exists in database

## Error Handling

### Valid Intake
```
✓ Ready to intake: "My Song Title" (C53a4864)
```

### Invalid Intake (Example)
```
✗ Cannot intake
  Error 1: Invalid SKU format: "C53" (expected C53a)
  Error 2: Missing required field: key
  Warning: Unusual key: "TEX" (check if correct)
```

### What Happens
1. Validation runs **before** any file copying
2. If errors found → folder moved to `_INVALID` with error report
3. User sees clear error message
4. User can fix .md file and move folder back to intake
5. If valid → proceeds with normal intake (copy → rename → upload)

## Integration into Existing Intake

### 1. Add to Intake Start (before processing)
```javascript
// At start of executeIntake() or intake button handler

const IntakeValidator = require('./intake-validation.js')
const IntakeErrorHandler = require('./intake-error-handler.js')

const validator = new IntakeValidator(db, config)
const errorHandler = new IntakeErrorHandler(config)

// For each folder being processed:
const mdContent = await fs.readFile(mdPath, 'utf-8')
const validationResult = await validator.validateFolder(folderPath, mdContent)

if (!validationResult.valid) {
  // Quarantine the folder
  await errorHandler.quarantineFolder(folderPath, validationResult)
  
  // Show user the error
  const summary = errorHandler.generatePreIntakeSummary(validationResult)
  console.error(`[intake] ${summary.title}`)
  summary.errors.forEach(err => console.error(`  - ${err}`))
  
  // Skip this folder and continue with next
  continue
}

// If valid, proceed with normal intake flow
```

### 2. Update Intake Completion
```javascript
// After successful intake, move to _PROCESSED (already done in current code)
// But now bad intakes go to _INVALID instead of _PROCESSED
```

### 3. Add UI Feedback
Show validation results before committing:
```javascript
const summary = errorHandler.generatePreIntakeSummary(validationResult)
if (summary.canProceed) {
  console.log(`✓ ${summary.message}`)
  if (summary.warnings.length > 0) {
    console.warn(`⚠ ${summary.warnings.join(', ')}`)
    // Ask user to confirm with warnings
  }
  // Proceed with intake
} else {
  console.error(`✗ ${summary.title}`)
  summary.errors.forEach(err => console.error(`  - ${err}`))
  // Don't proceed
}
```

## Folder Structure After Integration

```
2. COLLECTION UPLOADER/
├── 2. ATMOS_Shipping/     (destination for valid intakes)
├── 2. ATMOS_Staging/      (source, deleted after valid intake)
├── 3. ATMOS_Finish/       (archive of processed intakes)
├── _INVALID/              (NEW - invalid intakes stay here)
│   ├── BadFolder1/
│   │   ├── file.md
│   │   ├── audio.wav
│   │   └── ERROR_REPORT.txt
│   └── BadFolder2/
├── _INTAKE_LOGS/          (NEW - structured logs of all intakes)
│   ├── BadFolder1_2026-08-12T11-04.json
│   └── BadFolder2_2026-08-12T11-05.json
```

## Error Report Example

When an intake fails, a file `ERROR_REPORT.txt` is created in the quarantined folder:

```
======================================================================
INTAKE VALIDATION FAILED
======================================================================

Reason: VALIDATION_FAILED
Time: 2026-08-12T11:04:45Z

ERRORS (must fix before intake):
----------------------------------------------------------------------
  1. Invalid SKU format: "C53" (expected format: C53a, R48a, S33b, etc.)
  2. Missing required field: key

WARNINGS (review carefully):
----------------------------------------------------------------------
  1. Unusual key: "TEX" (check if correct)

METADATA EXTRACTED:
----------------------------------------------------------------------
  title: My Song
  composer: Someone
  sku: C53
  key: (empty)
  collection: NIMBUS

ACTION REQUIRED:
----------------------------------------------------------------------
1. Review the errors above
2. Fix the .md file metadata
3. Move folder back to INTAKE folder
4. Run intake again

This folder is in _INVALID to prevent bad data from entering the database.
```

## Benefits

✓ **Prevents bad data** — Catches issues before they hit the database  
✓ **Clear feedback** — Users see exactly what's wrong  
✓ **Audit trail** — _INVALID and _INTAKE_LOGS show what failed and why  
✓ **Easy recovery** — Users can fix and retry without manual intervention  
✓ **Zero false positives** — Only real errors block intakes (warnings allow proceed)  
✓ **Easy to extend** — Add more validation rules as needed  

## Testing

```javascript
// Test valid intake
const valid = await validator.validateFolder(path, validMdContent)
console.log(valid.valid) // Should be true

// Test invalid SKU
const invalidSKU = await validator.validateFolder(path, mdWithBadSKU)
console.log(invalidSKU.errors) // Should show SKU error

// Test quarantine
await errorHandler.quarantineFolder(badFolder, invalidSKU)
// Should create _INVALID/badFolder/ERROR_REPORT.txt
```

## Configuration

Both modules accept `config` object:

```javascript
const config = {
  // For validator
  // (no special config, uses defaults)

  // For error handler
  invalidFolder: '/path/to/_INVALID',
  archiveFolder: '/path/to/_PROCESSED',
  logFolder: '/path/to/_INTAKE_LOGS'
}
```

## Migration

1. Copy `intake-validation.js` and `intake-error-handler.js` to your app
2. Import them at top of your intake code
3. Call validator before processing each folder
4. If invalid, call errorHandler.quarantineFolder()
5. Update UI to show validation results
6. Test with a folder that has a bad SKU or missing field

No breaking changes — this is additive validation before existing intake flow.

## Example: Valid .md File

```markdown
# Cowboy Intuition

SKU: C53a4864
Composer: James Sheehan
Key: Am
Collection: NIMBUS
Genres: Country, Americana, Western
Moods: Adventurous, Contemplative, Determined
Tempo: 120 BPM
KSLS: KSL-C53-001
Lot: LOT-2026-08-001
Release Date: 2026-08-12

This is a classic country tune with strong melodic elements.
```

## Example: Invalid .md File (Will Be Quarantined)

```markdown
# My Song

Composer: Someone
Collection: NIMBUS

(Missing: SKU, Key, Genres, Moods, Tempo, KSLS, Lot, Release Date)
```

This would generate:
```
ERRORS:
  1. Missing required field: sku
  2. Missing required field: key
  3. Missing required field: genres
  4. Missing required field: moods
  5. Missing required field: tempo
  6. Missing required field: ksls
  7. Missing required field: lot
  8. Missing required field: releaseDate
```
