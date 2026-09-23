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
    [ ] INTAKE LOT_230825_AP450 RETURNS   187 folders -- set aside earlier
        purely for size, no other blocker. Being worked in CHUNKS as of
        2026-09-23: Erik makes a sibling folder under the same Dropbox
        directory (e.g. AP450_Returns_Group1), moves in whatever is already
        synced locally, runs it through the normal loop as its own lot,
        then sets that chunk back to online-only to reclaim disk space
        before starting the next chunk. Each chunk gets its own line below;
        this parent line stays unticked until every chunk is closed.
        [x] AP450_Returns_Group1   50 folders / 405 files -- PASS 2026-09-23
            uploaded=397 skippedAlreadyThere=8 failed=0, 0 ambiguous, clean
            on the first pass -- no folder-name or new-composer issues.
    [x] INTAKE LOT_251028_SOHO4_12 EDM(EX)   30 folders / 154 files / 2.14 GB
        PASS 2026-09-15. All 154 files were already in B2 at correct size
        (uploaded:0, skippedAlreadyThere:154 -- confirmed live via B2 list API,
        not a stale check) -- pre-existing before this session, cause unknown.
        Erik independently confirmed 3 songs play correctly in the app.
        create-stems inserted 154 rows, 0 ambiguous. verify-lot record=1:
        filesFullyVerified 154/154, 0 failures, 0 warnings.
        work_queue: 30 rows resolved, resolved_by='lot-upload-251028-SOHO4-12'.
    [x] INTAKE LOT_251113_SNAPPED_46   30 folders / 181 files / 2.04 GB
        PASS 2026-09-16. First upload pass: 180/181 uploaded, 1 file failed
        with a B2-side transient error ("incident id"). Re-ran upload-lot
        (idempotent) after restarting the server (session was lost on
        restart, re-logged in) -- second pass showed skippedAlreadyThere:181,
        failed:0, confirming all 181 landed. create-stems (no cohort filter)
        inserted 181 rows, 0 ambiguous, 0 titlesWithNoAudio. verify-lot
        record=1: PASS, filesFullyVerified 181/181, 0 failures, 0 warnings.
        work_queue: 30 rows resolved, resolved_by='lot-upload-251113-SNAPPED-46'.
        Dropbox folder set back to online-only.
    [ ] INTAKE LOT_251120_SOHO4_16
    [x] INTAKE LOT_251124_SNAPPED_47
        CLOSED via lot_pipeline.py, PASS. (Exact file counts not re-confirmed
        here -- see lot_logs/ for that run's verify-lot output.)
    [x] INTAKE LOT_251202
        CLOSED via lot_pipeline.py, PASS. (Exact file counts not re-confirmed
        here -- see lot_logs/ for that run's verify-lot output.)
    [x] INTAKE LOT_251202_SNAPPED 48   30 folders / 184 files
        CLOSED 2026-09-17. PASS, 184/184 files verified, 30/30 song folders.
        Three ~30-min upload-lot dry-run hangs on this lot were investigated
        (see engineering_notes.md, ATMOSPHERE project doc) -- DB query, title
        matching, and the synchronous fs walk were each individually ruled
        out with direct evidence; a 4th, code-confirmed candidate (leaked
        pooled DB connections on 3 unrelated endpoints' error paths, plus
        idleTimeoutMillis:0 meaning a leak is never reclaimed) was found and
        a live pool-stats diagnostic was added to api.js, but no hang has
        recurred since to confirm it against real data -- treat as an open,
        instrumented investigation, not a closed one.
        Separately, this lot also surfaced a NEW edge case worth remembering
        for the remaining lots: 3 songs (S98a0304/0314/0324, composer Kyle
        Butman) were already onboarded in FileMaker/Neon (titles existed)
        but had never been uploaded to B2 -- a brand-new composer with zero
        existing nimbus presence to derive a folder from. upload-lot's
        "never construct the path" rule correctly refused to guess, so
        these were uploaded by hand instead. First attempt used B2's own web
        console dragging the 3 song folders in directly -- B2 has no real
        folders, only key prefixes, and the console FLATTENED the folder
        structure, dropping the song-folder segment entirely, which
        create-stems's bucket scan then couldn't match to any SKU. Fixed by
        using the app's own /api/b2/get-upload-url + /api/b2/upload-file
        endpoints instead (same mechanism as normal intake), specifying the
        full nested key directly -- see upload_three_songs.py. LESSON: for
        any future brand-new composer, do NOT use the B2 web console to
        upload folders -- use upload-file with an explicit b2FileName.
    [x] INTAKE LOT_251204   30 folders / 180 files
        CLOSED 2026-09-17. PASS, 180/180 files verified, 30/30 song folders.
        Same brand-new-composer-in-this-collection situation as SNAPPED 48,
        this time composer T31 / Jared Kahn, 5 songs -- handled the same way
        (upload_new_composer_songs.py, generalized from the SNAPPED 48 script).
        MUCH MORE IMPORTANT: this lot is where the multi-day hang mystery
        finally got a real fix, not just another ruled-out theory. Live
        upload-lot hung again (30 min, client curl timeout) -- but this time
        during the LIVE run, not the dry run, which pointed at B2 calls
        instead of the DB. Reading _b2Request found it uses a bare
        https.request with NO timeout at all -- a silently stalled
        connection would hang forever, no error, no retry. Separately, the
        server's own log during the hang showed [pool] stats stuck at
        total=1 idle=0 waiting=0 for 30+ straight minutes right after a
        "Connection terminated unexpectedly" / reconnect on the
        "upload-lot skus" query -- i.e. a query that got a fresh connection
        but then never got a response, holding it forever, because NO
        statement_timeout/query_timeout was set anywhere in the file either.
        Both gaps are real, code-confirmed, and (unlike every earlier theory
        this week) directly explain an UNBOUNDED hang with zero symptoms.
        FIXED in api.js: pool now sets statement_timeout:20000 /
        query_timeout:25000; _b2Request now sets a 60s idle timeout via
        req.on('timeout', ...). After restarting the server with these
        fixes, upload-lot's live run completed normally with no hang. This
        is NOT yet proven beyond doubt (one clean run since the fix isn't
        certainty), but it is the first fix this whole investigation found
        that is actually IN the failing code path, rather than something
        ruled out. Keep watching -- if a hang recurs, it should now surface
        as a real, visible error within under a minute instead of a silent
        30-minute stall, which is itself useful new information either way.
    [x] INTAKE LOT_251210_SNAPPED 49   30 folders / 181 files -- PASS
        Two folder-name fixes needed before upload-lot would take it:
        S33a47503_Colossal Confession_Am_TENSION -> S33a47504_... (one-digit
        typo vs. the titles table -- found by searching titles on the song
        title text, not the sku_root prefix alone, since S33 alone is ~5000
        rows) and T09a0664 Underneath The Basement_G -> T09a0664_... (missing
        underscore, same class of issue as the earlier R48a4154 fix).

        Also hit two hangs on this lot with the exact same idle=0/waiting=0
        signature the 09-17 fix was supposed to close, despite that fix
        being live in the file the whole time. ACTUAL cause (see
        engineering_notes.md 2026-09-18): api.js has a SECOND place that
        builds a Postgres Pool -- POST /api/pg/connect -- which lacked
        statement_timeout/query_timeout and silently REPLACES the boot-time
        pgPool (pgPool = newPool) whenever it runs. index.html calls this
        endpoint automatically on page load, even logged out, so simply
        having the workspace webpage open/refreshed at any point during the
        migration silently downgraded protection with zero error or log
        line. Fixed by adding the same two timeout settings to that second
        pool's config. If a hang recurs with this same signature again,
        that fix is not the first place to look -- search for a THIRD
        pool-construction/reassignment site instead.
    [x] INTAKE LOT_251217   30 folders / 202 files -- PASS
        Hit "Query read timeout" (query_timeout, the 09-17 fix, firing
        correctly at 25s instead of hanging) on the live upload -- but
        _pgRetry's transient-error regex didn't recognize that message, so
        it failed on attempt 1 instead of retrying. Fixed by adding
        "timeout" to the regex (engineering_notes.md 2026-09-18). Re-ran
        with the new upload_live_only.py (live-step-only, reusable for any
        future lot that just needs a retry) -- 202 uploaded, 0 failed,
        clean on the first attempt after the fix.
    [x] INTAKE LOT_260107_SOHO4 18 MIXED (EX)   30 folders / 208 files -- PASS
        Two folder-name typos vs. titles (S73r11844 -> S73r1184, extra
        trailing digit; R89c0034 folder said RIVER, catalogue title is
        "On Your River" -- found both by searching titles on song title
        text, same as prior lots). Also THREE brand-new composer/collection
        situations in one lot: R89c0024 + R89c0034 (Mark Roos) and
        S81j0014/0024/0034 (Sebastian Arno Sprenger), all nimbus, zero
        prior B2 presence -- ran upload_new_composer_songs.py three
        separate times (once per composer-folder target), then ONE
        create-stems pass for the whole lot to link all 5 songs into
        mix_stems before re-running upload-lot. Also hit a B2 auth
        token expiry ("Could not list buckets: HTTP 401", the B2 side's
        own ~24h token, unrelated to app login/Postgres) mid-lot --
        fixed by restarting the server, which re-authorizes B2 from env
        vars on boot.
    [x] INTAKE LOT_260114_SOHO4_19   30 folders / 184 files -- PASS
        CLOSED 2026-09-20. PASS, 184/184 files verified, 30/30 song folders,
        0 failures, 0 warnings. First upload pass: 183/184 uploaded, 1 file
        failed with a transient B2 error; retried (idempotent) and landed
        clean (skippedAlreadyThere:183, failed:0). create-stems (no cohort
        filter): 184 rows inserted, 0 ambiguous, 0 titlesWithNoAudio. All 7
        composerFolders resolved to healthy existing B2 folders (no strays,
        no brand-new composers this lot): R25_Sean Hagon(95),
        R48_Michael Toland(768), R89_Mark Roos(16), S33_Peter Lobo(7042),
        T40_Jordan Whaley(979), T50_Anthony Fuscaldo(190),
        T51_Thomas Hoffman(356).
        work_queue: resolve pending, resolved_by='lot-upload-260114-SOHO4-19'
        (SQL in lot_logs/INTAKE_LOT_260114_SOHO4_19_20260920_131503/).
    [x] INTAKE LOT_260121_SOHO4_20   30 folders / 195 files -- PASS
        CLOSED 2026-09-20. PASS, 195/195 files verified, 30/30 song folders,
        0 failures, 0 warnings. First upload pass: 194/195 uploaded, 1 file
        failed with a transient B2 error; retried (idempotent) and landed
        clean (skippedAlreadyThere:194, failed:0). create-stems (no cohort
        filter): 195 rows inserted, 0 ambiguous, 0 titlesWithNoAudio. All 5
        composerFolders resolved to healthy existing B2 folders (no strays,
        no brand-new composers this lot): R13_Ben Zwerin(227),
        R48_Michael Toland(794), R91_Christopher Paulson(34),
        S12_Joseph Rusnak(194), S33_Peter Lobo(7135).
        Folder-name fix needed before the dry run passed: folder
        `R48a4514_SAD EXPECTATIONS_TENSION` had a wrong SKU digit --
        `sku_root not in titles`. Confirmed real sku_root by title lookup
        (`SELECT sku_root, title FROM titles WHERE title ILIKE
        '%SAD EXPECTATIONS%'`) -> R48a4474. Erik renamed the local folder
        to match; no B2/DB changes needed for this.
        work_queue: resolve pending, resolved_by='lot-upload-260121-SOHO4-20'
        (SQL in lot_logs/INTAKE_LOT_260121_SOHO4_20_20260920_134737/).
    [x] INTAKE LOT_260127_SOHO4_21   30 folders / 232 files -- PASS
        CLOSED 2026-09-20. PASS, 232/232 files verified, 30/30 song folders,
        0 failures, 0 warnings. Clean upload pass: uploaded=232, failed=0,
        no retries needed. create-stems (no cohort filter): 232 rows
        inserted, 0 ambiguous, 0 titlesWithNoAudio. All 5 composerFolders
        resolved to healthy existing B2 folders (no strays, no brand-new
        composers this lot): R48_Michael Toland(874),
        R67_Emmett O'Malley(34), R91_Christopher Paulson(61),
        S12_Joseph Rusnak(215), S13_Omar Blyde(377).
        work_queue: resolve pending, resolved_by='lot-upload-260127-SOHO4-21'
        (SQL in lot_logs/INTAKE_LOT_260127_SOHO4_21_20260920_144046/).
    [x] INTAKE LOT_260128_SOHO4_22   30 folders / 198 files -- PASS
        CLOSED 2026-09-20. PASS, 198/198 files verified, 30/30 song folders,
        0 failures, 0 warnings. Clean upload pass: uploaded=198, failed=0,
        no retries needed. create-stems (no cohort filter): 198 rows
        inserted, 0 ambiguous, 0 titlesWithNoAudio. All 3 composerFolders
        resolved to healthy existing B2 folders (no strays, no brand-new
        composers this lot): R13_Ben Zwerin(269), S13_Omar Blyde(434),
        S33_Peter Lobo(7160).
        work_queue: resolve pending, resolved_by='lot-upload-260128-SOHO4-22'
        (SQL in lot_logs/INTAKE_LOT_260128_SOHO4_22_20260920_155246/).
    [x] INTAKE LOT_260203_SOHO4_23   30 folders / 195 files -- PASS
        CLOSED 2026-09-21. PASS, 195/195 files verified, 30/30 song folders,
        0 failures, 0 warnings. Clean upload pass: uploaded=195, failed=0,
        no retries needed. create-stems (no cohort filter): 195 rows
        inserted, 0 ambiguous, 0 titlesWithNoAudio. All 9 composerFolders
        resolved to healthy existing B2 folders (no strays, no brand-new
        composers this lot): R13_Ben Zwerin(304), R48_Michael Toland(911),
        R67_Emmett O'Malley(64), R82_Steve Mayone(250),
        R91_Christopher Paulson(78), S20_Bill Maier(233),
        S33_Peter Lobo(7256), T46_Paul Micca(6), T51_Thomas Hoffman(384).
        Two folder-name fixes needed before the dry run passed:
          - `S33a47413_Full Of Strangers_Cm_TENSION` had a wrong SKU digit
            -- `sku_root not in titles`. Confirmed real sku_root by title
            lookup and Erik renamed the local folder to match; no B2/DB
            changes needed.
          - `T51a0734_FeverDream_E_VOX` -- SKU matched fine, but
            `folder name does not contain the catalogue title`
            (catalogue title is "DeliriousFeverDream"). Renamed to
            `T51a0734_DeliriousFeverDream_E_VOX`, keeping key/collection tag.
        work_queue: resolve pending, resolved_by='lot-upload-260203-SOHO4-23'
        (SQL in lot_logs/INTAKE_LOT_260203_SOHO4_23_20260920_161716/).
    [x] INTAKE LOT_260204_SNAPPED_49   30 folders / 156 files -- PASS
        CLOSED 2026-09-21. PASS, 156/156 files verified, 30/30 song folders,
        0 failures, 0 warnings. Clean upload pass: uploaded=156, failed=0,
        no retries needed. create-stems (no cohort filter): 156 rows
        inserted, 0 ambiguous, 0 titlesWithNoAudio. All 8 composerFolders
        resolved to healthy existing B2 folders (no strays, no brand-new
        composers this lot): R15_Kari Steinert(36), R48_Michael Toland(917),
        R91_Christopher Paulson(96), S12_Joseph Rusnak(306),
        S20_Bill Maier(240), S33_Peter Lobo(7346), T09_Steven Farella(26),
        T51_Thomas Hoffman(391).
        One folder-name fix needed before the dry run passed:
        `T09a0674 SnappedOff_FSharp_SNAPPED` had a space instead of an
        underscore after the SKU -- `sku_root not in titles` (same failure
        mode as the S73r1114 case in Lot 1: the space breaks the SKU-token
        split). Erik renamed to `T09a0674_SnappedOff_FSharp_SNAPPED`; no
        B2/DB changes needed.
        work_queue: resolve pending, resolved_by='lot-upload-260204-SNAPPED-49'
        (SQL in lot_logs/INTAKE_LOT_260204_SNAPPED_49_20260921_095100/).
    [x] INTAKE LOT_260217_SOHO4_24   30 folders / 195 files -- PASS
        CLOSED 2026-09-21. PASS, 195/195 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (no cohort filter): 195 rows
        inserted, 0 ambiguous, 0 titlesWithNoAudio. Composer folders:
        nimbus/S33_Peter Lobo_NIMBUS, nimbus/S73_Eddie Grey_NIMBUS,
        nimbus/S81_Sebastian Arno Sprenger_NIMBUS, nimbus/S86_Jeff Miller_NIMBUS,
        nimbus/T31_Jared Kahn_NIMBUS.
        Two real problems hit on this lot, not just folder-naming:
          - One Dropbox item (`HAUS_OurCastInStonelight_A_S33a_DNB`) refused
            to go offline-available at first; Erik resolved it locally
            (Dropbox client-side, not an app/DB issue).
          - Live upload-lot (attempt 1) landed 138/195 then failed the
            remaining 57 with `bucket haus-music not found` on the
            automatic retry. Root cause (code-confirmed, not yet in
            engineering_notes.md -- needs writing up there): the B2
            authorization token cached in `b2Auth` had gone stale
            (~24h TTL) and `_b2Request` never throws on a non-200 HTTP
            status, so the live-upload bucket lookup's
            `(response.body.buckets || [])` silently collapsed a real
            401/auth-error response into an empty array, masking the
            true cause behind a misleading "bucket not found" message.
            Fixed by restarting the server (re-authorizes B2 fresh on
            boot) + `atmosphere_login.py` + `upload_live_only.py`
            (idempotent: uploaded the missing 57, skippedAlreadyThere
            138, failed 0). NOT yet fixed in code -- the error-swallowing
            in the live-upload bucket lookup should surface the real B2
            status/message instead of "bucket haus-music not found".
        work_queue: resolve pending, resolved_by='lot-upload-260217-SOHO4-24'.
        (No auto-generated work_queue_resolve.sql this time -- lot was
        finished via manual curl steps, not a single lot_pipeline.py run.)
    [x] INTAKE LOT_260218_SOHO_25   30 folders / 193 files -- PASS
        CLOSED 2026-09-21. PASS, 193/193 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (no cohort filter, run twice --
        once for the brand-new composer, once for the rest of the lot):
        11 + 182 = 193 rows inserted total, 0 ambiguous, 0 titlesWithNoAudio.
        composerFolders: R13_Ben Zwerin(325), R48_Michael Toland(953),
        S33_Peter Lobo(7537), T54_Randall Shattuck(11, brand-new this lot).
        Two real issues on this lot:
          - `S33a46724_Nothing On Us_Asharpm_POPEDM` -- SKU matched an
            existing title (`Fun Wires And Words`), so this looked like a
            routine "folder name doesn't contain the catalogue title"
            case at first. Erik caught that "Nothing On Us" is itself a
            real, separate catalogue title (sku_root is unique per title,
            so it couldn't be both) -- exactly the mis-attachment the title
            cross-check exists to catch. Looked up the real sku_root by
            title (S33a46714) and renamed to
            `S33a46714_Nothing On Us_Asharpm_POPEDM`. If we'd taken the
            naive fix (just append the wrong catalogue title) this song's
            audio would have been mis-recorded under "Fun Wires And
            Words". IMPORTANT PRECEDENT: when a "folder name does not
            contain the catalogue title" block fires, verify the folder's
            OWN title isn't itself a real, different catalogue song before
            just appending the catalogue title -- look it up by title text
            first.
          - `T54a0014_MicePlayingDice_Em_CLT` -- brand-new composer (T54 /
            Randall Shattuck), zero prior nimbus objects. Used
            `upload_new_composer_songs.py` (11 files, all OK), then
            create-stems for the whole lot (dryRun=1 showed
            titlesWithAudio:1/rowsToCreate:11 since only this composer's
            audio was in B2 yet; ambiguous:0, so went live), THEN
            re-ran the normal pipeline for the remaining 29 folders
            (uploaded=182, skippedAlreadyThere=11, failed=0).
        work_queue: resolve pending, resolved_by='lot-upload-260218-SOHO-25'
        (SQL in lot_logs/INTAKE_LOT_260218_SOHO_25_20260921_120819/).
    [x] INTAKE LOT_260225_SOHO4_26   30 folders / 249 files -- PASS
        CLOSED 2026-09-21. PASS, 249/249 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (no cohort filter, run twice):
        11 + 238 = 249 rows inserted total, 0 ambiguous, 0 titlesWithNoAudio.
        composerFolders: R13_Ben Zwerin(332), R36_Jan Jirasek(11,
        brand-new this lot), R48_Michael Toland(989), R82_Steve Mayone(258),
        S33_Peter Lobo(7676), T46_Paul Micca(14), T51_Thomas Hoffman(398),
        T54_Randall Shattuck(11), T55_Jeffrey Richardi(21).
        Two blockers, one of which was a near-miss:
          - `R36a2464_Context_Aminor` -- brand-new composer (R36 / Jan
            Jirasek), zero prior nimbus objects. Handled with
            `upload_new_composer_songs.py` (11 files OK), then
            whole-lot create-stems, then the normal pipeline for the rest.
          - `R82a8744_SloppySeconds_Bb_EMO` -- catalogue title for
            R82a8744 is "Sloppy Fourths", not "Sloppy Seconds". Following
            the SOHO_25 precedent, checked whether "Sloppy Seconds" was a
            real separate title before renaming -- it IS a real title, but
            with sku_root R82a1801, a stratus-era SKU (~10 years old) that
            Erik immediately flagged as implausible for a current-lot
            composer R82 song. Re-checked with a broader query
            (`sku_root LIKE 'R82%' AND title ILIKE '%Sloppy%'`) before
            acting on it -- Erik determined the real story: "Sloppy
            Fourths" IS "Sloppy Seconds" RENAMED in the catalogue at some
            point, so R82a8744 was the correct SKU all along and the
            original "append the catalogue title" fix was right. Renamed
            folder to `R82a8744_SloppyFourths_Bb_EMO` (SKU unchanged,
            title text updated to match current catalogue title).
            LESSON: a title lookup returning a real but implausible SKU
            (wrong era/collection for this composer) is itself a signal to
            dig further, not to trust the lookup blindly either way -- a
            renamed catalogue title can look identical to a genuine
            mis-attachment from the SKU side alone.
        work_queue: resolve pending, resolved_by='lot-upload-260225-SOHO4-26'
        (SQL in lot_logs/INTAKE_LOT_260225_SOHO4_26_20260921_135327/).
    [x] INTAKE LOT_260226_SOHO4_PUNTA_and_PUNTAb   27 folders / 192 files -- 26/27 songs migrated (1 deferred)
        CLOSED 2026-09-21. verify-lot verdict: FAIL (not PASS) -- but the
        FAIL is fully explained: 185/185 expected files verified, 0 other
        failures/warnings; the single "failure" IS the deliberately
        skipped song below. Closed manually since verify-lot's record=1
        gate only writes on true PASS.
        create-stems (whole lot, single run): 185 rows inserted, 0
        ambiguous, 0 titlesWithNoAudio, titlesConsidered=26 (not 27 --
        correct, since the skipped song's audio was never uploaded to B2
        so it never entered this scan).
        composerFolders (post-upload, backedByObjects): C32_Hugo
        McLaughlin(54), R13_Ben Zwerin(346), R48_Michael Toland(995),
        S33_Peter Lobo(7728), T46_Paul Micca(35), T54_Randall
        Shattuck(113), T55_Jeffrey Richardi(27).
        DEFERRED: `R13a15634_LaFiestaTranquila_F#min_SOHOPUNTA` (sku_root
        R13a15634, 7 files) -- confirmed genuinely absent from the
        `titles` table entirely (not a typo/mismatch -- broad title
        search across "Fiesta"/"Tranquila" found nothing matching).
        Needs to be added to `titles` manually by Erik through the normal
        cataloguing process (outside this pipeline's scope) before it can
        be uploaded. Deliberately excluded via upload-lot's
        `&allowSkips=1` so the other 26 songs could proceed; Dropbox
        folder was returned to online-only afterward, so this song's
        local files are cloud stubs again until revisited.
        Other issues hit and resolved:
          - Dropbox ghost-sync: `R48a Don't Start With Texas.wav`
            (TEXAS WIVES) stuck "Syncing 6 files" through multiple app
            restarts even though the file had already been moved out of
            the Dropbox tree entirely (onboarded that morning, relocated
            to local Downloads/1.ATMOS_Shipping). Standard fixes
            (restart, cancel sync, network toggle) did not clear it;
            resolved on its own / by Erik without a clear single fix
            identified -- flagging in case the same ghost-sync symptom
            recurs on a file that's been moved rather than deleted.
          - Neon cold-start "Connection terminated unexpectedly" during
            this lot -- matches the documented expected pattern, resolved
            via simple retry.
          - Two B2 transient live-upload failures ("incident id...", "no
            tomes available") -- resolved via idempotent retry
            (upload_live_only.py), landing at uploaded=185 failed=0
            across two passes.
        OPEN ITEM: verify-lot's own `recorded` flag never fired for this
        lot (stayed 0, since verdict was FAIL). work_queue was resolved
        directly via manual SQL instead (unaffected by that flag, since
        it keys off `mix_stems.source_lot`, not verify-lot's internal
        record). Haven't read what else, if anything, that `recorded`
        flag feeds downstream -- flagging in case some other view/report
        relies on verify-lot having recorded a PASS for this lot.
        work_queue: resolved 26 sku_roots,
        resolved_by='lot-upload-260226-SOHO4-PUNTA-and-PUNTAb' (manual
        SQL, not from a lot_logs/ file since this went through the
        manual curl path rather than lot_pipeline.py).
    [x] INTAKE LOT_260302_SOHO4_Punta2   30 folders / 212 files -- PASS
        CLOSED 2026-09-22. PASS, 212/212 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (whole lot, single run): 212
        rows inserted, 0 ambiguous, 0 titlesWithNoAudio.
        composerFolders: R13_Ben Zwerin(360), R48_Michael Toland(1027),
        R67_Emmett O'Malley(94), R85_Eric Nolan(55), S33_Peter Lobo(7763),
        S73_Eddie Grey(220), S89_Robert Critchley(15), T08_Doug
        Hinrichs(30), T46_Paul Micca(49), T55_Jeffrey Richardi(45).
        MAJOR BLOCKER (new failure mode, not seen before this lot): the
        Dropbox desktop app's own download engine got permanently stuck
        partway through "Make Available Offline" for this lot's folder --
        stalled at a fixed byte count for 2+ hours with zero progress,
        Activity panel showing nothing for days despite heavy Dropbox
        traffic elsewhere that same day, and no per-file spinner anywhere
        in Finder. Ruled out in order, with direct evidence each time:
          - Account unlink (menu bar popup showed normal signed-in
            state with real recent-activity entries -- ruled out).
          - Dead network (`lsof -i -p <dropbox pid>` showed live
            ESTABLISHED connections to Dropbox's own IPs -- ruled out,
            though this proved connections existed, not that bytes were
            moving).
          - Local disk space (29 GB free, comfortably more than this
            lot's 2.76 GB -- ruled out).
          - Full app kill (`killall Dropbox`) + relaunch -- no change,
            cloud-file count identical before and after.
          - Folder-level toggle (online-only, then back to Available
            Offline) -- forced a full fresh re-download of all 212
            files (confirmed via the cloud-count check jumping to 100%
            cloud), which then STILL showed zero progress after several
            minutes. This is the strongest evidence: not a stuck resume,
            a genuine failure to download anything new for this folder
            specifically, despite the app and account both working
            normally in every other respect.
          - Not yet tried / unresolved: Dropbox support ticket. Flagging
            for Erik to pursue separately since it's outside what's
            diagnosable from Terminal alone.
        WORKAROUND (new technique, worth reusing if this recurs): Erik
        downloaded the lot folder directly from the Dropbox web app
        (dropbox.com) into `/Users/HAUS/Downloads/INTAKE
        LOT_260302_SOHO4_Punta2`, completely bypassing the stuck desktop
        sync engine. Rather than moving files back into the Dropbox tree,
        found that `/api/b2/upload-lot`, `/api/b2/create-stems`, and
        `/api/b2/verify-lot` all already support an undocumented-in-the-
        runbook `&base=<path>` query param that overrides
        LOT_BASE_DEFAULT (checked directly in api.js, not guessed) -- so
        the whole lot was run via the manual curl path with
        `&base=/Users/HAUS/Downloads` on every call instead of
        lot_pipeline.py (which has no flag for this). Worked cleanly.
        The original Dropbox-synced folder (still stuck, never finished
        downloading) is no longer needed at all now that everything is
        verified in B2 -- Erik was told it's safe to set it back to
        online-only without waiting for it to ever complete.
        One ordinary blocker: `R67a2694_Rum Punch_Gm_96BPM` -- catalogue
        title for R67a2694 is "Rum Punch And Red Flags", not "Rum Punch".
        Checked for a separate real "Rum Punch" title first (the
        Sloppy Fourths precedent) -- none found, confirmed as the same
        renamed-in-catalogue-but-not-locally pattern. Manually fixed.
        work_queue: resolve pending, resolved_by='lot-upload-260302-SOHO4-Punta2'
        (manual SQL, not from a lot_logs/ file since this went through
        the manual curl path rather than lot_pipeline.py).
    [x] INTAKE LOT_260310_SOHO4_27   30 folders / 215 files -- PASS
        CLOSED 2026-09-22. PASS, 215/215 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (whole lot, single run): 215
        rows inserted, 0 ambiguous, 0 titlesWithNoAudio.
        composerFolders: R13_Ben Zwerin(395), R48_Michael Toland(1033),
        R85_Eric Nolan(73), S13_Omar Blyde(501), S20_Bill Maier(265),
        S33_Peter Lobo(7791), S73_Eddie Grey(243), T31_Jared Kahn(27),
        T46_Paul Micca(64), T55_Jeffrey Richardi(51).
        Ran via the normal lot_pipeline.py this time -- yesterday's
        Dropbox stuck-download bug (see LOT_260302_SOHO4_Punta2's closure
        note) did not recur; this lot's folder synced normally.
        One blocker: `S73r1254 SLEEPWALKING And Talking_Dbm` -- second
        occurrence of the "missing underscore" bug first seen on
        LOT_260204_SNAPPED_49 (T09a0674). A space instead of an
        underscore right after the SKU broke the SKU-extraction logic,
        producing "sku_root not in titles" even though S73r1254 is a
        real, correct sku_root (title: "Sleep Walking And Talking").
        Confirmed via a broadened title search (`%leep%alk%`, since the
        folder's own spelling "SLEEPWALKING" as one word didn't match a
        direct title search) before renaming -- found S73r1254 already
        correct. Fixed by inserting the missing underscore only; left
        "SLEEPWALKING" as-is since it normalizes fine against the
        catalogue title.
        work_queue: resolve pending, resolved_by='lot-upload-260310-SOHO4-27'
        (SQL in lot_logs/INTAKE_LOT_260310_SOHO4_27_20260922_083127/).
    [x] INTAKE LOT_260317_SOHO4_28   30 folders / 204 files -- PASS
        CLOSED 2026-09-22. PASS, 204/204 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (whole lot, single run): 204
        rows inserted, 0 ambiguous, 0 titlesWithNoAudio.
        composerFolders: C32_Hugo McLaughlin(78), R13_Ben Zwerin(423),
        R48_Michael Toland(1093), R85_Eric Nolan(82), T46_Paul Micca(71),
        T54_Randall Shattuck(161), T55_Jeffrey Richardi(71).
        No folder-name blockers this lot -- clean dry run start to finish.
        One transient upload hiccup: 3 files failed on attempt 1, all 3
        succeeded on the idempotent retry (attempt 2) -- matches the
        normal expected transient-B2 pattern, nothing new.
        work_queue: resolve pending, resolved_by='lot-upload-260317-SOHO4-28'
        (SQL in lot_logs/INTAKE_LOT_260317_SOHO4_28_20260922_091657/).
    [x] INTAKE LOT_260325_SOHO4_29   30 folders / 192 files -- PASS
        CLOSED 2026-09-22. PASS, 192/192 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (whole lot, single run): 192
        rows inserted, 0 ambiguous, 0 titlesWithNoAudio.
        composerFolders: R48_Michael Toland(1153), S33_Peter Lobo(7803),
        T51_Thomas Hoffman(412).
        No folder-name blockers this lot -- clean dry run start to finish.
        One transient upload hiccup: 2 files failed on attempt 1, both
        succeeded on the idempotent retry (attempt 2) -- same normal
        transient-B2 pattern as the previous lot, nothing new.
        work_queue: resolve pending, resolved_by='lot-upload-260325-SOHO4-29'
        (SQL in lot_logs/INTAKE_LOT_260325_SOHO4_29_20260922_095431/).
    [x] INTAKE LOT_260331_SOHO4_30   30 folders / 192 files -- PASS
        CLOSED 2026-09-22. PASS, 192/192 files verified, 30/30 song folders,
        0 failures, 0 warnings. create-stems (whole lot, single run): 192
        rows inserted, 0 ambiguous, 0 titlesWithNoAudio.
        composerFolders: R13_Ben Zwerin, R48_Michael Toland, S33_Peter
        Lobo, S86_Jeff Miller.
        Hit the same "bucket haus-music not found" B2 auth-token-
        staleness bug as LOT_260217_SOHO4_24 (see that lot's closure
        note and the runbook's "Recurring blockers" section) -- second
        confirmed occurrence this session. Fixed the same known way:
        server restart (re-authorizes with B2 on boot) + re-login +
        `upload_live_only.py` retry, no data loss. Still an unfixed code
        bug in api.js's live-upload bucket lookup (error-swallowing on
        non-2xx B2 responses); worth prioritizing a real fix given this
        is now a recurring, not one-off, issue.
        work_queue: resolve pending, resolved_by='lot-upload-260331-SOHO4-30'
        (manual SQL, not from a lot_logs/ file since this went through
        the manual curl path after the auth-token retry rather than
        lot_pipeline.py end to end).
    [ ] INTAKE LOT_260407_SOHO4_31
    [ ] T28a0823_mrdramatix_Gm_SH        (single song, not a lot)
    [ ] T38_Catchup                      (single song, not a lot)

## Some lots may already be in B2 (found 2026-09-15, lot 251028_SOHO4_12)
upload-lot's dry run for this lot showed uploaded:0, skippedAlreadyThere:154 --
every file was already in the bucket at the right size (confirmed live against
B2's own file listing, not a stale/local check -- and Erik independently played
3 songs back successfully). Cause unknown: possibly an earlier backfill/recovery
script matched these files by composer/song folder path rather than by lot, so
the bytes arrived without the lot ever getting marked done. Implication: check
the upload-lot dry run's uploaded/skippedAlreadyThere counts on EVERY remaining
lot before assuming the usual ~15 minute wait -- some of the 27 may already be
sitting in B2 and just need create-stems + verify-lot to actually close them.

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
