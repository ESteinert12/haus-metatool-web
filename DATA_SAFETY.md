# DATA SAFETY — READ BEFORE DELETING, HIDING, OR MOVING ANYTHING

Erik, 2026-09-11: **"I CANNOT afford to lose anything. ANYTHING."**

He keeps a spare copy of every migrated lot in an **ARCHIVE Dropbox folder** and
will keep doing so until B2 is provably safe. Do NOT tell him to delete a source
copy. Do NOT imply that a verify-lot PASS makes the second copy unnecessary.

## What a verify-lot PASS actually proves
That AT THE MOMENT OF THE CHECK, an object existed in B2 at the expected key,
with a byte count matching the file in Dropbox, and a mix_stems row pointing at
it. That is presence and integrity at a point in time.

It proves NOTHING about durability, about protection from accidental deletion,
or about what happens next month. Do not oversell it.

## The bucket, measured 2026-09-11 (not assumed)
`/api/b2/list-buckets` on bucket `haus-music`:

GOOD
- `lifecycleRules: []` — **nothing auto-deletes, ever.** This is the important
  one: it means `b2_hide_file` really is non-destructive and B2 keeps the bytes
  indefinitely. Our "hide, never delete" policy is REAL, not theatre. The
  187 GB `music/` cleanup can proceed on this basis.
- `bucketType: allPrivate` — nothing publicly readable.
- `revision: 2` — settings have barely been touched since creation.

NOT COVERED
- `isFileLockEnabled: false` — **no object lock.** Nothing at the storage layer
  prevents deletion. The only thing standing between the catalogue and data loss
  is that our code chooses not to call `b2_delete_file_version`. A bug is enough.
- `replicationConfiguration: null` — **one bucket, one region.** No second copy
  inside B2. The Dropbox Archive is currently the ONLY redundancy that exists.
- Server-side encryption not enabled (`algorithm: null, mode: null`).
  Confidentiality, not durability — but worth knowing.

## The highest-value hardening available, still OPEN
Check whether the B2 application key in `.env` has `deleteFiles`. Nothing we run
needs it. A key restricted to `listFiles` / `readFiles` / `writeFiles` makes
hard deletion **physically impossible** rather than merely against policy —
the difference between a rule and a guarantee. It costs a key rotation that is
already owed.

## Standing rules
1. `b2_hide_file` only. NEVER `b2_delete_file_version`.
2. Never write keys, tokens or secrets into files. Erik edits `.env` himself.
3. Never tell Erik a source copy is safe to delete. That is his call, not ours,
   and the conditions for it (object lock or a delete-incapable key, plus
   replication, plus a second provider) are not met.
4. A lot moved to the Archive can still be re-verified — `verify-lot` takes a
   `&base=` override pointing at the Archive path.
