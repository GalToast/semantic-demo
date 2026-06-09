# Reusable Knowledge — semantic-explorer

Durable workflow notes. Update when conventions change.

## Dual-track dev model
Two parallel app tracks coexist:
1. **Legacy JS track** — `js/modules/`, served via `npm run serve` (Python static server on `127.0.0.1:8795`), bundled via `npm run build` (esbuild → `dist/bundle.js`).
2. **Svelte/TS track** — `src/`, served via `npm run dev:svelte` (Vite on `localhost:5173`), built via `npm run build:svelte`.

The legacy engine runs via `src/lib/engine/bridge.ts` until fully replaced. Body `data-*` attributes are synced from Svelte stores via `$effect()` in `App.svelte` for CSS coexistence.

## Test command preferences
- **Fast static checks:** `npm run test` (shell, manifest, cache, config-topology, ownership, tokens, surface-styles, semantic-space, typecheck)
- **Unit tests:** `npm run test:unit` (Vitest)
- **Contract tests (fast DOM/layout):** `npm run qa:contract:all` (Playwright, all surfaces)
- **Single surface contract:** `npm run qa:contract:mobile-idle` (or other named surface)
- **Visual screenshot audit:** `npm run qa:surface:all` (headed, full suite — run sequentially to avoid browser saturation)
- **Micro-demo verification:** `npm run test:microdemo`
- **Svelte check + build:** `npm run check` (svelte-check + vite build)
- **Typecheck only:** `npm run typecheck` (tsc --noEmit)

## Cache-buster reminder
Run `npm run refresh:cache` after CSS/JS changes if stale cache headers are suspected. The cache-buster check is part of `npm run test`.

## Edit safety rules
- Keep edits inside the assigned slice; do not reformat unrelated files.
- Treat `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js` as high-risk — need explicit ownership + targeted tests.
- CSS: find owning module via `docs/semantic-demo-css-ownership-map.md` before editing.
- No `!important` in CSS — resolve specificity conflicts properly.
- Do not move the app root until `deploy.sh`/`deploy.ps1` no longer depend on sibling `../js/scanner.js`.

## Worker / subagent patterns
- Prefer end-to-end seam owners: each worker diagnoses, edits, verifies, returns changed paths + risks.
- Workers stay inside their seam; cross-seam findings are reported, not fixed.
- Use `mode: "yolo"` + `mcp_profile: "default"` for implementation workers; `mode: "readonly"` for analysis-only.
- Report tools exposed at start of worker session; stop if expected tools are missing.

## MCP recovery
If `mcp__chrome-devtools__*` or `mcp__playwright__*` tools go missing: run `npm run mcp:recover`, then restart the client. The MCP node process is owned by the client lifecycle.

## Browser QA
- Run Playwright/Chromium tests headed for visual QA.
- Default to 1 active tab; max 2 during compare/debug.
- Parallel visual-state audits saturate locally — prefer sequential runs.
