"""Whine/score meter mining: correlate cheap acoustic features with ear scores.

43+ scored wavs sit on disk (ladder, cross, interp). If a numpy-computable
feature predicts ear_v10/whine/beat, future sweeps get instant feedback
without the expensive scorer. CPU-only, zero GPU/stack/RAM pressure.

Features per wav (48k stereo -> mono): rms, peak, crest, centroid,
HF-band energy ratio (8-16kHz / full), onset density, zero-crossing rate,
spectral flatness (Wiener entropy proxy for whine narrowband-ness).
Labels: scraped from every results JSON + scoring log on disk.
"""
import glob
import json
import os
import re
import wave

import numpy as np

OUT = r"C:\tmp\code_analysis"
os.makedirs(OUT, exist_ok=True)

WAV_DIRS = [r"C:\tmp\pitch_ladder", r"C:\tmp\pitch_style_cross", r"C:\tmp\style_interp"]


def load_wav(path):
    with wave.open(path, "rb") as w:
        n = w.getnframes()
        raw = w.readframes(n)
        sr = w.getframerate()
        ch = w.getnchannels()
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def features(a, sr=48000):
    a = a - a.mean()
    rms = float(np.sqrt(np.mean(a * a)) + 1e-12)
    peak = float(np.abs(a).max() + 1e-12)
    out = {"rms": rms, "peak": peak, "crest": peak / rms}
    n = min(len(a), sr * 4)
    seg = a[:n] * np.hanning(n)
    spec = np.abs(np.fft.rfft(seg))
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    tot = spec.sum() + 1e-12
    out["centroid"] = float((freqs * spec).sum() / tot)
    hf = spec[freqs >= 8000].sum()
    out["hf_ratio"] = float(hf / tot)
    # spectral flatness in 6-12kHz (whine = narrowband peak = LOW flatness)
    band = spec[(freqs >= 6000) & (freqs <= 12000)] + 1e-12
    out["hf_flatness"] = float(np.exp(np.log(band).mean()) / (band.mean() + 1e-12))
    env = np.abs(a)
    k = max(1, len(env) // 400)
    env = env[::k]
    d = np.diff(env)
    thr = 0.05 * env.mean() + 1e-9
    out["onset_density"] = float((d > thr).sum() / max(1, len(d)))
    zc = ((a[:-1] < 0) != (a[1:] < 0)).sum()
    out["zcr"] = float(zc / max(1, len(a)))
    return {k: round(v, 6) for k, v in out.items()}


def scrape_labels():
    """filename stem -> {v10, v7, whine, beat} from every results artifact."""
    labels = {}
    # json results files with per-file scores
    for jf in glob.glob(r"C:\tmp\pitch_style_cross\*.json") + glob.glob(r"C:\tmp\style_interp\*.json"):
        try:
            d = json.load(open(jf))
        except Exception:
            continue
        txt = json.dumps(d)
        # entries keyed by amp/cell names; match loosely below per-file
        labels["_raw_" + os.path.basename(jf)] = d
    # scoring.log style lines: amp 10: v10=97 v7=95/S beat=0.382
    for lf in [r"C:\tmp\pitch_ladder\scoring.log"]:
        if not os.path.exists(lf):
            continue
        for line in open(lf):
            m = re.search(r"amp (\d+): v10=(\d+) v7=(\d+)(?:/(\w))? beat=([\d.]+)", line)
            if m:
                amp, v10, v7, grade, beat = m.groups()
                labels[f"amp_{int(amp):d}"] = {"v10": int(v10), "v7": int(v7),
                                              "grade": grade, "beat": float(beat)}
                labels[f"amp_{int(amp):02d}"] = labels[f"amp_{int(amp):d}"]
    return labels


def normalize_label(d):
    """Map the various results-file schemas onto {v10, v7, whine, beat}."""
    if not isinstance(d, dict):
        return None
    out = {}
    if isinstance(d.get("v10"), (int, float)):
        out["v10"] = d["v10"]
    elif isinstance(d.get("overall_v10"), (int, float)):
        out["v10"] = d["overall_v10"]
    if isinstance(d.get("v7"), (int, float)):
        out["v7"] = d["v7"]
    elif isinstance(d.get("score"), (int, float)):
        out["v7"] = d["score"]
    for k in ("whine_pct", "whine", "whinepct"):
        if isinstance(d.get(k), (int, float)):
            out["whine"] = d[k]
            break
    if isinstance(d.get("beat"), (int, float)):
        out["beat"] = d["beat"]
    return out or None


def match_score(stem, labels):
    if stem in labels and isinstance(labels[stem], dict) and "v10" in labels[stem]:
        return labels[stem]
    for jf in ["grid_results.json", "summit_results.json", "whine_scan_results.json",
               "slot_scan_results.json", "final_scan_results.json", "results.json"]:
        raw = labels.get("_raw_" + jf)
        if isinstance(raw, dict):
            for key in (stem, stem + ".wav"):
                if key in raw:
                    norm = normalize_label(raw[key])
                    if norm:
                        return norm
    return None


def main():
    labels = scrape_labels()
    rows = []
    for d in WAV_DIRS:
        for wav in sorted(glob.glob(os.path.join(d, "*.wav"))):
            stem = os.path.splitext(os.path.basename(wav))[0]
            try:
                a, sr = load_wav(wav)
            except Exception as e:
                print(f"  SKIP {stem}: {e}")
                continue
            f = features(a, sr)
            lab = match_score(stem, labels)
            rows.append({"file": stem, "features": f, "label": lab})
            tag = f"v10={lab.get('v10')} whine={lab.get('whine_pct', lab.get('whine', '?'))}" if lab else "UNLABELLED"
            print(f"  {stem}: centroid={f['centroid']:.0f} hf={f['hf_ratio']:.4f} flat={f['hf_flatness']:.4f} onset={f['onset_density']:.4f} [{tag}]")

    with open(os.path.join(OUT, "meter_features.json"), "w") as fh:
        json.dump(rows, fh, indent=1)

    # correlations where labels exist
    lab_rows = [r for r in rows if r["label"] and isinstance(r["label"].get("v10"), (int, float))]
    print(f"\nlabelled rows: {len(lab_rows)}/{len(rows)}")
    if len(lab_rows) >= 6:
        for feat in ["centroid", "hf_ratio", "hf_flatness", "onset_density", "zcr", "crest", "rms"]:
            xs = np.array([r["features"][feat] for r in lab_rows])
            for target in ["v10", "whine", "beat"]:
                ys = np.array([r["label"].get(target, np.nan) for r in lab_rows], dtype=float)
                m = ~np.isnan(ys)
                if m.sum() >= 6:
                    c = np.corrcoef(xs[m], ys[m])[0, 1]
                    print(f"  corr({feat}, {target}): {c:+.3f} (n={m.sum()})")
    print(f"\nwrote {OUT}/meter_features.json")


if __name__ == "__main__":
    main()
