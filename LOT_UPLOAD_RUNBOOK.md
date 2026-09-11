# RUNBOOK — uploading "4. SKU but not tagged" lot by lot
Started 2026-09-10. **This is a multi-week job, not a one-day gig.**
30 lots · 998 song folders · 6,808 audio files · 91.2 GB.

## Why lot at a time
Every file in that Dropbox folder is ONLINE-ONLY (zero blocks). Reading one
gives a placeholder, and that is exactly how the August backfill uploaded
thousands of stubs. So each lot has to be materialised before it can be
uploaded, and 91.2 GB will not sit on the Mac at once. ~3 GB per lot is
manageable, and a bad lot costs one lot instead of a day.

## THE LOOP — repeat per lot
1. **Finder** → right-click the lot folder → **Make Available Offline**. Wait.
   Watch the Dropbox menu bar. If it says syncing but bytes are not moving it
   is WEDGED — quit and relaunch Dropbox, that is faster than waiting.
2. **Verify it really landed** (blocks, not size — size lies):
       find "<lot dir>" -type f \( -iname '*.wav' -o -iname '*.mp3' \) \
         -printf '%s %b\n' | awk '{if($2==0)c++;else l++} END{print "cloud",c,"local",l}'
   Do not continue until cloud is 0.
3. **Dry run** — refuses if anything is still cloud-only:
       /api/b2/upload-lot?lot=<FOLDER NAME>&dryRun=1
   CHECK `composerFolders`: every entry must be the 3-char form
   (`nimbus/C32_Hugo McLaughlin_NIMBUS`) with a healthy `backedByObjects`.
   A 4-char folder (`C32b_...`) or a tiny count means it picked a STRAY.
   CHECK `skipped`: folders whose SKU is not in `titles` need a human.
4. **Small batch first**: `&dryRun=0&limit=10` → expect `failed: 0`.
5. **Full lot**: `&dryRun=0`. Re-uploading the first 10 is harmless.
6. **Record in the database**:
       /api/b2/create-stems?dryRun=1&cohort=soho4_exclusive_partial
   then `dryRun=0`. Dots go green in the Finish Queue.
7. **Set the lot back to online-only** in Finder to reclaim the space BEFORE
   materialising the next one.

## Hard-won details — do not relearn these
- The endpoint DERIVES the composer folder from the MOST-USED existing folder
  for that composer+collection. Majority wins because B2 contains strays: e.g.
  `nimbus/C32_Hugo McLaughlin_NIMBUS` (19 objects) vs
  `nimbus/C32b_Hugo McLaughlin_NIMBUS` (5). An unordered LIMIT 1 picked the
  stray and would have uploaded 164 files into it — the same mistake that made
  the 92 stray root keys. NEVER construct the path.
- **Neon is serverless and suspends when idle.** `_pgRetry` now backs off
  1s/2s/4s/8s. Before that, upload-lot died with "Connection terminated
  unexpectedly" twice.
- **FOLDER names and DATABASE lot names DO NOT MATCH.** Folder
  `INTAKE LOT_250918_SOHO4_09_EDM(EX)`; the DB has things like
  `250819_INTAKE LOT_SOHO4_05 EDM (EX)` (date first), `SOHO_25` vs `SOHO4_25`,
  dates off by one. The uploader does not care — it reads the SKU off each SONG
  folder — but the Finish Queue groups by the DB name, so a lot may appear
  under a differently-spelled heading.
- The August 2025 SOHO4 lots (05 EDM, 04 TENSION, Lifestyle, 06, 08) are NOT
  in this folder. Their audio is somewhere else — UNRESOLVED.
- `b2_hide_file` only, never `b2_delete_file_version`.

