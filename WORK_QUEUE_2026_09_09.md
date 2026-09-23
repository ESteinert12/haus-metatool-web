## SOURCEAUDIO IS GONE — BUT bpm/mmw ARE STILL REQUIRED (Erik, 2026-09-09)
HAUS no longer uses SourceAudio. ATMOSPHERE REPLACES it, so it needs the SAME
metadata: `bpm` and `mmw` must still be filled in. The requirement did not go
away, it moved in-house.

So a song is only FINISHED when BOTH are true:
  1. it has mix_stems rows pointing at real audio  (what create-stems does)
  2. bpm and mmw are populated                     (still to do, all 3,261)
Step 1 is done for 492. Step 2 is done for none of them.

# The 3,261 unfinished songs — found, characterised, flagged

## What they are (Erik's account, confirmed against the data 2026-09-09)
Songs logged during the FileMaker era by someone entering ONLY the fields Avid
needed, not the second-pass fields (bpm, mmw, description). They came across in the
FileMaker->Neon migration as real records and have sat in the catalogue since,
invisible to every audit we had — because every audit starts
`WHERE b2_key IS NOT NULL` and these have NO mix_stems rows at all.

**They are NOT known to be missing from B2.** Nothing here tested that. Erik
expects the filenames are all correct and match B2, i.e. a bookkeeping gap
rather than lost audio. UNTESTED — verify before acting on it.

## The metadata signature (this is what identifies them)
Avid fields present, SourceAudio fields absent. Dec-2025..May-2026, 507 of 507:

    key      507/507      bpm          0/507
    mood_1   507/507      mmw          0/507
    vocals   507/507      description 80/507
    genre    505/507

bpm and mmw are literally zero, not merely sparse.

## Two cohorts, needing different handling
- **soho4_exclusive_partial — 829.** In SOHO4 lots, 30 songs per lot, many
  named "(EX)". Sent to SOHO4 as exclusives; exclusivity now expired.
  Locatable today by lot name.
- **filemaker_migration_partial — 2,432.** In NO lot at all, spread 2014-2024.
  Same signature. No handle to find them by — exactly why they stayed hidden.

Monthly orphan rate is 100% Dec 2025 - May 2026 and 0% from June 2026. That is
the SOHO4 run starting and ending, not a bug that broke and got fixed.

## BUSINESS EXPOSURE — flagged, deliberately NOT acted on
All 3,261 are is_public=true, status='active'. They are live in the catalogue
now, presented as available, with no stem records. If the client portal lists
them, a client could request something that may not be deliverable.
**Erik's decision 2026-09-09: leave them public, just flag them.** Do not
change visibility without asking him again.

## What was built (additive only — nothing existing modified)
`work_queue`:
    wq_id, sku_root (FK -> titles, CASCADE), cohort, reason, note,
    added_at, added_by, resolved_at, resolved_by
    UNIQUE (sku_root, cohort)
    partial index work_queue_open_idx (cohort, resolved_at) WHERE resolved_at IS NULL

A table rather than a column on titles, so it generalises: the other known
backlogs (98 songs with no audio in B2, 275 wrongly-FULL stem_names, 38
CORRECTIONS folders) can go in the same queue instead of being rediscovered.

`v_work_queue_open` — open items joined to title, composer, lot, with
per-field missing_bpm / missing_mmw / missing_description / missing_genre /
missing_mood booleans.

Verified after the write: titles 32,736 unchanged, mix_stems 206,141
unchanged, is_public unchanged, work_queue 3,261 (829 + 2,432).

## To find them
    SELECT * FROM v_work_queue_open WHERE cohort='soho4_exclusive_partial';
    SELECT lot_name, count(*) FROM v_work_queue_open GROUP BY 1 ORDER BY 2 DESC;

To mark one finished:
    UPDATE work_queue SET resolved_at=now(), resolved_by='<who>'
     WHERE sku_root='<sku>' AND resolved_at IS NULL;

## Schema correction
`titles` has NO `sku` column — only `sku_root` plus `variant`. Older project
memory saying titles has a unique `sku` is WRONG. The album digit is still the
last character of sku_root (C32b4904 -> 4 -> Nimbus), which does hold.

## Next, not yet done
1. Verify against B2 whether audio for a sample of the 829 actually exists.
   That decides whether this is bookkeeping or recovery.
2. Surface the queue in the app so a tagger can work it. The view is ready;
   there is no UI for it yet.
