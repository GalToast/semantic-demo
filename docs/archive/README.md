# Docs Archive

> Reorganized 2026-06-18 by Worker C (W38 Charter Closeout).

All historical migration docs, charter closeouts, old bugswep reports, and superseded audit documents have been moved here from `docs/` root. The root now contains only **current architecture**, **active bugs**, **bundle audits**, **performance budgets**, and the **current charter**.

## Contents

| Directory | Contents |
|-----------|----------|
| `w-charter-history/` | Prior charter documents (W17, W19, W21, W22, W24, W37) |
| `migration-docs/` | Migration plans, Svelte 5 strict-mode docs, bridge contracts, state coexistence strategy |
| `bugswep-reports/` | Historical bug sweep reports and CSS smell audits |
| `audit-reports/` | Superseded roadmaps, parity baselines, and audit reports |
| `w14-tier2/`, `w14-tier3/`, `w15-visual-qa/` | Historical wave execution artifacts |
| `fix-verification/` | Historical fix verification screenshots |
| (root-level .md) | Superseded semantic-demo-*, nvidia-*, provider-*, and other stale docs |

## Test-Referenced Files

The following archived files are still referenced in test comments (not imported at runtime):

| File | Referenced by |
|------|---------------|
| `w-charter-history/w21-charter-2026-06-17.md` | `tests/unit-active/w20-wave4-readiness-regression.test.ts` (comment reference) |
| `w-charter-history/wave-11-engine-port-plan-2026-06-14.md` | `tests/unit-active/svelte-bridge-import-contract.test.ts` (comment reference) |

These references are documentation-only (in JSDoc comments, not file reads). Moving these files does not break any tests.

## Files NOT moved (kept in docs/ root)

| File | Reason |
|------|--------|
| `semantic-demo-design-tokens.md` | Constraint: do not touch |
| `semantic-demo-state-transition-table.md` | Read by `tests/surface-style-matrix-contract.mjs` |
| `semantic-demo-surface-style-matrix.md` | Read by `tests/surface-style-matrix-contract.mjs` |
| `window-global-allowlist.md` | Referenced in test assertions |
| `w38-charter-2026-06-17.md` | Current charter |
| `w40-bundle-audit-2026-06-18.md` | Current bundle audit |
| `bug-thread-inspector-baseline-and-activation-2026-06-18.md` | Active bug |
| `a11y-baseline-2026-06-18.md` | Current accessibility baseline |
