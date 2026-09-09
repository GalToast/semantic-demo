"""Joint-structure mining of scored token draws (CPU-only, zero GPU/stack).

The marginal analysis (scripts/code-analysis.py) showed the c9->c11 climb
is NOT in per-level entropies — it must live in JOINT structure. This probes:
1. BIGRAM ENTROPY per level (motif proxy): repetition = low bigram entropy.
   Winner should show locked transitions where the loser wanders.
2. TOP-5 CODE IDENTITY per level: WHICH codes lock (marginals showed the
   strength, not the address). Shared top codes across good configs =
   attractors; loser-specific codes = traps.
3. CROSS-LEVEL MI (adjacent levels): coherent streams predict each other;
   mush does not. Normalized MI in [0,1].

Same artifacts, same loader. No GPU, no stack.
"""

import json
import os

import numpy as np

PX = r"C:\tmp\pitch_style_cross"
PL = r"C:\tmp\pitch_ladder"
OUT = r"C:\tmp\code_analysis"
os.makedirs(OUT, exist_ok=True)

FILES = {
    "c9_none": f"{PX}/sum_c9_none.npz",
    "c11_none": f"{PX}/sum_c11_none.npz",
    "c11_L2": f"{PX}/sum_c11_L2.npz",
    "c12_none": f"{PX}/grid_c12_none.npz",
    "amp8": f"{PL}/amp_8.npz",
    "amp10": f"{PL}/amp_10.npz",
    "amp11": f"{PL}/amp_11.npz",
}
# ear_v7 reference scores for correlation readout
SCORES = {
    "c9_none": 75,
    "c11_none": 88,
    "c11_L2": 100,
    "c12_none": None,
    "amp8": 74,
    "amp10": 95,
    "amp11": 53,
}


def load(path):
    d = np.load(path)
    key = "codes" if "codes" in d else list(d.keys())[0]
    return d[key]


def bigram_entropy(col):
    pairs = {}
    for a, b in zip(col[:-1], col[1:]):  # noqa: B905 (pairwise by design)
        pairs[(int(a), int(b))] = pairs.get((int(a), int(b)), 0) + 1
    tot = sum(pairs.values())
    return float(-sum((c / tot) * np.log2(c / tot) for c in pairs.values()))


def topk(col, k=5):
    hist = np.bincount(col, minlength=1024)
    idx = np.argsort(hist)[::-1][:k]
    return [(int(i), int(hist[i])) for i in idx]


def norm_mi(a, b):
    ha = np.bincount(a, minlength=1024).astype(np.float64)
    hb = np.bincount(b, minlength=1024).astype(np.float64)
    ha /= ha.sum()
    hb /= hb.sum()
    joint = {}
    for x, y in zip(a, b):  # noqa: B905 (same-length columns)
        joint[(int(x), int(y))] = joint.get((int(x), int(y)), 0) + 1
    n = len(a)
    mi = 0.0
    for (x, y), c in joint.items():
        p = c / n
        mi += p * np.log2(p / (ha[x] * hb[y] + 1e-18) + 1e-18)
    ea = -sum(p * np.log2(p) for p in ha if p > 0)
    eb = -sum(p * np.log2(p) for p in hb if p > 0)
    return round(float(mi / (np.sqrt(ea * eb) + 1e-12)), 4)


def main():
    data = {}
    for name, path in FILES.items():
        if os.path.exists(path):
            data[name] = load(path)
            print(f"  {name}: {data[name].shape}")
        else:
            print(f"  {name}: MISSING")

    full: dict = {}
    lines = []

    def show(s):
        print(s)
        lines.append(s)

    names = [n for n in FILES if n in data]

    show("\n=== 1. BIGRAM ENTROPY per level (low = repetitive/motific) ===")
    show("level | " + " ".join(f"{n:>9}" for n in names))
    bigrams: dict = {n: [] for n in names}
    for q in range(12):
        row = []
        for n in names:
            e = bigram_entropy(data[n][:, q])
            bigrams[n].append(round(e, 2))
            row.append(f"{e:9.2f}")
        show(f"L{q:2d}  | " + " ".join(row))
    full["bigram_entropy"] = bigrams

    show("\n=== 2. TOP-5 CODE IDENTITY, focus levels (L0,L1,L2,L6) ===")
    full["top5"] = {}
    for q in (0, 1, 2, 6):
        show(f"-- L{q} --")
        full["top5"][q] = {}
        for n in names:
            t = topk(data[n][:, q])
            full["top5"][q][n] = t
            show(f"  {n:9} (score {SCORES[n]}): {t}")

    show("\n=== 3. CROSS-LEVEL normalized MI (adjacent pairs) ===")
    show("pair  | " + " ".join(f"{n:>9}" for n in names))
    full["xmi"] = {}
    for q in range(11):
        row = []
        for n in names:
            m = norm_mi(data[n][:, q], data[n][:, q + 1])
            full["xmi"].setdefault(n, []).append(m)
            row.append(f"{m:9.3f}")
        show(f"L{q}-L{q + 1} | " + " ".join(row))

    with open(os.path.join(OUT, "joint_analysis.json"), "w") as f:
        json.dump(full, f, indent=1)
    with open(os.path.join(OUT, "joint_analysis.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\nwrote {OUT}/joint_analysis.json + .txt")


if __name__ == "__main__":
    main()
