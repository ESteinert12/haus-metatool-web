/**
 * Intake Error Handler
 * Manages invalid/rejected intakes and generates error reports
 *
 * Usage:
 *   const handler = new IntakeErrorHandler(config)
 *   await handler.quarantineFolder(folderPath, validationResult)
 *   const report = handler.generateReport(validationResult)
 */

const fs = require('fs').promises
const path = require('path')

class IntakeErrorHandler {
  constructor(config = {}) {
    // Fallback: if neither invalidFolder nor intakeFolder provided, use temp directory
    const baseDir = config.invalidFolder
      ? path.dirname(config.invalidFolder)
      : (config.intakeFolder ? path.dirname(config.intakeFolder) : path.dirname(config.shipping || '/tmp'))

    this.config = {
      invalidFolder: config.invalidFolder || path.join(baseDir, '_INVALID'),
      archiveFolder: config.archiveFolder || path.join(baseDir, '_PROCESSED'),
      logFolder: config.logFolder || path.join(baseDir, '_INTAKE_LOGS')
    }
  }

  /**
   * Move failed intake to _INVALID folder with error report
   */
  async quarantineFolder(folderPath, validationResult) {
    try {
      const folderName = path.basename(folderPath)
      const quarantineDir = path.join(this.config.invalidFolder, folderName)

      // Create _INVALID folder if needed
      await fs.mkdir(this.config.invalidFolder, { recursive: true })
      await fs.mkdir(quarantineDir, { recursive: true })

      // Copy entire folder to quarantine
      await this.copyFolder(folderPath, quarantineDir)

      // Write error report to folder
      const report = this.generateReport(validationResult)
      const reportPath = path.join(quarantineDir, 'ERROR_REPORT.txt')
      await fs.writeFile(reportPath, report)

      // Also write to log folder
      await this.writeLog(folderName, report, validationResult)

      return {
        success: true,
        quarantineDir,
        reportPath
      }
    } catch (error) {
      console.error('[quarantineFolder] Error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Copy folder recursively
   */
  async copyFolder(src, dest) {
    try {
      await fs.mkdir(dest, { recursive: true })
      const entries = await fs.readdir(src, { withFileTypes: true })

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        if (entry.isDirectory()) {
          await this.copyFolder(srcPath, destPath)
        } else {
          await fs.copyFile(srcPath, destPath)
        }
      }
    } catch (error) {
      console.error('[copyFolder] Error:', error)
      throw error
    }
  }

  /**
   * Generate human-readable error report
   */
  generateReport(validationResult) {
    const lines = [
      '='.repeat(70),
      'INTAKE VALIDATION FAILED',
      '='.repeat(70),
      '',
      `Reason: ${validationResult.reason}`,
      `Time: ${new Date().toISOString()}`,
      ''
    ]

    if (validationResult.errors && validationResult.errors.length > 0) {
      lines.push('ERRORS (must fix before intake):')
      lines.push('-'.repeat(70))
      validationResult.errors.forEach((err, i) => {
        lines.push(`  ${i + 1}. ${err}`)
      })
      lines.push('')
    }

    if (validationResult.warnings && validationResult.warnings.length > 0) {
      lines.push('WARNINGS (review carefully):')
      lines.push('-'.repeat(70))
      validationResult.warnings.forEach((warn, i) => {
        lines.push(`  ${i + 1}. ${warn}`)
      })
      lines.push('')
    }

    if (validationResult.metadata) {
      lines.push('METADATA EXTRACTED:')
      lines.push('-'.repeat(70))
      Object.entries(validationResult.metadata).forEach(([key, value]) => {
        if (key !== 'expectedFilename') {
          lines.push(`  ${key}: ${value || '(empty)'}`)
        }
      })
      lines.push('')
    }

    lines.push('ACTION REQUIRED:')
    lines.push('-'.repeat(70))
    lines.push('1. Review the errors above')
    lines.push('2. Fix the .md file metadata')
    lines.push('3. Move folder back to INTAKE folder')
    lines.push('4. Run intake again')
    lines.push('')
    lines.push('This folder is in _INVALID to prevent bad data from entering the database.')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Write structured log entry
   */
  async writeLog(folderName, report, validationResult) {
    try {
      await fs.mkdir(this.config.logFolder, { recursive: true })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const logFile = path.join(this.config.logFolder, `${folderName}_${timestamp}.json`)

      const logEntry = {
        timestamp: new Date().toISOString(),
        folder: folderName,
        reason: validationResult.reason,
        errorCount: (validationResult.errors || []).length,
        warningCount: (validationResult.warnings || []).length,
        errors: validationResult.errors || [],
        warnings: validationResult.warnings || [],
        metadata: validationResult.metadata || null
      }

      await fs.writeFile(logFile, JSON.stringify(logEntry, null, 2))
    } catch (error) {
      console.error('[writeLog] Error:', error)
    }
  }

  /**
   * Generate pre-intake summary for user
   */
  generatePreIntakeSummary(validationResult) {
    if (validationResult.valid) {
      return {
        canProceed: true,
        title: 'Ready to Intake',
        message: `✓ ${validationResult.metadata.title}`,
        sku: validationResult.metadata.sku,
        warnings: validationResult.warnings,
        confirmText: validationResult.warnings.length > 0
          ? `${validationResult.warnings.length} warning(s) - review before proceeding`
          : 'All checks passed'
      }
    }

    return {
      canProceed: false,
      title: 'Cannot Intake - Fix These Errors',
      message: 'The metadata in your .md file has problems:',
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      action: 'Your folder has been moved to _INVALID. Edit the .md file and try again.'
    }
  }

  /**
   * List all quarantined (invalid) intakes
   */
  async listQuarantined() {
    try {
      const entries = await fs.readdir(this.config.invalidFolder, { withFileTypes: true })
      const folders = entries.filter(e => e.isDirectory()).map(e => e.name)

      return {
        count: folders.length,
        folders,
        location: this.config.invalidFolder
      }
    } catch (error) {
      console.error('[listQuarantined] Error:', error)
      return {
        count: 0,
        folders: [],
        error: error.message
      }
    }
  }

  /**
   * Get details of a quarantined intake
   */
  async getQuarantineDetails(folderName) {
    try {
      const folderPath = path.join(this.config.invalidFolder, folderName)
      const reportPath = path.join(folderPath, 'ERROR_REPORT.txt')

      const report = await fs.readFile(reportPath, 'utf-8')

      return {
        folder: folderName,
        path: folderPath,
        report
      }
    } catch (error) {
      console.error('[getQuarantineDetails] Error:', error)
      return {
        error: error.message
      }
    }
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntakeErrorHandler
}
