# Session chronicle — bugsweep campaign continuation — 2026-07-25 UTC

## Scope

Follow-on session to the W7 keyboard bugsweep campaign recorded in `docs/bugsweep-campaign-2026-07-24.md`. This session deepened the laguna-s-2.1 harness-probe lane, completed the off-slice keyboard fix batch, and added two regression-guard assets: a static-source contract for `bindFocusTrapObserver()` installation and a runtime retryability patch for `pi-ai` so opencode-zen laguna workers stop dying mid-streaming.

## Session commit chain (oldest → newest)

| UTC commit time | SHA | Subject | Lane |
| --- | --- | --- | --- |
| 10:24:12 | `61cbc415` | fix(keyboard): apply W7 bugsweep findings to keyboard-help.ts | parallel (Fred) |
| 10:30:44 | `d5ae46c0` | fix(a11y): wire bindFocusTrapObserver at app-init (LAGUNA-FT-1) | main |
| 10:34:48 | `e6c5c11e` | docs(bench): record W7 surgical fix-wave completion | parallel (Fred) |
| 11:01:55 | `e1785420` | fix(keyboard): split predicate per W7ks1-F1 — amended from `090c7923` | parallel (Fred) |
| 11:05:05 | `62e6af09` | docs(bench): record W7ks1-F1 followup fix-wave completion | parallel (Fred) |
| 11:18:53 | `38c1b9ff` | fix(a11y): scope focus-trap selector to tabindex="0" only (LAGUNA-FT-4) | main |
| 12:14:52 | `7163dc64` | fix(keyboard): apply W7ks2 fixwave F2/F4/F5/F6 | parallel (Fred) |
| 12:22:13 | `ea95a1e3` | docs(bench): record W7ks2 fix-wave | parallel (Fred) |
| 12:36:55 | `c3cd2f99` | feat(router-v2): land V2 two-axis failover spec + Sprint-1/2/3 impl + adversarial test harness (7/7 PASS); AGENTS.md +1 line "Knowledge-gap default → websearch" | parallel (Fred) |
| 12:49:49 | `eb823521` | fix(keyboard-target): guard `el?.isContentEditable` optional chain (TRIGGERS-69) | agnesia worker (Fix #1) |
| 13:06:26 | `497cbbd2` | fix(triggers): unexport handleGlobalKeydown (TRIGGERS-DEAD-EXPORT) — main-lane takeover | main |
| 13:14:46 | `2b70b8f8` | fix(legend-panel): lowercase tagName comparison (LEGEND-318) | main |
| 13:14:51 | `0653da01` | fix(focus-coordinator): defensive optional chain on `ae?.isContentEditable` (FOCUS-COORD-93) | main |
| (this turn) | (TBD) | test(focus-trap): add installed-contract test pinning LAGUNA-FT-1 | main |

## Off-slice keyboard fix batch — final verdicts

| # | Ticket | Verdict | Commit | Author |
| --- | --- | --- | --- | --- |
| 1 | TRIGGERS-69 | REAL FIXED | `eb823521` | agnesia worker (keyboard-target.ts `el?.isContentEditable`) |
| 2 | TRIGGERS-DEAD-EXPORT | REAL FIXED | `497cbbd2` | main-lane takeover (triggers.ts unexport + eslint-disable) |
| 3 | TRIGGERS-GS-COLLIDE | DROPPED — false-positive (no export collision existed) | (none) | main-lane verdict |
| 4 | LEGEND-318 | REAL FIXED | `2b70b8f8` | main-lane (legend-panel.svelte.ts `.toLowerCase()`) |
| 5 | FOCUS-COORD-93 | REAL FIXED | `0653da01` | main-lane (focus-coordinator.ts `ae?.isContentEditable`) |

Net: 4 real fixes landed, 1 dropped false positive. Lessons: bug-list labels must distinguish "duplicate *symbol* name" from "duplicate *export* name collision" — add export-keyword detection + rg import-check before labeling a collision.

## Harness-retry resilience investigation (D) — verified findings

### Verified root cause: opencode-zen / laguna-s-2.1-free silent abort

Worker stdout event sequence at `tmp/laguna-sparse-find/opencode-zen-laguna-s-2.1-free/ocw_a1577799.../stdout.log` lines 1496-1498:

```
1496: {"type":"message_end","stopReason":"error","errorMessage":"Streaming response failed",...}
1497: {"type":"turn_end",  same errorMessage propagated}
1498: {"type":"agent_end","willRetry":false}
```

- `pi-ai`'s `isRetryableAssistantError(response)` (in `node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/utils/retry.js:ets sec`) builds `RETRYABLE_PROVIDER_ERROR_PATTERN` from a fixed array (existing entries: `"stream ended before message_stop"`, `"stream ended before a terminal response event"`, `"http2 request did not get a response"`, network/timeout patterns, etc.).
- The literal string `"Streaming response failed"` matched NONE of those patterns → `isRetryableAssistantError` returned `false` → outer `retryAssistantCall` loop returns the error message immediately → `willRetry:false` → worker exits with NO auto-retry.

The emit text "Streaming response failed" was confirmed NOT in pi-coding-agent dist, pi-ai dist, or harness tree — synthesized by the openai-completions streaming layer when an upstream stream dies mid-assistant-text.

### Two resilience layers verified to exist (and one gap)

1. **Key rotation within a router** — `opencode-key-router.mjs` rotates upstream-pool keys on 429; when ALL keys on cooldown → final 429 "OpenCode Zen router has no keys currently off cooldown".
2. **Cross-provider failover via FAILOVER_CHAINS** — exists (`opencode-key-router.mjs:244`) + `MODEL_FAMILY_PATTERNS` (`:303`)+ `getModelFamily()` (`:317`)+ `tryFailover()` (`:1703`). BUT `laguna-s-2.1-free` has NO entry in either `FAILOVER_CHAINS` or `MODEL_FAMILY_PATTERNS` → zero cross-provider resilience for the laguna family.

### D Option B patch — applied + audited (2026-07-25)

The retryability gap was patched provisionally as a single-line edit to `pi-ai/dist/utils/retry.js`:

- Append `"streaming.?response.?failed"` to the `RETRYABLE_PROVIDER_ERROR_PATTERN` strings array (right after `"ResourceExhausted",`).
- The existing `i` case-insensitive flag from `buildProviderErrorPattern([...])` is inherited by the join.
- Backup at `retry.js.bak-pre-option-b-patch-20260725193258Z.js`.
- Verification (5 independent audits, all PASS):
    - `isRetryableAssistantError({stopReason:'error', errorMessage:'Streaming response failed'})` → **true** (was false pre-patch)
    - Negative control `GoUsageLimitError` → **false** (NON_RETRYABLE catches first — no false positive)
    - Positive control `stream ended before message_stop` → **true** (existing patterns unbroken)
    - `node docs/v2-failover/adversarial/test-driver.mjs` → EXIT 0, 7/7 PASS
    - `node tests/keyboard-reset-ownership-contract.mjs` → 5/5 PASS
    - `require()` loads retry.js without SyntaxError.

Tradeoff: lives under `node_modules/` → does NOT survive `pi update` / reinstall. See follow-up proposal below.

### D Option B vs Fred's v2-failover spec

`docs/v2-failover/spec.md` (committed in `c3cd2f99`) acknowledges the v1 `FAILOVER_CHAINS` gap (spec line 86) and includes the laguna multicarrier routes (spec lines 20-31). But v2 is blueprint only — Sprint-1/2/3 modules and adversarial test harness live under `docs/v2-failover/` and ZERO live patches to `opencode-key-router.mjs` landed. The Option B retryability patch is ORTHOGONAL to v2 (v2 fails across providers/capabilities; Option B patches retry-within-route on a single stream-die). Both are independent improvements.

## C — `tests/focus-trap-installed-contract.mjs` (new regression guard, this turn)

Static-source contract test pinning the `d5ae46c0` LAGUNA-FT-1 fix. The existing `tests/focus-trap-contract.mjs` is a Playwright e2e that passes vacuously — it only verifies focus doesn't leak into the canvas via Tab, but the canvas isn't natively focusable, so it never actually exercised trap activation. Before `d5ae46c0`, `bindFocusTrapObserver()` was never invoked (silent activation gap), and that test failed to catch it.

Five contract points (no DOM / no Playwright):

1. `src/main.ts` imports both `bindFocusTrapObserver` + `disposeFocusTrapBindings` from `@lib/utils` (reachability).
2. `src/lib/utils/focus-trap-bindings.ts` exports `bindFocusTrapObserver` as a non-stub function declaration.
3. `src/main.ts` invokes `bindFocusTrapObserver()` at column 0 (unconditional module top-level), NOT inside `if (window)`, `if (import.meta.env.*)`, or a lazy-init callback — pinned because regression bugs here are silent.
4. `src/main.ts` wires `disposeFocusTrapBindings()` into a teardown handler (`beforeunload` / `disposeAppListeners` / `import.meta.hot.dispose`) — bidirectional lifecycle, no MutationObserver leak.
5. `bindFocusTrapObserver` body has the idempotent re-entry guard (`if (_focusTrapObserver) return`), the real `MutationObserver` `.observe(document.body, {attributeFilter:['data-panel-surface']})`, and the surface branch calling `trapFocusIn([...])` / `releaseFocusTrapNow()`.

Registered in `tests/run-all-contracts.js` PINNED_FILES and `tests/contracts.manifest.json` groups `full` (exact-match invariant preserved) and `lifecycle` (thematic). `--validate` shows no FULL_GROUP_*_MISMATCH and no orphan warning for the new file. `--single` execution: 5/5 PASS through the official ts-resolve-loader runner in 1.72s.

## Discovered facts (durable — captured in failures.md memory)

- `laguna-s-2.1-free` has NO entry in `FAILOVER_CHAINS` or `MODEL_FAMILY_PATTERNS` in `opencode-key-router.mjs` — zero cross-provider resilience for the laguna family even when sibling multicarrier routes exist in the registry.
- `hy3-free` bare ref is NOT in the Zen free catalog. Canonical Hy3 routes are `modelscope/Tencent-Hunyuan/Hy3` and `kilo/tencent/hy3`. Verify via `external_subagent_free_models` before dispatching.
- agnes-2.0-flash worker warmup pattern: ANTHROPIC lanes hit `Connection error` on first attempt and need ~4-5 min warmup via auto_retry; but can die SILENTLY mid-tool-result dispatch after ~5-7 min of stable production (no `tool_execution_end`, no `agent_end`, no `auto_retry_start`). Main-lane takeover threshold: ~240 sec of quiet.
- pi-lens eager-LSP daemon auto-formats files to 4-space + no-semi on read, opposite of the project canonical 2-space + semicolon (eslint-config-prettier). Revert with `git checkout HEAD -- <churn-files>`. Pre-commit hook catches drift.
- Bug-list labels must distinguish "duplicate symbol name" from "duplicate *export* name collision" — bugsweep pipeline should include export-keyword detection + rg import-check before labeling collision (the TRIGGERS-GS-COLLIDE false positive).

## Pending / follow-up

- **Upstream PR to `@earendil-works/pi-ai`** — propose adding `"streaming.?response.?failed"` to `RETRYABLE_PROVIDER_ERROR_PATTERN` so the dist-patch tradeoff goes away. Reversible until then via the recorded `.bak` snapshot.
- **B (Wave-3 race fix)** — KH-HELPBTN-SECOND-CLICK-RACE Svelte 5 delegation + capture-phase race when `btn-keyboard-help` is double-clicked rapidly. Not started in this session; deferred.
- **V2 failover (Fred)** — `docs/v2-failover/spec.md` Sprint-1/2/3 blueprint. Pending material implementation that would obsolete the laguna `FAILOVER_CHAINS` tactical shim.
- **Pre-existing manifest orphans** (Fred-era, NOT this session): `mycelium-logic-contract.mjs` listed in `scene` group but missing from disk; `svelte-style-token-contract.mjs` orphan; 25 spec.js orphans. `--validate` reports these as warnings without exiting non-zero.
