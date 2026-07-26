# Cleanup Session Chronicle Supplement — 2026-07-26 (G-indep + NIM + kiro-auto)

This supplement file is a SEPARATE doc from `docs/cleanup-session-chronicle-2026-07-26.md`
(which is parallel-session WIP at time of writing). Kept apart so the chronicle
capture can land in-tree without colliding with the parallel edit lane.

Surface covers three parallel-track events: (1) Subagent G-indep Phase-B cleanup
commit, (2) NVIDIA NIM provider diagnosis — **FINAL**: NIM IS UP, root cause =
key-router capacity (5-key pool, ~30s cooldown to 429), NOT an outage, (3)
`logfare/kiro-auto` golden-goose lane re-confirmation.

> **SECOND CORRECTION**: The "id-format bug" described in the CORRECTION section
> below was ITSELF a misdiagnosis. The harness DOES strip the leading `nvidia/`
> prefix correctly before sending the bare catalog ID to NIM upstream. Proof:
> `nvidia/poolside/laguna-xs-2.1` subagent dispatch completed exit 0 with real tool
> use (REPORT.md on disk, cost $0.0017, commit `681b4c77`). The 429 from the
> glm-5.2 dispatch test confirms the request reached NIM upstream (rate-limited,
> not 404 format error). See `docs/nim-provider-investigation-2026-07-26.md` for
> the definitive diagnosis with the full 8-LIVE-model classification.

## CORRECTION (during writing this doc): NIM provider IS UP — bench fails were ID-format bug

During the writing of this doc, main-lane direct curl probes to
`http://127.0.0.1:8788/nvidia/v1/chat/completions` returned **200 OK with full
reasoning_content** for `"model": "z-ai/glm-5.2"` (bare catalog ID, NO `nvidia/`
prefix). The NIM catalog `/nvidia/v1/models` lists 118 live models.

Root-cause isolated from `scripts/benchmark-subagent-models.mjs`:

- `loadModelsFromFile()` splits each line on the first `/` — `providerKey:id`.
- But `McpStdioClient.startWorker()` passes the FULL line (`nvidia/z-ai/glm-5.2`)
  to `external_subagent_start` as `model`. No stripping happens.
- Per MCP doc: "The leading provider segment of the launch ref selects the
  provider/key lane; do not strip it." — so the harness selects NIM lane but
  sends the FULL `nvidia/z-ai/glm-5.2` string upstream.
- NIM catalog lists bare IDs like `z-ai/glm-5.2`, `meta/llama-3.3-70b-instruct`,
  etc. (without `nvidia/` prefix). Receiving `nvidia/z-ai/glm-5.2` → 404 not found.
- Direct curl with bare `z-ai/glm-5.2` → 200 OK with reasoning_content.
- Direct curl with `nvidia/llama-3.1-nemotron-51b-instruct` → 404 (redundant
  `nvidia/` prefix).

**Conclusion**: NVIDIA NIM IS UP. The 15/15 bench failures today were a
harness-id-format bug at the bench script layer, NOT an upstream provider
outage. Fix: strip the leading provider prefix before calling
`external_subagent_start` (one-line fix in `startWorker()`: use the cpp `model`
argument derived from file <provider>/<bare-id> by joining `id`, NOT `<line>`),
or change file format to bare IDs only.

Memory fact: `nim-is-up-glm-5.2-direct-works-2026-07-26` saved in
`~/.pi/agent/pi-hermes-memory/failures.md` as a correction.

A follow-up NIM-Investigator subagent (`ocw_de8b4945`, model
`nemotron-3-ultra-free`, harness `pi`) was dispatched this turn to probe ~25
untested catalog-org-bucket models via direct curl (60s max per probe) and
write a LIVE/DEAD/SLOW/RATE_LIMITED classification matrix at
`tmp/nim-investigation-2026-07-26/REPORT.md`. Expected ~3-5 min cold-start.

---

## Original three-track summary (verdict TLL maintained)

## Subagent G-indep committed (`f7a94f3c`)

Phase-B cleanup — Subagent G-independent style fixes batch landed cleanly on four
clean files (none touched by parallel-session WIP):

- `src/lib/search/scoring.ts` — STYLE-014 (optional-chaining fix layered on top of
  the WARNING-010 NAICS deny-list sort from prior commit `5dcf4910`). Deny-list
  longest-first ordering preserved; doc comment retained.
