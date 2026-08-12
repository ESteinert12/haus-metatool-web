# Phase B Phase 1: B2 Stub Recovery Script

**Date:** 2026-08-11  
**Status:** Ready for testing  
**Scope:** Upload 800 real audio files from SHIPPING folder → B2 stubs

---

## Overview

Phase 1 replaces ~800 empty stub files in B2 with real audio from the local SHIPPING folder. This is quick-win recovery before tackling the 29,903-file Phase 2 (old Dropbox archive).

## Script Details

**File:** `b2_recovery_phase1.py`  
**Location:** `/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/`

### Features

- **Checkpoint-based resumable uploads** — survives interruptions
- **Batch processing** — uploads 50 files at a time
- **Error handling with retries** — 3 attempts per file before giving up
- **Progress tracking** — JSON checkpoint file + detailed logging
- **File matching** — matches local files to B2 stubs by ComposerID (SKU)

### File Matching Logic

```
Local file:  HAUS_MoonlightSonata_BbMajor_R48_FULL.wav
             Split by '_' → parts[3] = "R48" (ComposerID)

B2 stub:     HAUS_MoonlightSonata_BbMajor_R48_FULL.wav
             Split by '_' → parts[3] = "R48" (ComposerID)

Match: YES ✓ (same ComposerID)
```

### Naming Convention

All files follow HAUS format:
```
HAUS_{TitleCamelCase}_{Key}_{ComposerID}_{VERSION}.ext
```

Examples:
- `HAUS_MoonlightSonata_BbMajor_R48_FULL.wav`
- `HAUS_BlueSky_FMajor_S33a_ALT.wav`
- `HAUS_Tension_Cm_R15a_BUMPERa.wav`

**ComposerID** includes optional version letter (a, b, c) for variants.

## Usage

### Prerequisites

```bash
# Install dependencies
pip install requests

# Set B2 credentials
export B2_KEY_ID="your_b2_key_id"
export B2_APP_KEY="your_b2_app_key"
```

### Run the Script

```bash
cd /Users/HAUS/Documents/Claude/Projects/ATMOSPHERE
python3 b2_recovery_phase1.py
```

### Output

**Checkpoint file:** `~/.haus-recovery/phase1-checkpoint.json`  
**Log file:** `~/.haus-recovery/phase1.log`

Checkpoint structure:
```json
{
  "started_at": "2026-08-11T10:30:00.000Z",
  "last_batch": 0,
  "total_files": 800,
  "uploaded": 123,
  "failed": 2,
  "matches": [...],
  "results": [...]
}
```

### Resume After Interruption

Simply re-run the script. It will:
1. Load checkpoint file
2. Skip already-uploaded files
3. Continue from last batch
4. Update progress as it goes

## Expected Results

| Metric | Expected |
|--------|----------|
| Total matches | ~750-800 |
| Upload success | 99%+ |
| Duration | 30-60 min (depending on network) |
| Error handling | Automatic retry on transient failures |
| Checkpoint save | After each file |

## Error Handling

**Retry logic:**
- File upload fails → retry up to 3 times with 5-second delay
- B2 auth fails → full re-authorization
- Network timeout → logged but doesn't stop batch

**Persistent failures:**
- Logged to `phase1.log` with error message
- Tracked in checkpoint file
- Can be re-run manually after fixing (e.g., credentials, network)

## Testing Steps

1. ✅ Verify B2 credentials are set
2. ✅ Check SHIPPING folder exists and has audio files
3. ✅ Run script in dry-mode first (optional — add `--dry-run` flag if needed)
4. ✅ Monitor `phase1.log` for progress
5. ✅ After completion, verify B2 uploads via dashboard

## Next Steps (Phase 2)

Once Phase 1 succeeds:
1. Deploy to Digital Ocean droplet (4GB RAM recommended)
2. Run Phase 2 script for 29,903 files from old Dropbox archive
3. Monitor via SSH: `tail -f /tmp/recovery.log`
4. Estimated: 6-12 hours on cloud infrastructure

## Known Issues

**Dropbox sync interference:** If git index.lock appears, remove manually:
```bash
rm -f /path/to/repo/.git/*.lock
```

**Network timeouts:** If uploads stall, check:
- Internet connectivity
- B2 service status (backblaze.com)
- B2 bucket permissions

## Performance Notes

- **Upload speed:** Depends on file size and network bandwidth
- **B2 API rate limits:** 100 uploads/sec (handled automatically by script)
- **Memory usage:** Minimal (streams files, doesn't load all at once)
- **CPU usage:** Low (mostly I/O bound)

---

## Commit Info

Commit: (pending)  
Files: `b2_recovery_phase1.py`, `PHASE_B_PHASE1_RECOVERY.md`

---

## Success Criteria

✅ Script runs without errors  
✅ 95%+ of matched files upload successfully  
✅ Checkpoint persists and resumes correctly  
✅ Log file shows clear progress  
✅ B2 stubs replaced with real audio  

Ready to test!
