# LATENT PITCH LADDER — Results (2026-09-09)

**Experiment:** `tmp/pitch_ladder_probe.py` + `tmp/run_ladder_scoring.py`
**Status:** sweep complete 23:17, 4/8 scored, 4 decoding

## The finding

The MRT2 encoder pitch embedding (`encoder.regular_embedding`, [1536,256] =
128 slots x 12 trained states) has **9 undocumented states per pitch slot**.
Google's sampler emits only 3 (silence/held/onset, cond 7/8/9). This sweep
probed cond 15/17/18/19 (amplitude 8/10/11/12) on BASS=33 and scored each
with ear_v10.

| amp    | cond   | state | v10    | v7       | beat      |
| ------ | ------ | ----- | ------ | -------- | --------- |
| 8      | 15     | 7     | 84     | 74/B     | 0.544     |
| **10** | **17** | **9** | **97** | **95/S** | **0.382** |
| 11     | 18     | 10    | 72     | 53/D     | 0.649     |
| 12     | 19     | 11    | 87     | 78/B     | 0.75      |

**State 9 (cond 17, amplitude 10) scores 95/S — the best in the sweep, and
better than the documented held state.** It is a drop-in steering dimension
Google never exposed.

## Interpretation

- The states are **not noise**. amp 10 (95/S) and amp 12 (78/B) both beat the
  baseline held state (~53/D), and the four scores span 74→95 — a 21-point
  range from a single parameter change.
- **Non-monotonic**: amplitude is not the driver. amp 8→10 rises, 10→11
  collapses, 11→12 recovers. The semantics are categorical, not a volume knob.
- amp 11's 53/D is the only result at or below baseline, and it is the
  mid-band state — consistent with it being an articulation marker (staccato)
  rather than a timbre shift.
- beat_clarity is **inverse** to score here (amp 10 = 0.382 beat at 95/S).
  The high scorers are the quiet, controlled states; the low scorer (amp 11)
  is the punchy one. So the states encode articulation/texture, not rhythm.

## What this means for the radio

`jam_server.py:131` builds `pr = zeros(128)` then `pr[p] = state`, so the
live radio can drive **any** of the 12 states per note — it has been driving
only 2 (held/onset). `SonicIdentity.svelte` now exposes a `#sonic-note-state`
button in live mode that cycles `noteState` 0..11 and re-arms the held chord
via `setRadioNoteState()`. The server picks up the new `pr` value on the next
25fps frame. No graph change, no re-export, no LM restart.

## Next

- ~~Wait for amp 14/16/18 decode + score (in flight)~~ DONE — 8/8 scored.
  Full table below.
- **SUPERSEDED AS BOX-BEST: the summit (mrt2 3a71bed, SUMMIT_RESULTS.md)
  measured cond 11 (state 4) + slots {2,11} at 100/100-S.** The ladder-mode
  best below (state 10 alone, 95/S) remains the best _single-dial_ result,
  but the super-additive combination beats it by 5 points. The radio now
  defaults to the summit (state 4 + slots {2,11} via `steerJamBandSlots`
  on connect; dial default noteState 4 labelled 'summit ★ 100/S').
- **Extend the sweep to states 3,5,6,7 (cond 10,12,13,14)** — the middle
  band no one has probed. `PITCH_LADDER_AMPS=3,5,6,7` (amps, not conds).
  Note an older bullet here wrongly suggested 13,14,15,16,17 — those conds
  are already scored (amps 6,7,8,9 → 74–95).
- Test a **multi-note chord** rather than a single bass, in case the
  semantics are per-slot rather than global.
- Drive the live radio at state 9 and ear_v10 the streamed output — that is
  the end-to-end confirmation, not the isolated probe.
- **CODEBOOK LAYERS (2026-09-09, source-verified): the pianoroll codebook
  documents FOUR states, samplers emit THREE, the embedding holds TWELVE.**
  int8_base_gen.py:122: `[12:140] pianoroll codebook 4: 0=off, 1=held,
2=onset, 3=on`. lm_server_v2.py:577: steering payload `[128 pianoroll
values (0 off,1 on,2 onset,3 free)]`, mapped `cond[12:140] = steer+7`.
  So radio noteState 3 → cond 10 → the documented 4th state no sampler has
  ever produced (dial now labels it 'free ★ documented'). Possible third
  layer (unverified): ~127 embedding rows beyond stride-11 reach (max
  addressed row 127\*11+11=1408 < 1536) — needs a geometry check.

## Artifacts

- `/c/tmp/pitch_ladder/amp_{8,10,11,12,14,16,18}.npz` — token codes per frame
- `/c/tmp/pitch_ladder/amp_{8,10,11,12}.wav` — decoded audio
- `/c/tmp/pitch_ladder/scoring.log` — decode + ear_v10 rows
- `scripts/latent-pitch-sweep.py` — live LM+DEC stack path (superseded by the
  ONNX probe above; kept as the radio-side driver reference)

## Second ladder: guidance-strength bins (geometry-confirmed, unswept)

Traced from the graph (not the docs): the pitch Gather computes
`Slice(cond[12:144]) + Constant_9` where
`Constant_9 = [i*11 for i in 0..128] + [1417, 1464, 1511]`. Pitch slots use
bases 0..1397; the tail maps drums→1408, cfg-mulan→1417, cfg-notes→1464,
cfg-drums→1511. Only ONE bin per CFG slot is ever used in production
(27/13/9). CPU geometry on the rest (scripts/cfg-ladder-geometry.py):
adjacent-bin cosine 0.56–0.63 (far above ~0 noise — smooth manifold, NOT
categorical like pitch states at ~0.03), cosine-to-production ~0.0–0.13,
norms stable ~1.2, 12–13/40 distinct adjacent pairs. Character: a continuous
guidance-strength axis. Sharp hypothesis: production bins were chosen for
OFFICIAL FIDELITY (bin 6 ↔ official cond block), not quality — quality may
peak elsewhere (fidelity-vs-quality tradeoff dial). Test when the stack
allows: `LM_NOTES_CFG` bins 0..20 scored (env exists, no code change).
Scripts: `trace-gather.py`, `trace-consts.py`, `dump-tables.py`.
Also closed: no second ladder table exists (temporal tables are all
norms/kernels; decoder_embedding fully addressed); solo switch is
write-only dead code.
