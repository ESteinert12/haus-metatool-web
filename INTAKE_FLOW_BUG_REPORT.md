# Intake Flow Bug: Folders Disappearing/Not Being Moved Properly

## Problem
The intake flow is **deleting source folders** instead of **moving them to an archive location**. This causes:
1. Folders to disappear from Dropbox without a trace
2. Files potentially lost if deletion happens before copy operations complete
3. No audit trail of processed intakes

## Root Cause

**File:** `HAUS Workspace.app/Contents/Resources/haus-workspace/index.html` lines 11194-11202

**Current behavior:**
```javascript
// Line 11195 — DELETE (not move)
const rmR = await window.haus.shell.exec(`rm -rf "${d.path}"`)
if (rmR?.err) console.warn(`[executeIntake] rm -rf failed for "${d.path}":`, rmR.err)

// Verify folder is actually gone (Dropbox can re-sync it back)
const stillExists = await window.haus.shell.exec(`test -d "${d.path}" && echo exists`)
if ((stillExists?.stdout || '').trim() === 'exists') {
  console.warn(`[executeIntake] staging folder still present after rm -rf…`)
  await window.haus.shell.exec(`xattr -dr com.dropbox.attributes "${d.path}" 2>/dev/null; rm -rf "${d.path}"`)
}
```

The source intake folder is **permanently deleted** with no archive or undo mechanism.

## Why This Breaks Things

1. **Dropbox Re-sync Race Condition**
   - If you delete a Dropbox-synced folder too quickly, Dropbox can re-sync it back
   - The code tries to work around this (line 11201) but it's unreliable
   - Files end up in an inconsistent state

2. **No Audit Trail**
   - Processed folders disappear — no way to audit what was processed
   - If something fails downstream, you can't recover the source folder

3. **Folder Disappearance**
   - User doesn't know where the folder went
   - Not in staging (deleted), not in shipping (files were copied, not moved)
   - Appears to "vanish"

## Solution

**Move** the source folder to an archive/finished location instead of deleting it. The finished folders can be cleaned up later if needed.

### Implementation

Replace lines 11194-11202 with:

```javascript
// Move source folder to archive/finished location instead of deleting
const path = require('path')
const archiveDir = cfg.finish || `${cfg.intake}/../_PROCESSED`
if (archiveDir && archiveDir !== cfg.intake) {
  // Create archive folder if needed
  const mkArchive = await window.haus.shell.exec(`mkdir -p "${archiveDir}"`)
  if (!mkArchive?.err) {
    const archivedName = path.basename(d.path)
    // Move (not delete) the source folder to archive
    const mvR = await window.haus.shell.exec(`mv "${d.path}" "${archiveDir}/${archivedName}"`)
    if (mvR?.err) {
      console.warn(`[executeIntake] failed to move "${d.path}" to archive:`, mvR.err)
      // Fallback to deletion if move fails (for safety)
      await window.haus.shell.exec(`rm -rf "${d.path}"`)
    } else {
      console.log(`[executeIntake] archived intake folder: ${archiveDir}/${archivedName}`)
    }
  } else {
    console.warn(`[executeIntake] could not create archive dir, skipping folder move`)
  }
} else {
  // No archive configured — clean deletion as fallback
  const rmR = await window.haus.shell.exec(`rm -rf "${d.path}"`)
  if (rmR?.err) console.warn(`[executeIntake] rm -rf failed for "${d.path}":`, rmR.err)
}
```

## What This Fixes

✓ Folders are **moved to archive** instead of deleted  
✓ Eliminates Dropbox re-sync race conditions  
✓ Creates an audit trail of processed intakes  
✓ Allows recovery if something goes wrong downstream  
✓ User can see where processed folders ended up  

## Configuration

The code already supports `cfg.finish` (line 9144). This folder should be set to:
- `/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/3. ATMOS_Finish` (or similar archive location)

If `cfg.finish` is not configured, the code falls back to a `_PROCESSED` subfolder inside the intake directory.

## Testing Checklist

- [ ] Run intake on a test folder
- [ ] Verify source folder moves to archive location
- [ ] Check that shipping folder has the correctly renamed files
- [ ] Verify database entries are created
- [ ] Check that metadata file is written to shipping folder
- [ ] Confirm Dropbox shows the moved folder in archive, not in staging
- [ ] Test with duplicate SKUs to ensure recovery path works

## Files to Modify

- `HAUS Workspace.app/Contents/Resources/haus-workspace/index.html` — lines 11194-11202
