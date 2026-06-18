# W44 Lighthouse baseline — Phase 0

Run: `npx lighthouse http://127.0.0.1:4174/ --only-categories=performance --throttling-method=provided --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" --timeout=60000 --max-wait-for-load=30000`

Raw LHR JSON (306 KB) was removed during evidence cleanup. The command above reproduces it.

## High-level result

The run completed, but Lighthouse marked performance scoring incomplete because the page did not reach an idle CPU period before the timeout. This is consistent with the current cold-load path: the app fetches and parses large data artifacts before settling.

| Metric                   |                                Result |
| ------------------------ | ------------------------------------: |
| Performance score        |                   `null` (incomplete) |
| First Contentful Paint   |                                 2.1 s |
| Largest Contentful Paint |                                 2.1 s |
| Speed Index              |                                 4.4 s |
| CLS                      |                                     0 |
| Total Blocking Time      | incomplete (`NO_TTI_CPU_IDLE_PERIOD`) |
| Time to Interactive      | incomplete (`NO_TTI_CPU_IDLE_PERIOD`) |
| Main-thread work         |                                23.0 s |
| JS execution (boot-up)   |                                21.5 s |

## Dominant cold-load resources

| Resource                                      |    Transfer |
| --------------------------------------------- | ----------: |
| `semantic_threads_ui.dat?v=494947`            | 41.4 MB × 2 |
| `scripts/leadEnrichment.public.json?v=494947` |     18.6 MB |
| `data.dat?v=494947`                           |      1.8 MB |
| `index-*.js`                                  |     ~119 KB |
| `postprocessing-*.js`                         |     ~152 KB |

## Interpretation

- The first visual paint is not the main issue in this baseline: FCP/LCP are both ~2.1 s.
- The unresolved performance problem is main-thread saturation after paint, likely from data parsing / semantic thread hydration.
- The Phase 3 worker offload for `.dat` parsing is therefore the highest-leverage W44 seam already landed.
- Source-map stripping will reduce parse/download bytes but will not solve the missing TBT idle period by itself.
- Remaining lazy-loads should target non-critical UI surfaces and avoid anything required for initial data hydration.

# W44 Lighthouse follow-up — semantic-thread store sync

Run: `npx lighthouse http://127.0.0.1:4175/ --only-categories=performance --throttling-method=provided --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" --timeout=60000 --max-wait-for-load=30000 --output=json --output-path=tmp/lighthouse-w44-semantic-store-sync.json`

Raw LHR JSON: `tmp/lighthouse-w44-semantic-store-sync.json`.

## High-level result

The run completed with a full performance score after removing duplicate semantic-thread loading from `initData()` and keeping worker-backed semantic hydration in the engine idle path. The duplicate `semantic_threads_ui.dat` transfer is gone from the cold-load network waterfall.

| Metric                   |   Result |
| ------------------------ | -------: |
| Performance score        |     0.72 |
| First Contentful Paint   |    1.2 s |
| Largest Contentful Paint |    1.2 s |
| Speed Index              |    2.2 s |
| CLS                      |        0 |
| Total Blocking Time      | 1,930 ms |
| Main-thread work         |   10.1 s |
| JS boot-up               |    8.9 s |

## Cold-load resource changes

- `semantic_threads_ui.dat` appears once as the worker-backed semantic-thread payload (~40 MB), not twice.
- `scripts/leadEnrichment.public.json?v=494951` remains the dominant transfer at ~18.2 MB.
- `data.dat?v=494951` remains ~1.8 MB.
- Initial JS chunks remain split; semantic-thread code is in a lazy/background chunk (`semantic-threads-*.js`) rather than the startup path.

## Interpretation

- Removing the duplicate main-thread semantic-thread fetch collapsed the live Lighthouse run from the prior incomplete ~21 s main-thread-work baseline to a completed 10.1 s run, with FCP/LCP improving from ~2.1 s to ~1.2 s in this cached/clean run.

## Recommended next seams

1. Verify worker-offload effect with a warm/cached run or a browser Performance recording focused on data-parse tasks.
2. Apply or confirm Phase 2 source-map stripping / terser tightening.
3. Lazy-load only components that are not needed for the initial load path, with strong preference for low-risk components already behind conditional visibility.
4. Investigate `leadEnrichment.public.json` parsing / payload size as the next high-leverage cold-load seam.
