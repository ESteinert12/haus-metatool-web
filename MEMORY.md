# HAUS Music Library — Project Memory

## People
- **Erik Steinert** — CEO/owner, primary user. Email: erik@hausmusic.com
- **Kyle Frisch** — Business partner, data/operations. Works in Slack DM. Shares Claude subscription.
- **Christos** — Tech advisor (IBM background). Recommended PostgreSQL migration away from FileMaker.
- **Donna** — Erik's wife, involved in the business.
- **Axel Niehaus** — Team member (composer/sales). axel@hausmusic.com
- **Jake Atherton** — Former team member, went quiet. jake@hausmusic.com
- **Sam Campoli** — Team member. sam@hausmusic.com

---

## Working Style
- Direct, no fluff. Hates being asked questions he expects Claude to figure out from the project.
- No emojis. No eager-to-please tone.
- Prefers Claude checks files/state before asking.
- Responds well to concise status + next step format.

---

## The Business
- HAUS Music — production/library music company
- ~32,523 songs in catalog (HAUS + JUP)
- Revenue model: sync licensing to TV/film production companies (Bravo, Snapped, She-Hulk, etc.)
- Currently paying ~$20K/year on FileMaker + SourceAudio — plan is to replace both
- SlipStream has expressed interest in acquiring; Erik is not ready to sell yet
- Key clients: Bravo, Snapped, She-Hulk, Southern Hospitality, Peloton (prospect)

---

## The App — HAUS Workspace (Electron)

### Location
- App: `/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app`
- Source: `...HAUS Workspace.app/Contents/Resources/haus-workspace/`
- Files: `main.js`, `preload.js`, `index.html`, `producer.html`, `package.json`

### Terminology (important)
- **Producer** = client / licensee (ad agency, TV editor, brand, etc.)
- **Artist** = composer (person who makes the music, has a ComposerID like R13a)

### Three Portals
1. **Admin** (`index.html`) — Erik & Kyle only. Full access to all sections.
2. **Client Portal** (`producer.html` — rename pending) — TV/film producers/editors browse pitches, manage briefs, download licensed assets, message their HAUS rep.
3. **Artist Portal** — NOT BUILT YET. Composers upload tracks, see assignments, get feedback.

### Sections in the App (index.html)
- Today (dashboard), Email (webview), Slack (webview), Schedule (Daylite stub)
- **Catalog** — reads from PostgreSQL (primary) → FileMaker → file scan fallback. Has Export CSV.
- **Intake** — 4-step wizard (now auto-scans on enter). Auto-parses folder name → Info → Rename → Done.
- Files (two-pane: Intake + HAUSJUP), Assignments (kanban), Contacts (Daylite stub)
- Deals (kanban — hardcoded sample data), Finances (hardcoded sample data)
- Settings — has PostgreSQL connection field + Connect button

---

## Database

### PostgreSQL Setup
- Version: 18 (EDB installer, NOT Homebrew)
- Binary: `/Library/PostgreSQL/18/bin/psql`
- Start command: `sudo /Library/PostgreSQL/18/bin/pg_ctl start -D /Library/PostgreSQL/18/data`
- Connection: `postgresql://postgres:postgres123@localhost:5432/haus_music`
- Database name: `haus_music`
- **pg npm driver**: must be installed in the app (`npm install pg` inside haus-workspace/)
- Setup script: `bash setup_haus_db.sh` (from ATMOSPHERE folder)

### REAL Schema (confirmed via psql — supersedes all migration assumptions)

**titles**
- `sku_root` VARCHAR — PRIMARY KEY (format: `{composerId}{seq}` e.g. `R13a001`)
- `lot_id` FK, `composer_id` FK, `variant` char(1) default 'a'
- `title` (UNIQUE), `key`, `bpm`, `next_file_number_used`
- `primary_genre_id` FK, `secondary_genre_id` FK
- `mood`, `tempo_category`, `mood_1_id`, `mood_2_id`, `ksl_id`, `ksl_ids`
- `pd`, `locked`
- `is_jup` BOOLEAN exists (added by migration_023) but app does NOT use it for intake logic
- NO `title_id` serial, NO `team_id`, NO `genre` text, NO `sku` column, NO `ksl`/`mmw` text

