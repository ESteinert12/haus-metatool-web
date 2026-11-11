# Feature: auto-fill KSL composer when an RMO movie is picked

For Erik, to apply against the real ATMOSPHERE checkout. Not applied
anywhere yet — nothing here has touched Kyle's clone's `index.html`/`api.js`
or any live file. Three pieces:

## 1. Migration: `migration_041_rmo_composer_crosswalk.sql`

Attached alongside this doc. Adds `rmo.composer_name` and populates it for
2,245 titles (70.5% of the current RMO list) from this session's KSL→RMO
enrichment work. **Before running against production**, re-confirm the
`rmo` table's real column name — Kyle's clone's migration files say `name`,
but the clone's own `addIntakeTagNew` code (and a comment in `api.js` ~line
736) say production was hand-altered to `rmo_name` on 2026-09-03. The SQL
below assumes `rmo_name`; swap it if the real checkout disagrees.

Coverage gap, for context: the other ~30% of RMO titles either came from
the video-game composer pass (125 titles, never got per-title composer
attribution saved — a known, separate gap) or pre-date this whole
enrichment project entirely (legacy FileMaker import, no composer link ever
established). Those rows will just have `composer_name IS NULL` — the
feature below degrades gracefully for them (no auto-fill, nothing breaks).

## 2. `index.html` — include `composer_name` when loading RMO rows

Around line 8209, in the function that populates `_intakeRmo`:

**Before:**
```js
const rmoRows = await pgQ('SELECT DISTINCT ON (rmo_name) rmo_id, rmo_name FROM rmo ORDER BY rmo_name')
if (rmoRows && rmoRows.length) _intakeRmo = rmoRows
```

**After:**
```js
const rmoRows = await pgQ('SELECT DISTINCT ON (rmo_name) rmo_id, rmo_name, composer_name FROM rmo ORDER BY rmo_name')
if (rmoRows && rmoRows.length) _intakeRmo = rmoRows
```

That's the only query change needed — `_intakeRmo` rows now carry
`composer_name` alongside `rmo_name`.

## 3. `index.html` — auto-fill KSL when an RMO tag is added

In `addIntakeTagNew(fieldId)` (~line 8441), inside the existing
`fieldId.startsWith('rmo-')` branch, after the RMO tag itself is
successfully added. Current code:

```js
    } else if (fieldId.startsWith('rmo-')) {
      const rows = await pgQ(`INSERT INTO rmo (rmo_name) VALUES ($1) ON CONFLICT (rmo_name) DO UPDATE SET rmo_name=EXCLUDED.rmo_name RETURNING rmo_id`, [val])
      if (rows && rows.length && !_intakeRmo.find(r => r.rmo_name === val)) {
        _intakeRmo.push({ rmo_id: rows[0].rmo_id, rmo_name: val })
        document.querySelectorAll('[id^="rmo-dl-"]').forEach(dl => {
          const opt = document.createElement('option'); opt.value = val; dl.appendChild(opt)
        })
      }
    }
```

**Add this right after that block** (still inside the same `else if`,
before the closing brace):

```js
      // Auto-fill the matching KSL composer, if the crosswalk has one for
      // this movie and the row/track's KSL field doesn't already have it.
      // fieldId is like "rmo-3" -- the matching KSL field for the same
      // row is "ksl-3". Purely a UI convenience: the composer name is
      // expected to already be a real, existing ksl_name (it's always one
      // of the composer names this project has already verified and
      // seeded), so this never needs its own DB insert -- addIntakeTagNew's
      // own ksl branch handles persistence if the user later edits it.
      const rowIdx = fieldId.slice(4) // strip "rmo-"
      const match = _intakeRmo.find(r => r.rmo_name === val)
      if (match && match.composer_name) {
        const kslFieldId = 'ksl-' + rowIdx
        const kslContainer = document.getElementById(`${kslFieldId}-tags`)
        const already = kslContainer && Array.from(kslContainer.querySelectorAll('[data-tag]')).some(el => el.dataset.tag === match.composer_name)
        if (kslContainer && !already) _addTag(kslFieldId, match.composer_name)
      }
```

### Notes / things to actually verify before shipping
- Not tested against a live page or real data — written by reading the
  surrounding code carefully, not by running it. Needs a real smoke test:
  pick an RMO title known to be in the crosswalk (e.g. "1917" → Thomas
  Newman, confirmed in `crosswalk_movie_to_composer.json`) and confirm the
  KSL chip appears.
- `fieldId.slice(4)` assumes the `rmo-` prefix is always exactly 4
  characters — true today (`rmo-` + row index), but fragile if the naming
  convention ever changes. A `fieldId.replace(/^rmo-/, '')` would be
  slightly more robust; using the simpler version to match the file's
  existing style (`fieldId.startsWith('ksl-')` elsewhere in this same
  function uses the same assumption).
- This only fires when a user actively picks/types a matching RMO value
  during intake — it does not retroactively fill KSL for already-tagged
  titles. A separate one-off script could backfill existing `title_rmo` /
  `title_ksl` rows from the crosswalk if that's wanted too; not built here,
  out of scope unless asked for.
