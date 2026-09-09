# Full B2 inventory + code scan — 2026-09-09

Inventory: `python3 b2_inventory.py` -> B2_INVENTORY.tsv (255,532 objects).
Read-only, resumable. `python3 b2_ls.py "<prefix>"` lists one prefix.

## THE ROOT CAUSE of the 3,261 (found, fixed)
`/api/b2/rebuild-stem-keys` had, at api.js ~4180:

    if (!/^HAUS_/i.test(fileName)) continue

It skipped every file not named HAUS_*. The specialty cues are named SKU-first
(C27a0152_SIB_CoalTrain_E_FULL.wav), so every rebuild ever run walked straight
past them and reported success. 1,421 audio objects in the bucket are not
HAUS_-named.

Second half of the same problem: `updateMixStemsBatch` runs
`UPDATE mix_stems SET b2_key=$1 WHERE filename=$2 AND b2_key IS NULL`.
An UPDATE. These titles have NO rows, so there is nothing to update — the
rebuild can never CREATE a missing row. Both halves were blind, for different
reasons.

## Scope check — is this a problem outside the specialty cues? Mostly NO.
- The ^HAUS_ filter exists in exactly ONE place. haus-metatool-web has no
  equivalent. Checked both repos.
- The 1,421 non-HAUS audio files are ~1,044 specialty cues + **377 composer
  instrument stems** in Stems/ subfolders (C52d_Teach_Bass.wav,
  ..._Synth_Lead.wav). Erik: those are files we normally DELETE — a composer
  ignoring the printing protocol. So outside specialty cues the filter was
  only hiding files we do not want.
- Only **216** mix_stems rows have a NULL b2_key, and all 216 are HAUS_-named,
  so the existing rebuild can already repair them.
- index.html has 9 INSERT INTO mix_stems sites (intake path) — normal intake
  creates rows correctly. Only the server-side rebuild is update-only.

## NEW AND SEPARATE: the `music/` tree — 31,166 objects, 187.3 GB
A fifth top-level prefix beside the four collections, flat:
music/STRATUS 24,506 | music/CIRRUS 4,065 | music/CUMULUS 2,595

**31,165 of 31,166 basenames also exist in a proper collection tree.** The one
exception is `test.wav`. But it is NOT a clean duplicate:

    byte-identical to the collection copy   10,665
    music/ copy SMALLER                     19,523
    music/ copy LARGER                         977

Some of the smaller ones are stubs:
  music/.../HAUS_808sAndDustyPlains_Dm_C27c_STING.wav = 12,288 bytes
  vs collection copy                                  = 3,129,642 bytes
That looks like wreckage from the failed-upload era.

The 977 LARGER ones are specialty cues and matter more:
  C27a0152_SIB_CoalTrain_E_FULL.wav  music/ 19,872,766  cumulus/ 3,096,162
Size alone cannot say which is correct (different render? truncated collection
copy?). **Resolve this BEFORE pointing stem rows at the cumulus copies.**
DO NOT delete anything in music/ on the strength of the name match alone.

## Fixes applied to api.js 2026-09-09 (backup /tmp/api.js.bak-scan-*)
1. Filename filter now accepts SKU-first names as well as HAUS_*.
2. `client.release()` -> `await client.end()` on the B2-error path. It is a
   plain pg.Client; release() is a pooled-client method and threw a second
   error while handling the first.
3. `b2_list_file_versions` -> `b2_list_file_names`. The versions call returns
   hidden files and superseded versions, including the ones deliberately
   hidden during the stray-key cleanup.
4. `/b2/rebuild-stem-keys` and `/b2/authorize` REMOVED from PUBLIC_ROUTES.
   Both are writers. /b2/stream stays public — the <audio> element cannot send
   session credentials.

`node --check api.js` passes. NEEDS A RESTART to take effect.

### One behaviour change to watch after restart
b2AutoConnect() checks /api/b2/status (still public) first and only falls back
to /api/b2/authorize if the server is not already connected. The server
auto-authorizes at startup, so the fallback rarely fires — but if it ever does
before login it will now 401 instead of connecting. Symptom would be the B2
pill not showing "Connected". The fix in that case is to make the server
auto-authorize, not to re-open the route.

