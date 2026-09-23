# Merge review — ATMOSPHERE ⨯ GitHub main — 2026-09-23

Branch: `reconcile/atmosphere-main`, built on ATMOSPHERE (the live production checkout at `/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE`). Merge commit: `8ec3a1d`. **Nothing has been pushed to GitHub and the live server has not been touched or restarted.** This is purely a branch sitting in ATMOSPHERE's own git history, ready for your review.

## Why this was needed

ATMOSPHERE and the `haus-metatool-web` GitHub repo's `main` branch had silently diverged from a common ancestor (`69518c8`) into two independently-developed lines — not one simply "ahead" of the other:

- **ATMOSPHERE-only** (7 commits): the Lot Migration gate / Needs Eyeballs view, Finish Queue fixes, a `detectStemName` bug fix, B2 stem-row/stream fixes, a corrections/roles fix, and — captured just before this merge, in commit `e66718a` — uncommitted production hotfixes for two real incidents (queries hanging forever under Postgres pool exhaustion; songs saving with silently-blank genre/mood tags).
- **`main`-only** (17+ commits): a security-hardening pass (closing an unauthenticated file-write hole, removing hardcoded Neon passwords from ~55 one-off scripts, deleting unused endpoints), the Client Portal build, non-blocking toasts and a real sign-out, and this week's EBR export feature plus the admin-gated `/api/pg/query` restore.

Both lines have real, needed work. This merge combines them.

## The 5 manually-resolved conflicts

**`api.js` — auth architecture.** Took `main`'s hardened model wholesale: `PUBLIC_ROUTES` is now method-qualified (`'POST /auth/login'` not just `/auth/login`), there's a separate `ADMIN_ROUTES` list enforced by `req.session.user.role === 'admin'`, and Client Portal logins get their own `PORTAL_PUBLIC_ROUTES` so a portal login can never satisfy the admin guard or vice versa. ATMOSPHERE's version — what's actually live right now — still allowed **unauthenticated** access to `/fs/read-file`, `/fs/write-file`, `/pg/connect` (repoints the DB connection), `/shell/open-external`, and several `/b2/*` routes. That's a real, currently-live exposure this merge closes.

**`api.js` — login.** `main` upgraded to per-row-salted password verification (fetch by username, verify in app code, transparent scrypt upgrade on legacy hashes) — the rest of the merged file already depends on this (`role`, `must_change_password` fields). ATMOSPHERE's version still compared the hash directly in SQL, the older scheme. Took `main`'s query logic but kept ATMOSPHERE's `_pgRetry` wrapper around it, since that's the actual fix for the Sept 17–18 hanging-connection incident.

**`api.js` — Neon connection string.** Both sides independently removed the same hardcoded password from source at different times; functionally identical, kept `main`'s version/comment for consistency with the rest of the file.

**`package.json`.** Union of both sides' real dependencies — `b2`, `wavefile`, `essentia.js`, `backbone` from ATMOSPHERE, `xlsx` from `main` (needed by EBR). Regenerated `package-lock.json` from the merged file.

**`sku-audit.js`.** ATMOSPHERE's copy had a hardcoded Neon connection string with password `npg_VWPl7U3kYwJb` — **a different password than the one currently in `.env`** (`npg_t3BId4cOUzlG`). That means there are at least two real Neon credentials that have been sitting in plaintext at some point; worth checking with Neon which are still active and rotating what needs rotating. Took `main`'s `process.env.DATABASE_URL` version.

**`index.html` — 4 conflicts, mixed resolution:**
- `detectStemName()`: kept ATMOSPHERE's version entirely. Its own comment documents a measured, real bug in the exact logic `main` still has — an unrecognized filename token silently became `'FULL'`, mislabeling ~275 real tracks over the catalog's life. `main`'s version still ends with `return 'FULL'` as its fallback.
- `showMoveLotModal()`: kept ATMOSPHERE's version, which filters to active, non-full lots — explicitly so it matches the intake "Choose Lot" picker's rule ("so the two pickers cannot disagree"). `main`'s version loads all 200 most-recent lots with no filter at all.
- `submitCreateLot()`: kept ATMOSPHERE's version. This one wasn't a style choice — code later in the same function (on both sides) references a `chosenProject` variable that only ATMOSPHERE's side defines. Taking `main`'s side alone would have thrown a `ReferenceError` on every lot creation.
- AVID comment export: merged both — kept ATMOSPHERE's distinction between "the query actually failed" vs. "the lot legitimately has no tracks" (two different messages), but switched from blocking `alert()` to `main`'s non-blocking `toast()`.

## What else came along automatically (~70 files, no conflicts)

Git auto-merged the rest cleanly — mostly `main`'s removal of hardcoded Neon credentials from dozens of one-off scripts (`db-cleanup.js`, `migrate-to-neon.js`, and similar), plus bringing in EBR, the Client Portal (`client-portal.html`), `main.js`/`preload.js` updates, and three new scripts (`scripts/set-password.js`, `scripts/set-portal-password.js`, `scripts/test-fs-guard.js`) — all legitimate, reviewed briefly, no concerns.

**One thing worth a deliberate decision, not a silent accept: `server.js` is now present in ATMOSPHERE for the first time.** It's not run by `npm start` (`package.json`'s `start` script is `node api.js`), but the file itself is exactly as dangerous as flagged in an earlier session: its own `PUBLIC_ROUTES` list includes unauthenticated `/pg/query` (raw SQL, no login required at all), `/fs/read-file`, `/fs/write-file`, `/shell/open-external`, `/b2/authorize`, and it serves the **entire repo directory** as static files via `express.static(__dirname)`. It sitting in the folder is a landmine if anyone ever runs it by mistake. Recommend deleting it now that this merge exists, rather than carrying it forward again.

## Verification done so far

- No leftover conflict markers anywhere (`grep` swept all 5 manually-resolved files, clean).
- `node --check` syntax-validated `api.js` and every other `.js` file the merge touched — all pass.
- `npm install --package-lock-only` ran clean against the merged `package.json`.

## Verification NOT done yet — needs you or a real run

- **Never actually started.** This merged code has not been run with `npm start`. Before it goes anywhere near port 9999, it needs a real boot (ideally on a spare port first) and a human click-through: login, catalog, intake, EBR, Client Portal, Lot Migration/Needs Eyeballs, and stem detection on a real file.
- The ~70 auto-merged files were spot-checked (three new scripts, `server.js`) but not individually audited line-by-line — they're the well-understood output of `main`'s known security commit, but "well-understood" isn't the same as "verified."
- Not pushed to GitHub, not merged to ATMOSPHERE's own `main` branch locally, and not deployed. All still separate, deliberate next steps once you've reviewed this.

## Suggested next steps, in order

1. You review this document and the actual diff (`git diff 002cd1d..8ec3a1d` in the `haus-metatool-web`/ATMOSPHERE repo, on branch `reconcile/atmosphere-main`).
2. Delete `server.js` from the merged branch.
3. Check the two Neon passwords (`.env`'s and the one found in `sku-audit.js`) with Neon and rotate whatever's still live.
4. `npm start` the merged branch on a spare port (not 9999) and click through the core flows.
5. Once you're satisfied, merge `reconcile/atmosphere-main` into ATMOSPHERE's local `main`, push to GitHub, and only then plan the actual production restart — with a clear moment to point the tunnel/process at whichever folder you want to be "the" one going forward.
