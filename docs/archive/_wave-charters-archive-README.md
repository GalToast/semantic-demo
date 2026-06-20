# Archived Wave Charters (W5-W9 + W44)

Archived 2026-06-20 (W11 closure era). All wave charters from the W5-W9 cycle are now historical artifacts and not the source of truth for current work. Their work has been absorbed into:

1. `MIGRATION-STATUS.md` (repo root) — single-page wave tracker; canonical for current state and changelog
2. git history — all commits are preserved; `git log --since="<date>"` recovers any specific decision
3. `docs/migration-plan.md` — long-running plans (Phase 5/6/7 sequence)
4. `docs/performance-budget.md` — measurable perf budgets (live CI gate)
5. `scripts/w9-bridge-audit.mjs` — the 5-signal dead-code rule, regenerable
6. `docs/w9-bridge-audit-2026-06-20.md` — current audit source-of-truth

| File | Original date | Why archived |
|---|---|---|
| `w5-charter-2026-06-19.md` | 2026-06-19 | W5 TBT optimization + a11y closeout. Outcomes reflected in `docs/performance-budget.md` Live-Ceiling section. |
| `w6-charter-2026-06-19.md` | 2026-06-19 | W6 Splash + lazy Canvas; work delivered in `src/App.svelte` and `tests/integration/w6-splash-t1-contract.mjs` (scaffold). |
| `w6-t1-app-svelte-integration.md` | 2026-06-19 | W6-T1 sub-task spec; landed in `src/App.svelte` patches. Test comment now `docs/archive/...`. |
| `w7-charter-dual-module-collapse-2026-06-19.md` | 2026-06-19 | W7 dual-module collapse (Pairs 1-4) + Svelte-5 hardening (-1,553 LoC). Locked in `MIGRATION-STATUS.md` §Changelog row "W7". |
| `w8-charter-2026-06-20.md` | 2026-06-20 | W8 retiring old Engine Bridge & `adapters/` (-542 LoC). Decision documented in `MIGRATION-STATUS.md` Architecture Decision Records row. |
| `w9-charter-2026-06-20.md` | 2026-06-20 | W9 Lighthouse gate + parity smoke + 10 micro-bridges. Outcomes reflected in `MIGRATION-STATUS.md` §Changelog "W9" + Lighthouse summary doc. |
| `w44-performance-attack-plan-2026-06-19.md` | 2026-06-19 | W44 bundle audit + brotli + Three.js selective imports. Superseded by shrunk-tail `w44-performance-attack-plan.md` (kept live for AGENTS.md reference). |

**Per user preference (2026-06-20)**: future wave markers will live in `MIGRATION-STATUS.md` only. New wave charter docs will not be created unless explicitly requested.

**Do not follow these documents for current work.** Use `MIGRATION-STATUS.md` and `docs/migration-plan.md` instead.

## Index of NEW wave docs (kept in docs/, not archived)

- `w9-bridge-audit-2026-06-20.md` — output of `scripts/w9-bridge-audit.mjs`; regenerated on demand
- `w44-performance-attack-plan.md` — referenced from `AGENTS.md` Performance section

## How to recreate a wave charter doc from archive

If a wave charter needs to be revived (e.g., for an audit), the canonical data is in:

1. `git log --grep="feat(wN):" --pretty=fuller --stat` (full ticket list per wave)
2. `git log --grep="test(wN):" --pretty=fuller --stat` (test refactors per wave)
3. `MIGRATION-STATUS.md` §Changelog (high-level deliverable per wave)

Rebuilding a charter is mechanical: enumerate commits + write delta-table. Estimated effort ~30 min per wave.
