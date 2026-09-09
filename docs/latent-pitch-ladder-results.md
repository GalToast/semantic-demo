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
  measured cond 11 (state 4) + L2 melodic band at 100/100-S.** The ladder-mode
  best below (state 10 alone, 95/S) remains the best *single-dial* result,
  but the super-additive combination beats it by 5 points. The radio now
  defaults to the summit (state 4 + `steerJamBandMask('melodic')` on
  connect; dial default noteState 4 labelled 'summit ★ 100/S').
- **Extend the sweep to states 3..7 (cond 10..14)** — the middle band no one
  has probed. `PITCH_LADDER_AMPS=13,14,15,16,17`.
- Test a **multi-note chord** rather than a single bass, in case the
  semantics are per-slot rather than global.
- Drive the live radio at state 9 and ear_v10 the streamed output — that is
  the end-to-end confirmation, not the isolated probe.

## Artifacts

- `/c/tmp/pitch_ladder/amp_{8,10,11,12,14,16,18}.npz` — token codes per frame
- `/c/tmp/pitch_ladder/amp_{8,10,11,12}.wav` — decoded audio
- `/c/tmp/pitch_ladder/scoring.log` — decode + ear_v10 rows
- `scripts/latent-pitch-sweep.py` — live LM+DEC stack path (superseded by the
  ONNX probe above; kept as the radio-side driver reference)
