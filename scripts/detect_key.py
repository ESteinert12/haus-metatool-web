#!/usr/bin/env python3
"""
HAUS Audio Analyzer
Detects the musical key AND BPM of an audio file in one pass.
Uses numpy + ffmpeg — no external audio libraries required.

Key detection: Krumhansl-Schmuckler chromagram analysis
BPM detection: onset-strength autocorrelation (tempo estimation)

Usage: python3 detect_key.py <audio_file>

Output (JSON):
  {
    "key": "Bm",           # detected key in HAUS format
    "full_name": "B minor",
    "confidence": 0.82,    # 0.0 - 1.0
    "confident": true,     # false if confidence < 0.75
    "bpm": 96.0,           # detected BPM (nearest 0.5), null if uncertain
    "bpm_confidence": 0.71 # 0.0 - 1.0
  }
"""

import sys
import json
import subprocess
import os
import shutil

try:
    import numpy as np
except Exception as e:
    print(json.dumps({"error": f"numpy import failed: {e}"}))
    sys.exit(1)

# ── Binary resolution ────────────────────────────────────────────────────────
def find_binary(name):
    for path in [
        f'/opt/homebrew/bin/{name}',
        f'/usr/local/bin/{name}',
        f'/usr/bin/{name}',
    ]:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return name

FFMPEG  = find_binary('ffmpeg')
FFPROBE = find_binary('ffprobe')

# ── Constants ─────────────────────────────────────────────────────────────────
KEY_CONFIDENCE_THRESHOLD = 0.75
BPM_CONFIDENCE_THRESHOLD = 0.30

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

NOTE_NAMES         = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab']
NOTE_NAMES_DISPLAY = ['A', 'A#/Bb', 'B', 'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab']

KEY_FRAMERATE = 22050
WINDOW_SIZE   = 8192
HOP_SIZE      = 2048

BPM_FRAMERATE = 8000   # Low SR is fine for rhythm analysis
BPM_FRAME_MS  = 20     # 20ms energy frames
BPM_MIN       = 60
BPM_MAX       = 200


# ── Shared utilities ──────────────────────────────────────────────────────────
def extract_audio(path, offset, duration, samplerate):
    cmd = [
        FFMPEG, "-ss", str(offset), "-t", str(duration),
        "-i", path,
        "-f", "s16le", "-ac", "1", "-ar", str(samplerate),
        "-loglevel", "error", "-"
    ]
    result = subprocess.run(cmd, capture_output=True)
    if not result.stdout:
        return None
    return np.frombuffer(result.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def get_duration(path):
    # WAV files: read header directly — no ffprobe needed
    if path.lower().endswith('.wav'):
        try:
            import wave
            with wave.open(path) as wf:
                return wf.getnframes() / wf.getframerate()
        except Exception:
            pass
    # AIFF: use struct to read header
    if path.lower().endswith(('.aif', '.aiff')):
        try:
            import aifc
            with aifc.open(path) as af:
                return af.getnframes() / af.getframerate()
        except Exception:
            pass
    # Fall back to ffprobe if available
    if os.path.isfile(FFPROBE) or shutil.which(FFPROBE):
        probe = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True
        )
        try:
            return float(probe.stdout.strip())
        except ValueError:
            pass
    return 60.0


# ── Key detection ─────────────────────────────────────────────────────────────
def compute_chroma(data):
    chroma = np.zeros(12)
    for i in range(0, len(data) - WINDOW_SIZE, HOP_SIZE):
        frame = data[i:i + WINDOW_SIZE] * np.hanning(WINDOW_SIZE)
        spectrum = np.abs(np.fft.rfft(frame))
        freqs = np.fft.rfftfreq(WINDOW_SIZE, 1.0 / KEY_FRAMERATE)
        for j, freq in enumerate(freqs):
            if 27.5 < freq < 4200:  # A0 to ~C8
                midi = 69 + 12 * np.log2(freq / 440.0)
                bin_idx = int(round(midi)) % 12
                chroma[bin_idx] += spectrum[j]
    if chroma.max() > 0:
        chroma /= chroma.max()
    return chroma


