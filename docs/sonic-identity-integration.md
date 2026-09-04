# Sonic Identity Integration — Design

**Status:** scoped 2026-09-04 · main lane + analysis worker (ocw_a6248e95)
**Source:** Magenta RT2 pipeline (`Desktop/.../mrt2/tmp/generate_music.py`), ear_v7.1 scorer (GTZAN-calibrated)

## Concept

Every business node in the mycelium carries a short generated "sonic identity" — a 4–8s music clip
produced by the Magenta RT2 official pipeline, keyed to the node's cluster category, with
ear-quality metrics (score 0-100, grade S-F, motif, beat) from the validated ear scorer.
The focus panel surfaces: play/pause, score badge, subtle metrics.

## Data model

`public/sonic/manifest.json`:

```jsonc
{
    "version": 1,
    "clips": [
        {
            "id": "food-hospitality-campfire",
            "file": "/sonic/clips/food-hospitality-campfire.wav",
            "prompt": "warm acoustic guitar campfire",
            "seed": 7,
            "seconds": 8,
            "ear": { "score": 100, "grade": "S", "motif": 0.152, "beat": 0.361 }
        }
    ],
    "clusterMap": { "Food & Hospitality": "food-hospitality-campfire", "…": "…" }
}
```

Clips live as static assets (`public/sonic/clips/*.wav`); Vite serves them as-is.
Manifest is loaded at boot into a typed `sonicProfile` slice (one-writer store discipline).

## Audio path

`src/lib/audio/audio-scape.ts` already owns the Web Audio context, mute plumbing
(`setAudioMuted`), and lifecycle hooks (app-init, AppBoot, engine lifecycle).
New module `src/lib/audio/sonic-identity.ts` reuses that AudioContext:
fetch clip → `decodeAudioData` → play/pause with fade; hard-muted when audio is muted.

## Starter pack (validated prompts + best-known seeds)

| Cluster               | Prompt                        | Seed                |
| --------------------- | ----------------------------- | ------------------- |
| Food & Hospitality    | warm acoustic guitar campfire | 7 (100/S validated) |
| Retail & Shops        | bright upbeat boutique pop    | 7                   |
| Professional Services | clean minimal piano pulse     | 7                   |
| Healthcare & Medical  | gentle ambient choir          | 7                   |
| Arts & Culture        | expressive jazz brushes       | 7                   |
| Churches              | reverent organ hymn           | 7                   |

Generator: `producer_mode.py "<prompt>" --per-prompt 1 --seconds 8 --top 1` per row, then
rename + measure with `ear_v7.py`; manifest assembled by `scripts/build-sonic-manifest.mjs` (TBD).

## UI seam (pending worker confirmation)

Focus panel (node focused): play/pause button + score badge ("92/S") + motif/beat microtext.
Selection-dependent (focus is in SELECTION_DEPENDENT_MODES). CSS per css-ownership docs.

## Verification

- Journey test: focus a node → `sonic-play` button visible, badge text matches manifest ear score.
- `npm run qa:journey:headless` per repo rules; `--SkipTestStrategyGapCheck` not applicable (real surface).

## Minimal increment order

1. manifest + 1 clip (Food & Hospitality, the validated 100/S campfire)
2. typed loader + state slice
3. sonic-identity.ts playback (respect mute)
4. focus-panel UI (button + badge)
5. journey test
6. remaining 5 starter clips + clusterMap expansion
