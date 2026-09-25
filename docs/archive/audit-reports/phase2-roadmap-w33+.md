# Semantic Explorer — Phase 2: Post-Migration Hardening Roadmap (W33+)

**Date:** 2026-06-18  
**Baseline:** `e49cc36 chore(w32-a): delete orphaned legend-ui-bridge.ts`  
**Status:** Svelte 5 migration complete. Phase 2 = production hardening + polish.

---

## Context

The W20–W32 migration arc closed with:

- `js/modules/` entirely deleted (64+ files)
- `legacy-reference/` down to 1 README
- All 27 Svelte components tested
- 5 internal bridges remain (all with active consumers)
- 2 pre-existing test failures unrelated to migration
- Build: 4.85s, 384 modules, three.js chunked

This roadmap picks up where the migration left off.

---

## Phase 2 Waves

### W33: Production Hardening — CI Green

**Goal:** Close the 2 pre-existing test failures so `npm test` is fully green.

| Task             | File                                                       | Issue                                                                   | Approach                                                                                                    |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fix stale test   | `tests/unit-active/w20-wave4-readiness-regression.test.ts` | Expects `js/modules/` directory to exist for scanning                   | Update assertion: if directory missing, test should pass (zero cross-track imports is the actual invariant) |
| Fix CSS baseline | `tests/unit-active/css-important-invariant.test.ts`        | 3 `!important` uses in `css/mobile_base.css` exceed `APPROVED_BASELINE` | Either raise baseline if CSS team approves, or refactor the 3 selectors to avoid `!important`               |

**Verification:** `npm test` → 0 failures, 90/90 files pass
**Effort:** 1-2 hours  
**Payoff:** Production-ready signal

---

### W34: CSS Smell Closure

**Goal:** Audit and resolve remaining CSS architectural smells.

| Smell                 | Status                            | Owner File            | Action                                                                                               |
| --------------------- | --------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Smell 1**           | ❌ NOT YET AUDITED                | Unknown               | Audit all `css/` modules for selector scatter, specificity wars, z-index leakage. Document findings. |
| **Smell 2**           | 🟡 IN PROGRESS (parallel session) | `.info-panel` scatter | Parallel session already auditing in `0238426`. Wait for their findings or help close.               |
| **`!important` uses** | 🟡 3 uses over baseline           | `css/mobile_base.css` | Resolve via specificity refactoring or documented approval.                                          |

**Verification:** `npm test` CSS invariants pass, `svelte-check` 0/0  
**Effort:** 2-4 hours  
**Payoff:** Maintainable CSS, no specificity debt

---

### W35: Visual QA Surface Sweep

**Goal:** Every one of the 27 surfaces has a visual baseline screenshot.

| Surface Group     | Count | Has Baseline? | Gap              |
| ----------------- | ----- | ------------- | ---------------- |
| Overview surfaces | ~8    | Partial       | Need full matrix |
| Focus surfaces    | ~6    | Partial       | Need full matrix |
| Search surfaces   | ~5    | Partial       | Need full matrix |
| Mobile surfaces   | ~4    | Partial       | Need full matrix |
| Transition states | ~4    | None          | Critical gap     |

**Approach:**

1. Run `tests/visual-state-audit.mjs` for all surfaces
2. Capture baseline PNGs for any surface without one
3. Store baselines in `tests/visual-baselines/`
4. Add CI gate: visual diff fails if deviation > threshold

**Verification:** Every surface has a baseline; CI visual gate passes  
**Effort:** 4-6 hours  
**Payoff:** Regression-proof visual fidelity

---

### W36: A11y Closure

**Goal:** Resolve remaining accessibility audit gaps.

| Component                | Gap                 | Action                                                                     |
| ------------------------ | ------------------- | -------------------------------------------------------------------------- |
| `ThreadInspector.svelte` | Not yet audited     | Run ARIA contract test; add keyboard nav, focus trap, screen-reader labels |
| `SearchInput.svelte`     | Partial audit       | Complete roving tabindex, aria-activedescendant, live-region announcements |
| `Canvas.svelte`          | Already fixed (W24) | Verify no regressions                                                      |
| `InfoPanel.svelte`       | Already fixed (W24) | Verify no regressions                                                      |

**Verification:** `tests/aria-sync-contract.mjs` passes for all components  
**Effort:** 3-5 hours  
**Payoff:** WCAG 2.1 AA compliance

---

### W37: Performance Pass

**Goal:** Measure and optimize rendering FPS, bundle size, memory.

| Metric            | Current                             | Target                      | Approach                                                                    |
| ----------------- | ----------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| **Build size**    | `index.js` 584KB + `three.js` 759KB | Reduce `index.js` to <400KB | Tree-shake unused Svelte components; lazy-load non-critical modules         |
| **First paint**   | Unknown                             | <2s on 3G                   | Audit `copyRuntimeAssetsPlugin`; preconnect hints; font preload             |
| **FPS (desktop)** | Unknown                             | 60fps stable                | Profile `animate()` loop; reduce `drawCalls` in dense clusters              |
| **FPS (mobile)**  | Unknown                             | 30fps stable                | Cap particle count; reduce shadow map res; throttle `requestAnimationFrame` |
| **Memory**        | Unknown                             | <200MB heap                 | Dispose Three.js textures/geometries on unmount; avoid closure leaks        |

