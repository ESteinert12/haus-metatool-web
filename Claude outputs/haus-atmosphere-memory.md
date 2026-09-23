# HAUS Music Library / ATMOSPHERE — Project Memory

_HAUS Music Library / ATMOSPHERE project — business context, app architecture, DB schema, and build status for the HAUS Workspace Electron app._

## People
- Erik Steinert — CEO/owner, primary user. Email erik@hausmusic.com. HAUS is effectively a two-person shop (Erik + Kyle); Erik is the single point of contact for every client — there is no per-client rep assignment to manage or build UI around.
- Kyle Frisch (this user) — business partner, data/operations, shares Claude subscription
- Christos — tech advisor (IBM background), recommended PostgreSQL migration away from FileMaker
- Donna — Erik's wife, involved in the business
- Axel Niehaus — team member (composer/sales), axel@hausmusic.com
- Jake Atherton — former team member, went quiet, jake@hausmusic.com
- Sam Campoli — team member, sam@hausmusic.com

## Working style (Erik)
- Direct, no fluff; dislikes being asked questions Claude should figure out from project files
- No emojis, no eager-to-please tone
- Prefers Claude checks files/state before asking
- Responds well to concise status + next-step format

## The business
- HAUS Music — production/library music company, ~32,523 songs in catalog (HAUS + JUP)
- Revenue model: sync licensing to TV/film production companies (Bravo, Snapped, She-Hulk, etc.)
- Currently paying ~$20K/year on FileMaker + SourceAudio; plan is to replace both
- SlipStream has expressed acquisition interest; Erik is not ready to sell
- Key clients: Bravo, Snapped, She-Hulk, Southern Hospitality, Peloton (prospect)

## The app — HAUS Workspace (Electron)
- App path: `/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app`, source under `Contents/Resources/haus-workspace/` (main.js, preload.js, index.html, producer.html, package.json)
- Repo: `haus-metatool-web` on GitHub, working copy at `/Users/kyle/Documents/GitHub/haus-metatool-web` on Kyle's iMac (reached via device bridge). Server is `api.js` (Express + `pg` against Neon Postgres in prod, local Postgres per the block below for dev).
- Terminology: Producer = client/licensee; Artist = composer (has ComposerID like R13a)
- Three portals: Admin (index.html, Erik & Kyle only), Client Portal (**client-portal.html — new file, built 2026-09-15, see section below**; producer.html is a different, unrelated internal tool — see note below), Artist Portal (not built yet)
- Admin sections: Today, Email, Slack, Schedule (Daylite stub), Catalog (Postgres→FileMaker→file scan fallback, CSV export), Intake (4-step auto-scan wizard), Files (two-pane), Assignments (kanban), Contacts (Daylite stub), Deals/Finances (hardcoded sample data), Settings (Postgres connection)
- **`producer.html` is NOT the client portal** despite the name — corrected 2026-09-15. It's an internal tool for composers/editors: tabs for Assignments/Playlists/Ideas, hardcoded mock data (`CATALOG_TRACKS`, `PLAYLISTS`, `IDEAS`), `currentUser` options are composer/editor IDs (R13a, R48a, R03b, ED01, ED02). Left untouched. The real external-facing client portal was built as a brand-new file instead (`client-portal.html`) rather than repurposing producer.html.

## Database
- Postgres 18 (EDB installer, not Homebrew); binary `/Library/PostgreSQL/18/bin/psql`
- Start: `sudo /Library/PostgreSQL/18/bin/pg_ctl start -D /Library/PostgreSQL/18/data`
- Connection: `postgresql://postgres:postgres123@localhost:5432/haus_music`, db name `haus_music` (local dev only — production uses Neon via `DATABASE_URL` env var, see Security section)
- pg npm driver must be installed inside haus-workspace/
- Setup script: `bash setup_haus_db.sh` from ATMOSPHERE folder — WARNING: uses `brew services start postgresql@18`, which is wrong for EDB installs; needs fixing before fresh-install use

