# Handoff for Erik — Royalty Tracker (branch `feature/royalty-tracker`)

## TL;DR — what I need from you
1. `git fetch && git checkout feature/royalty-tracker` (9 commits on top of `main`, not yet merged, not yet pushed as of this writing — see "Getting this to you" below).
2. Run it against a real Neon connection and watch the startup log for `✅ royalty tracker tables ready` and `✅ episode reference tables ready` with no `[schema]` warning after either line (same thing you checked for the cue-sheet merge on 10/14).
3. Dry-run one real import of each of the 5 statement formats (sample files are in Kyle's Downloads — see below) and eyeball every line by hand before trusting a second one.
4. Decide the open questions in "Decisions needed from you" below — I made reasonable assumptions per Kyle's direction so the build wasn't blocked, but none of them are mine to decide permanently.
5. Nothing in this branch has ever touched a live database. Neither my cloud environment nor Kyle's local shell can reach Neon directly — same structural limit as every past handoff. This is the first real test it's getting.

## Getting this to you
This was built in a worktree on Kyle's machine (`../_wt_royalty_tracker` off his `haus-metatool-web` clone, per `standing_rules.md`). It is **not yet pushed to GitHub** — the automated shell I used has no git credentials configured (no credential helper, no SSH key, no token), so `git push` fails outright. Kyle needs to run this from his own Terminal (where his GitHub login actually works):

```
cd ~/Documents/GitHub/_wt_royalty_tracker
git push -u origin feature/royalty-tracker
```

Once that's up, open a PR or hand you the branch name — whichever you two normally do.

## What this is
Ingests real PRO royalty *payment* statements (BMI/SESAC/ASCAP/SOCAN) and matches each line against the titles catalog, plus a separate import for Kyle's own maintained cross-show episode reference list. Distinct from EBR export (sends registration data out, no money) and cue-sheet verification (reconciles aired-vs-catalog, no money) — this is the one with real financial consequences if it's wrong, so everything below defaults to "surface for a human to confirm" rather than auto-anything.

## What shipped

**`royalty-import.js`** — format-sniffing parser, 5 confirmed real statement shapes (BMI, SESAC domestic+international, ASCAP domestic, ASCAP foreign, SOCAN). Anything that doesn't match a known real header exactly comes back `UNKNOWN` with zero lines imported — never a guessed parse. Title matching is exact-normalized-match only (reused from `cue-sheet-import.js`'s `normTitle`), same posture as `matchCueToTitles` — multiple candidates → `ambiguous`, zero → `unmatched`, never fuzzy.

**Schema** (`api.js`, own `try/catch` blocks in `runServerMigrations`, same pattern as everything else here):
- `royalty_statements` / `royalty_statement_lines` — the payment data itself.
- `episode_reference_imports` / `episode_reference` — Kyle's episode title/code/air-date master list (1,040 rows, cross-show: American Pickers, Snapped, and ~20 smaller shows).

**Routes**: `/api/royalties/{import,import-bulk,:id/lines,title-search}`, `/api/royalties/lines/:id/confirm` (manual confirm only, with an `applyToAllInStatement` flag — see below), `/api/episode-reference/{import,suggest}`. All 1:1 in spirit with the existing `/api/cue-sheets/*` routes.

**UI**: new "Royalties" tab (list → detail → search-override, same pattern as Cue Sheets), plus an "Import Episode List" button and a per-line "suggest episode" lookup.

**Offline report** (already delivered to Kyle, no DB involved): a one-off script cross-checked all statement files found and wrote `royalty-report-by-song.csv` to his Downloads — 6,770 distinct titles, $269,418.59 total across everything on file. This was just to get Kyle something usable immediately; the in-app feature above is the durable version.

## Data-quality issues found and fixed before they could bite
- `sniffFormat` validates the **full header**, every field in exact position, not just 2-3 anchor columns — a PRO changing their export format now falls back to `UNKNOWN` instead of silently misreading a column.
- Dedup keys on `(source, format, period)` parsed from file content, not filename — ASCAP's own export tool uses opaque batch-ID filenames with no period embedded, so filename-only dedup would've let the same quarter get imported twice under a new filename.
- BMI's bonus/adjustment columns are captured separately (`bonus_amount`), deliberately **not** folded into `amount` — every real row on file has these at 0.00, so whether they're additive or already-included has never been observable. **Needs your judgment or BMI's docs before this is ever treated as real money.**
- The same song commonly repeats dozens-to-hundreds of times in one statement (confirmed: one BMI file had 5,566 of 9,893 title/show/episode combos repeat — each a separate per-platform line, not a duplicate). Added a "Confirm + N more" bulk-apply so resolving one occurrence can apply to every other unresolved line with the same title in that statement, without touching anything already confirmed/rejected separately.
- All 5 parsers skip blank-title rows (stray subtotal/footer lines).

