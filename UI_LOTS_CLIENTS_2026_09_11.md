# Lots -> Clients, forward only (2026-09-11, "Ergonomics and functionality")

Scope ruling (Erik): OLD LOTS ARE OUT OF SCOPE. 1,727 of 1,737 lots have no
project_id; do not backfill. Only new lots must land in a project.

## Why it mattered
A lot with NULL project_id is invisible on the client page. Every lot created
during intake rollover (`resolveCurrentLot` -> `_confirmNewLot` ->
`getOrCreateLot`) was created with no project. Erik: the popup used to have a
client selector; it was lost in the Git-vs-local fork. Not in either repo's
history, so rebuilt.

## Changed (index.html only; backup index.html.bak-lotpopup-HHMMSS)
- `getOrCreateLot(..., projectId = null)` - 5th param, used on INSERT only.
- `_confirmNewLot(suggestedName, clientName)` - now async; Client + Project
  selects. Project defaults to the project of this client's most recent lot
  that has one. Changing client re-suggests the lot name unless typed over.
  Returns {name, limit, clientName, projectId}; confirms if no project.
- New helpers `lotFillProjectSelect`, `lotCreateProjectInline` - shared by both
  popups; "+ New project..." creates a project under the selected client
  (dedupes on name within client).
- New Lot modal: confirm screen shows Project; Back keeps client, project,
  name, limit and the intake context (it used to drop all of them). Client
  preselect is case-insensitive (intake clients are often UPPERCASE).
- `createAndPickLot` is dead code (no caller, its input does not exist). Left.

## Known limit
If the client is changed in the rollover popup, intake's `intakeClient` does
not change, so the next song will look for that client's lots again.

## To verify (needs a browser refresh; no server restart)
1. Clients -> New Lot with a client that has no project -> "+ New project..."
2. Confirm screen shows Project; Back keeps everything.
3. Next time a lot hits its limit in intake: popup shows Client + Project.
4. SELECT lot_name, project_id FROM lots ORDER BY lot_id DESC LIMIT 5;

## Shipping lot folder layout (later 2026-09-11)
- 1. ATMOS_SHIPPING is local disk (~/Downloads) on purpose: Sequoia CloudStorage
  and Dropbox conflict. The SKU folder / HAUS_ rename never changed.
- Commit 1acc119 (Sep 3 16:58) moved consumed originals into the lot folder
  loose, beside the SKU folders, so a lot looked like twice as many songs.
- Now: executeIntake archives originals to `{lot}/_SOURCE/` (one-line change,
  backup index.html.bak-source-*). HEARTLAND's 7 originals moved there by hand.
- Also: R48a5854 Bone Dried moved lot 7614 -> 7618 (Erik). R48a5874 duplicate
  Lone Star folder: verified identical to R48a5884, removed.
