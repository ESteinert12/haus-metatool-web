"""
HAUS intake-time genre suggestion + mislabel check — local inference service.

Run once, keep running in the background (on Kyle's or Erik's machine, wherever
intake happens). Electron's intake flow calls this over localhost HTTP with the
path to the newly-dropped audio file; it returns a genre suggestion and a
mislabel flag for that ONE track, in a couple seconds, without reloading any
models (they're loaded once at startup and held in memory).

Start:
    TF_USE_LEGACY_KERAS=1 python3 service.py
    (listens on http://127.0.0.1:8765)

Call from the app (after a track gets its SKU and files are copied in):
    POST http://127.0.0.1:8765/analyze
    body: {"path": "/full/path/to/the/track's/full-length/audio/file.wav"}

    response: {
      "suggested_genre_1": "...", "p1": 0.41,
      "suggested_genre_2": "...", "p2": 0.18,
      "suggested_genre_3": "...", "p3": 0.09,
      "agrees_with_existing_tag": null,   # app fills this in if it has one to compare
      "mislabel_flag": false,
      "mislabel_consensus_genre": null,
      "mislabel_consensus_frac": 0.0
    }

Requires in this same folder: yamnet.h5, yamnet.py, features.py, params.py,
yamnet_embed.py, genre_classifier.joblib, genre_scaler.joblib,
catalog_embeddings_1024.npy, catalog_embeddings_skus.csv
(the last four are data files, NOT committed to git -- see README.md)
"""
import os
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import csv
import json
import time
import numpy as np
import joblib
import librosa
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
K_NEIGHBORS = 15
CONSENSUS_THRESHOLD = 10  # out of K_NEIGHBORS

print("Loading models (this happens once, at startup)...")
t0 = time.time()

import tensorflow as tf  # noqa: E402
from yamnet_embed import yamnet_frames_model_with_embedding  # noqa: E402
import params as yamnet_params  # noqa: E402

yamnet_model = yamnet_frames_model_with_embedding(yamnet_params)
yamnet_model.load_weights(os.path.join(HERE, "yamnet.h5"))

clf = joblib.load(os.path.join(HERE, "genre_classifier.joblib"))
scaler = joblib.load(os.path.join(HERE, "genre_scaler.joblib"))
class_order = clf.classes_

catalog_X = np.load(os.path.join(HERE, "catalog_embeddings_1024.npy"))
catalog_norms = np.linalg.norm(catalog_X, axis=1, keepdims=True)
catalog_norms[catalog_norms == 0] = 1e-9
catalog_Xn = catalog_X / catalog_norms

catalog_skus = []
catalog_genres = []
with open(os.path.join(HERE, "catalog_embeddings_skus.csv")) as f:
    for row in csv.DictReader(f):
        catalog_skus.append(row["sku"])
        catalog_genres.append(row["genre1"])
catalog_genres = np.array(catalog_genres)

print(f"Models loaded in {time.time()-t0:.1f}s. Ready.")


def extract_embedding(path):
    """15s clip, same offset/fallback convention as the batch pipeline, -> 1024-dim embedding."""
    y, sr = librosa.load(path, sr=16000, mono=True, offset=15, duration=15)
    if len(y) < sr * 2:
        y, sr = librosa.load(path, sr=16000, mono=True, duration=15)
    if len(y) < sr * 1:
        raise ValueError("clip too short to analyze")
    waveform = y.astype(np.float32)[np.newaxis, :]
    _, embedding, _ = yamnet_model.predict(waveform, verbose=0)
    return embedding.mean(axis=0)  # YAMNet gives one embedding per ~1s frame; average over the clip


def analyze(path):
    emb = extract_embedding(path)

    # genre suggestion
    emb_s = scaler.transform(emb.reshape(1, -1))
    proba = clf.predict_proba(emb_s)[0]
    order = np.argsort(-proba)[:3]
    top3 = [(class_order[i], float(proba[i])) for i in order]

    # mislabel / nearest-neighbor check against the full catalog
    norm = np.linalg.norm(emb)
    emb_n = emb / (norm if norm > 1e-9 else 1e-9)
    sims = catalog_Xn @ emb_n
    top_k_idx = np.argpartition(-sims, K_NEIGHBORS)[:K_NEIGHBORS]
    top_k_idx = top_k_idx[np.argsort(-sims[top_k_idx])]
    neighbor_genres = catalog_genres[top_k_idx]
    suggested_top1 = top3[0][0]
    same_as_suggestion = np.mean(neighbor_genres == suggested_top1)
    from collections import Counter
    other_counts = Counter(neighbor_genres)
    dom_genre, dom_n = other_counts.most_common(1)[0]
    mislabel_flag = bool(dom_n >= CONSENSUS_THRESHOLD and dom_genre != suggested_top1)

    return {
        "suggested_genre_1": top3[0][0], "p1": round(top3[0][1], 3),
        "suggested_genre_2": top3[1][0], "p2": round(top3[1][1], 3),
        "suggested_genre_3": top3[2][0], "p3": round(top3[2][1], 3),
        "nearest_neighbor_consensus_genre": dom_genre,
        "nearest_neighbor_consensus_frac": round(dom_n / K_NEIGHBORS, 3),
        "mislabel_flag": mislabel_flag,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep stdout quiet; comment out to debug

    def do_POST(self):
        if self.path != "/analyze":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        path = body.get("path")
        try:
            if not path or not os.path.exists(path):
                raise FileNotFoundError(f"no such file: {path}")
            t0 = time.time()
            result = analyze(path)
            result["_elapsed_sec"] = round(time.time() - t0, 2)
            payload = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            payload = json.dumps({"error": str(e)}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("Listening on http://127.0.0.1:8765  (POST /analyze, GET /health)")
    server.serve_forever()