## Progress
Tick these off. 30 lots.

    [x] INTAKE LOT_250918_SOHO4_09_EDM(EX)   180 files 3.13 GB
        UPLOADED 164/164 on 2026-09-10, 0 failed. 2 folders skipped (bad names).
    [ ] INTAKE LOT_230825_AP450 RETURNS
    [ ] INTAKE LOT_251028_SOHO4_12 EDM(EX)
    [ ] INTAKE LOT_251113_SNAPPED_46
    [ ] INTAKE LOT_251120_SOHO4_16
    [ ] INTAKE LOT_251124_SNAPPED_47
    [ ] INTAKE LOT_251202
    [ ] INTAKE LOT_251202_SNAPPED 48
    [ ] INTAKE LOT_251204
    [ ] INTAKE LOT_251210_SNAPPED 49
    [ ] INTAKE LOT_251217
    [ ] INTAKE LOT_260107_SOHO4 18 MIXED (EX)
    [ ] INTAKE LOT_260114_SOHO4_19
    [ ] INTAKE LOT_260121_SOHO4_20
    [ ] INTAKE LOT_260127_SOHO4_21
    [ ] INTAKE LOT_260128_SOHO4_22
    [ ] INTAKE LOT_260203_SOHO4_23
    [ ] INTAKE LOT_260204_SNAPPED_49
    [ ] INTAKE LOT_260217_SOHO4_24
    [ ] INTAKE LOT_260218_SOHO_25
    [ ] INTAKE LOT_260225_SOHO4_26
    [ ] INTAKE LOT_260226_SOHO4_PUNTA_and_PUNTAb
    [ ] INTAKE LOT_260302_SOHO4_Punta2
    [ ] INTAKE LOT_260310_SOHO4_27
    [ ] INTAKE LOT_260317_SOHO4_28
    [ ] INTAKE LOT_260325_SOHO4_29
    [ ] INTAKE LOT_260331_SOHO4_30
    [ ] INTAKE LOT_260407_SOHO4_31
    [ ] T28a0823_mrdramatix_Gm_SH        (single song, not a lot)
    [ ] T38_Catchup                      (single song, not a lot)

## Needs a human decision (found 2026-09-10, lot 250918)
    S33a_Flames Will Not Fade_Em_SoHoEDM   no SKU digits in the folder name
    S73r1114 THE SOUND_Dm                  space instead of underscore
Both were SKIPPED, not guessed at. Rename in Finder, then re-run that lot.

## AFTER the upload: the actual finishing work
Finish Queue → play → BPM+key auto-detect → type DESCRIPTION and MMW → next.
Description matters most (Erik). Catalogue gaps as of 2026-09-10:
bpm 9,803 · description 1,894 · mmw 4,050.


---

# LESSONS FROM LOT 1 (2026-09-10) — all fixed, but know why

## It appeared to hang for an hour with ZERO output
Three separate causes, all now fixed:
1. **`fs.readFileSync` blocked the whole event loop** for every file, up to
   30 MB each, on a single-threaded server that was ALSO running an intake
   session (ffmpeg/ffprobe). Now `await fsp.readFile`.
2. **Progress was logged every 25 files**, so 164 files could look silent for
   a very long time. Now ONE LINE PER FILE with size and name.
3. **A spinning browser tab means nothing.** The endpoint does not stream, so
   the tab sits blank until the whole run finishes. THE TERMINAL IS THE ONLY
   PLACE PROGRESS APPEARS. If the terminal is silent, it is stuck, not slow.

## Re-runs are now cheap
It lists what is already in the target folders once and SKIPS anything already
there at the right size (`skippedAlreadyThere`). Interrupting is safe; you will
not re-send gigabytes.

## Neon drops idle clients CONSTANTLY on this workload
Every long endpoint pages the bucket for minutes with the DB connection idle,
so the first query after that gap often hits a dead client. `_pgRetry` now
backs off 1s/2s/4s/8s and logs:

    [pg] create-stems titles failed (Connection terminated unexpectedly)
         — waking/reconnecting, retry 1/4 in 1000ms
    [pool] client connected

**That is the retry WORKING, not an error.** Two crashes before this fix.

## Don't run the uploader while anyone is using the app
One single-threaded Node process serves both. They will fight.
**Strongly consider moving the bulk uploads to a standalone script** run from
Terminal, outside the app, before grinding through the remaining 29 lots — it
would survive closing the laptop and would not touch live intake.

## `node --check` is NOT a test
It only proves the file parses. It passed happily on a patch that referenced
`apiH` in an endpoint whose variable is `apiHost`, which failed at runtime with
"apiH is not defined". Read the surrounding code before pasting a block from
another endpoint.

## LOT 1 CLOSED — 2026-09-10
`INTAKE LOT_250918_SOHO4_09_EDM(EX)` is done end to end.

- Folder holds 30 subfolders / 180 audio files.
- 2 folders skipped for bad names (fix later, then re-run the lot):
  - `S33a_Flames Will Not Fade_Em_SoHoEDM`  (no SKU digits)
  - `S73r1114 THE SOUND_Dm`                 (space instead of underscore)
- 28 folders / 164 files uploaded, 0 failed.
- `/api/b2/create-stems?dryRun=0` inserted 177 rows; stem counts for the 28
  lot SKUs sum to exactly 164, so every uploaded file has a `mix_stems` row.
  (The other 13 rows were pre-existing cumulus `C27a` FULL.wav files that had
  never been recorded.)
- 28 `work_queue` rows resolved, `resolved_by='lot-upload-250918-SOHO4-09'`.
  Open: 2,769 -> 2,741.

