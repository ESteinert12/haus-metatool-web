# HAUS intake-time genre suggestion service

Local HTTP service that gives a genre suggestion + mislabel flag for ONE
track at intake time, in about 1 second per track (after a one-time ~7s
model load at startup). Not a batch job — this runs per-track, triggered by
the Electron app at the point a new track gets its SKU.

## What's in this folder vs. what's NOT

Committed to git (code, small enough not to matter):
- `service.py` — the HTTP service itself
- `yamnet.py`, `features.py`, `params.py`, `yamnet_embed.py` — YAMNet model definition
- `yamnet.h5` — YAMNet's pretrained weights (15MB, small enough to commit)
- `requirements.txt`

NOT committed to git — data files, kept in Dropbox/B2 instead (they're
~165MB combined and change whenever the catalog-wide model gets refreshed):
- `genre_classifier.joblib` (66MB) — trained RandomForest, 66 genres, 1024-dim input
- `genre_scaler.joblib` (28KB) — StandardScaler fit alongside it
- `catalog_embeddings_1024.npy` (99MB) — every catalog track's embedding, for the nearest-neighbor mislabel check
- `catalog_embeddings_skus.csv` (650KB) — sku + genre1 index matching the rows in the .npy file

Both Kyle and Erik need all of the above four data files sitting in this
same folder for the service to start. Pull them from wherever they get
dropped (Dropbox/B2) rather than re-generating them.

## Setup (one-time, per machine)

```
pip install -r requirements.txt
```

TensorFlow + tf-keras + scikit-learn + librosa + soundfile + joblib + numpy.
This is the only "install" step — nothing else needs downloading beyond the
code + the four data files above.

## Running it

```
TF_USE_LEGACY_KERAS=1 python3 service.py
```

Leave it running in the background (e.g. as a launchd job, or just a
terminal tab) wherever intake happens. It listens on `http://127.0.0.1:8765`
and does nothing until called.

## Calling it from the app

At the point `writeTrackToDB` runs (new track has its SKU, files are
copied in), make one call:

```js
const res = await fetch('http://127.0.0.1:8765/analyze', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ path: fullPathToTheTracksAudioFile })
});
const suggestion = await res.json();
// { suggested_genre_1, p1, suggested_genre_2, p2, suggested_genre_3, p3,
//   nearest_neighbor_consensus_genre, nearest_neighbor_consensus_frac,
//   mislabel_flag, _elapsed_sec }
```

If the service isn't running (e.g. not started yet, or on a machine that
hasn't set it up), the fetch will just fail to connect — wrap it so intake
still proceeds normally and the suggestion fields are left blank. This
should never block or slow down intake itself; it's an optional enrichment
on top of what already works.

## Honest accuracy context (don't oversell this to Erik)

This is trained on today's catalog and genre labels. Cross-validated
accuracy (held-out, not training-set) was 33-35% overall against a ~66-way
classification with heavy class imbalance — real signal (roughly 11x
better than random guessing) but far from reliable enough to auto-apply.
Treat `suggested_genre_1`/`p1` as a prompt for the human tagging it, not a
replacement for that step. `mislabel_flag` is tuned to be conservative
(only fires on strong, concentrated neighbor disagreement in genres
already shown separable) — it's a review flag, not an automatic
relabeling action.

## Refreshing the model later

The classifier + embeddings reflect the catalog as of 2026-11-11
(~25,224 trimmed/embedded tracks). Re-run the training pipeline
periodically (monthly is reasonable) to pick up new intake and re-save
these four files; there's no need to touch this folder's code when that
happens, just the data files.
