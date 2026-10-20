# Handoff — Royalty Tracker build (branch feature/royalty-tracker)

## Status: built in worktree, verified syntactically, NOT yet run against a live DB
Built in `../_wt_royalty_tracker` (branch `feature/royalty-tracker`), per `standing_rules.md`.
`node -c` passes on `api.js` and `royalty-import.js`; all 5 inline `<script>` blocks in `index.html`
extracted and `node -c`'d clean. This session's shell can't reach Neon directly (`DATABASE_URL`
resolves to `127.0.0.1:5432`, connection refused) -- same constraint noted throughout this project's
history -- so **no insert/migration has actually run yet**. Needs a dry run from Erik's terminal
against one real statement before merging to `main`, per the existing process rule.

## What shipped
- **`royalty-import.js`** -- format-sniffing parser for 5 confirmed real PRO statement shapes:
  - `BMI` -- flat CSV, `PERIOD,W OR P,PARTICIPANT NAME,...,ROYALTY AMOUNT,...`. The only format that
    reliably reports a writer-vs-publisher split (`W OR P` column) -- mapped to `payee_role`.
  - `SESAC` -- starts with metadata lines + a literal `SESAC QUARTERLY Royalty Statement` line, then
    `Year,Qtr,Song #,Song Title,...,Earnings`. Same schema covers both the domestic statement
    (`382953.2024-3.csv`) and the international/reciprocal one (`382953.2026-2.csv`, foreign PROs in
    the `Society Abbrv`/`Society Country` columns -- PRS/GEMA/APRA/BUMA/KODA/OSA/SACM/TONO/SCD seen so
    far) -- no schema difference, just different country values in the same file shape.
  - `ASCAP_DOM` -- domestic quarterly distribution, header starts `DistributionYear,Distribution
    Quarter,...`. Earnings = `Dollars` + `Premium Dollars` summed.
  - `ASCAP_FOR` -- ASCAP's own foreign-society pass-through (header starts `File Type,Statement
    Recipient Name,...`, has a `Licensor` column for the collecting foreign PRO). Earnings in the
    single `$ Amount` column.
  - `SOCAN` -- direct Canadian PRO statement, header starts `RIGHTS OWNER,PERFORMER OR SERIES
    (FILM),PRODUCT OR EPISODE TITLE,WORK TITLE,...`. Real amount owed is `PAYMENT DUE` (net, after
    `CONTRACT RATE`) -- **not** `ORIGINAL AMT` (gross, pre-rate, dollar-sign-prefixed). Has two period
    fields that can diverge: `PMT SOCIETY PERIOD` (when SOCAN paid) vs `EARNINGS PERIOD` (when the
    performance happened) -- `meta.period` uses the payment period, consistent with the other formats.
  - Anything else -> `UNKNOWN`, zero lines imported, surfaced to the human. Never a guessed parse.
  - Title matching: `matchLineToTitles()`, same posture as cue sheets' `matchCueToTitles` -- exact
    normalized-title match only, multiple candidates -> `ambiguous`, zero -> `unmatched`, never fuzzy.
- **Schema** (`api.js`, own `try/catch` in `runServerMigrations`): `royalty_statements` +
  `royalty_statement_lines`, with `payee_role` carried through (non-optional on the BMI format,
  null elsewhere since no other confirmed format reports a reliable writer/publisher split per
  line -- don't invent one).
- **Routes**: `/api/royalties/import`, `/import-bulk`, `GET /`, `GET /:id/lines`,
  `POST /lines/:id/confirm`, `GET /title-search` -- 1:1 mirror of `/api/cue-sheets/*`. Manual
  confirm only, same as cue sheets, stronger case here since it's money.
- **UI**: new "Royalties" nav tab, same list -> detail -> search-override pattern as Cue Sheets.

## Offline reconciliation report (already delivered, no DB needed)
Separately, before building the in-app feature, ran all discovered statement files through a
standalone script and wrote `royalty-report-by-song.csv` into Kyle's Downloads folder -- per-song
totals broken out by PRO (BMI / SESAC domestic / SESAC international / ASCAP domestic / ASCAP
foreign / SOCAN), cross-checked against the ASCAP `WorksCatalog.csv` export for registration status.
Current grand total across all 13 real statements found: **$269,418.94** across 6,775 distinct
titles. This was a one-off local report, not wired to the app -- the in-app feature above is the
durable version of the same reconciliation.

## Real sample files now in hand (the earlier handoff doc's top blocker, resolved)
In Kyle's Downloads / "New Folder With Items":
- BMI: `royalty_1158285_20242.csv` (2024 Q2), `royalty_1158285_20243.csv` (2024 Q3)
- SESAC: `382953.2024-3.csv` (domestic, 2024 Q3), `382953.2026-2.csv` (international, 2026 Q2)
- ASCAP domestic: 6 files, 2024 Q4 through 2026 Q1 consecutively
- ASCAP foreign: 5 files, Feb 2025 through Feb 2026
- SOCAN: one statement, paid 4Q19 covering earnings back through 1Q19 (older/back-catalog money)

## Assumptions made on the earlier handoff doc's open questions (flagged for Erik, not Kyle's to guess)
Per Kyle's direction this session ("make reasonable assumptions, flag for Erik"):
- **Scope**: PRO performance royalties only for now. Sync/license fee payments from production
  companies directly are explicitly out of scope for this build -- different source formats and
  cadences, not addressed.
- **"Reconciled" means**: recording what was received per title (and payee, where the format
  reports one) -- NOT yet actively comparing received amounts against an expected amount computed
  from split percentages or a rate. That comparison is a natural next phase once import is trusted,
  not part of this build.
- **Publisher-side tie-in**: `deal_publishers` is NOT wired in yet -- only `team_writers`/`titles` via
  `matched_sku_root`. `payee_role` is carried on every line specifically so a later pass can split
  writer-side vs publisher-side reconciliation without re-deriving it.
- **Access/visibility**: no new permission gate was added. This shows real dollar amounts and
  currently inherits whatever access the rest of the app's routes have -- Erik should decide
  deliberately whether this needs its own scope before merging, per the earlier handoff doc's own flag.

## Before merging to main
1. Dry run from Erik's terminal against one real statement of each of the 5 formats -- eyeball every
   line by hand before trusting a second one (same discipline as the SESAC export verification).
2. Decide the open questions above rather than inheriting the assumptions silently.
3. Decide on access/permissions for a feature that shows real payment amounts.
4. Then: bulk import, then any aggregate reconciliation/reporting view on top (expected vs. received).

## Update: foreseeable data-quality risks reviewed and addressed (same session)
After the initial build, went through likely failure modes and verified several against the real
files rather than assuming:

- **Confirmed non-issues**: BMI's header is byte-identical across both quarters on file. SOCAN's
  `PAYMENT DUE` = `ORIGINAL AMT x CONTRACT RATE` exactly (checked 2,000 rows, zero mismatches) --
  `CONVERSION RATE` is disclosed metadata only, not something to multiply in ourselves. No
  parenthetical-negative or minus-sign amounts found anywhere sampled.
- **Fixed**: `sniffFormat` now validates the full header (exact field names, exact positions) for
  every format instead of 2-3 anchor columns -- a PRO changing their export next quarter now falls
  back to `UNKNOWN` instead of silently misreading the wrong column into the wrong field. Re-verified
  all 16 real files still parse identically after tightening this.
- **Fixed**: dedup is now keyed on `(source, format, period)` parsed from file content, not just
  `source_filename` -- ASCAP's own export tool names files with opaque batch IDs that carry no
  period at all, so a re-download of the same quarter would otherwise get a new filename and
  silently double-count that quarter.
- **Fixed**: BMI's bonus/adjustment columns are now captured as a separate `bonus_amount` column,
  deliberately NOT folded into `amount` -- every real BMI row on file has these at 0.00, so whether
  they're additive or already-included has never been observable. Needs verification (BMI docs or
  Erik) before ever treating this as real money.
- **Fixed**: all 5 parsers now skip blank-title rows (stray subtotal/footer lines).
- **Still open, not fixable without more information**: whether multiple HAUS entities (e.g. SDNYC
  MUSIC #1158285 vs HAUS COLLECTION MUSIK #4395147) ever report overlapping data, and how that
  should reconcile with `deal_publishers`. Also: generic one-word titles ("LOGO", "STING", "BUMPER")
  will produce a lot of `ambiguous` matches at real bulk-import volume -- operational cost of staying
  exact-match-only, not a bug, but worth expecting before running a big batch.

## Update: bulk-confirm for repeated titles within a statement
Confirmed on real data that the same song commonly appears dozens-to-hundreds of times in one
statement (one BMI file: 5,566 of 9,893 distinct title/show/episode combos repeat, each occurrence
a separate per-platform line -- Hulu, Amazon Channels, Apple Channels, etc -- not a duplicate).
Added `sameTitleUnresolvedCount` to `GET /api/royalties/:id/lines` and an `applyToAllInStatement`
flag on `POST /api/royalties/lines/:id/confirm` so resolving a title once can optionally apply to
every other still-unresolved line with that title in the same statement, without touching any line
someone already confirmed/rejected separately. UI shows a "Confirm + N more" button when applicable.

Also regenerated `royalty-report-by-song.csv` with a corrected normTitle (hyphens/underscores now
convert to spaces before stripping punctuation, matching the production parser) -- this merged a
few titles that had been incorrectly split (e.g. "American Pickers-Cues" and "American Pickers
Cues" were two separate rows before, now one at $61,380.05). 6,775 -> 6,770 distinct titles.

## Update 2026-10-20: episode reference import (suggest-only)

Kyle uploaded `episodes.csv`. Profiled it before writing any code:

- It's **not** American-Pickers-only. It's a cross-show master episode list: 1,040 raw rows (977 after blank-title rows are dropped), spanning show-code prefixes AP (American Pickers, 383), SN (Snapped, 125), BOAP (113), ZOO (46), FA (43), ZOOSD, VPR, and ~20 smaller shows. The SN names cross-check against the pre-existing `BMI episode ids.csv` already in Kyle's Downloads (same Snapped victim-name style titles), which corroborates this is a real, maintained reference, not a one-off.
- Verified match quality against real BMI American Pickers statement data (the only way to know if this is useful, not a guess): of 317 distinct `EPISODE NAME` values in the BMI statements, 78.5% matched this file's titles exactly, another ~7% were near-misses where BMI drops a leading "A"/"The" article the episode file keeps, and ~5% were "Best of ..." clip/compilation episodes with no original air date (legitimately unmatchable). Net: ~90% of real, non-compilation episodes match.
- Asked Kyle directly what this file is for, rather than assume: confirmed it's meant to be imported as a maintained reference, used to **suggest** an episode (title/code/air date) for a human to confirm next to a royalty line's show/episode context -- never auto-linked, same posture the title-matching has always had.

Built:
- `royalty-import.js`: `parseEpisodeReferenceFile()`. Handles a real quirk confirmed on the actual file -- it arrives with **CR-only line endings** (no `\n` at all; a plain `.split('\n')` reads the whole file as a single line). Dry-run verified end-to-end against the real file on Kyle's machine: 977 rows, spot-checked "NO STONER LEFT UNTURNED" -> `AP8192`, aired `2016-06-15`, matching the EPISODE NAME seen in real BMI statement data.
- `api.js`: `episode_reference_imports` / `episode_reference` tables (own try/catch, same pattern as every other schema block here). `importEpisodeReference()` replaces a prior import under the same filename rather than erroring or duplicating -- intentionally different from the royalty-statement dedup, because this is a reference list meant to be kept current, not a payment record where a duplicate means double-counted money. Three routes: `POST /api/episode-reference/import`, `GET /api/episode-reference` (status/listing), `GET /api/episode-reference/suggest?title=` (exact-normalized-title lookup, read-only, never writes).
- `index.html`: "Import Episode List" button + status indicator on the Royalties tab header; a "suggest episode" link on each line's show/episode cell that calls the suggest endpoint on click and renders candidates inline. No new write path from the UI -- this is display-only, exactly as scoped.

Not done / still open:
- This is **not wired into the cue-sheet `episodes` table** and deliberately so -- that table's join key (`program`, `episode_num`) has no verified correspondence to this file's `show_code` across all 5 PRO statement formats. Treat these as two separate reference points until someone verifies a real join key.
- Like the rest of this feature, never run against a live DB (cloud environment can't reach Neon). Needs the same dry run from Erik's terminal before merging.
- All 5 `index.html` inline `<script>` blocks and both `.js` files re-verified with `node -c` after this change.

## Update 2026-10-20 (same day): join key between episode_reference and the live `episodes` table

Kyle asked whether episode_reference's show_code already lines up with the keys the live `episodes` table uses. Checked against real artifacts on his machine before writing anything:

- **SESAC cue sheets** (`Cue_Sheet_Details_*.csv`, real files in Downloads) report a clean numeric "Episode Number". Two real examples confirmed exact: Patricia Brown / Episode 3021 / Snapped / 06/20/2021 matches episode_reference's `SN3021` row exactly (title, numeric suffix, air date all line up); Georgina Misener / 3125 / Snapped same result. So for SESAC-sourced shows, `episode_num` **is** the numeric tail of `show_code`.
- **Production "MUSIC FINAL" xlsx cue sheets** -- the American Pickers format, and the dominant show in the royalty money -- are different. `cue-sheet-import.js`'s `parseFormatB()` leaves `episodeNum` blank, so `importOneCueSheet()`'s existing fallback stores the **raw filename stem** as `episode_num` in the live DB (e.g. `"AP12 385 Evel Empire MUSIC FINAL"`), not a clean code. Checked 4 real AP12/AP13 filenames in Kyle's Downloads against episode_reference: no numeric key exists for this format, but the title embedded in the filename matches a reference row exactly every time ("Evel Empire" -> `AP12385`, "Speedway Thrills" -> `AP12390`, "Surf Signs Salvage" -> `AP12392`, "Legendary Find" -> `AP12393`).

Built `suggestEpisodeJoin(episodeNum, referenceRows, program)` in `royalty-import.js`, trying both real strategies and returning which one actually matched:
- `numeric-suffix` -- only when `episode_num` is a bare integer AND the real `episodes.program` value is one of the (so far 2) verified prefixes. **Important guardrail, found before it shipped**: a bare number like `103` matches 11 different shows in the reference list (SN, SBB, ZOOSD, AQUA, TEN, etc. all happen to have an episode 103) -- without a verified program match, this now always returns `ambiguous` with every candidate rather than silently picking one. A wrong pick here misattributes real money.
- `filename-title` -- strips the MUSIC FINAL marker and leading code tokens, matches the remaining title exactly (same posture as every other title match in this pipeline).
- `none` when neither applies -- never a guess.

Verified with real inline unit tests (not against a live DB -- same constraint as everything else here): all 4 real cases above resolve correctly, including the ambiguous case staying ambiguous and the program-disambiguation actually narrowing it down once the program string is given (even with messier real-world punctuation like "Snapped: Behind Bars").

**Explicitly not done / needs Erik:** only 2 of the ~25 show-code prefixes in the reference file have a verified program mapping (`SN`, `SBB`). Every other prefix (`AP`, `BOAP`, `ZOO`, `ZOOSD`, `FA`, `VPR`, ...) needs its own real cue sheet checked the same way before it's added to `VERIFIED_PREFIX_PROGRAMS` -- don't extrapolate the pattern without checking, the ZOO/ZOOSD split alone shows the numbering isn't uniform across shows. This function has never been run against the actual `episodes` table (can't reach Neon from here) -- it's ready for Erik to wire into a real query (`SELECT id, program, episode_num FROM episodes`) and see real match-rate numbers before anything gets built on top of it (a UI, a stored link column, etc).