## STILL NOT DONE
The rebuild still cannot CREATE missing stem rows. That is the actual repair
for the 3,261 and needs a new endpoint: match on the sku_root in the path
(present in 87% of keys / 30,406 distinct SKUs), INSERT what is missing,
dry-run by default and show the list first.

---

# RESOLVED: what `music/` actually is (evidence, 2026-09-09)

Tools written (all read-only, run from the Mac — the Cowork VM's egress blocks
Backblaze, so these are Erik-run, not Claude-run):
  b2_ls.py         list one prefix
  b2_inventory.py  page the whole bucket -> B2_INVENTORY.tsv (resumable)
  b2_wavhdr.py     WAV header vs real object size, 4KB per file
  b2_cmp.py        SHA-1 the DECLARED payload of two objects
  b2_cmp_batch.py  header-check pairs from B2_PAIRS.tsv + identify non-WAV content

## 62% of music/ is a saved HTML error page
**19,357 objects in music/ are EXACTLY 1,233 bytes** — 62.1% of the tree — and
every one sampled begins:

    <!DOCTYPE html> <html> <head><meta http-equiv="Content-Type" ...

A web page (error/login) uploaded where a wav should have been. Counted from
the full local inventory, not sampled.

## The rest of music/ is duplicates with garbage appended
Of 12 sampled pairs where the music/ copy is LARGER:
  9  same declared audio length, music/ has a junk tail (+4.5 MB to +33.9 MB)
  3  DIFFERENT declared length — genuinely different renders, check individually
One proven byte-identical: C27a0152_SIB_CoalTrain_E_FULL.wav, SHA-1 of the
declared payload matches exactly (7043d71d...), music/ just has 16.8 MB of
trailing junk past the WAV header that no player ever reads.

## THE COLLECTION TREES ARE SOUND — this was the blocking question
- All 24 sampled collection copies: `clean` (header-declared size == object
  size). **No truncation anywhere.**
- **ZERO** 1,233-byte HTML pages in cirrus/stratus/cumulus/nimbus. The error
  pages never reached the live catalogue.
=> Safe to create mix_stems rows pointing at collection copies.

## Collections DO have their own small-file problem — 852 audio objects <2KB
  nimbus 846 | cirrus 5 | cumulus 1        (wav 733, mp3 119)
- The nimbus ones are ~157-158 bytes: the known STUB pattern (a local file
  path written as text instead of audio).
- SIX are ZERO bytes — a different failure, all stems of two songs:
  cirrus/R03_.../R03b1253_I'M ABOUT TO!/  (5 files: Bumper, DNB, FULL,
  NoDrums, NoLead — the whole song is empty)
  cumulus/S33_.../S33a5972_Washington_Dm/HAUS_Washington_Dm_S33a_NoLead.wav

## Recommendation
music/ holds no unique material: 1 unique basename in 31,166, and that is
`test.wav`. It is 187.3 GB of error pages and junk-tailed duplicates. It is a
cleanup candidate — but per standing rule use b2_hide_file (reversible), never
b2_delete_file_version, and resolve the 3 different-render pairs FIRST.
Do not act on the name match alone.

NOT DONE. Nothing in music/ has been touched.

## /api/b2/link dry run — 2026-09-09 (live result)
    objectsScanned 255,555   unlinked 216   linkable 0
    ambiguous 141 | notFound 68 | stubOnly 7
Report: b2-link-<ts>.json in the project root.

**Every one of the 141 has EXACTLY 2 candidates; 136 are a `_Snapped` twin.**
e.g. nimbus/T40_.../T40h0734_Severed Heart Strings_C/...BUMPER.wav      4,149,746
     nimbus/T40_.../T40h0734_Severed Heart Strings_C_Snapped/...BUMPER.wav 4,132,286

SNAPPED is not special: it is a SHOW tag, like TEXAS WIVES / TEX HEARTLAND /
RODEO, and it IS in the `folder_tags` table. The artist puts the show on the
folder so we know which show the cue is meant for.

### ERIK'S TIE-BREAK RULE (2026-09-09) — use this, not "prefer untagged"
"Whichever lot it came in FIRST is the lot it should be in, and then the other
lot would be a client lot in theory."
So: resolve a duplicate-folder ambiguity by EARLIEST lot (lot_titles.added_at /
lots), not by whether the folder carries a show tag. The first lot is the
song's home; the later one is a client delivery copy.

NOT YET IMPLEMENTED. The 216 are a side quest — the main job is create-mode.
