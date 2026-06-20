# W9-B Bridge Audit — 2026-06-20

## Summary

| Metric | Value |
|--------|-------|
| Total bridge files | 7 |
| Total LoC | 314 |
| **KEEP (5/5 signals — load-bearing)** | 3 |
| **RETIRE (0/5 signals — confirmed dead)** | 0 |
| **AUDIT (1-4/5 signals — needs review)** | 4 |

## 5-Signal Rule (per docs/migration-plan.md §Bridge File Doctrine)

A bridge passes "dead" only when **all five signals are zero**:

1. Imported by another src/lib/ or src/ file
2. Imported by name in docs/, tests/, or legacy-reference/
3. Exports public types or functions used by src/components/
4. Has a commit in the last 60 days
5. Is a *-bridge.ts file with active callers

## Bridge Inventory

| # | Bridge | LoC | Consumers | Docs/Tests | Comp Exports | Last Commit | Within 60d | Active Signals | Verdict | Sample Consumers |
|---|--------|-----|-----------|------------|--------------|-------------|------------|----------------|---------|------------------|
| 1 | `data-worker-url-bridge.ts` | 17 | 2 | 0 | 11 | 2026-06-15 | ✓ | 4/5 | AUDIT (4/5 signals) | C:\Users\HP\repos\semantic-explorer\src\lib\data-loader.ts, C:\Users\HP\repos\semantic-explorer\src\lib\semantic-threads.ts |
| 2 | `journey-compass-controller-bridge.ts` | 24 | 4 | 1 | 2 | 2026-06-15 | ✓ | 5/5 | KEEP (load-bearing) | C:\Users\HP\repos\semantic-explorer\src\lib\engine\camera-choreography\cursor.ts, C:\Users\HP\repos\semantic-explorer\src\lib\engine\demo-choreography.ts, C:\Users\HP\repos\semantic-explorer\src\lib\orchestration\adapters.ts (+1) |
| 3 | `lifecycle-bridge.ts` | 45 | 13 | 1 | 3 | 2026-06-20 | ✓ | 5/5 | KEEP (load-bearing) | C:\Users\HP\repos\semantic-explorer\src\lib\engine\demo-choreography.ts, C:\Users\HP\repos\semantic-explorer\src\lib\engine\window-actions-bridge.ts, C:\Users\HP\repos\semantic-explorer\src\lib\journey\journey.ts (+10) |
| 4 | `search-state-bridge.ts` | 156 | 3 | 0 | 13 | 2026-06-16 | ✓ | 4/5 | AUDIT (4/5 signals) | C:\Users\HP\repos\semantic-explorer\src\lib\engine\window-actions-bridge.ts, C:\Users\HP\repos\semantic-explorer\src\lib\ui\mode-bindings.ts, C:\Users\HP\repos\semantic-explorer\src\lib\ui\suggestion-bindings.ts |
| 5 | `state-bridge.ts` | 24 | 57 | 3 | 23 | 2026-06-19 | ✓ | 5/5 | KEEP (load-bearing) | C:\Users\HP\repos\semantic-explorer\src\lib\audio\audio-scape.ts, C:\Users\HP\repos\semantic-explorer\src\lib\data-store.ts, C:\Users\HP\repos\semantic-explorer\src\lib\engine\camera-choreography\framing-utils.ts (+54) |
| 6 | `strand-continuity-bridge.ts` | 18 | 4 | 1 | 0 | 2026-06-16 | ✓ | 4/5 | AUDIT (4/5 signals) | C:\Users\HP\repos\semantic-explorer\src\lib\journey\focus-ui.ts, C:\Users\HP\repos\semantic-explorer\src\lib\journey\journey.ts, C:\Users\HP\repos\semantic-explorer\src\lib\journey\thread-inspector.ts (+1) |
| 7 | `window-actions-bridge.ts` | 30 | 2 | 0 | 23 | 2026-06-20 | ✓ | 4/5 | AUDIT (4/5 signals) | C:\Users\HP\repos\semantic-explorer\src\lib\orchestration\app-init.ts, C:\Users\HP\repos\semantic-explorer\src\lib\orchestration\window-actions.ts |