### DO NOT FILTER create-stems BY COHORT
All 28 titles in this lot are `filemaker_migration_partial`, NOT
`soho4_exclusive_partial`, even though the lot is named `SOHO4_09_EDM(EX)`.
The lot name does not predict the cohort. Running with
`?cohort=soho4_exclusive_partial` returned `titlesWithAudio: 0` and looked like
a failure for an hour. **Run create-stems with no cohort filter.**

### The 829 soho4_exclusive_partial titles are a DIFFERENT set
`C32b4844` "Bless Your Drama" .. `C32b5124` "Spicy Hustle" interleave in the
same SKU range as this lot's titles but their audio is in neither B2 nor
"4. SKU but not tagged". These are almost certainly the missing August 2025
SOHO4 lots. Unresolved.

### The 98 create-stems ambiguities are ONE problem
`cumulus/R04_Tim Ryan O'Kane/` vs `cumulus/R04_Tim-Ryan O'Kane_CUMULUS/` —
same bytes (25,668,032 on every pair), two composer-folder spellings, hyphen
vs space. The `_CUMULUS` spelling matches the `{ID}_{Name}_{COLLECTION}`
convention and is the keeper; the other is a stray tree to `b2_hide_file`
later. Clearing this clears all 98 at once.


## THE LOCKED-DOWN LOOP (2026-09-11) — USE THIS, NOT THE OLDER STEPS ABOVE
Four calls per lot. A lot is done when step 4 says PASS. Not before, and not
because an earlier step printed ok:true.

Let LOT be the folder name, URL-encoded (spaces -> %20).

    1. http://localhost:9999/api/b2/upload-lot?lot=LOT
       Dry run. MUST show skipped: 0. If it does not, the run REFUSES itself --
       fix the folder names first (see "Folder naming" below). Check
       composerFolders: backedByObjects should be a healthy number, not 3.

    2. ...&dryRun=0
       Uploads. Idempotent -- anything already in B2 at a matching size is
       skipped, so re-running after an interruption is safe and cheap.

    3. http://localhost:9999/api/b2/create-stems?lot=LOT&dryRun=1  then &dryRun=0
       NOTE ?lot= AND NO COHORT FILTER. ?lot= makes it consider EVERY SKU in
       the lot, including titles that already have some stem rows. Without it
       the endpoint only looks at titles with ZERO rows, which silently loses
       files. alreadyRecorded tells you how many it correctly declined to
       duplicate.

    4. http://localhost:9999/api/b2/verify-lot?lot=LOT&record=1
       THE GATE. Three-way reconciliation of Dropbox <-> B2 <-> mix_stems.
       PASS means every audio file in the lot folder is in B2 at the right byte
       count with a mix_stems row pointing at it, and the folder name matches
       the catalogue title. &record=1 then stamps size_bytes, sha1, source_lot
       and verified_at -- and it is GATED ON PASS, so verified_at can never be
       a lie.

    5. Resolve the lot's SKUs in work_queue, then set the Dropbox lot folder
       back to online-only.

verify-lot is READ ONLY without &record=1, and it works on an ONLINE-ONLY lot
because stat reports the true size without the bytes being local. So any lot
can be re-verified at any time, months later, for free.

### What the gate caught on its very first run
Lot 1 had been recorded as "closed, 28 of 30 folders, 0 failed" on 2026-09-10.
verify-lot immediately returned FAIL: the two badly-named folders held 16 audio
files that had NEVER been migrated. The lot was 91% done, not done. That is
exactly the rot this gate exists to prevent, and it disagreed with the human
summary on day one.

### Folder naming
upload-lot takes each song's SKU from the FIRST TOKEN of the folder name, so
the folder must be `{SKU}_{Title}...`. Two real failures from lot 1:
  - `S33a_Flames Will Not Fade_Em_SoHoEDM`  -> no digits. Correct: S33a43514.
  - `S73r1114 THE SOUND_Dm`                 -> space, not underscore.
Find the right SKU by title in `titles`, rename the folder, re-run from step 1.

### The title cross-check
The folder's title text is compared to the catalogue title (fuzzy substring
edit distance, threshold 0.55, chosen from measurement over 30,063 catalogue
songs -- see the comment in api.js). It exists because a mistyped SKU digit
that lands on a DIFFERENT real title passes every other check we have. Six
such mis-attachments were already in mix_stems when the check was written.

### Provenance
Every row now records source_lot, so `WHERE source_lot = '<lot>'` selects a lot
back out of the database. size_bytes + sha1 mean a stub can be detected with a
query instead of re-listing the bucket.

### Lot 1 final
30 folders / 180 files / 3.13 GB / 30 titles. verdict PASS, recorded 180.
work_queue open 3,261 -> 2,739.
