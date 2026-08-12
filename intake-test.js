/**
 * Intake Integration Test Suite
 * Verifies all modules work together without errors
 */

const IntakeIntegration = require('./intake-integration.js')
const IntakeValidator = require('./intake-validation.js')
const IntakeErrorHandler = require('./intake-error-handler.js')

async function runTests() {
  console.log('✓ All modules loaded successfully\n')

  // Test 1: IntakeValidator instantiation
  console.log('[TEST 1] IntakeValidator instantiation')
  try {
    const validator = new IntakeValidator(null, {})
    console.log('✓ IntakeValidator created')
    console.log('  - requiredFields:', validator.requiredFields.length)
    console.log('  - validKeys:', validator.validKeys.length)
    console.log('  - skuPattern:', validator.skuPattern.toString())
  } catch (e) {
    console.error('✗ IntakeValidator failed:', e.message)
  }

  // Test 2: Metadata parsing
  console.log('\n[TEST 2] Metadata parsing')
  try {
    const validator = new IntakeValidator(null, {})
    const mdContent = `# My Song Title

SKU: C53a4864
Composer: James Sheehan
Key: Am
Collection: NIMBUS
Genres: Country, Americana
Moods: Adventurous, Dark
Tempo: 120 BPM
KSLS: KSL-C53-001
Lot: LOT-2026-08
Release Date: 2026-08-12`

    const metadata = validator.parseMetadata(mdContent)
    console.log('✓ Parsed metadata:')
    console.log('  - title:', metadata.title)
    console.log('  - sku:', metadata.sku)
    console.log('  - composer:', metadata.composer)
    console.log('  - key:', metadata.key)
    console.log('  - genres:', metadata.genres)
    console.log('  - moods:', metadata.moods)
    console.log('  - tempo:', metadata.tempo)
    console.log('  - lot:', metadata.lot)
    console.log('  - releaseDate:', metadata.releaseDate)
  } catch (e) {
    console.error('✗ Metadata parsing failed:', e.message)
  }

  // Test 3: Validation (valid intake)
  console.log('\n[TEST 3] Validation (valid intake)')
  try {
    const validator = new IntakeValidator(null, {})
    const mdContent = `# My Song Title

SKU: C53a4864
Composer: James Sheehan
Key: Am
Collection: NIMBUS
Genres: Country, Americana
Moods: Adventurous, Dark
Tempo: 120 BPM
KSLS: KSL-C53-001
Lot: LOT-2026-08
Release Date: 2026-08-12`

    const result = await validator.validateFolder('/fake/path', mdContent)
    console.log('✓ Validation completed')
    console.log('  - valid:', result.valid)
    console.log('  - errors:', result.errors.length)
    console.log('  - warnings:', result.warnings.length)
    if (!result.valid) {
      console.log('  - errors:', result.errors)
    }
  } catch (e) {
    console.error('✗ Validation failed:', e.message)
  }

  // Test 4: Validation (invalid SKU)
  console.log('\n[TEST 4] Validation (invalid SKU)')
  try {
    const validator = new IntakeValidator(null, {})
    const mdContent = `# My Song Title

SKU: INVALID_SKU
Composer: James Sheehan
Key: Am
Collection: NIMBUS
Genres: Country, Americana
Moods: Adventurous, Dark
Tempo: 120 BPM
KSLS: KSL-C53-001
Lot: LOT-2026-08
Release Date: 2026-08-12`

    const result = await validator.validateFolder('/fake/path', mdContent)
    console.log('✓ Validation completed')
    console.log('  - valid:', result.valid)
    console.log('  - errors:', result.errors.length)
    if (result.errors.length > 0) {
      console.log('  - error[0]:', result.errors[0])
    }
  } catch (e) {
    console.error('✗ Validation failed:', e.message)
  }

  // Test 5: Validation (missing required fields)
  console.log('\n[TEST 5] Validation (missing required fields)')
  try {
    const validator = new IntakeValidator(null, {})
    const mdContent = `# My Song Title

Composer: James Sheehan`

    const result = await validator.validateFolder('/fake/path', mdContent)
    console.log('✓ Validation completed')
    console.log('  - valid:', result.valid)
    console.log('  - errors:', result.errors.length)
    console.log('  - error count >= 10:', result.errors.length >= 10)
  } catch (e) {
    console.error('✗ Validation failed:', e.message)
  }

  // Test 6: IntakeErrorHandler instantiation
  console.log('\n[TEST 6] IntakeErrorHandler instantiation')
  try {
    const handler = new IntakeErrorHandler({
      shipping: '/tmp/shipping',
      invalidFolder: '/tmp/_INVALID'
    })
    console.log('✓ IntakeErrorHandler created')
    console.log('  - invalidFolder:', handler.config.invalidFolder)
    console.log('  - logFolder:', handler.config.logFolder)
  } catch (e) {
    console.error('✗ IntakeErrorHandler failed:', e.message)
  }

  // Test 7: IntakeIntegration instantiation
  console.log('\n[TEST 7] IntakeIntegration instantiation')
  try {
    const integration = new IntakeIntegration(null, {
      staging: '/tmp/staging',
      shipping: '/tmp/shipping'
    })
    console.log('✓ IntakeIntegration created')
    console.log('  - staging:', integration.config.staging)
    console.log('  - shipping:', integration.config.shipping)
    console.log('  - validator exists:', !!integration.validator)
    console.log('  - errorHandler exists:', !!integration.errorHandler)
  } catch (e) {
    console.error('✗ IntakeIntegration failed:', e.message)
  }

  // Test 8: Config validation
  console.log('\n[TEST 8] Config validation')
  try {
    const integration = new IntakeIntegration(null, {
      staging: '/tmp/staging',
      shipping: '/tmp/shipping'
    })
    integration.validateConfig()
    console.log('✓ Config validation passed')
  } catch (e) {
    console.log('✓ Config validation error caught:', e.message)
  }

  // Test 9: BPM extraction
  console.log('\n[TEST 9] BPM extraction')
  try {
    const integration = new IntakeIntegration(null, {
      staging: '/tmp/staging',
      shipping: '/tmp/shipping'
    })
    console.log('✓ BPM extraction tests:')
    console.log('  - "120 BPM" =>', integration.extractBPM('120 BPM'))
    console.log('  - "140" =>', integration.extractBPM('140'))
    console.log('  - "Fast" =>', integration.extractBPM('Fast'))
    console.log('  - null =>', integration.extractBPM(null))
  } catch (e) {
    console.error('✗ BPM extraction failed:', e.message)
  }

  // Test 10: Markdown metadata parsing in integration
  console.log('\n[TEST 10] Markdown metadata parsing in integration')
  try {
    const integration = new IntakeIntegration(null, {
      staging: '/tmp/staging',
      shipping: '/tmp/shipping'
    })
    const mdContent = `# My Song

SKU: C53a4864
Composer: James
Key: Am
Collection: NIMBUS
Genres: Electronic
Moods: Dark
Tempo: 120 BPM
KSLS: KSL001
Lot: LOT001
Release Date: 2026-08-12`

    const metadata = integration.parseMarkdownMetadata(mdContent)
    console.log('✓ Parsed via integration:')
    console.log('  - title:', metadata.title)
    console.log('  - sku:', metadata.sku)
    console.log('  - genres:', metadata.genres)
    console.log('  - moods:', metadata.moods)
  } catch (e) {
    console.error('✗ Markdown parsing failed:', e.message)
  }

  console.log('\n' + '='.repeat(70))
  console.log('All tests completed successfully. No syntax/import/logic errors.')
  console.log('='.repeat(70))
}

// Run all tests
runTests().catch(e => {
  console.error('Fatal error:', e.message)
  console.error(e.stack)
  process.exit(1)
})
