# Engineering Notes — HAUS Workspace

Current as of the most recent handoff (`HANDOFF_2026-09-22.md`). Older docs (`PHASE_A/B/C_*`, `INTAKE_*`, `SECURITY_PATCHES.md`, `CODE_REVIEW_FINDINGS.md`, `B2SERVICE_ARCHITECTURE.md`, etc., all dated 2026-09-08) cover earlier work and are superseded where they conflict with this file.

## Live in production right now

- `feature/ebr-export`'s EBR commit (`fb0a10d`) is merged to `main` and pushed (`65bad60`). Not yet clicked through live by a human.
- `/api/pg/query` was restored, gated to admin-only login (`4c9a545`). This is a stopgap, not a real fix — `pgQ()` is called from 371+ sites in `index.html`, so it's still "any logged-in admin can run any SQL," not a properly scoped API. A real replacement (purpose-built endpoints per feature) is future work, not yet scoped.
- Server restarted on current `main` for the first time since before 2026-09-15. Needed `npm install`, a fresh `.env` (new `SESSION_SECRET`, `DATABASE_URL` recovered from `~/.haus-workspace-cfg.json`), and killing a stale process on port 9999.
- Confirmed live: Neon Postgres connection, catalog, EBR sidebar entry.
- **Needs a decision:** the Client Portal's backend tables self-migrated into existence on this restart, so `client-portal.html` is now reachable by any client who finds it — whether or not that was the intended launch moment. Consider gating it (e.g. a `portal_enabled` flag per client) until tested end-to-end.

## Down, on purpose

- **B2 storage** — no recoverable `B2_APP_KEY_ID` / `B2_APP_KEY`. Exhaustive search of the repo turned up nothing. Intake/staging is down until Erik provides real credentials or a fresh key pair is generated from the Backblaze dashboard. Everything else (catalog, EBR, portal, Postgres features) is unaffected.
- **Dropbox** — `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REFRESH_TOKEN` are empty in `.env`. Impact not yet investigated (likely intake staging, alongside B2).

## Unmerged on `feature/ebr-export`

- `67c7192` — Artist Portal work + a `detectStemName()` fix.
- `a8738b0` — an fs-blocking fix, unrelated to EBR or the Artist Portal.
- A `mix_stems` collision-check SQL query was written but never run (DB access wasn't live at the time). It's runnable now via `/api/pg/query` — run it before any further Artist Portal work, to confirm whether the collision case it checks for exists in live data.

## Housekeeping

- `kyle`'s account is still on the published default password. Fix: `node scripts/set-password.js kyle`.
- The live Neon `DATABASE_URL` (full connection string, with password) got pasted into a chat session to get the server running — worth rotating that password since it's sitting outside normal secret storage.
- `server.js` (a dead, older 78KB Express entry point, not run by `npm start`) is still in the repo. It's a real security liability if ever run by mistake — its `PUBLIC_ROUTES` include unauthenticated `/pg/query`, `/fs/read-file`, `/fs/write-file`, `/shell/open-external`, `/b2/authorize`, and it serves the whole repo via `express.static(__dirname)`. Undecided: delete it or clearly quarantine it.
- The device-bridge connection to Erik's machine dropped intermittently all last session, no pattern found, never diagnosed — worth a dedicated session if it recurs.

## Suggested order for next session

1. Get B2 credentials — restores intake, the thing Erik cares about most.
2. Human click-through of EBR's Export and Acknowledgments/Fix-It tabs with a real login.
3. Run the `mix_stems` collision-check query now that DB access works.
4. Decide Client Portal go-live status and `server.js` disposition — both are decisions, no investigation needed.
5. Fix kyle's password — one command.
6. Everything else (Dropbox investigation, Neon rotation, the real `/api/pg/query` replacement, the two remaining `feature/ebr-export` commits) can wait for a dedicated session.
