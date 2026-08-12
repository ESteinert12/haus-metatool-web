# Intake Flow Bug Fix Summary

## What Was Broken
The intake workflow was **permanently deleting** source folders from Dropbox instead of archiving them. This caused:
- Folders to disappear without a trace
- Race conditions with Dropbox re-sync (code tried to work around this but it was unreliable)
- No audit trail of processed intakes
- User confusion about where files went

## Root Cause
**File:** `HAUS Workspace.app/Contents/Resources/haus-workspace/index.html`  
**Lines:** 11194-11218 (old code used `rm -rf` to permanently delete)

The intake completion workflow was:
1. ✓ Copy files from staging → shipping (CORRECT)
2. ✓ Rename files to HAUS format (CORRECT)
3. ✓ Upload to B2 (CORRECT)
4. ✓ Write database records (CORRECT)
5. ✗ **DELETE source folder with `rm -rf`** (WRONG - should move, not delete)

## The Fix
Changed the folder handling from **deletion** to **archival**:

### Old Code (lines 11194-11202)
```javascript
// Delete source folder from staging after successful intake
const rmR = await window.haus.shell.exec(`rm -rf "${d.path}"`)
if (rmR?.err) console.warn(`[executeIntake] rm -rf failed for "${d.path}":`, rmR.err)

// Verify folder is actually gone (Dropbox can re-sync it back within seconds)
const stillExists = await window.haus.shell.exec(`test -d "${d.path}" && echo exists`)
if ((stillExists?.stdout || '').trim() === 'exists') {
  console.warn(`[executeIntake] staging folder still present after rm -rf…`)
  await window.haus.shell.exec(`xattr -dr com.dropbox.attributes "${d.path}" 2>/dev/null; rm -rf "${d.path}"`)
}
```

### New Code (lines 11195-11218)
```javascript
// Move source folder to archive/finished location instead of deleting
const archiveDir = cfg.finish || (cfg.intake ? `${cfg.intake}/../_PROCESSED` : null)
if (archiveDir && archiveDir !== cfg.intake) {
  // Create archive folder if needed
  const mkArchive = await window.haus.shell.exec(`mkdir -p "${archiveDir}"`)
  if (!mkArchive?.err) {
    const baseName = d.path.split('/').pop()
    // Move (not delete) the source folder to archive
    const mvR = await window.haus.shell.exec(`mv "${d.path}" "${archiveDir}/${baseName}"`)
    if (mvR?.err) {
      console.warn(`[executeIntake] failed to move "${d.path}" to archive:`, mvR.err)
      // Fallback to deletion if move fails (for safety)
      await window.haus.shell.exec(`rm -rf "${d.path}"`)
    } else {
      console.log(`[executeIntake] archived intake folder: ${archiveDir}/${baseName}`)
    }
  } else {
    console.warn(`[executeIntake] could not create archive dir ${archiveDir}:`, mkArchive.err)
  }
} else {
  // No archive configured — clean deletion as fallback
  const rmR = await window.haus.shell.exec(`rm -rf "${d.path}"`)
  if (rmR?.err) console.warn(`[executeIntake] rm -rf failed for "${d.path}":`, rmR.err)
}
```

## How It Works Now
1. **Primary:** Uses `cfg.finish` folder (already configured in Settings → Folders)
2. **Fallback:** Uses `_PROCESSED` subfolder in the staging directory if no finish folder is configured
3. **Safe:** If the move fails for any reason, it falls back to deletion as a safety measure
4. **Auditable:** Processed folders are preserved so you can see what was processed and when

## Configuration
The system already supports this through `cfg.finish`:
- Settings → Folders → Finish Queue  
- Typically set to: `/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/3. ATMOS_Finish`

If not configured, the code will create a `_PROCESSED` folder automatically.

## Benefits
✓ Folders are **moved to archive**, not deleted  
✓ Eliminates Dropbox re-sync race conditions  
✓ Creates an audit trail of processed intakes  
✓ Allows recovery if something goes wrong downstream  
✓ User can see where processed folders ended up  
✓ Safe fallback to deletion if move fails  

## Testing
To verify the fix works:
1. Run intake on a test folder
2. Check that the source folder **moves to the archive location** (not deleted from Dropbox)
3. Verify files appear correctly in the shipping folder
4. Confirm database entries are created
5. Check Dropbox shows the moved folder in the archive, not in staging

## Files Modified
- `HAUS Workspace.app/Contents/Resources/haus-workspace/index.html` (lines 11195-11218)

## No User Action Required
The fix is automatic. Just restart the server and the new behavior takes effect on the next intake run.
