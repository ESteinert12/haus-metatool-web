# Intake Flow: Before & After

## THE PROBLEM
Folders were disappearing from Dropbox staging and not showing up anywhere.

---

## OLD FLOW (BROKEN)

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGING (Dropbox/1. ATMOS_Staging)                             │
│                                                                   │
│  R13a_SongTitle_Cm/  ← User drops folder here                   │
│  ├─ file_FULL.wav                                               │
│  ├─ file_STING.wav                                              │
│  └─ file_ALT.wav                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1. Copy files
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ SHIPPING (Dropbox/2. ATMOS_Shipping)                           │
│                                                                   │
│  MyLot/                                                         │
│  ├─ R13a0001_SongTitle_R/                                       │
│  │  ├─ HAUS_SongTitle_Cm_R13a_FULL.wav  ✓ Copied              │
│  │  ├─ HAUS_SongTitle_Cm_R13a_STING.wav ✓ Copied              │
│  │  ├─ HAUS_SongTitle_Cm_R13a_ALT.wav   ✓ Copied              │
│  │  └─ HAUS_SongTitle_Cm_R13a.md        ✓ Created             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 2. Update database
                              ├─ Add title record
                              ├─ Add mix_stems records
                              ├─ Update sku_sequences
                              │
                              │ 3. DELETE SOURCE ✗ WRONG!
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGING (Dropbox/1. ATMOS_Staging)                             │
│                                                                   │
│  R13a_SongTitle_Cm/  ← PERMANENTLY DELETED!                     │
│  (folder is gone — NOWHERE TO FIND IT!)                         │
│                                                                   │
│  PROBLEMS:                                                      │
│  • Folder vanishes without a trace                              │
│  • No audit trail of what was processed                         │
│  • Dropbox may re-sync it back (race condition)                │
│  • User doesn't know where it went                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## NEW FLOW (FIXED)

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGING (Dropbox/1. ATMOS_Staging)                             │
│                                                                   │
│  R13a_SongTitle_Cm/  ← User drops folder here                   │
│  ├─ file_FULL.wav                                               │
│  ├─ file_STING.wav                                              │
│  └─ file_ALT.wav                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1. Copy files
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ SHIPPING (Dropbox/2. ATMOS_Shipping)                           │
│                                                                   │
│  MyLot/                                                         │
│  ├─ R13a0001_SongTitle_R/                                       │
│  │  ├─ HAUS_SongTitle_Cm_R13a_FULL.wav  ✓ Copied              │
│  │  ├─ HAUS_SongTitle_Cm_R13a_STING.wav ✓ Copied              │
│  │  ├─ HAUS_SongTitle_Cm_R13a_ALT.wav   ✓ Copied              │
│  │  └─ HAUS_SongTitle_Cm_R13a.md        ✓ Created             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 2. Update database
                              ├─ Add title record
                              ├─ Add mix_stems records
                              ├─ Update sku_sequences
                              │
                              │ 3. MOVE SOURCE ✓ CORRECT!
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ ARCHIVE (Dropbox/3. ATMOS_Finish or _PROCESSED)               │
│                                                                   │
│  R13a_SongTitle_Cm/  ← Folder moved here                        │
│  ├─ file_FULL.wav                                               │
│  ├─ file_STING.wav                                              │
│  └─ file_ALT.wav                                                │
│                                                                   │
│ BENEFITS:                                                       │
│ ✓ Folder is preserved for audit trail                           │
│ ✓ You can see what was processed and when                       │
│ ✓ Can recover if something goes wrong                           │
│ ✓ No Dropbox re-sync race conditions                            │
│ ✓ Clear lifecycle: Staging → Shipping → Archive                │
└─────────────────────────────────────────────────────────────────┘
```

---

## In Plain English

**Before:** Files copied to shipping ✓ but source folder DELETED ✗  
→ Folders disappear with no trace

**After:** Files copied to shipping ✓ and source folder MOVED to archive ✓  
→ You can see where everything went, recover if needed, and keep an audit trail

---

## Configuration

Your system already has this configured:

```
Settings → Folders → Finish Queue
Currently set to: /Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/3. ATMOS_Finish
```

If not set, it will automatically create a `_PROCESSED` folder.

---

## No Action Required

Just restart the server and the fix is active. The next intake you run will move the source folder to the archive instead of deleting it.
