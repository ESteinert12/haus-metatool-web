# FileMaker MMW recovery — 2026-09-10  (DONE, verified)

## Result
    mmw missing   32,420  ->  4,050      28,370 rows recovered in one pass
    description    1,894  ->  1,894      (migration DID carry description)
    ksl_ids                    1,431     (migration DID carry ksl; 1 filled)
    bpm                        9,803     (FileMaker never held bpm)
Verified in the app: MMW renders as a proper phrase list, not literal \n.

## What actually happened
The FileMaker->Neon migration carried description and ksl but SILENTLY DROPPED
mmw. Before this import only 318 of 32,738 titles had an mmw, and every one of
those was created by the NEW ATMOSPHERE intake (June 2026 on).

Erik's recollection is what cracked it: FileMaker would not mint a SKU if ANY
field was left untouched, so the data had to exist there. It did.
**This was a RECOVERY, not a re-typing job** — the previous plan (type MMW by
hand for thousands of songs) was based on a false premise.

## The export
Erik exported SKU / MMW / KSL / Description from FileMaker as a .tab file.
Classic FileMaker shape, worth knowing for next time:
  - record separator = **CR (\r)**, NOT newline  (`wc -l` returns 0 — misleading)
  - field separator  = TAB
  - in-field line breaks = **VT (0x0B)**, 819,991 of them
  - UTF-8, no header row
Parsed to `fm_mmw_flat.tsv` (one record per line, in-field breaks escaped as
literal \n). 32,512 records: 28,373 mmw, 31,102 ksl, 30,489 description.

## The importer — /api/fm/import-metadata
    ?dryRun=1 (default) | ?dryRun=0 | ?file=fm_mmw_flat.tsv
  - matches sku_root CASE-INSENSITIVELY (the export has R19C0011, T73A0063 —
    an exact match silently drops them). Matched 32,509 of 32,738 = 99.3%.
  - **NEVER OVERWRITES** — only fills a column that is NULL or ''.
  - writes description first, then mmw, then ksl; batches of 500 via _pgRetry.

## CORRECTION 2026-09-10 (same day) — I got the remaining gap WRONG at first
I first wrote that all 4,050 titles still missing mmw were created on/after
2026-06-01, and concluded the CURRENT INTAKE was failing to capture mmw. That
was vacuous: **the FileMaker migration itself ran on 2026-06-26**, so every one
of the 32,738 rows has a created_at after 1 June. The date proved nothing.

The real distribution:

    2026-06-26   32,529 titles   <-- the migration.  4,027 still lack mmw
    everything after                209 titles total (Jul/Aug/Sep), ~23 lack mmw

So the 4,050 are 4,027 migration rows + ~23 recent. The export itself had a
blank mmw for 4,139 of its 32,512 records — those songs never had an mmw in
FileMaker either. **It is blank at source, not a pipeline leak.** New intake
since the migration is only ~209 songs and is largely complete.

## Noted in passing, needs its own look
5,943 sku_roots (18% of the catalogue) do NOT match the "immutable" format
`^[A-Z][0-9]{2}[a-z][0-9]{3,4}$`. They predate the August CHECK constraints so
they are grandfathered, but "immutable format" and "18% violate it" should not
both be true in the notes.
