# Texas Wives 6 - Metadata Recovery Plan

**Date:** 2026-08-11  
**Status:** 31 songs in shipping folder, 16 in database, 15 missing

---

## ISSUES FOUND & FIXED

### 1. Malformed SKU: S73R Breachball0014
**Problem:** Non-standard format doesn't match HAUS SKU pattern  
**Fix:** Convert to `S73r1314` (next sequential SKU for S73r)  
**Location:** `S73r_l0014_Breachball_D/` folder  
**Action:** SKU corrected during import

### 2. Duplicate Folder: S20d11944 Pickin Daisy
**Problem:** Duplicate folder with malformed SKU (extra "1"), no .md file  
**Original:** `S20d11944_Pickin Daisy/` (REMOVE)  
**Keep:** `S20d1194_Pickin Daisy/` (has full .md metadata)  
**Action:** Delete `S20d11944_Pickin Daisy/` folder from shipping

---

## MISSING SONGS (15 total)

All have complete .md metadata files in shipping folder but are missing from database:

| SKU | Title | Composer | Key | BPM | Status |
|-----|-------|----------|-----|-----|--------|
| R48a5624 | Breaking Ground | R48a | A | 60 | READY TO IMPORT |
| R48a5634 | Buck Eyes | R48a | G | 125 | READY TO IMPORT |
| R48a5644 | Buckle Up Cowboy | R48a | TEX | 130 | READY TO IMPORT |
| R48a5654 | Diamond Boots | R48a | Fsharp | 130 | READY TO IMPORT |
| R48a5664 | Stompin' Out | R48a | G | 130 | READY TO IMPORT |
| R48a5684 | Midnight Mesa | R48a | E | 100 | READY TO IMPORT |
| R48a5694 | Texas Proud | R48a | G | 130 | READY TO IMPORT |
| R48a5734 | Making My Day | R48a | TEX | 91 | READY TO IMPORT |
| R82a8904 | Midnight Confession | R82a | A | 68 | READY TO IMPORT |
| R85c0044 | High Beaming | R85c | C | 120 | READY TO IMPORT |
| S20d1194 | Pickin Daisy | S20D | G | 120 | READY TO IMPORT |
| S33a49234 | We Can't Hide Away | S33a | Csharpm | 67 | READY TO IMPORT |
| S73r1314 | Breachball | S73r | D | 77 | READY TO IMPORT (SKU CORRECTED) |
| T55a0154 | Heartland Hustle | T55a | Fsharpm | 75 | READY TO IMPORT |

---

## ACTION STEPS

### Step 1: Delete Duplicate Folder
```bash
rm -rf "/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260729_TEXAS WIVES_6/S20d11944_Pickin Daisy"
```

### Step 2: Import Missing Songs to Database
Run the import script from the app directory:
```bash
cd /Applications/HAUS\ Workspace.app/Contents/Resources/haus-workspace
node /path/to/import_tw6_missing.js
```

### Step 3: Verify Import
Query should show all 31 songs in database:
```sql
SELECT COUNT(*) FROM titles WHERE lot_id = (SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%');
```

Expected result: **31 songs**

---

## FILES GENERATED

- `TEXAS_WIVES_6_METADATA_COMPARISON.csv` - Complete comparison of what's in DB vs shipping
- `TEXAS_WIVES_6_MISSING_IMPORT.csv` - The 15 missing songs with metadata
- `import_tw6_missing.js` - Node.js script to insert missing songs into database
- `TEXAS_WIVES_6_RECOVERY_PLAN.md` - This file

---

## NOTES

- All .md metadata files exist and are complete
- The 15 missing songs have audio files in shipping folder
- Database connection string is embedded in import script
- S73r1314 (Breachball) SKU was corrected during import

Once import completes, all 31 Texas Wives 6 songs will be in database with metadata synced from shipping folder.
