# Lazification plan — designed 1,240KB `mode-transition-deps` → <350KB

Status: **draft**, awaiting the orchestration lane to land its URL/nav work.

## Why

p1–p3 (2026-08-14) measured mobile LCP 11.7s as **transfer-bound**: the entry's
static closure funnels navigation/orchestration/journey/search into one
1,240KB `mode-transition-deps-*.js` chunk (see vite.config.ts manualChunks
comment). Everything else is healthy (engine split ~81KB×2, triggers already
rIC-deferred, Canvas/workers lazy).

## The move (from the config's own W-61 note)

Convert orchestrator **static imports to dynamic `import()`** so journey/search
load on demand. Shell target: **< 350KB** transferred.

## Candidate seams (p3-boot trace evidence; re-verify each before touching)

1. `@lib/orchestration/triggers` — already rIC-deferred; use as the template.
2. `@lib/orchestration/url-params.ts` + `applyUrlState` — only needed for
   deep-links (`?session=`/`?record=`/`?view=`/`?q=`) → dynamic-load only when
   `parseUrlParams().isDeepLink` is true.
3. `compass-controller`, `adapters`, `lifecycle` — statically subscribe into
   journey/search at startup; convert heavy side-effect chains to lazy
   (keep store/state modules eager; defer orchestrator wiring).
4. Re-audit for accidental eager `three` re-import off the engine path.

## Non-negotiable gate (from AGENTS.md lockstep invariant)

- Do NOT alter `focusActive` / `chromeHasFocus` parity predicates (App.svelte
    - JourneyChrome.svelte). Public state modules must stay eager.
- Verify after each file: `npm run build` + added-shell-size check (<350KB),
  `npm run qa:journey:headless`, `node tests/run-all-contracts.js --validate`,
  then `--baseline` re-seed + `node scripts/qa-lighthouse-gate.mjs`.

## Sequencing

Lane URL lands → implement one seam per commit with per-step re-measure →
re-run gate → expect mobile LCP 11.7s → ~3–5s (bytes-bound recovery).

## Ownership / collision

`url-params.ts`, `navigation/*`, `App.svelte`, `JourneyChrome.svelte`,
`data-worker.ts` are the parallel lane's files — do NOT touch while live.
