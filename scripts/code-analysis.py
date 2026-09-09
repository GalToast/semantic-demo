"""Mine scored token draws for mechanism (CPU-only, zero GPU/stack).

Three questions, all answerable from artifacts already on disk:
1. SUMMIT GRADIENT: sum_c9->c10->c11 (x L2/none) — which RVQ levels carry
   the climb? A level-concentrated climb = mechanism + a finer dial.
2. COND-12 CLIFF: grid_c12_none vs sum_c11_none — adjacent conds, one is
   summit-adjacent (88/80-A), the other off-limits. What collapses?
3. L2 EFFECT: sum_c*_L2 vs sum_c*_none per cond — L2's lift varies by cond
   (c9: +13, c11: +12?). Where in code space does L2 act?

Metrics per (file, level): code histogram entropy, top-1 concentration,
silence-dropout rate (code 0 runs?), level-active rate. Deltas between
configs tell the story.
"""
import os

import numpy as np

PX = r"C:\tmp\pitch_style_cross"
PL = r"C:\tmp\pitch_ladder"
OUT = r"C:\tmp\code_analysis"
os.makedirs(OUT, exist_ok=True)

FILES = {
    # summit gradient (none)
    "c9_none": f"{PX}/sum_c9_none.npz",
    "c10_none": f"{PX}/sum_c10_none.npz",
    "c11_none": f"{PX}/sum_c11_none.npz",
    # summit gradient (L2)
    "c9_L2": f"{PX}/sum_c9_L2.npz",
    "c10_L2": f"{PX}/sum_c10_L2.npz",
    "c11_L2": f"{PX}/sum_c11_L2.npz",
    # cond-12 cliff (style sweep at c12)
    "c12_none": f"{PX}/grid_c12_none.npz",
    "c12_L2": f"{PX}/grid_c12_L2.npz",
    "c12_all12": f"{PX}/grid_c12_all12.npz",
    # ladder endpoints (single-bass, style-free)
    "amp8": f"{PL}/amp_8.npz",
    "amp10": f"{PL}/amp_10.npz",
    "amp11": f"{PL}/amp_11.npz",
    "amp12": f"{PL}/amp_12.npz",
}


def load(name, path):
    if not os.path.exists(path):
        print(f"  {name}: MISSING, skipped")
        return None
    d = np.load(path)
    key = "codes" if "codes" in d else list(d.keys())[0]
    codes = d[key]
    print(f"  {name}: shape {codes.shape} range [{codes.min()},{codes.max()}]")
    return codes


def level_stats(codes):
    """Per-RVQ-level distribution stats. codes: (frames, 12), local 0..1023."""
    out = []
    for q in range(codes.shape[1]):
        col = codes[:, q]
        hist = np.bincount(col, minlength=1024).astype(np.float64)
        p = hist / hist.sum()
        nz = p[p > 0]
        ent = float(-(nz * np.log2(nz)).sum())
        top1 = float(p.max())
        drop = float((col == 0).mean())
        out.append({"entropy": round(ent, 3), "top1": round(top1, 4), "dropout": round(drop, 4)})
    return out


def main():
    import json

    data, stats = {}, {}
    for name, path in FILES.items():
        c = load(name, path)
        if c is not None:
            data[name] = c
            stats[name] = level_stats(c)

    lines = []
    full: dict = {"per_level": stats}

    def show(s):
        print(s)
        lines.append(s)

    show("\n=== 1. SUMMIT GRADIENT (none): c9 -> c10 -> c11 ===")
    show("level | c9_ent c10_ent c11_ent | c9_top1 c11_top1 | c9_drop c11_drop")
    grad = {}
    for q in range(12):
        r = [stats[k][q] for k in ("c9_none", "c10_none", "c11_none") if k in stats]
        if len(r) == 3:
            show(
                f"L{q:2d} | {r[0]['entropy']:6.2f} {r[1]['entropy']:6.2f} {r[2]['entropy']:6.2f} | "
                f"{r[0]['top1']:.3f} {r[2]['top1']:.3f} | {r[0]['dropout']:.3f} {r[2]['dropout']:.3f}"
            )
            grad[q] = round(r[2]["entropy"] - r[0]["entropy"], 3)
    full["gradient_entropy_delta_c9_c11"] = grad
    conc = sorted(grad, key=lambda q: abs(grad[q]), reverse=True)[:4]
    show(f"biggest entropy movers (levels carrying the climb): {conc}")
    full["gradient_carrier_levels"] = conc

    show("\n=== 2. COND-12 CLIFF: c11_none vs c12_none ===")
    if "c11_none" in stats and "c12_none" in stats:
        show("level | c11_ent c12_ent | c11_top1 c12_top1 | c11_drop c12_drop")
        cliff = {}
        for q in range(12):
            a, b = stats["c11_none"][q], stats["c12_none"][q]
            show(
                f"L{q:2d} | {a['entropy']:6.2f} {b['entropy']:6.2f} | "
                f"{a['top1']:.3f} {b['top1']:.3f} | {a['dropout']:.3f} {b['dropout']:.3f}"
            )
            cliff[q] = {"d_ent": round(b["entropy"] - a["entropy"], 3),
                        "d_drop": round(b["dropout"] - a["dropout"], 4)}
        full["cliff_delta"] = cliff
        worst = sorted(cliff, key=lambda q: abs(cliff[q]["d_drop"]) + abs(cliff[q]["d_ent"]) / 10, reverse=True)[:4]
        show(f"collapse centers (levels where c12 breaks): {worst}")
        full["cliff_center_levels"] = worst

    show("\n=== 3. L2 EFFECT per cond: (L2 - none) entropy delta ===")
    l2eff = {}
    for c in ("c9", "c10", "c11"):
        a, b = stats.get(f"{c}_none"), stats.get(f"{c}_L2")
        if a is None or b is None:
            continue
        d = [round(b[q]["entropy"] - a[q]["entropy"], 3) for q in range(12)]
        l2eff[c] = d
        show(f"{c}: " + " ".join(f"L{q}:{v:+.2f}" for q, v in enumerate(d)))
    full["l2_effect"] = l2eff

    show("\n=== 4. LADDER endpoints: amp8 (74/B) vs amp10 (95/S) vs amp11 (53/D) ===")
    if all(k in stats for k in ("amp8", "amp10", "amp11")):
        show("level | amp8_ent amp10_ent amp11_ent | amp8_top1 amp10_top1 amp11_top1")
        for q in range(12):
            r = [stats[k][q] for k in ("amp8", "amp10", "amp11")]
            show(
                f"L{q:2d} | {r[0]['entropy']:6.2f} {r[1]['entropy']:6.2f} {r[2]['entropy']:6.2f} | "
                f"{r[0]['top1']:.3f} {r[1]['top1']:.3f} {r[2]['top1']:.3f}"
            )

    with open(os.path.join(OUT, "code_analysis.json"), "w") as f:
        json.dump(full, f, indent=1)
    with open(os.path.join(OUT, "code_analysis.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\nwrote {OUT}/code_analysis.json + .txt")


if __name__ == "__main__":
    main()
