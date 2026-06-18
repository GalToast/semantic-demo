# Performance Budget — 2026-06-17

Baseline established after Svelte 5 migration (W20–W36) structural closeout.

- **Git HEAD:** `1bc3c57`
- **Date:** 2026-06-17
- **Svelte check:** 0 errors / 0 warnings

---

## Baseline measurements

### Build time

Measured via `time npm run build:svelte` (wall-clock) and Vite's own report across 3 consecutive runs on the same tree.

| Run | Wall-clock | Vite-reported |
|-----|-----------|---------------|
| 1   | 3.807 s   | 2.61 s        |
| 2   | 3.591 s   | 2.48 s        |
| 3   | 3.649 s   | 2.54 s        |
| **Median** | **3.649 s** | **2.54 s** |

> The closeout doc's claim of "build 3.02 s" was inconsistent with measured data; actual wall-clock median is 3.65 s and Vite-reported median is 2.54 s.

### Chunk sizes

All assets live under `dist/svelte/assets/`. Sizes measured from the build output and verified with `stat -c%s` + `gzip -c | wc -c`.

| Chunk | File | Raw (bytes) | Raw (kB) | Gzip (bytes) | Gzip (kB) |
|-------|------|-------------|----------|--------------|-----------|
| **Main app** | `index-DOEj5CWA.js` | 584,650 | 584.65 | 179,310 | 179.31 |
| **Three.js** | `three-Ct0RfkIo.js` | 759,664 | 759.66 | 191,292 | 191.29 |
| **Postprocessing** | `three-postprocessing-ODJp4eIW.js` | 82,487 | 82.49 | 18,817 | 18.82 |
| **Web Worker** | `data-worker-DFjzbRDE.js` | 3,438 | 3.44 | 1,549 | 1.55 |
| **Rolldown runtime** | `rolldown-runtime-DK3Fl9T5.js` | 158 | 0.16 | 183 | 0.18 |
| **CSS** | `index-DDptPK1b.css` | 54,579 | 54.58 | 9,744 | 9.74 |
| **HTML** | `index.html` | 9,218 | 9.22 | 3,026 | 3.03 |

**Totals:**

| | Raw | Gzip |
|---|-----|------|
| **JS only** | 1,430,397 B (1,430.40 kB) | 391,151 B (391.15 kB) |
| **All (JS+CSS+HTML)** | 1,494,194 B (1,494.20 kB) | 403,921 B (403.92 kB) |

> The closeout doc's claim of "load time 2.4 s" was unverified. Actual browser load metrics require a real-browser measurement pass (see § Methodology gap).

### Network-level load timing (localhost preview, curl)

Measured from `npx vite preview --port 4175 --host 127.0.0.1` serving `dist/svelte/`, requesting `/?nodemo=1&view=galaxy`.

| Asset | TTFB (s) | Total (s) | Size (B) |
|-------|----------|-----------|----------|
| HTML | 0.003 | 0.003 | 9,218 |
| Main JS | 0.004 | 0.006 | 584,650 |
| Three.js | 0.002 | 0.005 | 759,664 |
| Postprocessing | 0.003 | 0.003 | 82,487 |
| Worker | 0.003 | 0.003 | 3,438 |
| CSS | 0.002 | 0.003 | 54,579 |

> These are localhost network times (negligible latency). They confirm the server serves correctly but do NOT represent real browser paint/render metrics.

### Browser paint metrics (FCP / LCP / TTI)

**⚠ Methodology gap:** No Playwright MCP or headless browser automation was available in this tool session. FCP, LCP, and TTI **cannot** be measured without a real browser rendering pipeline. This section requires a follow-up pass with Playwright or Lighthouse CLI.

Estimated from network waterfall (localhost, sequential load): all critical JS/CSS deliverable in <15 ms network time. First meaningful paint depends on Svelte hydration + three.js initialization — **not measurable without a browser**.

---

## Budget targets

### Bundle size

