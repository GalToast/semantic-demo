# Production-Preview Parity Baseline — W9 Refresh (2026-06-20)

## Purpose

Re-validate the W15 production-preview parity baseline (captured 2026-06-17) after the **W8 Bridge Retirement** (`b9c6154f`) changed the engine import surface from `@lib/engine/adapters/types` (legacy bridge types) to direct `@lib/engine/lifecycle` (self-contained engine declarations). This is the W9-A deliverable: a fast-lane parity smoke that confirms W8 did not regress dev/prod parity for the canonical body data-attrs.

## Test methodology

- **Dev server:** `npx vite --config vite.config.ts --port 5173 --host 127.0.0.1 --strictPort`
- **Preview server:** `npx vite preview --config vite.config.ts --port 4174 --host 127.0.0.1 --strictPort` (serves the production build)
- **Bundle:** `dist/svelte/assets/index-BrBgLeLH.js` (255.76 kB pre-gzip, after W8 retirement)
- **URLs:**
  - Dev: `http://127.0.0.1:5173/?nodemo=1&view=galaxy`
  - Preview: `http://127.0.0.1:4174/?nodemo=1&view=galaxy`
- **Flows covered:**
  1. **idle (overview)** — page load, no user interaction
  2. **search-query "cafe"** — fill `#search-input`, press Enter, wait 2s for results

## Body data-attrs covered

The smoke test compares the following 16 body data-attrs across both servers and both flows:

`mode`, `navMode`, `navSurface`, `panelSurface`, `panelSurfaceMode`, `panelSurfaceDetail`, `journeyPhase`, `graphContext`, `searchStatus`, `trailDepth`, `trailState`, `semanticDive`, `loadingOverlay`, `sceneReady`, `activeView`, `viewMode`

These are the **canonical body data-attrs** that parity-attrs.svelte.ts writes and downstream CSS/Three.js selectors consume. The full set of 26 attrs (as enumerated in `src/lib/orchestration/parity-attrs.svelte.ts` `PARITY_ATTRIBUTES` constant) is exercised by the existing `parity-attrs-mode-transition-smoke.test.ts` unit test.

## W9-A result

```
Flow: idle (overview)
  [OK] 0 mismatches

Flow: search-query "cafe"
  [OK] 0 mismatches


[W9-A PASS] Dev and production-preview produce identical body data-attrs.
  W8 bridge retirement preserves W15 parity baseline.
```

**Conclusion:** The W8 Bridge Retirement (`b9c6154f`) **preserves** the W15 production-preview parity baseline across all 16 body data-attrs and both user flows tested. No regression detected.

## Comparison with W15 baseline

| Flow | W15 baseline (2026-06-17) | W9-A refresh (2026-06-20) | Status |
|------|---------------------------|----------------------------|--------|
| idle (overview) | All attrs match W15 spec | All 16 attrs match between dev/preview | ✅ No drift |
| search-result click (focus-search) | All attrs match W15 spec | Out of scope for fast smoke (W43-C covers full 16-surface parity) | 🟡 Subset only |

**Note:** The W15 baseline doc captured a more detailed flow (`search → click first result → focus-search state`). The W9-A smoke is a **fast lane** that runs in CI; the deeper 16-surface parity (W43-C deferred arc) is covered by `npm run qa:surface:all` which renders all 16 surface IDs.

## Reproduction

```bash
# Start both servers
npx vite --config vite.config.ts --port 5173 --host 127.0.0.1 --strictPort &
npx vite preview --config vite.config.ts --port 4174 --host 127.0.0.1 --strictPort &
sleep 5

# Run the parity smoke
node tests/production-preview-parity-contract.mjs
```

Expected output: `[W9-A PASS] Dev and production-preview produce identical body data-attrs.`

## CI integration

The contract is registered in `tests/contracts.manifest.json` under the `smoke` group, so it runs as part of:

```bash
node tests/run-all-contracts.js --group=smoke
```

The smoke group is sub-30s; the parity contract adds ~10s (two Playwright browser launches + 2 flows × 16 attr reads).

## Future hardening

1. **Expand to 16 surfaces** — extend flows to cover all 26 `PARITY_ATTRIBUTES` entries. Current scope is 16 high-traffic attrs only.
2. **Add visual parity diff** — for each flow, capture a screenshot from dev and preview and assert pixel-level similarity (or a small percentage threshold).
3. **Add bundle hash assertion** — assert the preview bundle hash matches the W8 retirement commit (`b9c6154f`).

## Files changed in W9-A

- **New:** `tests/production-preview-parity-contract.mjs` (the smoke test)
- **Modified:** `tests/contracts.manifest.json` (registered under `smoke` group)
- **New:** `docs/production-preview-parity-baseline-w9-2026-06-20.md` (this doc)

## Owner

W9-A landed: 2026-06-20. Status: ✅ Complete. Migration Arc #4 (Prod-Preview Parity Smoke) **closed**.

---

_Generated 2026-06-20. W9 charter ticket W9-A._