## Methodology Notes

- **Consumer scan**: Recursively greps `src/lib/**` and `src/components/**` for `from '@lib/engine/<bridge>'` imports. Excludes the bridge file itself.
- **Docs/Tests/Legacy scan**: Recursively greps `docs/**`, `tests/**`, and `legacy-reference/**` for the same alias. Hits here count as Signal 2 even though they're not runtime callers (they indicate the bridge is part of the documented contract surface).
- **Component exports scan**: Parses the bridge file for `export const|function|class|type|interface|{ ... }` declarations, then greps `src/components/**` for any of those names appearing as bare identifiers (catches indirect usage via `import { foo } from '@lib/engine/anything'`).
- **Last commit**: `git log -1 --format=%cI` on the bridge file.
- **Verdict thresholds**: 5/5 = KEEP (load-bearing); 0/5 = RETIRE (5-signal dead); 1–4/5 = AUDIT (needs human review).

## Per-Bridge Detail

### data-worker-url-bridge.ts — SUPERSEDED

Superseded by W10 worker URL closeout: the Vite `?worker&url` boundary now lives at
`src/lib/workers/data-worker-url.ts`, outside `src/lib/engine/*-bridge.ts`. The runtime
boundary remains centralized; it is no longer bridge debt.

### Original audit record — data-worker-url-bridge.ts — AUDIT (4/5 signals)

- **LoC**: 17
- **Exports**: 1 symbol(s)
- **Signal 1** (src/lib+components consumers): 2
- **Signal 2** (docs/tests/legacy refs): 0
- **Signal 3** (component-export usages): 11
- **Signal 4** (last commit within 60d): yes (2026-06-15)
- **Signal 5** (active callers): yes

### journey-compass-controller-bridge.ts — KEEP (load-bearing)

- **LoC**: 24
- **Exports**: 12 symbol(s)
- **Signal 1** (src/lib+components consumers): 4
- **Signal 2** (docs/tests/legacy refs): 1
- **Signal 3** (component-export usages): 2
- **Signal 4** (last commit within 60d): yes (2026-06-15)
- **Signal 5** (active callers): yes

### lifecycle-bridge.ts — KEEP (load-bearing)

- **LoC**: 45
- **Exports**: 30 symbol(s)
- **Signal 1** (src/lib+components consumers): 13
- **Signal 2** (docs/tests/legacy refs): 1
- **Signal 3** (component-export usages): 3
- **Signal 4** (last commit within 60d): yes (2026-06-20)
- **Signal 5** (active callers): yes

### search-state-bridge.ts — AUDIT (4/5 signals)

- **LoC**: 156
- **Exports**: 56 symbol(s)
- **Signal 1** (src/lib+components consumers): 3
- **Signal 2** (docs/tests/legacy refs): 0
- **Signal 3** (component-export usages): 13
- **Signal 4** (last commit within 60d): yes (2026-06-16)
- **Signal 5** (active callers): yes

### state-bridge.ts — KEEP (load-bearing)

- **LoC**: 24
- **Exports**: 2 symbol(s)
- **Signal 1** (src/lib+components consumers): 57
- **Signal 2** (docs/tests/legacy refs): 3
- **Signal 3** (component-export usages): 23
- **Signal 4** (last commit within 60d): yes (2026-06-19)
- **Signal 5** (active callers): yes

### strand-continuity-bridge.ts — AUDIT (4/5 signals)

- **LoC**: 18
- **Exports**: 6 symbol(s)
- **Signal 1** (src/lib+components consumers): 4
- **Signal 2** (docs/tests/legacy refs): 1
- **Signal 3** (component-export usages): 0
- **Signal 4** (last commit within 60d): yes (2026-06-16)
- **Signal 5** (active callers): yes

### window-actions-bridge.ts — AUDIT (4/5 signals)

- **LoC**: 30
- **Exports**: 20 symbol(s)
- **Signal 1** (src/lib+components consumers): 2
- **Signal 2** (docs/tests/legacy refs): 0
- **Signal 3** (component-export usages): 23
- **Signal 4** (last commit within 60d): yes (2026-06-20)
- **Signal 5** (active callers): yes