**mix_stems**
- `mix_stem_id` serial PK, `sku_root` FK, `stem_name`, `filename`, `created_at`, `updated_at`
- stem_name values: FULL, ALT, BUMPER, STING, STINGa, DNB, NoDNB
- NO `version` column, NO `title_id`

**pro_registrations**
- `registration_id` PK, `mix_stem_id` FK (per stem, not per title), `pro_name`, `status`, `created_at`, `updated_at`

**lots**
- `lot_id`, `lot_name`, `client`, `song_count`, `status`, `created_at`, `updated_at`
- NO `lot_type` column

**composers** (created via migration_021)
- `composer_id` VARCHAR(10) PK (e.g. R13a), `first_name`, `last_name`, `full_name`
- `ipi_number`, `location`, `middle_name`, `pro`, `date_added`, `status`, `notes`
- `is_jup` BOOLEAN — this is the JUP source of truth
- Real composers seeded: R04 Tim O'Kane, R09 Zach McNees, R15 Kari Steinert, R25 Sean Hagon (is_jup=true), etc.

**primary_genres**
- `primary_genre_id`, `primary_genre_name` (uppercase), `created_at`

**moods** — 69 pre-seeded mood tags (lookup)
**title_moods** — junction: title ↔ moods
**rmo** — Reminds Me Of — 626 TV show/movie names (lookup)
**title_rmo** — junction: title ↔ rmo

**NOTE: `sourceaudio_uploads` table exists in DB (migration_025 creates it) but is not used by the app**
**NOTE: No `teams` table used anywhere in intake — JUP toggle defaults from `composers.is_jup` but is manually overrideable per track in the UI**

---

## Metadata Fields
- **Genre**, Sub-genre
- **Moods** (multiple, from lookup table)
- **Key**, BPM, Tempo
- **KSL** — Kinda Sounds Like (free text)
- **MMW** — Makes Me Wanna (free text)
- **RMO** — Reminds Me Of (626 TV shows/movies — lookup table)
- KSL and MMW are KEPT (not replacing with RMO — all three coexist)

---

## File Naming Convention
- Standard: `HAUS_TitleCamelCase_Key_ComposerID_VERSION.ext`
- JUP: `HAUSJUP_TitleCamelCase_Key_ComposerID_VERSION.ext`
- Versions: FULL, ALT, BUMPER, STING, STINGa, DNB, NoDNB, PERC, LOOP, INTRO, OUTRO, etc.
- Key: Major = letter only (E, G). Minor = letter + m (Fm, Cm)

### Intake Folder Naming (composer drops)
- Incoming from composer: `{ComposerID}_{Track Title}_{AlbumCode}` — e.g. `R23a_Fuck A Duck_MYSTERY`
- After intake (SKU assigned): `{skuRoot}_{Track Title}_{AlbumCode}` — e.g. `R23a1114_Fuck A Duck_MYSTERY` (skuRoot = composerBase + teamLetter + songNum + archiveDigit)
- ComposerID regex: `^([A-Z]\d{2}[a-z])` (letter + 2 digits + letter, e.g. R23a, S33a)
- AlbumCode = last `_`-delimited segment; Title = everything between first and last `_`
- Auto-parsed in `scanStaging()` via `parseFolderName()` — pre-fills Composer ID, Title, Album Code in the Info table

---

## JUP System
- JUP = Jupiter. Special co-publishing arrangement.
- Pub split locked: HAUS 25% / Production Company 25% / Writer 50%
- Production companies: Code Blue Cues (ASCAP, IPI 815607148), Undercover Blues (BMI), Beat Street Cues (SESAC)
- JUP intake goes through same intake flow — is_jup defaults from `composers.is_jup` but is a per-track toggle in the intake UI (user can override)
- `buildHausName` outputs `HAUSJUP_` prefix when toggle is on, `HAUS_` when off

---

