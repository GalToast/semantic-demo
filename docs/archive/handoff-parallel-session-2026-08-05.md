# Handoff — Parallel Session (2026-08-04/05 late-night)

> Main lane. 5 files changed (93+, 10−), uncommitted at session end.
> QA: `qa:contract` **309 pass / 0 fail** · `qa:journey` **60/60 pass**.
> No gate blockers — parallel lane can proceed freely.

---

## 1 · Changes This Session

All edits are **mobile-premium CSS + one Svelte layout + one e2e spec**.
Comments inline reference the "2026-08-04 sweep" / "W58" audit origins.

| #   | File (relative)                      | One-line reason                                                                                                                                                                                                             |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | `css/mobile_premium__layout.css`     | Mute `#btn-app-help` on search / focus / focus-search / semantic-dive surfaces — ghost button was rendering on top of the focus card's close / controls rail (z-blocker overlap). Idle + map surfaces keep the help button. |
| b   | `src/components/FocusCard.svelte`    | Mobile sheet `max-height: calc(100dvh − 330px)` on focus / focus-search so the card top band clears the stage pill rail (z-70 kept for nearby-list toggle). Short-landscape (`≤540px`) gets a separate 10px inset rule.     |
| c   | `css/mobile_premium__state.css`      | Hide `.header-description` on `focus` / `focus-search` / `semantic-dive` — caption row (y≈33–60) overlapped the mode-chip rail (y≈38–84); the focus-stage compass already owns intent copy.                                 |
| d   | `css/mobile_premium__components.css` | Suppress `.focus-stage-auxiliary-surfaces` under `map-focus-search` — aux content was absolute-positioned to y≈1070 (226px below 844px fold), unreachable with body overflow hidden.                                        |
| e   | `tests/widget-journey.spec.js`       | **5i** W58 cue anchor band: assertion updated from `< 64` to `64..240` (top now `calc(5.5rem + safe-area)` to clear header chrome). Also added new test: compass Search remains available without a selection on map view.  |

**Do not re-edit these five files** unless you have a concrete regression. The sweep comments cite their own audit rationale.

---

## 2 · Vision Infrastructure

### Verified-vision lane ladder (from `docs/vision-lane-catalog.md`)

| Lane                                                 | Route                   | Notes                     |
| ---------------------------------------------------- | ----------------------- | ------------------------- |
| `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct`        | Best focused VLM        | Pixel-perfect reads, fast |
| `zenmux/stepfun/step-3.7-flash`                      | Best general fast/cheap | —                         |
| `nvidia/thinkingmachines/inkling`                    | Deeper reasoning        | Slow                      |
| `cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct` | Free tier               | —                         |
| `nvidia/minimaxai/minimax-m3`                        | Slow, occasional 400s   | —                         |

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

| Gate          | Result                            | Action |
| ------------- | --------------------------------- | ------ |
| `qa:contract` | **309 pass / 0 fail**             | None   |
| `qa:journey`  | **60/60 pass** (post 5i spec fix) | None   |

Both gates green. No broken invariants, no pending test updates needed.

---

_Generated 2026-08-05 by main lane. This file is tracked in git._

## UI fixture recipe (2026-08-05, verified) — the RICH neighbor/walk capture

`?anchor=N` / live-search NEVER populate neighbors ("0 visible neighbors" on every record — those are search-result pills, not neighbor pills). The rich path = the app bridge: after load, `(window.__APP_ACTIONS__ ?? window.__navActions__).focusOnNode(0, {})` → node 0 has **5 visible neighbors + Walk rail + "WHY THESE NEIGHBORS / Connection — 'These businesses appear near each other in the local market'"**. Then hover the first `[class*="neighbor"]` (thread preview) / click (walk) / `button[data-journey-action="enter-inside"]` (dive, trail depth→2). Full capture script: `tmp/rich-node-capture.mjs` (also covers fallback click-path). Headless needs SEMANTIC_FORCE_WEBGL_SOFTWARE=1 to render the real scene.

## LIVE search = VERIFIED (2026-08-05 15:55) — previously "API-gated re-audit"

API (:8795 /api.php?action=semantic_search) was alive tonight; full live flow captured & QA-clean:
search('coffee') → results (Top match: Angel Fire Coffee; "10 of 17 · 7 behind"; MATCH rows; Show-more; CONNECTION CUE "Search found related businesses…") → real click top row → focus node 518 (5 visible neighbors + WHY THESE NEIGHBORS) → hover/click thread → walk rail → enter-inside → semantic-dive(active). Shots: tmp/ui-jury-set/l-focus-live|thread-live|walk-live|dive-live(.png/.json). Vision: clean.
CAVEAT (infra): api.php answered `degraded:true, reason:"semantic_service_offline"` → lexical_fallback only; the FULL semantic-quality path (the fancy tie) needs the semantic service up. Health: `curl '/api.php?action=semantic_search&q=coffee&limit=1&offset=0' -H 'Referer: http://127.0.0.1:5173/'`.

