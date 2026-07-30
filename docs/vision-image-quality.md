# Vision Image Quality Policy

**Status:** Active 2026-07-30 · **Supersedes** the W53-era `*.small.png` 50% downscale workflow.

## Problem this fixes

The old visual-QA pipeline downscaled screenshots to `*.small.png` at 50% (e.g.
1280×800 → 640×400, **75% of pixels discarded**) before sending them to vision
models. The stated rationale was "compatible with NIM 1-image HTTP body caps" —
but the NVIDIA NIM constraint is an **image-count cap (1 image/request)**, not a
byte/pixel cap. The downscale was a misdiagnosis.

The consequence (documented in the `visual-audit-false-positive-watchlist` skill,
W53 V4): small text washed out at 640×400, so VLMs perceived "low contrast" on
text that is actually WCAG-AA-compliant in the DOM (probe returned 7.98–19.15:1).
Both jurors agreed because they were fed the **same** downscaled image —
correlated errors, not independent verdicts. VLMs also hallucinated overlaps /
clipping that DOM measurement refuted.

## Policy

1. **Default = lossless passthrough, full resolution.** Send the captured PNG
   verbatim. The 1280×800 / 375×667 captures are already the right resolution for
   modern VLMs (Qwen3-VL, minimax-m3, agnes-2.0-flash) which do their own dynamic
   tiling / token-based high-res handling. **Do not pre-downscale.**

2. **Never JPEG for UI text screenshots.** JPEG compression introduces block
   artifacts on text edges that VLMs read as clipping/overlap. PNG (lossless) is
   the only acceptable format for grading. JPEG is opt-in via
   `prepare-vision-images.mjs --jpeg-q=Q` and is documented as DEGRADING — only
   for a provider with a hard byte cap that rejects lossless PNG.

3. **If a provider genuinely needs a smaller body, downscale intelligently — not
   blindly.** Use `scripts/prepare-vision-images.mjs --long-edge=N` which rescales
   by **longest edge** (aspect preserved) and stays **lossless PNG**. `--long-edge=1024`
   yields 1280×800 → 1024×640 (64% of pixels) — far better than the old 640×400
   (25%), and lossless. Never use a flat 50% linear downscale again.

4. **Capture at the resolution you want to send.** `tests/visual-state-audit.mjs`
   already captures PNG (lossless) with `deviceScaleFactor: 2` for mobile (retina).
   Desktop is `deviceScaleFactor: 1` at 1280×800 — sufficient for VLM grading.
   Prefer re-capturing at a target viewport over lossy post-processing.

## Tooling

### `scripts/prepare-vision-images.mjs` (new)

Parameterized, dependency-light prep. Default = passthrough (node:fs only).
Rescale/JPEG modes require ImageMagick 7 (`magick`, installed).

```bash
# DEFAULT — lossless passthrough, full-res (the fix)
node scripts/prepare-vision-images.mjs
# -> tmp/vision-input/*.png (byte-identical to sources) + manifest.json

# Optional — lossless PNG rescale to longest edge <= 1024 (if a provider needs it)
node scripts/prepare-vision-images.mjs --long-edge=1024 --out tmp/vision-input-le1024

# Explicit legacy downscale (DO NOT USE for grading — documented degradation)
node scripts/prepare-vision-images.mjs --jpeg-q=85   # lossy, text artifacts
```

The script prints an auditable manifest (source dims → output dims + bytes,
%pixels retained) so any degradation is visible. It auto-excludes `*.small.png`
from its input glob so the legacy downscaled variants are never fed back in.

### `scripts/vision-grader-inline.mjs` (updated)

Now defaults to **full-res** `tmp/phase2-*.png` instead of `tmp/phase2-*.small.png`.
Configurable via env:

```bash
# full-res (default)
node scripts/vision-grader-inline.mjs --models=agnes-2.0-flash

# legacy downscaled set (opt-in, for reproducing old W53 runs only)
VISION_IMAGES_SUFFIX=.small node scripts/vision-grader-inline.mjs --models=...

# a prepared set from prepare-vision-images.mjs
VISION_IMAGES_DIR=tmp/vision-input-le1024 node scripts/vision-grader-inline.mjs --models=...
```

MIME is now extension-aware (`image/png` / `image/jpeg`) so JPEG from the prep
script is not mislabeled.

### `scripts/vision-jury.mjs`

Already sends raw base64 of whatever files the `questions.json` points at (no
downscale). Point its `images[]` at full-res PNGs or a `prepare-vision-images.mjs`
output dir.

## Verification

- `node scripts/prepare-vision-images.mjs --dry-run` — confirms the plan without
  writing.
- The manifest's `%px` column must read `100%` for the default passthrough, or
  the documented ratio for an opt-in rescale. Anything below 64% for UI text is a
  red flag — re-capture at a larger viewport instead.
- After a grading run, if a VLM flags a contrast/clipping issue, cross-verify
  against DOM truth (`getComputedStyle` + WCAG probe, or `getBoundingClientRect`)
  per the `visual-audit-false-positive-watchlist` skill BEFORE shipping a fix.

## Per-provider notes (empirical, update as probed)

- **NVIDIA NIM** (llama-vision / nemotron-vl / minimax-m3): caps **image count**
  at 1/request (use `--mode=single`). No documented pixel cap that requires the
  50% downscale; full-res 1280×800 PNG accepted in `single` mode.
- **Qwen3-VL** (modelscope): supports `resized_height`/`resized_width` for
  fine-grained control; dynamic tiling handles high-res natively. Send full-res.
- **agnes-2.0-flash**: accepts full-res PNG; the W53 hallucinations traced to the
  downscale, not the model.

## See also

- `~/.pi/agent/projects-memory/semantic-explorer/skills/visual-audit-false-positive-watchlist/SKILL.md`
  — the W53 V4 false-positive category this policy retires.
- `docs/visual-qa-2026-07-15.md` — the audit that introduced `*.small.png`
  (historical; the downscale step is now removed from the default path).
- `tests/visual-state-audit.mjs` — the lossless PNG capture source.
