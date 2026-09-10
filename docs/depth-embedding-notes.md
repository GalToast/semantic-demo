# Depth codebook geometry (offline, CPU)

Date: 2026-09-10. Lane: pi-main. No live stack touched.

## Correction first

Prior notes recorded a `depth_embedding [12294, 256]` table. Header scan of
all six graphs in `mrt2/mrt2_onnx/` finds **no such initializer**. What exists:

- `temporal_step.onnx`: **`m.m.decoder_embedding` [12294, 1024]** (verified
  loaded, 781,250,034-byte file). This is the second latent table.
- `depth_step.onnx`: no embedding table; a 2-layer 768-hidden transformer
  mapping `depth_in [B,1,1024]` → `logits [B,T,12294]`.
- `temporal_step_win25.onnx`: 0 nodes (empty shell).
- `encoder*.onnx`: only the known `encoder.regular_embedding` [1536, 256].

Scripts: `C:/tmp/depth_map.py`, `C:/tmp/depth_find.py`, `C:/tmp/depth_geom.py`.
Logs: `C:/tmp/depth_map.log`, `C:/tmp/depth_find.log`, `C:/tmp/depth_geom*.txt`.

## Structure: 12294 = 12 x 1024 + 6

Twelve per-depth-level code banks of 1024 codes plus 6 special rows.
Null floor (random-pair cosine, n=4000): **0.040**.

## Bank geometry (cosine on L2-normalized rows)

| bank | adj-cos mean | within-bank mean | verdict              |
| ---- | ------------ | ---------------- | -------------------- |
| 0–4  | 0.05–0.06    | 0.05–0.07        | categorical (≈ null) |
| 5    | 0.090        | 0.093            | weakly smooth        |
| 6    | 0.088        | 0.087            | weakly smooth        |
| 7    | 0.093        | 0.096            | weakly smooth        |
| 8    | 0.112        | 0.106            | graded               |
| 9    | 0.122        | 0.122            | graded               |
| 10   | 0.143        | 0.143            | graded               |
| 11   | **0.391**    | **0.384**        | **smooth manifold**  |

Reference points: pitch-slot states ~0.03 (categorical), CFG bins 0.56–0.63
(smooth). Bank 11 sits between — a genuine cluster, 10x above the floor.

Inter-bank centroid cosine: mean **0.323** (min −0.156, max 0.766) — banks
share a common subspace direction rather than being orthogonal.

Specials (rows 12288–12293): tiny norms (1.5–1.9), nearest neighbor is
bank 11 in all six cases (0.53–0.71), then 10, then 9. Specials live next
to the fine-detail manifold.

## Caveat on adjacency

Code-id order need not be topologically meaningful (unlike the CFG ladder,
where bin index IS magnitude). The verdict above rests on **within-bank
random-pair means**, not adjacency order — bank 11 at 0.384 vs null 0.040
is robust either way.

## Steerability verdict

- Banks 0–4 are categorical: the existing whole-level band masks
  (`STYLE_BAND_PRESETS`) are already the right control for them.
- Bank 11 is smooth: interpolating between rows within bank 11 should move
  fine texture continuously — a **texture-interp dial** the current
  on/off masks cannot express. Banks 9–10 (0.12–0.14) may support weak
  interpolation; 5–8 are marginal.
- Mechanism would be logit biasing toward interpolated bank-11 rows at
  sample time. That is a **server change** (jam sampling path,
  `codex-disk` owns `jam_server.py`) — proposed, not implemented.
- Runtime validation (does interp sound smooth, which bank-11 directions
  are musical) needs a quiet window with a generating stack. Flagged for
  the lanes; nothing here requires it.

## Open

- fp16 variants of the table not compared (same graph, expect same shape).
- Code-row norms distribution not recorded (only specials).
- Which musical attributes live along bank-11 directions: needs scored
  interp renders, i.e. live LM + decode + ear loop.