- `src/lib/search/search-panel-adapter.ts` — STYLE-019 (Element → HTMLElement
  narrow cast at the only strict-DOM call site).
- `src/lib/search/tokenizer.ts` — STYLE-021 (English-only doc note) + STYLE-016
  (Intl.Segmenter memoization flag added).
- `src/lib/search/results-ui.ts` — STYLE-023 (double-cast replaced) + STYLE-024
  (query sanitize hardening). Incidental refactor accepted: worker inlined
  `syncSearchResultsA11y` (3 sites) and `clearLegacySearchResultsDom` (1 site) —
  both single-file readability wins, no cross-file scope creep.

### Verification — `npx vitest run` background green

- Job `pi-bg-1785095937796` (246 files / 3195 passed / 4 todo / exit 0 / 238s).
- Diff stat: 4 files changed, 72 insertions(+), 44 deletions(-).
- Worker metadata: `ocw_f0b93f44` (deepseek-v4-flash-free), exit 0; stdout.log
  hit the 200 MB cap (209715200 bytes) but edits landed — the recoverable pattern
  confirmed by file-disk diff. Worker report at
  `tmp/search-layer-found/subagent-g-report.md` (5256 bytes).

### Phase-B chain progress

| Commit     | Files                                                            | Change Class                             |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `5dcf4910` | search-abort.ts NEW + scoring.ts                                 | HIGH (BUG-002 race) + MED (WARNING-010)  |
| `f7a94f3c` | scoring.ts, search-panel-adapter.ts, tokenizer.ts, results-ui.ts | LOW (STYLE-014/-019/-021/-016/-023/-024) |

Pending (deferred): Subagent F (5 fixes on `mock-search-fallback.ts`, `cache.ts`,
`search-dispatch.ts`) — all three files still `M` parallel-WIP. Subagent G-deferred
portion (STYLE-018/020/015) lives in those same WIP files; waits for F.

## NVIDIA NIM provider outage — definitive diagnosis (v1 + v2 benches)

15 NIM-related model probes today; 0 succeeded. The conclusion is provider-level
distress, NOT a model-selection issue.

### Bench v1 (5 models, 180s timeout)

| Model                                             | Result       |
| ------------------------------------------------- | ------------ |
| `nvidia/nvidia/llama-3.1-nemotron-ultra-253b-v1`  | 404 — 97s    |
| `nvidia/nvidia/llama-3.1-nemotron-70b-instruct`   | 404 — 97s    |
| `nvidia/nvidia/llama-3.3-nemotron-super-49b-v1.5` | 404 — 75s    |
| `nvidia/meta/llama-3.3-70b-instruct`              | 404 — 97s    |
| `nvidia/mistralai/mistral-large-2-instruct`       | 180s timeout |

Results file: `tmp/subagent-benchmark/subagent-benchmark-2026-07-26T04-16-23-988Z.md`.

### Bench v2 (10 models, 240s timeout) — diversified candidates

| Model                                                            | Result                        |
| ---------------------------------------------------------------- | ----------------------------- |
| `nvidia/deepseek-ai/deepseek-v4-flash`                           | Connection error / 404 — 122s |
| `nvidia/z-ai/glm-5.2` (previously STABLE paid goose 2026-07-23!) | 404                           |
| `nvidia/qwen/qwen3.5-397b-a17b`                                  | 240s timeout                  |
| `nvidia/qwen/qwen3-next-80b-a3b-instruct`                        | 240s timeout                  |
| `nvidia/openai/gpt-oss-120b`                                     | 240s timeout                  |
| `nvidia/bytedance/seed-oss-36b-instruct`                         | 240s timeout                  |
| `nvidia/cosmos-reason2-8b`                                       | 240s timeout                  |
| `nvidia/llama-3.1-nemotron-51b-instruct`                         | 240s timeout                  |
| `kilo/nvidia/nemotron-3-ultra-550b-a55b:free`                    | 240s timeout                  |
| `kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`        | Connection error / 404 — 199s |

Results file: `tmp/nim-bench-2026-07-26/bench-v2-output.log`.

### Verdict

- The previously-stable paid goose (`router-nvidia/z-ai/glm-5.2`) returned 404
  today — strong signal of provider-level change. That route was paid + goose-
  status confirmed on 2026-07-23 with stable behavior, so the regression is the
  provider, not the model identifier format.