---

## 2026-08-06 lane notes (main lane)

- **3 journey reds are env-owned**: deep-link ?anchor=N blank pocket, F5.1 SemanticOverlay badge, F5.2 SemanticGuideCard suggestion chips — all wait on the LIVE semantic summary data path and fail while semantic_service_offline (verified live: degraded:true). They fail in ISOLATION on a clean tree too (not run-chaos; not the seam). Fix: tmp/semantic-probe-REPORT.md. Other 5 gate reds on 08-05 were run-contamination (pass solo).
- **Commit-purity invalidity red (lane-owned)**: `docs(...) commits touch only doc-class files` fails for lane commits ecadeb6 (docs(ui-sweep) shipped tmp/probe-\*.mjs code files) + 7202a6. Fix: reclassify temp probe files as doc-class in tests/unit-active/commit-purity-invariant.test.ts or use code-prefix commits. Not ours to change without lane OK.
- **Clean-serve recipe (re-verified)**: build → ONE `php -S 127.0.0.1:8795 -t .` from repo root. Six parallel php listeners + missing dist/svelte caused phantom stale-bundle diagnoses on 08-05. Check `curl 127.0.0.1:8795/dist/svelte/index.html` mtime vs the new build before capture runs.
- **Run migration wave**: seam-1 (filter, legend-panel) applied + verified (0 svelte-check errors; unit green apart from the lane invariancy); patch = /tmp/seam1.patch; commit pending. seam-2 (focus, search) dispatched to ocw_33f4a71e under strict no-build/no-commit contract. seam-3 reserved: journey/camera/engine (larger; engine harness-mirrored) — coordinate before those.
- **Long-tail harness note**: prompt-prefix cache nuked by mid-session edits to APPEND_SYSTEM.md (49 cache_breaks today, incl. ours). Harness/system edits → batch at session boundaries. Bash stays stock: background:true + pi_background_jobs for long ops.

## 2026-08-06 late-lane notes: store-wave DONE, wave re-scoped to lib/

- **seam-2 VERIFIED-ALREADY-MIGRATED (main-lane audit, no code change needed)**: focus.svelte.ts and search.svelte.ts are both `createStateMirror`-based already. The only svelte/store residue: type-only `Readable` imports + `get()` on our own mirrors (focus), and ONE `writable(false)` `searchUseRerank` (search) which is TEST-PINNED ("searchUseRerank is a writable store", tests/unit-active/state-class-migration.test.ts:901) — keep as store-compat seam per wave rule. The store layer is effectively FINISHED. Audit overcounted these as migratable; count driven by `get(` occurrences, not actual writable/derived.
- **Next genuine wave targets (lib/, measured counts = svelte/store import + writable/derived/get uses)**:
    - src/lib/journey/neighborhood-manifest.ts (25) — biggest
    - src/lib/data-store.ts (19) — kernel-adjacent, high risk, go last / test heavily
    - src/lib/journey/neighborhood.ts (15)
    - src/lib/journey/thread-settler.ts (6)
    - src/lib/journey/canvas-hover-preview.ts (3) · src/lib/journey/journey.ts (2)
- **Subagent fleet today: systematically broken at the id-mapping layer.** All 6 launches (ling×2, north, logfare×2, openrouter/nvidia) either wedged silently or failed fast with `Error: Model "router-nvidia/…" not found. Use --list-models` (child pi rejects the launcher-rewritten `--model router-<provider>/<rest>` alias). The launcher claims a model present in external-subagent allowed_models AND healthy per direct router probe → still fails at child resolution. Recommendation: enumerate the child's true alias space (`--list-models` from the pi CLI as the worker is invoked) and pass `requested_model` values that survive the `router-` prefix rewrite; until fixed, execute seams main-lane (ready-for-fleet pattern preserved: tmp/seam2-brief.md is valid for whoever fixes the mapping).
- **Benchmark-lane policy** written to tmp/lane-policy-benchmark.md (gate probing + public SWE-bench ranking + dead gates table). Free slugs move fast (kimi-k2.6:free & qwen3-coder:free already 404 "paid now" upstream): ALWAYS one-token probe before dispatch.
- semantic_service_offline still green-starvation for 3 journey tests; probe worker never ran (fleet). Hand to whoever owns infra: semantic rank service down → lexical fallback; bring-up doc: docs/search-fallback.md.
