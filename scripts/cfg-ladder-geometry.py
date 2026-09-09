"""CFG-ladder geometry: are the CFG-bin embedding rows structured or noise?

Constant_9 (traced from the graph) = [i*11 for i in 0..128] + [1417,1464,1511].
cond[12:140] pitch slots use bases 0..1397; the tail maps:
  drums      cond[140] + base 1408
  cfg-mulan  cond[141] + base 1417   (production bin 20 -> row 1444)
  cfg-notes  cond[142] + base 1464   (production bin 6  -> row 1477)
  cfg-drums  cond[143] + base 1511   (production bin 2  -> row 1520)
Only ONE bin per CFG slot is ever used in production. The rest (~90 rows)
are addressed solely by non-production bins. Question: trained or init noise?

Method (same as the pitch ladder): row norms + cosine-separation between
adjacent bins + cosine to the production row. Structured = distinct learned
concepts (sweep-worthy); noise = dead (close the thread cheaply).
CPU-only, no GPU/stack.
"""

import os

import numpy as np

BASE = r"C:\Users\HP\Desktop\Temp while my comp is at the shop\mrt2"
ONX = os.path.join(BASE, "mrt2_onnx", "fp16")

import onnx
from onnx import numpy_helper

model = onnx.load(os.path.join(ONX, "encoder.onnx"), load_external_data=False)
table = None
for init in model.graph.initializer:
    if init.name == "encoder.regular_embedding":
        table = numpy_helper.to_array(init).astype(np.float64)
print(f"table: {table.shape}")

BASES = {"drums": 1408, "cfg-mulan": 1417, "cfg-notes": 1464, "cfg-drums": 1511}
PROD = {"drums": 8, "cfg-mulan": 27, "cfg-notes": 13, "cfg-drums": 9}
# plausible bin ranges: mulan/notes step 0.2 x40 bins (+7 offset); drums step 1.0 x8 (+7)
RANGES = {
    "drums": range(6, 10),
    "cfg-mulan": range(7, 48),
    "cfg-notes": range(7, 48),
    "cfg-drums": range(7, 16),
}


def cos(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


for slot, base in BASES.items():
    print(
        f"\n=== {slot} (base {base}, production cond {PROD[slot]} -> row {base + PROD[slot]}) ==="
    )
    rows = {c: table[base + c] for c in RANGES[slot] if base + c < 1536}
    norms = [np.linalg.norm(v) for v in rows.values()]
    print(
        f"  rows: {min(rows)}..{max(rows)}  norm mean={np.mean(norms):.3f} std={np.std(norms):.3f} "
        f"min={min(norms):.3f} max={max(norms):.3f}"
    )
    prod = table[base + PROD[slot]]
    adj = []
    keys = sorted(rows)
    for a, b in zip(keys, keys[1:]):  # noqa: B905 (adjacent pairs differ by design)
        adj.append(cos(rows[a], rows[b]))
    print(
        f"  adjacent-bin cosine: mean={np.mean(adj):.3f} min={min(adj):.3f} max={max(adj):.3f}"
    )
    to_prod = [cos(v, prod) for k, v in rows.items() if k != PROD[slot]]
    print(
        f"  cosine to production row: mean={np.mean(to_prod):.3f} min={min(to_prod):.3f} max={max(to_prod):.3f}"
    )
    # verdict heuristic: structured if adjacent bins are mutually distinct (cos < 0.5)
    # AND norms are in the trained band (not collapsed)
    distinct = sum(1 for c in adj if c < 0.5)
    print(f"  distinct adjacent pairs: {distinct}/{len(adj)}")

print("\n=== pitch-slot high-cond reach (slot 127, cond 6..27 -> rows 1403..1424) ===")
reach = {c: table[127 * 11 + c] for c in range(6, 28)}
norms = [np.linalg.norm(v) for v in reach.values()]
print(f"  norm mean={np.mean(norms):.3f} std={np.std(norms):.3f}")
base6 = reach[6]
far = [cos(v, base6) for k, v in reach.items() if k != 6]
print(f"  cosine to cond-6 row: mean={np.mean(far):.3f} min={min(far):.3f}")