- Direct-NIM + kilo-gateway shadow routes all dead. The shadow routing path the
  harness uses (`kilo/nvidia/<nemotron>:free`) cannot mitigate an upstream NIM
  outage; kilo just observes the same upstream loss.
- NIM-Investigator first dispatch (`ocw_293e4aa4`, deepseek-v4-flash-free, 360s
  budget) timed out at exit 124 with zero assistant output — slow cold start.
  Relaunch dispatched this turn on `nemotron-3-ultra-free` (see below).
- Recommended action: defer NIM model benchmarking until upstream restores; do
  not burn subagent dispatch cycles on a downstream-target outage.

### Next investigative step — probe matrix

A focused probe-matrix subagent (`nemotron-3-ultra-free`, harness `pi`) was
dispatched this turn to enumerate the live catalog via curl, sample up to 25
untested NIM model IDs, classify each as LIVE / DEAD (404) / SLOW (timeout >60s)
/ RATE_LIMITED, and write a markdown matrix table to
`tmp/nim-investigation-2026-07-26/REPORT.md`. The goal is to confirm the outage
is exhaustive (and capture any near-miss worth retrying when upstream restores).

## `logfare/kiro-auto` re-test confirms golden-goose lane

Fresh dispatch `ocw_a14f7d37` (PID 25472, session `9827b590`) on the same
`logfare/kiro-auto` lane that commit `87000c75` declared the "golden-goose".
The lane held up:

### Telemetry (worker metadata + live poll)

- Wall time: **2:09 min** (created 20:07:11Z, terminal 20:09:20Z).
- First assistant output at **20:08:34Z** — **1:23 min** cold start (vs prior
  4:30 min cold start on `ocw_44398b97` from commit `87000c75`).
- Three-turn inference: toolUse → `write` tool → text `KIRO-AUTO-DONE`.
- Token accounting: ~34k cache reads, ~192 output tokens, ~30 reasoning tokens,
  **cost $\mathbf{0}$** (free lane confirmed).
- Deliverable verified on disk: 443-byte Report at
  `tmp/kiro-auto-test-2026-07-26/REPORT.md`, well-formed markdown with the
  correct one-line answer ("no contract-test DOM ids/classes in the
  ThreadInspector.svelte top comment").

### Lane catalog `/logfare/v1/models`

- `kiro-auto` (router-auto-meta lane, the dispatched lane)
- `minimax-m3`
- `kimi-k2.6`
- `deepseek-v4-pro`
- `kimi-k2.7-code`
- `deepseek-v4-flash`
- `glm-5.2`
- `qwen-3.8-max`

### Recommendation

Keep `logfare/kiro-auto` as the primary candidate-choice route for subagent
dispatch when (a) cost matters (zero-cost lane) and (b) speed matters more than
depth (the auto-router picks the working sub-lane from the upstream SES stack).
The two-turn "thinking + write tool + text" flow validated successfully twice.

## Open tracks after this session

- **Subagent F** (5 search-layer fixes on `mock-search-fallback.ts`, `cache.ts`,
  `search-dispatch.ts`): DEFERRED. All three files persist as parallel-session
  WIP (`M`) with no new commit since `87000c75`. PROMPT-F.md staged; dispatch
  when WIP clears.
- **Subagent G-deferred portion** (STYLE-018/020/015): DEFERRED. Lives in the
  same parallel WIP files for F; waits for F to clear first.
- **NIM-Investigator relaunch probe matrix**: dispatched this turn on
  `nemotron-3-ultra-free`; this supplement falls through once the matrix lands.
- **`docs/subagent-model-benchmarks.md` doc update**: DEFERRED because the doc
  file is currently parallel-WIP from the prior session. When that lane clears,
  fold the NIM v1+v2 + kiro-auto telemetry into the canonical bench doc.

## Memory facts written this session

- `logfare-kiro-auto-golden-goose` — durable insight recorded in
  `~/.pi/agent/pi-hermes-memory/MEMORY.md` (route, catalog, telemetry,
  cold-start pattern, zero-cost lane confirmation).
- `nim-router-catalog-104-untested-2026-07-26` — durable insight recorded
  earlier this session (118 NIM models / 113 chat-like / 104 untested vs only 7
  tested at start of day, of which only `router-nvidia/z-ai/glm-5.2` was
  previously proven-stable — now also 404).
