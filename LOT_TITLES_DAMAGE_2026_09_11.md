# lot_titles is 97.5% broken — the July migration stripped the album digit

Found 2026-09-11, chasing "we processed a lot but the songs don't show in the
Finish Queue".

## What is wrong
`lot_titles.sku_root` stores the SKU with the LAST CHARACTER — the album digit —
missing. `C32b499` where the catalogue has `C32b4994`.

The Finish Queue does `JOIN lot_titles lt ON lt.sku_root = t.sku_root`. It is an
INNER join, so a song whose lot row is malformed is INVISIBLE no matter how
unfinished it is. Nothing errors. The queue just looks emptier than reality.

## Scale, by when the row was written

| month     | rows   | valid |
|-----------|--------|-------|
| 2026-07   | 85,892 | 2,086 |
| 2026-08   |     45 |    45 |
| 2026-09   |     10 |    10 |

**The damage is entirely the July bulk migration. Every row written since is
correct, so the live intake code is FINE.** This is one-time data damage, not a
bug to fix in code.

Of the 83,806 broken rows, 83,710 (99.9%) repair by appending the album digit.
96 are genuinely orphaned.

## The dangerous subset: 959 collisions
Where the truncated SKU happens to BE a real, different song, the lot silently
points at the wrong track. Verified case:

  lot 1383 stored `R13a1521` = "Hollaring" (Stratus)
  the lot folder actually contains `R13a15214_DeadRoses_Bmin_SOHOEDM`
  `R13a15214` = "Dead Roses" (Nimbus)

Both are real songs. Only the physical folder settled it.

**956 of the 959 collisions are S33 (722), S60 (132) and R13 (102)** — the three
composers whose sequences run past 999 and therefore mint FIVE-digit SKUs.
Truncating a five-digit SKU lands on a valid four-digit one. The collision and
the five-digit SKU quirk are the same phenomenon.

These are in the view `v_lot_title_damage`. Do NOT auto-resolve them: the
"likely_intended" column is a candidate, not an answer. Either could be right
and only evidence — a lot folder, a delivery record — decides.

## What was repaired
ONLY lot 1383 (`INTAKE LOT_250918_SHO4_09_EDM(EX)` — note the DB name is
missing the O of SOHO). 29 rows repaired mechanically; the 30th was the
Dead Roses collision, repaired using mix_stems.source_lot as independent
evidence that the song was physically in that lot.

The other 83,776 rows are UNTOUCHED, pending a decision.

## Repair guard that earned its keep
    AND NOT EXISTS (SELECT 1 FROM titles t2 WHERE t2.sku_root = lt.sku_root)
This refuses to touch a row whose stored value is itself a real SKU. On the very
first run it caught the Dead Roses collision instead of silently overwriting it.
Any bulk repair MUST keep this guard.