### Real schema (confirmed via psql, June 2026 — supersedes migration assumptions)
- **titles**: sku_root VARCHAR PK (format `{composerId}{seq}`, e.g. R13a001); lot_id/composer_id FK; variant char(1) default 'a'; title (unique), key, bpm, next_file_number_used; primary_genre_id/secondary_genre_id FK; mood, tempo_category, mood_1_id, mood_2_id, ksl_id, ksl_ids; pd, locked; is_jup boolean exists (migration_023) but app doesn't use it for intake logic. No title_id serial, team_id, genre text, sku column, or ksl/mmw text columns.
- **mix_stems**: mix_stem_id serial PK, sku_root FK, stem_name (FULL/ALT/BUMPER/STING/STINGa/DNB/NoDNB), filename, timestamps. No version or title_id column.
- **pro_registrations**: registration_id PK, mix_stem_id FK (per stem not per title), pro_name, status, timestamps.
- **lots**: lot_id, lot_name, client, song_count, status, timestamps. No lot_type column.
- **composers** (migration_021): composer_id VARCHAR(10) PK (e.g. R13a), first/last/full name, ipi_number, location, middle_name, pro, date_added, status, notes, is_jup boolean (source of truth for JUP status). Seeded composers include R04 Tim O'Kane, R09 Zach McNees, R15 Kari Steinert, R25 Sean Hagon (is_jup=true).
- **primary_genres**: primary_genre_id, primary_genre_name (uppercase), created_at.
- **moods** (69 pre-seeded), **title_moods** junction, **rmo** (626 TV/movie names), **title_rmo** junction.
- `sourceaudio_uploads` table exists (migration_025) but unused by the app. No `teams` table used in intake — JUP toggle defaults from composers.is_jup but is manually overrideable per track in the UI.

### Client Portal tables (added 2026-09-15, self-migrating via `runServerMigrations()` in api.js — `CREATE TABLE IF NOT EXISTS`, no separate migration_*.sql file)
- **portal_users**: portal_user_id PK, client_id FK → clients, email, display_name, password_hash (scrypt, same format as haus_users), must_change_password boolean.
- **clients** (pre-existing table, reused rather than duplicated) gained `portal_enabled BOOLEAN` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. **Note:** an earlier draft also added a `haus_rep TEXT` column to `clients`, but that was removed — Erik is hardcoded as the sole rep (`const HAUS_REP = 'Erik Steinert'` in api.js) rather than stored per-client, per Kyle's explicit decision that HAUS doesn't do per-client rep assignment.
- **briefs**: brief_id, client_id, title, description, mood_tags (array), budget_type, due_date, status (draft/active/delivered), created_by, created_at.
- **pitches**: pitch_id, client_id, brief_id, sku_root FK → titles, rep_note, status (pending/approved/passed), created_at, responded_at.
- **licenses**: license_id, client_id, sku_root FK → titles, brief_id, license_type, formats, expires_at, created_at.
- **portal_messages**: message_id, client_id, sender_type (portal_user/haus_rep), sender_id, sender_name, body, created_at, read_at.
- **portal_playlists** / **portal_playlist_tracks**: playlist_id/name/share_token/created_by/created_at; junction table with sort_order. **Client-owned and editable** (not rep-curated) — clients can create/delete playlists and add/remove tracks from the full catalog via the Library tab, per Kyle's explicit decision (see Client Portal section below).
- Session identity: `req.session.portalUser` (separate from admin `req.session.user`), guarded by a `PORTAL_PUBLIC_ROUTES` array + `req.path.startsWith('/portal/')` branch in the `/api` middleware, scoped to `client_id` on every query so one client can never see another's data.
- Provisioning: `scripts/set-portal-password.js <client-id-or-fm-pk> <email> ["Display Name"]` — CLI script mirroring the existing `scripts/set-password.js`, sets `portal_enabled=true` and inserts/updates the `portal_users` row with `must_change_password=true`.
- **Not yet integration-tested** — no reachable database from the cloud sandbox this session, so all portal backend code is syntax-checked (`node --check`) and logically reviewed only, not run against a live DB.