## Archive System
- HTOR = Cumulus (SKU digit 2)
- CRRS = Cirrus (SKU digit 3)
- NMBS = Nimbus (SKU digit 4)
- Stratus = digit 1
- SKU last digit indicates archive; serial increments by 10 (e.g. Nimbus: 0004, 0014, 0024…)
- **Current intake SKU generation is simplified (3-digit count) — fix before bulk import**

---

## EBR (Electronic Batch Registration)
- PRO registration format for ASCAP/BMI/SESAC
- Skill exists: `ebr-consolidator` — consolidates FileMaker exports into PRO-ready template
- Erik planned to use EBR export from the app but deferred ("don't worry about it for now")

---

## Migrations (ATMOSPHERE folder)
- `migration_021_composers.sql` — composers + cowriters
- `migration_022_teams.sql` — teams + team_writers
- `migration_023_jup_flag.sql` — adds is_jup to titles
- `migration_023b_team_placeholders.sql` — placeholder teams for unmatched SKU roots
- `migration_025_core_schema.sql` — **STALE/OLD SCHEMA** — defines old `title_id` PK, `team_id`, `version` on mix_stems. Does NOT match what the app uses. Runs last in setup_haus_db.sh (sort order) which breaks a fresh install.
- `seed_lots_from_csv.sql` — intake lots
- `seed_nimbus_genre_lots.sql` — Nimbus genre lots
- `seed_rmo.sql` — 626 RMO entries
- `setup_haus_db.sh` — one-time setup script (installs pg, creates DB, runs all migrations). **WARNING: uses `brew services start postgresql@18` which won't work — PostgreSQL 18 is EDB not Homebrew. Needs fix before use on a fresh machine.**

---

## What's Built vs. What's Left

### Built
- Electron app shell with all nav sections
- Intake workflow: scan staging → info table (title, composerID, JUP badge, key, genre, tag, KSL, MMW, BPM) → preview → copy + rename → PostgreSQL write → done screen
- PostgreSQL IPC in main.js + preload.js
- Catalog with PostgreSQL source, FileMaker fallback, file scan fallback
- Export CSV from catalog
- Settings with PostgreSQL connection UI
- Complete schema SQL (migrations)
- Setup script
- migration_021_composers.sql — composers table seeded (cowriters seed partial — non-critical)

### DB Functions in index.html (all rewritten to real schema as of June 2026)
- `generateSku(composerId)` — returns `{composerId}{seq}` string e.g. `R13001`, reads `sku_root` from titles
- `getTeamByComposerId(composerId)` — queries `composers` table for `is_jup` and `pro` (NOT teams table)
- `writeTrackToDB(trackData)` — inserts titles (sku_root PK), mix_stems (stem_name), pro_registrations (per mix_stem_id). Accepts pre-generated `skuRoot` so folder and DB stay in sync.
- `detectStemName(filename)` — renamed from detectVersion, maps to stem_name values
- `resolvePathsBySku(skuRoot)` — joins mix_stems on sku_root, primary_genres for genre
- `deriveTrackFolder(lotName, skuRoot, title, genre)` — format: `{cfg.hausjup}/{lotName}/{skuRoot}_{title}_{genre}`
- `loadCatalogPG()` — joins composers + primary_genres, no teams/is_jup on titles
- `executeIntake()` — pre-generates SKU before folder creation; folder = `{skuRoot}_{title}_{tag/genre}`
- `collectIntakeInfo()` — resolveJup from composers, no teamId

### Folder Naming
- Drop (before intake): `{composerID}_{title}_{tag}` e.g. `R13a_StormChaser_TENSION`
- After intake (SKU assigned): `{skuRoot}_{title}_{tag}` e.g. `R13001_StormChaser_TENSION`
- All tracks (JUP and regular) go to `cfg.hausjup/{lotName}/` — lot subfolder is the only differentiator
- Paths are NEVER stored in DB — always derived from lot_name + sku_root + title + genre