## Episode join key — confirmed real patterns, incomplete coverage
Kyle asked whether his episode reference list's `show_code` lines up with the live `episodes` table's `episode_num`. Checked against real cue sheets and filenames on his machine (not guessed):
- **SESAC-sourced shows** (Snapped, Snapped: Behind Bars confirmed): `episode_num` in the live table is a clean integer that **is** the numeric tail of `show_code` (e.g. cue sheet Episode Number 3021 for Snapped ↔ reference row `SN3021`). Verified on 2 real cue sheets.
- **American Pickers** (the "MUSIC FINAL" xlsx format, and the dominant show by royalty volume): `parseFormatB()` in `cue-sheet-import.js` currently leaves `episodeNum` blank, so the live `episodes` table ends up storing the **raw filename** as `episode_num`. Kyle confirmed the real SKU grammar directly (`AP` + season + 3-digit episode, no separator, e.g. `AP10314` = season 10 episode 314) — verified against all 23 real "MUSIC FINAL" filenames on file and the full reference dataset (clean season range 7–13 across 258 codes). `suggestEpisodeJoin()` now reconstructs this code directly from the filename rather than fuzzy-matching a title.
- A real false-positive risk was caught and fixed before shipping: a bare episode number like `103` matches 11 *different* shows in the reference list. The numeric-match path now requires the real `episodes.program` value to narrow to a specific, pre-verified show before returning a confident match — otherwise it returns `ambiguous` with every candidate.
- **Coverage gap**: only 2 of ~25 show-code prefixes (`SN`, `SBB`) plus American Pickers (via the SKU grammar) have a verified join strategy. Every other show (Best of American Pickers, The Zoo and its San Diego spinoff, Forged in Fire, Vanderpump Rules, ~20 more) returns `ambiguous`/`none` until someone checks a real cue sheet for that show the same way — don't extrapolate the pattern, the ZOO/ZOOSD split alone shows numbering isn't uniform across shows.
- `suggestEpisodeJoin()` is unit-tested against every real case above but **has never been run against the live `episodes` table** — it's ready for you to wire into a real query (`SELECT id, program, episode_num FROM episodes`) and see actual match-rate numbers before anything gets built on top of it.
- A recommendation, not implemented here since it touches your already-shipped `parseFormatB()`: since the AP filename grammar is now confirmed, that parser could derive a clean `episode_num` directly at import time going forward, instead of falling back to the raw filename. Separate, more careful change — your call. A backfill of existing historical rows would be a further, separate decision.
- Left alone on purpose: the "SFP" short-form-promo filename variant (e.g. `AP12 SFP 403_32_Smokin Find_FINAL MUSIC.xlsx`) has a second number that doesn't correspond to anything in the reference list — whether a promo clip should link to the same episode row as the full episode is a product question, not a parsing one.

## Decisions needed from you (flagged, not decided)
- **Scope**: this only handles PRO performance royalties. Sync/license payments from production companies directly are out of scope — different formats, zero sample files, not addressed at all.
- **What "reconciled" means**: right now this only records what was *received* per title/payee. It does not yet compare that against an *expected* amount from split percentages — that's a natural next phase, not part of this build.
- **Publisher-side tie-in**: `deal_publishers` isn't wired in. `payee_role` (writer/publisher, reliable only on BMI) is carried on every line specifically so a later pass can split writer-side vs. publisher-side reconciliation without re-deriving it.
- **Access/permissions**: no new gate was added. This shows real dollar amounts and currently inherits whatever access the rest of the app has — worth a deliberate decision before this is live for everyone who can log in.
- **Episode join scope**: how far to extend `VERIFIED_PREFIX_PROGRAMS` beyond Snapped/Snapped: Behind Bars, and whether SFP promo clips should link to their parent episode.

## Also noticed, not fixed
The `season` column inside Kyle's `episodes.csv` reference file doesn't match the season embedded in the show_code itself — looks like it's tracking something else (a production/calendar block, maybe). Worth asking whoever maintains that file; not something I could resolve from here.

---
*Full session-by-session build log (every commit, every real-data check, in chronological order) is in `Claude outputs/handoff-2026-10-14-royalty-tracker-build.md` in this branch, if you want the blow-by-blow instead of this summary.*