## Metadata fields
- Genre, Sub-genre, Moods (multi, lookup table), Key, BPM, Tempo
- KSL = Kinda Sounds Like (free text), MMW = Makes Me Wanna (free text), RMO = Reminds Me Of (626 shows/movies, lookup) — all three coexist, none replaced

## File naming
- Standard: `HAUS_TitleCamelCase_Key_ComposerID_VERSION.ext`; JUP: `HAUSJUP_...`
- Versions: FULL, ALT, BUMPER, STING, STINGa, DNB, NoDNB, PERC, LOOP, INTRO, OUTRO, etc.
- Key: major = letter only (E, G); minor = letter+m (Fm, Cm)
- Intake drop naming: `{ComposerID}_{Track Title}_{AlbumCode}` (e.g. R23a_Fuck A Duck_MYSTERY); after SKU assigned: `{skuRoot}_{Track Title}_{AlbumCode}`
- ComposerID regex: `^([A-Z]\d{2}[a-z])`; AlbumCode = last `_`-segment; title = everything between first and last `_`
- Auto-parsed in `scanStaging()` via `parseFolderName()`

## JUP system
- JUP = Jupiter, special co-publishing arrangement; pub split locked HAUS 25% / Production Company 25% / Writer 50%
- Production companies: Code Blue Cues (ASCAP, IPI 815607148), Undercover Blues (BMI), Beat Street Cues (SESAC)
- Same intake flow; is_jup defaults from composers.is_jup, per-track override toggle in UI
- `buildHausName` outputs HAUSJUP_ prefix when toggle on, HAUS_ when off

## Archive system
- HTOR = Cumulus (SKU digit 2), CRRS = Cirrus (digit 3), NMBS = Nimbus (digit 4), Stratus = digit 1
- SKU last digit = archive; serial increments by 10 (e.g. Nimbus 0004, 0014, 0024…)
- Current intake SKU generation is simplified (3-digit count) — needs fix before bulk import