### Not Built Yet
- **Composer portal** (third portal — artists submit music, see assignments, audition area)
- **Production company portal** (producer.html needs search/filter/preview/download)
- **Triangulated RMOs** — cross-reference RMO tags to surface related/similar tracks
- **Production back end** — production company management/admin layer
- **Premade playlists** — curated playlists featuring most-synced songs (for pitching/browse)
- Two-person tagging/QC workflow
- BPM auto-detection for 32k legacy songs (Librosa)
- Bulk import of 32k existing songs from FileMaker → PostgreSQL
- PRO registration automation (queued per stem but no submit flow)
- Deals and Finances sections (currently hardcoded sample data)
- Contacts section (currently sample data, planned Daylite integration)
- Admin role / auth (Erik + Kyle should access all 3 portals)
- SKU archive suffix system (3-digit simplified now; 4-digit archive system TBD before bulk import)
- cowriters seed in migration_021 failed (column is `cowriter_name` not `full_name`) — fix if needed

---

## Intake Automation (added June 2026)
- `parseFolderName(name)` — new function. Extracts composerID (regex `^([A-Z]\d{2}[a-z])`), title (middle segment), albumCode (last `_` segment) from incoming folder name
- `initIntake()` — replaces `renderIntake(0)` call in `onSectionEnter`. Auto-runs `scanStaging()` on navigate; no manual Scan button needed
- `scanStaging()` — now auto-parses each folder and pre-fills `guessedID`, `guessedTitle`, `guessedTag`; auto-advances to step 1 if drops found
- `pollIntakeBadge()` — polls staging folder every 60s, shows blue count badge on Intake nav item
- `updateIntakeBadge(count)` — sets/hides `#intake-nav-badge` span in the Intake nav item
- Info table now includes Album Code column (pre-filled from folder name), title pre-filled from folder name
- Step label: "1. Scan" → "1. Drops"
- Folder output format: `{skuRoot}_{title}_{albumCode}` (albumCode falls back to genre if blank)

---

## Client Portal (producer.html — design session June 2026)

### Terminology (critical)
- **Producer** = CLIENT (TV/film editor, ad agency, brand — the music licensee)
- **Artist** = COMPOSER (makes the music, has a ComposerID like R13a)
- `producer.html` is misnamed — it's the CLIENT portal, not composer portal

### Client Portal Sections (designed, not yet built as real HTML)
1. **Overview** — stat cards (pending pitches, approved tracks, active briefs, licensed count) + active brief summary + recent rep message + quick-approve list
2. **Pitches** — tracks HAUS has pitched for a brief. Each card shows: track title (NOT filename), genre/key/BPM, HAUS rep's note, waveform player, Approve / Pass / Feedback buttons. Approved cards get a green left border + stems download button.
3. **Briefs** — client submits creative briefs. Fields: title, description, mood tags, budget type, due date. Status: draft / active / delivered.
4. **My Licenses** — all approved/licensed tracks. Shows brief, license type (Sync+Master, Blanket), expiry, download buttons per format (WAV / MP3 / Stems).
5. **Playlists** — HAUS rep curates playlists for the client's brief. Client can share via link.
6. **Messages** — threaded chat between client and their named HAUS rep (e.g. Jordan Kassel).

### Display Rule
- Always show human-readable track title (e.g. "Tension Rise") — NEVER show the filename (e.g. `HAUS_TensionRise_Cm_R13a`) in client-facing UI
- File names are internal/admin only

### Client Portal Data Model (conceptual)
- Client has a named HAUS rep
- Briefs link to pitches; pitches have status: pending / approved / passed
- Licenses are per-track with expiry and downloadable file formats

---

## Immediate Next Steps
1. End-to-end intake test: drop a folder in staging → open app → run through intake → verify DB row + files
2. Fix migration_025 + setup_haus_db.sh for fresh-install correctness (migration_025 is stale old schema; setup script uses wrong pg start command for EDB)
3. Build client portal (`producer.html` rewrite) — briefs, pitches (approve/pass), licenses (download), messages
4. Bulk import 32k songs from FileMaker → PostgreSQL
5. Build composer portal (third portal — artists upload tracks, see assignments)
