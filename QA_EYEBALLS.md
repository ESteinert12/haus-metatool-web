# The "needs eyeballs" list — v_needs_eyeballs

Created 2026-09-11. A VIEW, not a report, so it is always current. Query it
anywhere you can run SQL against Neon.

    SELECT severity, category, count(*) FROM v_needs_eyeballs GROUP BY 1,2 ORDER BY 1;
    SELECT * FROM v_needs_eyeballs WHERE severity = 1 ORDER BY category, subject;

Columns: category, severity, subject, detail.
Severity 1 = the data is probably WRONG. 2 = ambiguous. 3 = incomplete, not wrong.

## Counts at creation (900 items)

| sev | category                  | items |
|-----|---------------------------|-------|
| 1   | title_spans_folders       |    76 |
| 1   | shared_audio              |    29 |
| 1   | stub_sized_object         |     0 |
| 2   | stem_in_two_folders       |   412 |
| 2   | folder_sku_not_in_titles  |   132 |
| 3   | row_without_b2_key        |   216 |
| 3   | folder_sku_not_in_titles  |    35 |

## How to read the big ones

**title_spans_folders (76)** — the sharpest category. `R11a2622` claims both
`R11a2622_Mumbai Mood_D_INDIAN` and `R11a2622_On The Move_C_SEINFELD`. One
folder belongs to this SKU and the other does not. Needs someone who knows the
music.

**stem_in_two_folders (412)** — mostly ONE problem: the two spellings of the
R04 composer folder, `cumulus/R04_Tim Ryan O'Kane/` vs
`cumulus/R04_Tim-Ryan O'Kane_CUMULUS/`, byte-identical files. The `_CUMULUS`
spelling matches the `{ID}_{Name}_{COLLECTION}` convention and is the keeper.
Resolving that one folder clears most of this category at once.

**folder_sku_not_in_titles, sev 2 (132)** — e.g. `C32b4433_Clueless Schemer_
Csharpm`. Either a legacy SKU from before the naming system was locked in
(compare R25a44054 / R82a87614, where the folder carries a dead five-digit SKU
but the audio is on the RIGHT song), or genuinely orphaned audio. Check the
title text against `titles` before assuming.

**folder_sku_not_in_titles, sev 3 (35)** — pure case drift, `C53A0052` where
the catalogue has `C53a0052`. Cosmetic, safe to batch-fix.

**row_without_b2_key (216)** — rows pointing at nothing. Cross-check against B2
before deleting anything. We do not delete B2 data and should not delete these
rows either without knowing which is which.

**stub_sized_object** — 0 today because size_bytes only exists for lot 1 so
far. This is how the 846 nimbus stubs become findable: as more lots record
their sizes, stubs surface here automatically instead of needing a bucket scan.

## What it deliberately does NOT flag
- `ALTa`/`ALTb`/`ALTc` and `GUITAR`/`GUITARS` in the same folder. Genuine
  multiple alternates and a naming variant the stem detector collapses on
  purpose. 273 such groups were measured and excluded — flagging them would
  have buried the real findings.
- Specialty-cue CATEGORY folders (`1. EXTENDED IMPACTS`, `SINGLE INSTRUMENT
  BUMPERS`). Those legitimately hold many songs and are not named after a SKU.

## Known unresolved, carried over
Three genuine mis-attachments found 2026-09-11, all inside title_spans_folders:
- `S60a12253` "All The Hop" — 5 stems inside `C32b3173_Could Be Anyone_Fm`
  (a different composer entirely)
- `T31a0013` "Fractured Frames" — 5 stems inside T31a0063's folder
- `S33a2461` "Brick" — 2 stems inside `S33a2541_Duet_Csharpm`
Three others (`R25a44054`, `R82a87614`, `R82a87624` folders) are BENIGN: the
folder carries a legacy SKU but the title text matches, so the audio is on the
right song.