**Approach:**

1. Add `performance.mark` instrumentation to `Canvas.svelte` lifecycle
2. Run Lighthouse + Chrome DevTools Performance panel
3. Document findings in `notes/performance-baseline-2026-06-18.md`
4. Fix top 3 bottlenecks

**Verification:** Lighthouse score ≥90, no memory leaks in 5-min session  
**Effort:** 6-10 hours  
**Payoff:** Production-grade performance

---

### W38: Final Bridge Retirement

**Goal:** Inline or retire the 5 remaining pure-living bridges.

| Bridge                                        | Consumers                 | Strategy                                                                      |
| --------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/engine/adapters/core.ts`             | Orchestrates all adapters | **KEEP** — this is the engine API surface, not a bridge to legacy             |
| `src/lib/engine/adapters/lifecycle-bridge.ts` | `core.ts`                 | Evaluate: can `core.ts` import from `@lib/engine/lifecycle.ts` directly?      |
| `src/lib/engine/adapters/camera-bridge.ts`    | `core.ts`                 | Evaluate: can `core.ts` import from `@lib/engine/camera-controls` directly?   |
| `src/lib/engine/adapters/search-bridge.ts`    | `core.ts`                 | Evaluate: can `core.ts` import from `@lib/engine/search-animations` directly? |
| `src/lib/orchestration/adapter-deps.ts`       | `app-init.ts`             | Evaluate: can `app-init.ts` build deps inline?                                |

**Approach:**

1. For each bridge, read its re-exports and find all consumers
2. Repoint consumers to canonical imports
3. Delete bridge if zero consumers remain
4. If bridge still needed (e.g., `core.ts` uses it for type aggregation), document why

**Verification:** `npm run check` 0/0, `npm test` 0 failures  
**Effort:** 4-6 hours  
**Payoff:** Zero bridge files; all imports are direct canonicals

---

## Wave Ordering Rationale

| Wave                         | Priority       | Why                                                                             |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------- |
| **W33** Production Hardening | 🔴 **HIGHEST** | Unblocks CI. Every downstream wave depends on green tests.                      |
| **W34** CSS Smell            | 🟡 HIGH        | Parallel session already on Smell 2. Smell 1 is the last big architectural gap. |
| **W35** Visual QA            | 🟡 HIGH        | User-facing. Protects against visual regression.                                |
| **W36** A11y                 | 🟡 HIGH        | User-facing. Required for production deployment.                                |
| **W37** Performance          | 🟢 MEDIUM      | Important but not blocking. Can ship without it.                                |
| **W38** Bridge Retirement    | 🟢 MEDIUM      | Code hygiene. No user impact. Do last.                                          |

---

## Pre-Work (Before Any Wave)

Before starting W33+, verify:

1. `git log --since="3 hours ago" --oneline` — no parallel session commits in flight
2. `git status --short` — working tree clean or only your intended changes
3. `npm run check` — 0 errors, 0 warnings
4. `npm run build:svelte` — succeeds
5. `npx vitest run` — only 2 expected failures (the ones W33 will fix)

---

## Parallel Session Coordination

The parallel session is currently active on:

- CSS Smell 2 audit (`0238426`)
- Final session summaries (`ef9b708`, `d241c60`)

**Rule:** If starting W34 before the parallel session's CSS Smell 2 audit lands, either:

- Wait for their findings
- Or work on W33 (production hardening) which is fully independent

Do NOT start W34 CSS work while parallel session is mid-audit on the same surface.

---

## Exit Criteria for Phase 2

Phase 2 is "done" when:

- [ ] `npm test` → 0 failures (90/90 files pass)
- [ ] All 27 surfaces have visual baselines
- [ ] ARIA contract tests pass for all components
- [ ] Lighthouse score ≥90
- [ ] 0 bridge files remain (or documented justification for each kept bridge)
- [ ] `AGENTS.md` updated with any new off-limits surfaces

---

## Appendix: Current Open Files for Reference

| File                                                       | Why It Matters                                          |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `tests/unit-active/w20-wave4-readiness-regression.test.ts` | Stale — expects `js/modules/` to exist. W33 fixes this. |
| `tests/unit-active/css-important-invariant.test.ts`        | Baseline mismatch. W33 or W34 fixes this.               |
| `css/mobile_base.css`                                      | Contains 3 `!important` uses. W34 resolves.             |
| `src/lib/engine/adapters/core.ts`                          | Last bridge aggregator. W38 evaluates retirement.       |
| `tests/visual-state-audit.mjs`                             | Entry point for W35 visual QA.                          |
| `tests/aria-sync-contract.mjs`                             | Entry point for W36 a11y.                               |

---

_End of Phase 2 roadmap. Ready for W33 when you are._