## EBR (Electronic Batch Registration) — build in progress, started 2026-09-15
- EBR = MusicMark's batch registration system, covers ASCAP/BMI/SOCAN in one upload. SESAC is a completely separate system/template and is out of scope for this feature.
- Kyle confirmed scope for v1: regular (non-JUP) titles only, JUP deferred as a follow-up.
- Ground truth for the export format: Kyle provided a real accepted MusicMark submission (`EB263700H03_707.xlsx`, 210 columns, "Registrations"/"LookUp"/"Instructions" sheets) and MusicMark's own onboarding PDF (`musicmark_ebr_getting_started_v2.0.pdf`). Column headers were extracted programmatically (sha256-hash-verified against the source file, not hand-typed) into a hardcoded `EBR_HEADERS` array — MusicMark's importer matches column names exactly.
- File naming per MusicMark spec: `EByynnnnsss_707.xlsx` (yy=year, nnnn=sequence, sss=3-char submitter code). HAUS's submitter code inferred from the real sample filename = `H03` — should be confirmed with MusicMark/Kyle before first live submission, not just trusted.
- Kyle also uploaded `SESAC Bulk Song Recordings Template1.xlsx` — confirmed it's a totally different flat one-row-per-writer/publisher/share format, nothing like MusicMark's layout. Not built; would be a separate export if/when wanted.
- **What was built** (Electron app: `main.js`/`preload.js`/`index.html` in haus-metatool-web repo):
  - New Admin nav section "EBR" (`data-section="ebr"`): lot + date-added range picker → checklist of matching titles (JUP and SESAC-writer titles auto-flagged/excluded with a visible reason, not silently dropped) → editable writer-name review (team_writers.writer_name is one string; auto-split on last space into first/last, editable since cowriters don't have separate first/last like the composers table does) → Generate button writes a real `.xlsx` via a new `ebr-write-xlsx` IPC handler (added the `xlsx` npm package).
  - Row-mapping logic (`ebrBuildRow`), empirically derived from the sample file: Submitter Work ID = `titles.sku_root` (this column actually holds the full SKU, e.g. `R13a15444`, despite the name); Alt Title 1–10 = `mix_stems.filename` minus extension, excluding the `FULL` stem, capped at 10; Writer Role Code hardcoded `C` (every sample row used this); Original Publisher per writer derived the same way the app's existing `HAUS_PUBLISHERS` map already does (BMI writer → SDNYC Music/BMI/554507939, everyone else → HAUS Collection Musik/ASCAP/770983501), at writer share ÷ 2, `Controlled = YES`. **Known limitation**: template only has 4 Original Pub slots vs. 10 Writer slots — a work with 5+ controlled writers can't fully round-trip; flagged in the UI, not solved.
  - **Auto-trigger**: hooked into `writeTrackToDB` at the exact point a lot hits `track_limit` and auto-closes (`sent_date = CURRENT_DATE`). Fires `ebrAutoRunForLot()` in the background — exports everything it can straight to `{cfg.hausjup}/EBR Exports/`, no dialog, skips/flags JUP + SESAC + no-writer titles individually rather than aborting the whole lot, shows a toast either way. Shares one sequence counter (`ebr_export_log` table, created lazily) with manual exports.
  - Fixed a real bug found on review: writer-name review inputs were building `onchange` handlers with `JSON.stringify(teamId)` (double quotes) inside an already-double-quoted HTML attribute, which would have broken the row's markup on render. Fixed to single-quoted literal (team IDs are plain `TM####`, no special chars, so this is safe).
- **Status as of 2026-09-15**: built and syntax-verified, sitting as uncommitted working-tree changes (not yet committed or pushed). Kyle wants it committed to a `feature/ebr-export` branch once confirmed working end-to-end in the running app (requires restarting the Electron app, since main.js/preload.js changed). Not yet tested inside the actual app. **This WIP was carefully protected during the same-day git reconciliation/security work below — repeatedly `git stash push -u` / `git stash pop`'d around every commit so it was never lost or accidentally committed on Kyle's behalf.** index.html also gained a matching EBR nav section/UI as part of this same uncommitted WIP.
- **Process lesson learned this session**: Kyle and (apparently) another concurrent Claude session were both doing heavy git activity (branch switches, merges, hard resets) on this same repo while this uncommitted work sat in the working tree. At one point a read of the file appeared to show the EBR code completely gone — turned out to be a stale/cached read from the device bridge mid-churn, not an actual loss (re-verified minutes later, byte-identical). Real risk though: an actual `git reset --hard`/checkout during that window *would* have permanently destroyed uncommitted changes with no recovery path (never staged, so nothing in git's object store, not even reflog). Lesson: get substantial uncommitted work committed (to a branch) promptly when there's any chance of concurrent git activity on the same clone.
- Also encountered: a stale `.git/index.lock` (0 bytes) blocked git operations at one point — `.git/` internals are a protected path the device bridge can't delete; had to give Kyle the manual `rm` command to run himself after quitting GitHub Desktop/Terminal. (Recurred more than once during the branch-reconciliation work below — same fix each time.)

## Security — incident + remediation, 2026-09-15
- While reconciling three diverging branches (`main`, `feature/toasts-and-signout`, `fix/authz-hardening`) per Kyle's direction ("Reconcile all three", merge order "authz-hardening first, then rebase toasts-and-signout on top"), found a teammate's commit (`cc7a6e1`, from Erik or someone on the team — not confirmed who) had reintroduced a **SQL-injection endpoint** (`/api/pg/query`, raw query execution) and a **hardcoded live Neon Postgres connection string/password** into `api.js`, undoing an earlier fix.
- Kyle's decision: **"Revert cc7a6e1 on main now"** — reverted directly on main (not just in the reconcile branch). Also: **"Flag it, I'll rotate it myself"** re: the exposed Neon DB password — Claude did not touch Neon or attempt to rotate credentials; that's on Kyle. **As of end of session, rotation status is unconfirmed — still needs Kyle to actually rotate it (and confirm) if he hasn't already.**
- Reverting to the commit-before-cc7a6e1 turned out to still contain an *older* hardcoded password (`npg_hiXWAOZ3C0gL`) baked into `api.js` as `DEFAULT_NEON` — pre-existing tech debt, not something cc7a6e1 introduced. Fixed: `DEFAULT_NEON` now reads `process.env.DATABASE_URL || null`, `require('dotenv').config()` restored, `"dotenv": "^17.4.2"` added to package.json, and a new `.env.example` created documenting `SESSION_SECRET`, `DATABASE_URL` (commented "rotated after the 2026-09-08 exposure" — reflects Kyle's stated intent, not confirmed completion), `B2_APP_KEY_ID`/`B2_APP_KEY`, `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN`, `HAUS_INSECURE_COOKIE`, `HAUS_FS_EXTRA_ROOTS`.
- Kyle's follow-up ("1,2,4 and i want to build the client ui") also asked to address **repo-wide hardcoded-credential sprawl**: ~55 root-level one-off scripts (db-dedup.js, sku-audit.js, migrate-to-neon.js, and similar) each had a literal `postgresql://neondb_owner:<password>@...` string; swept via regex to `process.env.DATABASE_URL` (local dev strings like `postgres:postgres123` deliberately left alone).
- Also deleted several dead files that cc7a6e1 had reintroduced alongside the SQL-injection endpoint (routes/auth.js, middleware_auth.js, routes/{b2,cfg,fs,lot,pg,shell,applescript,audio}.js, server.js.backup, setup-routes.sh) — confirmed nothing in api.js still requires any of them.
- **Merged/committed locally on `main`, but NOT yet pushed to `origin/main`** — a `git push` attempt from the cloud sandbox failed (no git credential helper available there: "could not read Username for 'https://github.com'"). Kyle needs to push himself from his own terminal/GitHub Desktop/VS Code. This includes the revert, the credential sweep, the branch reconciliation, and all the Client Portal work below.
- Kyle has not yet looped Erik in about the reverted commit — open item, not yet asked about again.

## Migrations (ATMOSPHERE folder)
- migration_021_composers.sql (composers + cowriters), migration_022_teams.sql (teams + team_writers), migration_023_jup_flag.sql (adds is_jup to titles), migration_023b_team_placeholders.sql
- migration_025_core_schema.sql — STALE/OLD SCHEMA (old title_id PK, team_id, version on mix_stems) — does not match what app uses; runs last in setup_haus_db.sh sort order, breaking fresh installs
- seed_lots_from_csv.sql, seed_nimbus_genre_lots.sql, seed_rmo.sql (626 entries)
- cowriters seed in migration_021 failed (column is cowriter_name not full_name) — fix if needed

## Built vs. not built
Built: Electron app shell with all nav sections; intake workflow (scan staging → info table → preview → copy+rename → Postgres write → done); Postgres IPC in main.js/preload.js; Catalog with Postgres/FileMaker/file-scan fallback + CSV export; Settings with Postgres connection UI; complete schema migrations; setup script; composers table seeded. **Client Portal backend + frontend (2026-09-15, see Client Portal section) — built and syntax-checked, not yet DB-integration-tested, not yet pushed.**

Key DB functions in index.html (rewritten to real schema as of June 2026): generateSku, getTeamByComposerId (queries composers table, not teams), writeTrackToDB, detectStemName (renamed from detectVersion), resolvePathsBySku, deriveTrackFolder, loadCatalogPG, executeIntake, collectIntakeInfo.

Folder naming: drop = `{composerID}_{title}_{tag}`; after intake = `{skuRoot}_{title}_{tag}`; all tracks go to `cfg.hausjup/{lotName}/`; paths never stored in DB, always derived.

Not built yet: composer/artist portal; production-company portal (**client portal now built as `client-portal.html`, see section below** — this line previously said "producer.html needs search/filter/preview/download", now superseded); triangulated RMOs (cross-reference for similar tracks); production back end; two-person tagging/QC workflow; BPM auto-detection for 32k legacy songs (Librosa); bulk import of 32k songs FileMaker→Postgres; PRO registration automation (queued but no submit flow); Deals/Finances (hardcoded sample data); Contacts (sample data, planned Daylite integration); admin role/auth for all 3 portals; SKU archive suffix system (3-digit simplified, 4-digit TBD before bulk import). Audio preview in the Client Portal Library tab is also not built yet (no player wired up).

## Intake automation (added June 2026)
- `parseFolderName()` extracts composerID/title/albumCode from incoming folder name
- `initIntake()` replaces `renderIntake(0)`; auto-runs `scanStaging()` on navigate
- `scanStaging()` auto-parses + pre-fills guessedID/guessedTitle/guessedTag, auto-advances if drops found
- `pollIntakeBadge()` polls staging folder every 60s for nav badge count
- Info table now includes Album Code column; step label changed "1. Scan" → "1. Drops"
- Folder output format: `{skuRoot}_{title}_{albumCode}` (albumCode falls back to genre if blank)

## Client Portal (client-portal.html — built 2026-09-15)
- Corrected naming/assumption: producer.html is NOT the client portal (see "The app" section). The real client portal was built as a brand-new file, `client-portal.html`, in the haus-metatool-web repo, so producer.html's actual internal tool wasn't disturbed.
- Kyle: "we dont care about reps, were two people, erik is their rep" — there is no per-client rep to manage; Erik is hardcoded (`HAUS_REP = 'Erik Steinert'`) as the fixed contact shown to every client, replacing the earlier design's per-client "named HAUS rep" concept (e.g. the old placeholder "Jordan Kassel" idea below is obsolete).
- Kyle: "i want them to have access to the library so that they can make their own playlists" — clients get a **Library tab** to search/filter the full catalog (genre, mood, text search, debounced) and **build their own playlists** themselves (create/delete playlists, add/remove tracks) rather than the earlier "rep-curated, read-only, shareable link" design. Backed by `portal_playlists`/`portal_playlist_tracks` tables, client-owned.
- Branding: matches the real app's color scheme pulled from `index.html`'s `:root` — navy `#0b2a5b`, teal `#C0C9CD`, green accent `#6F927E`, neutral background palette, Geist font, ATMOSPHERE logo (`/assets/atmosphere-logo.svg`) — not a generic/placeholder palette.
- Tabs: Overview (stat cards + Erik-as-contact card), Pitches, Briefs, My Licenses, Library (new), Playlists (client-editable, new behavior), Messages (threaded chat).
- Standalone page (no preload.js/haus-api.js dependency, fetch-based like producer.html); session via `req.session.portalUser`; forced password-change screen on first login (`must_change_password`).
- Sections (Pitches/Briefs/Licenses/Messages) otherwise follow the original June 2026 design session: title not filename shown, genre/key/BPM, rep note, approve/pass/feedback on pitches, stems download on approved licenses, threaded messages.
- Display rule (still holds): always show human-readable track title, never the internal filename, in client-facing UI.
- Static preview versions (not part of the git repo — mockups only, no real login/DB) were sent to Kyle via SendUserFile so he could see the visual design before the real backend was wired up.

## Immediate next steps — status as of 2026-09-15
1. DONE — end-to-end intake test (drop folder → intake → verify DB row + files)
2. Status unknown/unconfirmed — fix migration_025 + setup_haus_db.sh for fresh-install correctness
3. DONE (backend + frontend built, not yet DB-tested or pushed) — build client portal as `client-portal.html`: briefs, pitches, licenses, messages, plus new Library + client-editable Playlists tabs, Erik hardcoded as sole rep
4. DONE/good — bulk import 32k songs FileMaker → PostgreSQL
5. Low priority right now — build composer portal (third portal)
6. New — Kyle needs to: push all local `main` commits to origin (git push failed from the cloud sandbox, needs Kyle's own machine); confirm/complete Neon password rotation; decide whether/how to loop Erik in on the reverted commit; DB-integration-test the Client Portal before real use; commit the EBR export feature to `feature/ebr-export` once verified in the running app.