def score_keys(chroma):
    scores = []
    for root in range(12):
        for mode, profile in [("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)]:
            rotated = np.roll(profile, root)
            score = np.corrcoef(chroma, rotated)[0, 1]
            scores.append((score, root, mode))
    return sorted(scores, reverse=True)


def format_key(root, mode):
    note = NOTE_NAMES[root]
    return f"{note}m" if mode == "minor" else note


def detect_key(path, total_duration):
    sample_points   = [total_duration * 0.1, total_duration * 0.4, total_duration * 0.65]
    sample_duration = min(30, total_duration / 3)

    combined_chroma = np.zeros(12)
    samples_used = 0

    for offset in sample_points:
        data = extract_audio(path, offset, sample_duration, KEY_FRAMERATE)
        if data is not None and len(data) > WINDOW_SIZE:
            combined_chroma += compute_chroma(data)
            samples_used += 1

    if samples_used == 0:
        return {"key": "?", "full_name": "unknown", "confidence": 0.0, "confident": False}

    combined_chroma /= samples_used
    if combined_chroma.max() > 0:
        combined_chroma /= combined_chroma.max()

    scores = score_keys(combined_chroma)
    best_score, best_root, best_mode = scores[0]
    second_score = scores[1][0]

    margin     = best_score - second_score
    confidence = min(1.0, best_score * (1 + margin))

    return {
        "key":        format_key(best_root, best_mode),
        "full_name":  f"{NOTE_NAMES_DISPLAY[best_root]} {best_mode}",
        "confidence": round(float(confidence), 3),
        "confident":  bool(confidence >= KEY_CONFIDENCE_THRESHOLD),
    }


# ── BPM detection ─────────────────────────────────────────────────────────────
AUBIO = find_binary('aubiotempo')

def detect_bpm_librosa(path):
    """
    Use librosa for beat tracking — full file analysis, excellent accuracy.
    Install with: pip3 install librosa --break-system-packages
    """
    try:
        import librosa
        y, sr = librosa.load(path, sr=None, mono=True)
        # beat_track returns (tempo, beat_frames); tempo may be array in 0.10+
        tempo_result, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(np.atleast_1d(tempo_result)[0])
        bpm = round(bpm)

        if not (BPM_MIN <= bpm <= BPM_MAX):
            return None

        # Confidence: consistency of inter-beat intervals
        if len(beat_frames) >= 4:
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)
            intervals  = np.diff(beat_times)
            std        = float(np.std(intervals))
            med        = float(np.median(intervals))
            confidence = max(0.0, min(1.0, 1.0 - std / max(med, 0.01)))
        else:
            confidence = 0.5

        return {"bpm": bpm, "bpm_confidence": round(confidence, 3)}
    except Exception:
        pass
    return None


def detect_bpm_aubio_python(path):
    """
    aubio Python library — kept as secondary option.
    (aubio 0.4.9 does not compile on Python 3.14; skips gracefully if unavailable.)
    """
    try:
        import aubio
        win_s      = 512
        hop_s      = 256
        samplerate = 0

        src = aubio.source(path, samplerate, hop_s)
        sr  = src.samplerate
        tempo = aubio.tempo("default", win_s, hop_s, sr)

        beat_times = []
        while True:
            samples, read = src()
            if tempo(samples):
                beat_times.append(tempo.get_last_s())
            if read < hop_s:
                break

        if len(beat_times) < 4:
            return None

        intervals  = np.diff(beat_times)
        median_int = float(np.median(intervals))
        if median_int <= 0:
            return None

        bpm = round(60.0 / median_int)
        std = float(np.std(intervals))
        confidence = max(0.0, min(1.0, 1.0 - std / max(median_int, 0.01)))

        if BPM_MIN <= bpm <= BPM_MAX:
            return {"bpm": bpm, "bpm_confidence": round(confidence, 3)}
    except Exception:
        pass
    return None


def detect_bpm_aubio_binary(path):
    """
    Use aubiotempo CLI binary as an alternative (requires brew install aubio).
    """
    if not (os.path.isfile(AUBIO) and os.access(AUBIO, os.X_OK)):
        return None

    try:
        result = subprocess.run(
            [AUBIO, path],
            capture_output=True, text=True, timeout=60
        )
        tempos = []
        for line in result.stdout.strip().splitlines():
            parts = line.strip().split()
            if len(parts) == 2:
                try:
                    tempos.append(float(parts[1]))
                except ValueError:
                    pass
        if not tempos:
            return None

        median_bpm = round(float(np.median(tempos)))
        std        = float(np.std(tempos))
        confidence = max(0.0, min(1.0, 1.0 - std / 20.0))

        if BPM_MIN <= median_bpm <= BPM_MAX:
            return {"bpm": median_bpm, "bpm_confidence": round(confidence, 3)}
    except Exception:
        pass
    return None


def _autocorrelate_chunk(audio, frames_per_sec):
    """Run autocorrelation BPM on a single audio chunk. Returns (bpm, confidence) or None."""
    frame_len = int(BPM_FRAMERATE * BPM_FRAME_MS / 1000)
    hop       = max(1, frame_len // 2)

    energy = np.array([
        np.sqrt(np.mean(audio[i:i+frame_len] ** 2))
        for i in range(0, len(audio) - frame_len, hop)
    ])
    onset = np.maximum(0, np.diff(energy))
    if len(onset) < 10:
        return None

    std = onset.std()
    if std > 0:
        onset = (onset - onset.mean()) / std

    ac = np.correlate(onset, onset, mode='full')
    ac = ac[len(ac) // 2:]

    fps       = BPM_FRAMERATE / hop
    lag_min   = max(1, int(fps * 60 / BPM_MAX))
    lag_max   = min(len(ac) - 1, int(fps * 60 / BPM_MIN))
    if lag_min >= lag_max:
        return None

    best_lag = np.argmax(ac[lag_min:lag_max + 1]) + lag_min
    bpm_raw  = (fps * 60) / best_lag

    def ac_at(b):
        if b < BPM_MIN or b > BPM_MAX:
            return -np.inf
        lag = int(round(fps * 60 / b))
        return ac[lag] if 1 <= lag < len(ac) else -np.inf

    candidates = [bpm_raw]
    if BPM_MIN <= bpm_raw / 2 <= BPM_MAX:
        candidates.append(bpm_raw / 2)
    if BPM_MIN <= bpm_raw * 2 <= BPM_MAX:
        candidates.append(bpm_raw * 2)

    best_bpm  = max(candidates, key=ac_at)
    final_lag = int(round(fps * 60 / best_bpm))
    zero_ac   = max(ac[0], 1e-9)
    conf      = float(np.clip(ac[final_lag] / zero_ac, 0, 1)) if final_lag < len(ac) else 0.0
    best_bpm  = round(best_bpm * 2) / 2
    return (best_bpm, conf)


def detect_bpm_numpy(path, total_duration):
    """
    Fallback: sample three windows across the track and pick the strongest result.
    Sampling from 25%, 50%, and 70% into the track avoids intros that don't have
    a beat yet (common in library music where the beat kicks in at :20-:30).
    """
    chunk_dur = min(30.0, total_duration / 3)
    offsets   = [
        total_duration * 0.25,
        total_duration * 0.50,
        total_duration * 0.70,
    ]

    best_bpm, best_conf = None, 0.0
    fps = BPM_FRAMERATE / max(1, int(BPM_FRAMERATE * BPM_FRAME_MS / 1000) // 2)

    for offset in offsets:
        audio = extract_audio(path, offset, chunk_dur, BPM_FRAMERATE)
        if audio is None or len(audio) < BPM_FRAMERATE:
            continue
        result = _autocorrelate_chunk(audio, fps)
        if result and result[1] > best_conf:
            best_bpm, best_conf = result

    return {
        "bpm":            best_bpm if best_conf >= BPM_CONFIDENCE_THRESHOLD else None,
        "bpm_confidence": round(best_conf, 3),
    }


def detect_bpm(path, total_duration):
    # Preferred: librosa (full file, Python 3.14 compatible)
    result = detect_bpm_librosa(path)
    if result is not None:
        return result
    # Secondary: aubio Python library
    result = detect_bpm_aubio_python(path)
    if result is not None:
        return result
    # Tertiary: aubio binary (if installed separately)
    result = detect_bpm_aubio_binary(path)
    if result is not None:
        return result
    # Fallback: numpy autocorrelation across multiple windows
    return detect_bpm_numpy(path, total_duration)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: detect_key.py <audio_file>"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    total_dur  = get_duration(audio_path)

    key_result = detect_key(audio_path, total_dur)
    bpm_result = detect_bpm(audio_path, total_dur)

    print(json.dumps({**key_result, **bpm_result}))
