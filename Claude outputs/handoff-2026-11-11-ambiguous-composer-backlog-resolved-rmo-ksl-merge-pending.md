# Handoff — 2026-11-11: ambiguous_person composer backlog resolved; RMO/KSL merge still needs Erik + real ATMOSPHERE checkout

Written for Erik. Kyle did all of today's work locally on his iMac clone
(`~/Documents/GitHub/haus-metatool-web`, NOT the real ATMOSPHERE checkout —
see `standing_rules.md`'s "one true checkout" rule). Nothing here has touched
production. This doc is the handoff for whoever actually applies it from the
real checkout.

## What this session did

Picked up the long-running KSL→RMO enrichment project (MusicBrainz discography
seeding + TMDB film-composer seeding, both covered in earlier handoffs) and
went after the 407-name `ambiguous_person` backlog left over from the
original TMDB composer pass (`rmo_ksl_seed_report.json`).

**Root cause found and fixed:** the original resolution rule
`top.popularity >= Math.max(3 * second.popularity, 1)` had a hard floor of
1.0 — real TMDB popularity scores for anyone but a current A-lister are
almost always well under 1.0, so the floor silently blocked auto-resolution
almost every time, regardless of how lopsided the real margin was
(Alexandre Desplat: 0.95 vs 0.01, a 95x gap, still failed the `>=1` check).
**This bug lives in whatever script originally produced `rmo_ksl_seed_report.json`
— it is not fixed at the source, only worked around for this one pass via
`resolve_ambiguous.js`'s Pass A. If that original script is ever re-run from
scratch, this bug will recur.** Worth fixing at the source before the next
full re-run.

**Important correction caught by Kyle mid-session:** a first pass at fixing
this just trusted whichever candidate was dominant by popularity, without
checking whether that person actually had a real `Original Music Composer`
credit on TMDB. That flagged 118 names (Billy Joel, Chuck Berry, Dean Martin,
Buddy Guy, Charlie Parker, etc. — real, famous musicians) as "resolved
composers" when none of them have ever actually scored a film. Caught before
anything was merged; corrected by requiring an actual confirmed composer
credit (not just popularity dominance) for every resolution.

### Final breakdown of the 407 `ambiguous_person` names
- **143 genuine composers**, each confirmed via a real `Original Music
  Composer` job credit on TMDB (99 via the popularity-floor fix + credit
  verification, 40 via a dedicated Sound-department + credit check, 4 via a
  manual credit-count tiebreak — David Holmes, David Schwartz, John
  Williams, Steve Reich, each with 7-129 credits vs. a same-named
  candidate's 1 incidental credit)
- **263 correctly reclassified as "matched a real person, not a composer"**
  (118 popularity false-positives + 145 that already had no plausible
  composer candidate at all)
- **1 (Yanni) still unresolved** — fell through silently during a batch run
  for a reason never root-caused (not a network issue; happened even on a
  clean run). Needs either a fresh look or just re-running
  `resolve_ambiguous.js` again, which is resumable and will pick him up
  automatically. Low priority — Yanni's a working musician either way and
  is already covered by the separate MusicBrainz/music pass regardless of
  his film-composer status.

### RMO titles produced
Ran all 143 confirmed composers' filmographies through the same top-10-by-
vote-count selection the original composer pass used, then applied a
`vote_count >= 10` floor (same rationale as the existing pipeline, just
made explicit) to drop concert films/live specials/obscure foreign titles.
Net: **563 new RMO titles**, from **109 of the 143 composers** (the other
34 had real but entirely sub-threshold filmographies).

**This has already been merged into Kyle's local `rmo_clean_names.json`**
(2,620 → 3,183 titles), via a careful read-fresh-then-write script to avoid
racing the separately-running MusicBrainz background pass that also writes
to that same file. **It has NOT been merged into production.**

## Files (all in Kyle's `~/Documents/GitHub/haus-metatool-web`, NOT git-tracked — `*.json` is gitignored repo-wide)

- `rmo_clean_names.json` — 3,183 titles, includes the 563 above (already merged)
- `ksl_clean_names.json` — unchanged this session from the prior game-composer pass (2,803 names)
- `ambiguous_resolution_report.json` — full per-name outcome for all 407
- `ambiguous_newly_resolved.json` — the 143 resolved identities + their confirmed composer credits
- `ambiguous_still_unresolved.json` — the 263 reclassified + Yanni
- `ambiguous_resolved_additions_FINAL.json` — the 563 titles actually merged, in the same schema as `rmo_ksl_seed_additions.json` (`name`, `content_type`, `reference_artist`, `year`, `vote_count`, `tmdb_id`, `added_via_ksl`, `resolution_source`)
- `genuinely_resolved_composers.json` / `floor_bug_false_positives.json` — the clean 143-name and 118-name lists, for reference

Three new scripts ARE git-trackable (untracked but not gitignored — Kyle can
`git add`/commit/push these if useful): `resolve_ambiguous.js`,
`generate_resolved_additions.js`, `diff_ksl_rmo_live.js`. The JSON data
files above are NOT in git at all — getting them to Erik/production needs a
direct file hand-off (chat/AirDrop/etc.), not a git pull.

## Open item: getting this into production

This is where the session ran into the checkout confusion. Kyle's iMac
clone has an **empty `DATABASE_URL`** in its `.env` (confirmed down to the
raw byte level — the line is genuinely `DATABASE_URL=` with nothing after
it, not a tooling quirk). Per `standing_rules.md`, this clone was never the
production checkout anyway, so that's probably expected and not a new
problem — just surfaced here for the first time this project.

**Also found, and this needs verifying against the REAL ATMOSPHERE checkout
before anyone runs SQL from it:** Kyle's clone's `migration_025_core_schema.sql`
says the `rmo` table's column is `name`, but `api.js` (~line 736) and the
live insert code in `index.html`'s `addIntakeTagNew` both show production
was hand-altered on 2026-09-03 to actually use `rmo_name` — a drift that
was never written back into a migration file. The real, currently-used
shape (per the app's own live insert code) is:
```sql
INSERT INTO ksl (ksl_name) VALUES ($1) ON CONFLICT (ksl_name) DO NOTHING
INSERT INTO rmo (rmo_name) VALUES ($1) ON CONFLICT (rmo_name) DO NOTHING
```
**Don't trust this blindly either** — it was derived from Kyle's
non-production clone, which per the standing rule can itself have
diverged from the real ATMOSPHERE checkout. Re-confirm the actual live
column names from the real checkout (or just test one insert) before
running anything in bulk.

**Suggested next step:** a read-only diff script (`diff_ksl_rmo_live.js`,
already written, untested against a real DB connection) that pulls the
live `ksl_name`/`rmo_name` values and diffs them against the local JSON
files, so we know exactly what's actually new vs. what production may
already have picked up independently (e.g. via the live intake form, since
`addIntakeTagNew` lets any user add new tags directly). This should be run
from the real ATMOSPHERE checkout, by whoever has that `DATABASE_URL`, with
the column names reconfirmed first. Only after that diff is reviewed should
anything be inserted.

## Also still running
Kyle's separate MusicBrainz-based music pass (`rmo_seed_from_ksl_music.js`,
covered in earlier handoffs) was still actively running in his own terminal
throughout this session (last confirmed alive at 641/2,448 artists). It
writes to the same `rmo_clean_names.json` — unaffected by anything above,
and will keep adding real musician discography titles as it continues.

## Not yet decided
Whether to retroactively apply the same `vote_count >= 10` floor to the
original 1,682 titles from the first composer pass (merged earlier,
pre-dates this session) — some of those are below-5-vote concert
films/specials too. Flagged to Kyle, not yet actioned either way.
