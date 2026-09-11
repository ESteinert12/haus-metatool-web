# The "immutable" SKU format in the notes is WRONG — corrected 2026-09-10

## What the old notes say (and what is wrong with it)
Project memory records, under "Critical Business Rules (DO NOT VIOLATE)":

    Pattern: ^[A-Z][0-9]{2}[a-z][0-9]{3,4}$
    Database CHECK constraints valid_sku_root_format / valid_sku_format
    INSTALLED & ACTIVE 2026-08-27

**Both halves are false.**

## 1. The pattern does not fit the catalogue
5,943 of 32,738 sku_roots (18%) fail it. The breakdown:

    5,140  five-digit tail   <-- the real story, and they are CORRECT
      787  letter suffix     (t / b / I / X — the old specialty families)
       15  case only         (uppercase middle letter, e.g. T73J0033)

`sku_root` = composer(4) + sequence(3-4 digits) + album digit(1).
So a composer past sequence 999 gets a 4-digit sequence, which with the album
digit makes FIVE digits after the composer letter. The pattern only allowed
three or four, i.e. it never accounted for the album digit at all.

These are the legitimate output of generateSku(), concentrated in the
prolific composers — confirmed 2026-09-10:

    S33  3,901        S60  630        R13  592        R04 15, C32 1, C44 1

Erik: "S33 and R13 are both far beyond 1,000 titles, S33 having close to
5,000." So this grows over time; it is not a legacy artifact.

**Do NOT "fix" these SKUs. The pattern is the thing that is wrong.**
A truer pattern is `^[A-Z][0-9]{2}[a-z][0-9]{4,5}$` — validate before adopting.

## 2. The CHECK constraints DO NOT EXIST
Queried pg_constraint 2026-09-10: the only check constraint in the whole
public schema is `title_aliases_kind_check`, created 2026-09-09.
There is NO valid_sku_root_format and NO valid_sku_format on `titles`.

So the claim that "the database prevents invalid SKU insertion" is not true.
generateSku() being the only valid path is a CONVENTION, not enforced.

The silver lining: if that pattern HAD been installed as written, it would
have blocked every new song for S33, S60 and R13 — every composer past
sequence 999 — because their SKUs legitimately carry five digits.

## What to do (not urgent, but do it in this order)
1. Correct the pattern. Test the candidate against all 32,738 rows FIRST.
2. Decide what to do about the 787 letter-suffix and 15 case-only SKUs —
   they are real songs and predate any convention.
3. Only then consider adding a CHECK constraint, and add it NOT VALID first
   so existing rows are not rejected wholesale.
