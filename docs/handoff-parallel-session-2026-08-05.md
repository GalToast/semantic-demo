# Handoff — Parallel Session (2026-08-04/05 late-night)

> Main lane. 5 files changed (93+, 10−), uncommitted at session end.
> QA: `qa:contract` **309 pass / 0 fail** · `qa:journey` **60/60 pass**.
> No gate blockers — parallel lane can proceed freely.

---

## 1 · Changes This Session

All edits are **mobile-premium CSS + one Svelte layout + one e2e spec**.
Comments inline reference the "2026-08-04 sweep" / "W58" audit origins.

| # | File (relative) | One-line reason |
|---|---|---|
| a | `css/mobile_premium__layout.css` | Mute `#btn-app-help` on search / focus / focus-search / semantic-dive surfaces — ghost button was rendering on top of the focus card's close / controls rail (z-blocker overlap). Idle + map surfaces keep the help button. |
| b | `src/components/FocusCard.svelte` | Mobile sheet `max-height: calc(100dvh − 330px)` on focus / focus-search so the card top band clears the stage pill rail (z-70 kept for nearby-list toggle). Short-landscape (`≤540px`) gets a separate 10px inset rule. |
| c | `css/mobile_premium__state.css` | Hide `.header-description` on `focus` / `focus-search` / `semantic-dive` — caption row (y≈33–60) overlapped the mode-chip rail (y≈38–84); the focus-stage compass already owns intent copy. |
| d | `css/mobile_premium__components.css` | Suppress `.focus-stage-auxiliary-surfaces` under `map-focus-search` — aux content was absolute-positioned to y≈1070 (226px below 844px fold), unreachable with body overflow hidden. |
| e | `tests/widget-journey.spec.js` | **5i** W58 cue anchor band: assertion updated from `< 64` to `64..240` (top now `calc(5.5rem + safe-area)` to clear header chrome). Also added new test: compass Search remains available without a selection on map view. |

**Do not re-edit these five files** unless you have a concrete regression. The sweep comments cite their own audit rationale.

---

## 2 · Vision Infrastructure

### Verified-vision lane ladder (from `docs/vision-lane-catalog.md`)

| Lane | Route | Notes |
|---|---|---|
| `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct` | Best focused VLM | Pixel-perfect reads, fast |
| `zenmux/stepfun/step-3.7-flash` | Best general fast/cheap | — |
| `nvidia/thinkingmachines/inkling` | Deeper reasoning | Slow |
| `cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct` | Free tier | — |
| `nvidia/minimaxai/minimax-m3` | Slow, occasional 400s | — |

### Blocked / not-vision right now

- **infron/anthropic/claude-\*** — 403 insufficient_user_quota
- **zenmux/google/gemini-3.5-flash** — prepayment depleted
- **zenmux/x-ai/grok-4.5** — 402 reject_no_credit
- **ling-3.0-flash / ling-2.x** — text-only modalities; 404-no-image on live hook
- **logfare kimi-k3** — prompt-ack then silence (flake)

### Catalog stats

- `tmp/vision-catalog-full.json`: **293 chat-vision IDs** across 5 gateways (infron 85, zenmux 95, novita 44, groq 1, plus others).
- `tmp/vision-ask.mjs` (33 lines) — inline vision bridge for main-lane screenshot → text reads.

### ⚠️ ALERT: Kilo VL EOL misroute

Kilo (`kilo` gateway) exposes Qwen3-VL model IDs (e.g. `qwen/qwen3-vl-32b-instruct`, `qwen/qwen3-vl-8b-thinking`) in its live catalog (`tmp/kilo-live-ids.json`, `tmp/kilo-all-models.json` — 346 listed IDs). Probing these routes to an **end-of-life backend** — responses are empty/error or silently return the wrong model. Do not use kilo for Qwen3-VL vision tasks. Use `modelscope` or `novita` for Qwen3-VL instead. (A formal `tmp/kilo-vl-eol-report.md` was planned but not written this session; treat the probe data in `tmp/kilo-live*.json` as the evidence source.)

---

## 3 · AGENT-3: .gitignore-safe tmp/ Notes Policy

The `tmp/` directory is gitignored (`.gitignore`: `tmp/`, `.tmp/`). Any parallel-session flags, probe artifacts, or session-specific notes may be surfaced here without polluting the git tree. Examples from this session:

- `tmp/vision-ask.mjs` — inline vision bridge
- `tmp/vision-catalog-full.json` — machine-readable catalog
- `tmp/kilo-live-ids.json`, `tmp/kilo-all-models.json` — kilo probe data

Feel free to add your own `tmp/` artifacts; they will not appear in diffs or PRs.

---

## 4 · Gate Status

| Gate | Result | Action |
|---|---|---|
| `qa:contract` | **309 pass / 0 fail** | None |
| `qa:journey` | **60/60 pass** (post 5i spec fix) | None |

Both gates green. No broken invariants, no pending test updates needed.

---

*Generated 2026-08-05 by main lane. This file is tracked in git.*
