# W44 Lighthouse baseline — Phase 0

Run: `npx lighthouse http://127.0.0.1:4174/ --only-categories=performance --throttling-method=provided --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" --timeout=60000 --max-wait-for-load=30000`

Raw LHR JSON (306 KB) was removed during evidence cleanup. The command above reproduces it.

## High-level result

The run completed, but Lighthouse marked performance scoring incomplete because the page did not reach an idle CPU period before the timeout. This is consistent with the current cold-load path: the app fetches and parses large data artifacts before settling.

| Metric | Result |
| --- | ---: |
| Performance score | `null` (incomplete) |
| First Contentful Paint | 2.1 s |
| Largest Contentful Paint | 2.1 s |
| Speed Index | 4.4 s |
| CLS | 0 |
| Total Blocking Time | incomplete (`NO_TTI_CPU_IDLE_PERIOD`) |
| Time to Interactive | incomplete (`NO_TTI_CPU_IDLE_PERIOD`) |
| Main-thread work | 23.0 s |
| JS execution (boot-up) | 21.5 s |

## Dominant cold-load resources

| Resource | Transfer |
| --- | ---: |
| `semantic_threads_ui.dat?v=494947` | 41.4 MB × 2 |
| `scripts/leadEnrichment.public.json?v=494947` | 18.6 MB |
| `data.dat?v=494947` | 1.8 MB |
| `index-*.js` | ~119 KB |
| `postprocessing-*.js` | ~152 KB |

## Interpretation

- The first visual paint is not the main issue in this baseline: FCP/LCP are both ~2.1 s.
- The unresolved performance problem is main-thread saturation after paint, likely from data parsing / semantic thread hydration.
- The Phase 3 worker offload for `.dat` parsing is therefore the highest-leverage W44 seam already landed.
- Source-map stripping will reduce parse/download bytes but will not solve the missing TBT idle period by itself.
- Remaining lazy-loads should target non-critical UI surfaces and avoid anything required for initial data hydration.

## Recommended next seams

1. Verify worker-offload effect with a warm/cached run or a browser Performance recording focused on data-parse tasks.
2. Apply or confirm Phase 2 source-map stripping / terser tightening.
3. Lazy-load only components that are not needed for the initial load path, with strong preference for low-risk components already behind conditional visibility.
