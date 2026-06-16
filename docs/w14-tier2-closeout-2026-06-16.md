# W14 Tier 2 Closeout — 2026-06-16

## Outcome: 4 retired, 1 skipped, 1 filed for W15

| File | LOC | Status | Commit | Notes |
|---|---|---|---|---|
| `js/modules/config.ts` | 107 | ✅ Retired | `7a0a25e` | 1 importer + 1 test contract rewired |
| `js/modules/environment.ts` | 144 | ✅ Retired | `127523e` | 28 files rewired (3 src, 1 bridge, 16 kernel-side, 8 test mocks) |
| `js/modules/focus-panel-mode.ts` | 31 | ✅ Retired | `adbc6fe` | 6 importers (5 TS, 1 Svelte). Commit also absorbed parallel session's `cluster-labels.ts` deletion |
| `js/modules/cluster-labels.ts` | 275 | ✅ Retired | `705e9b7` | 4 importers + 2 test contracts rewired |
| `js/modules/strand-continuity.ts` | 96 | ⚠️ Skipped | — | **API mismatch finding** (see below) |
| `js/modules/legend-ui.ts` | 308 | 📋 W15 candidate | — | Port-completion arc, separate work (see `docs/w14-tier2/legend-ui-port-completion-2026-06-16.md`) |

**Net reduction: 557 LOC of legacy kernel deleted (4 of 6 in-scope files), 0 build breakages.**

## Workers

| Worker | Files | Time | Cost | Status |
|---|---|---|---|---|
| `ocw_57eaeffe` (Wave 1) | config + environment + focus-panel-mode | 25 min | $0.0005 | Completed |
| `ocw_fd51de49` (Wave 2) | cluster-labels + legend-ui finding | 5 min | $0.0005 | Completed |
| **Combined** | **4 retirements** | **~30 min** | **$0.001** | **Done** |

## Findings

### 1. strand-continuity API mismatch (skipped)

**Kernel** (`js/modules/strand-continuity.ts`): standalone functions

- `setStrandContinuityState`, `clearStrandContinuityState`
- `setTimer`, `clearTimer`, `disposeTimers`
- `getStrandArrivalNote`

**Canonical** (`src/lib/utils/strand-continuity.ts`): class-based API

- `StrandContinuityManager` class
- `getStrandContinuityManager`, `resetStrandContinuityManager`

**Bridge**: re-exports the kernel's standalone functions to 4 journey-layer consumers.

**Two paths forward** (main-lane decision required):

- **(a)** Add standalone function wrappers to the canonical that delegate to the singleton manager (~1-2 hour worker, ~$0.003)
- **(b)** Port the 4 journey consumers to use the class API (~1-2 hour worker, ~$0.003)
- **(c)** File as W16 candidate if other priorities take precedence

### 2. legend-ui port-completion (W15 candidate)

The Svelte 5 port is 20 LOC with 1 export vs the kernel's 308 LOC with 11 exports. 10 missing exports. 10 live code importers (7 .ts + 3 .svelte). This is **port-completion work**, not a retirement rewiring — see `docs/w14-tier2/legend-ui-port-completion-2026-06-16.md` for the full finding with effort estimates and two-approach recommendation.

## Verification gates (each commit, at commit time)

- svelte-check: 0 errors
- test:unit: 652/652
- bridge contract: 5/5
- ts-js-drift: 78 .ts files clean

## Post-W14-T2 state

- 4 in-scope files retired from disk
- 2 in-scope files documented for follow-up (strand-continuity, legend-ui)
- `src/lib/engine/camera-controls.ts` is being split by the parallel session (mid-refactor, causes 23 svelte-check errors in `src/lib/engine/index.ts` — not W14-T2 scope)
- 5 parallel session DEATH-BRIDGE commits landed this session (camera-controls consumers, demo-choreography)

## Commit hygiene note

`adbc6fe` (focus-panel-mode retirement) accidentally absorbed the parallel session's `cluster-labels.ts` kernel deletion (275 LOC) into the diff. The cluster-labels importer rewires + test contract updates then got their own commit `705e9b7`. End state is correct, but the focus-panel-mode commit message only mentions focus-panel-mode. If commit archaeology matters later, the cluster-labels kernel deletion actually landed in `adbc6fe`, not `705e9b7`.
