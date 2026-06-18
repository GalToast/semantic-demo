# Performance Budget

**Date:** 2026-06-17
**Source:** W35 deploy verification measurements
**Baseline:** Post-SvelteKit migration

---

## Bundle Size Targets

| Chunk | Current | Target | Tolerance |
|-------|---------|--------|-----------|
| Main (index.js) | 584 KB | < 650 KB | +100 KB |
| Three.js (cached) | 760 KB | < 800 KB | +50 KB |
| CSS | 54 KB | < 75 KB | +20 KB |
| Post-processing | 82 KB | < 100 KB | +20 KB |
| Total (first load) | ~638 KB gzipped | < 700 KB gzipped | — |

**Notes:**
- Three.js is served from a separate chunk with immutable caching headers; it does not block initial render.
- The main + post-processing + CSS chunks constitute the critical path (~279 KB gzipped).
- Data worker (3.43 KB) is offloaded and does not block the main thread.

## Load Time Targets

| Metric | Current | Target |
|--------|---------|--------|
| DOM Interactive | 332ms | < 500ms |
| FCP | 2.52s | < 3.0s |
| LCP (estimated) | ~3.0s | < 3.5s |
| TTI (estimated) | ~3.5s | < 4.0s |

**Notes:**
- FCP includes Three.js parsing and initial scene hydration.
- LCP and TTI are estimated from observed load waterfall; formal measurement via Lighthouse recommended for future verification.
- DOM Interactive at 332ms confirms fast shell rendering (SvelteKit static + minimal JS).

## Measurement Methodology

| What | How |
|------|-----|
| Build time | `npm run build` (Vite production build) |
| Bundle sizes | `ls -lh dist/svelte/assets/*.js` and `*.css` |
| gzip sizes | Built-in Vite gzip output (`*.gz` or reported at build) |
| Load timing | Playwright Navigation Timing API (`performance.getEntriesByType('navigation')`) |
| Visual regression | `tests/visual-regression.test.ts` (Playwright screenshot comparison) |

## How to Check If Budget Is Exceeded

Run the following after a production build:

```bash
# 1. Build
npm run build

# 2. Check bundle sizes
ls -lh dist/svelte/assets/*.js dist/svelte/assets/*.css

# 3. Check gzip sizes (if not printed at build)
for f in dist/svelte/assets/*.js dist/svelte/assets/*.css; do
  echo "$(gzip -c "$f" | wc -c) $f"
done

# 4. Run load-time measurement
npx playwright test tests/perf-budget.test.ts
```

If any chunk exceeds its **Target** column, the budget is exceeded. If it exceeds **Target + Tolerance**, it is a hard blocker for release.

## Budget Review Cadence

- **Weekly:** Re-measure on CI green builds.
- **Per-feature:** Re-measure before merging any PR that adds >10 KB to any chunk.
- **Quarterly:** Reassess targets against Core Web Vitals benchmarks.
