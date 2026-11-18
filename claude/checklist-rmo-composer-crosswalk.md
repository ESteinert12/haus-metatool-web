# Verification checklist: RMO composer-crosswalk migration (before running on production)

Context: `migration_041_rmo_composer_crosswalk.sql` and the composer-resolution scripts
(`resolve_ambiguous.js`, `generate_resolved_additions.js`, `diff_ksl_rmo_live.js`) were
written and tested only against `~/Documents/GitHub/haus-metatool-web` -- per
`claude/standing_rules.md`, this is **not** the real production checkout. The real one
Erik runs is `/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE`. Nothing here has touched
a live DB connection.

- [ ] Confirm the real `rmo` table's composer column name against the actual ATMOSPHERE
      checkout (`information_schema.columns` or `\d rmo` in psql) -- the migration's own
      header flags uncertainty between `name` and `rmo_name`. Do not assume either.
- [ ] Re-run `diff_ksl_rmo_live.js` against the real production Neon DB (it has never
      been run against a live connection -- only written/tested with local JSON).
- [ ] Spot-check a sample of the 2,245 crosswalk rows in the migration against real `rmo`
      rows by title, not just by row count, before running the `UPDATE`.
- [ ] Confirm the 143 "confirmed composers" / 263 "reclassified" / 563 "new RMO titles"
      figures in the handoff doc against the real DB -- those numbers came from the
      non-production clone.
- [ ] Run the migration's `UPDATE` as a dry run first (count affected rows, review a
      sample) before trusting the bulk result, even though it's wrapped in
      `BEGIN`/`COMMIT` with `ADD COLUMN IF NOT EXISTS` (safe to re-run) -- the `UPDATE`
      itself has not been tried against real data.
- [ ] New Postgres calls here should go through `_pgRetry`, not raw `pgPool.query`, per
      the 2026-10-28 standing rule -- check `diff_ksl_rmo_live.js` and any future live
      version of it for this before it's used against production.
- [ ] Review the separate auto-fill feature spec (`Claude outputs/rmo-composer-autofill-feature.md`)
      with Erik before implementing -- it is a spec only, not yet applied to `index.html`.
