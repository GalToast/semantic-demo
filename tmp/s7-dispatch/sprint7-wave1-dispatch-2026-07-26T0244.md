# Sprint-7 Wave-1 Dispatch Manifest

**Dispatched**: 2026-07-26 02:41 – 02:44 UTC
**All routes pre-probed ALIVE today** (HTTP 200 + content="Pong" via key-router at 127.0.0.1:8788)
**Campaign ID**: `sprint7-wave1`
**Carrier**: 4 substantives on `opencode-zen/mimo-v2.5-free` (FREE + confirmed) ↳ pivoted OFF agnes-2.0-flash (zenmux-only, DEAD today)

## Worker Roster

| Worker | OwnerTag | worker_id | PID | Route | Model | Timeout(s) | Steer | cwd |
|---|---|---|---|---|---|---|---|---|
| INKLING-SMOKE | s7-INKSMOKE | ocw_cfe3ddf6-94d2-4370-923b-118f9a4e629c | 23760 | pi:router-nvidia/thinkingmachines/inkling | nvidia/thinkingmachines/inkling | 180 | false | semantic-explorer |
| LAGUNA-S-SMOKE | s7-LAGSMOKE | ocw_e440d9f7-8a7f-4629-9739-0bd6614769f6 | 9800 | pi:router-opencode-zen/laguna-s-2.1-free | laguna-s-2.1-free | 180 | false | semantic-explorer |
| W1 SLOT-HANDLE-FIX | s7-W1-SLOTHANDLE | ocw_5823b30e-3b5d-4e0a-b47a-0fe3042dfb08 | 12572 | pi:router-opencode-zen/mimo-v2.5-free | mimo-v2.5-free | 1800 | TRUE ✓ | harness/servers/key-router |
| W2 MATRIX-LOAD | s7-W2-MATRIXLOAD | ocw_ab64aa3c-02ac-473e-be8c-1cc1ee672c60 | 13172 | pi:router-opencode-zen/mimo-v2.5-free | mimo-v2.5-free | 1800 | TRUE ✓ | harness/servers/key-router |
| W3 PROPOSAL | s7-W3-PROPOSAL | ocw_3639f06a-fa25-4181-a910-7bdf1c43b128 | 18880 | pi:router-opencode-zen/mimo-v2.5-free | mimo-v2.5-free | 1800 | TRUE ✓ | semantic-explorer |
| W4 E2E-SCRIPT | s7-W4-E2ESCRIPT | ocw_7122096c-9061-4ffb-9df5-d5e806f1a2a8 | 10740 | pi:router-opencode-zen/mimo-v2.5-free | mimo-v2.5-free | 1800 | TRUE ✓ | semantic-explorer |

## File Conflicts (None)

| Worker | Allowed Files (input) | Expected Output |
|---|---|---|
| W1 | `src/v2-failover-overlay.mjs` (harness repo) | patch + report `tmp/s7-dispatch/W1-...-REPORT.md` |
| W2 | `src/opencode-key-router.mjs` + new `src/v2-overlay-matrix.json` (harness) | patch + report |
| W3 | READS `index.ts` only, WRITES `tmp/s7-dispatch/W3-...-PROPOSAL.md` | proposal report |
| W4 | WRITES `tmp/s7-dispatch/v2-success-path-e2e.mjs` + `.md` | test script + spec |
| INKLING-SMOKE | 1 read + 1 write | `tmp/s7-dispatch/inkling-smoke-REPORT.md` |
| LAGUNA-S-SMOKE | 1 read + 1 write | `tmp/dispatch/laguna-smoke-REPORT.md` (typo: dir is `tmp/dispatch/` not `tmp/s7-dispatch/`) |

## Bench-log rows pending (to write post completion)

Each worker row: worker_id, owner_tag, route, model, exit_code, stdout_bytes, token usage, latency, fail_mode.

## Wave-2 (deferred)

After Wave-1 lands + main-lane restarts key-router + runs W4's e2e script live:
- W5 BENCH-LOG-APPEND — append Sprint-7 worker rows to `tmp/v2-impl-bench-log.md`
- W6 SESSION-SUMMARY-2 — Sprint-7 wrap report