| Asset | Ceiling (gzip) | Rationale |
|-------|----------------|-----------|
| Main chunk (`index-*.js`) | 200 kB gzip | App code + Svelte runtime; current 179 kB |
| Three.js chunk (`three-*.js`) | 210 kB gzip | Vendor library; current 191 kB |
| Postprocessing chunk | 25 kB gzip | Effect pipeline; current 19 kB |
| Total JS (all chunks) | 450 kB gzip | Current 391 kB |
| Total all assets | 500 kB gzip | Current 404 kB |

### Load time

| Metric | Ceiling | Notes |
|--------|---------|-------|
| FCP | ≤ 1.5 s | On 4G; requires browser measurement |
| LCP | ≤ 2.5 s | On 4G; requires browser measurement |
| TTI | ≤ 3.0 s | On 4G; requires browser measurement |

### Lighthouse

| Category | Floor |
|----------|-------|
| Performance | ≥ 90 |
| Accessibility | ≥ 90 |

### Build time

| Metric | Ceiling |
|--------|---------|
| Wall-clock `npm run build:svelte` | ≤ 5.0 s |
| Vite-reported | ≤ 3.5 s |

---

## Measurement methodology

Reproducible commands for a future session:

```bash
# 1. Build time (run 3×, take median)
time npm run build:svelte

# 2. Chunk sizes (raw + gzip)
for f in dist/svelte/assets/*.js; do
  raw=$(stat -c%s "$f")
  gz=$(gzip -c "$f" | wc -c)
  echo "$(basename "$f") raw=$raw gzip=$gz"
done

# 3. Network-level asset timing (localhost)
npx vite preview --port 4175 --host 127.0.0.1 &
sleep 2
curl -s -o /dev/null -w "%{url} TTFB:%{time_starttransfer}s Total:%{time_total}s\n" \
  http://127.0.0.1:4175/?nodemo=1&view=galaxy

# 4. Browser paint metrics (requires Playwright or Lighthouse)
npx lighthouse http://127.0.0.1:4175/?nodemo=1&view=galaxy \
  --only-categories=performance \
  --output=json --output-path=./lighthouse-report.json

# 5. svelte-check (source integrity)
npx svelte-check --tsconfig ./tsconfig.json

# 6. Preview server PID (find & kill)
# Windows:
Get-NetTCPConnection -LocalPort 4175 | ForEach-Object { Stop-Process -Id $_.OwningProcess }
# macOS/Linux:
lsof -ti :4175 | xargs kill
```

---

## Phase 2 guardrails

Regression thresholds that **should block a merge**:

| Guardrail | Threshold | How to check |
|-----------|-----------|-------------|
| Main chunk growth | > 10% increase in gzip size vs. baseline (179 kB) | Compare `gzip -c dist/svelte/assets/index-*.js \| wc -c` against 179,310 |
| Three.js chunk growth | > 10% increase in gzip size vs. baseline (191 kB) | Compare `three-*.js` gzip against 191,292 |
| Total JS gzip growth | > 15% increase vs. baseline (391 kB) | Sum all JS gzip sizes |
| FCP regression | > 200 ms increase over measured baseline | Requires Playwright/Lighthouse CI |
| LCP regression | > 300 ms increase over measured baseline | Requires Playwright/Lighthouse CI |
| svelte-check regression | Any error or warning | `npx svelte-check --tsconfig ./tsconfig.json` must report 0 errors, 0 warnings |
| Build time regression | Wall-clock > 6.0 s (median of 3 runs) | `time npm run build:svelte` |
| New dynamic import anti-pattern | `INEFFECTIVE_DYNAMIC_IMPORT` warnings from Vite | Build log must be free of these warnings |

### Open item

The current build emits one `INEFFECTIVE_DYNAMIC_IMPORT` warning for `src/lib/engine/map-state.ts` (dynamically imported in `MapView.svelte` but statically imported elsewhere). This prevents the chunk from being split as intended. Should be resolved or explicitly acknowledged in Phase 2.

---

*Generated from real measurements on 2026-06-17. No placeholder values.*
