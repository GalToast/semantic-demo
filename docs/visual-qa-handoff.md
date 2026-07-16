# Visual-QA Handoff — 5-Surface Layout Audit

**Generated:** 2026-07-15 · **Method:** main-agent Playwright nav + screenshots, graded by
`agnes/agnes-2.0-flash` (vision model) reading the PNGs. (Hybrid avoids the autonomous-nav
worker timeouts that blocked earlier QA workers.)

> **Follow-up — 2026-07-16 Wave-3 Phase-4 closure:** see `docs/visual-qa-2026-07-16-wave-3.md`. Three of four Phase-3 residuals closed-green: R1 Surface 5 @820 chip-clip was ruled an agnes-2.0-flash hallucination (DOM truth: no chip label is clipped), R2 Surface 4 Map tile-loading + R3 Surface 7 mobile splash dismiss patched. The B-A1 finding below has parallel-session guard-test coverage via `tests/widget-journey.spec.js` test 'B-A1: search count never overshoots total + Show-more reachable' added at `80f7d93c`; the substantive fix (`SearchResults.svelte` visibleCount clamp `Math.min(searchVisibleCountFn(), total)`) remains working-tree-uncommitted at time of this banner. Treat the per-surface "Status" cells below as the Phase-3 grader reads, not as current truth — see the Wave-3 doc for the final disposition.

Screenshots (in `tmp/`): `qa-A2.1-360.png`, `qa-A2.2-820.png`, `qa-A3-focus.png`,
`qa-search-coffee.png`, `qa-B1-filters.png` (downscaled `*.small.jpg` used for grading).

## Findings table

| Surface                                   | Status          | Finding                                                                                                                                        | Severity | Evidence                                                                                                                                                                             |
| ----------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A2.1** — Mobile 360px compass/mode rail | Issue confirmed | Right-side mode chips clipped at viewport edge; welcome overlay obscures 60%+ of canvas; rail centering offset by uncleared `translateX(-50%)` | Med      | "Overview" visible; subsequent locked chips (Trail, Focus…) cut off at right edge; welcome search overlay covers center; weather pill slightly misaligned                            |
| **A2.2** — Header mode-chip rail @ 820px  | Issue confirmed | Chip labels cut mid-word at the narrow end of the 820px range; subtitle text truncated with ellipsis                                           | Med      | "See all businesses linked to the focused one, rank…" ellipsized; chips _appear_ to fit at exactly 820px but clip at the breakpoint boundary (narrower)                              |
| **A3** — Focus mode detail panel          | OK              | All text readable; info panel, trail step bar, and header chips fit without clipping                                                           | Low      | "Angel Fire Coffee" card, trail "Step 1" text, all 6 mode-nav chips fully visible with adequate padding                                                                              |
| **B-A1** — Search "coffee" results        | Issue confirmed | Results list extends below the fold; "Show more" control not visible; result counter "18 of 17" is anomalous                                   | **High** | 3 of 17 matches shown; "7 behind" indicator present but no pagination/expand control in frame; count mismatch suggests a data bug                                                    |
| **B1** — Filters dropdown                 | OK              | Filter panels (STATUS / CONTACT / CITY) render fully; right-sidebar buttons intact; city count "(8406)" fits                                   | Low      | All toggles visible; Reset (0) correctly disabled; header "See all 8,406 …" truncated by ~6 chars (non-critical). Orphan `css/mobile_premium__layout.css` causes no visible breakage |

## Notes / next actions

- **B-A1 is the highest-priority fix:** the "Show more" control is clipped below the viewport _and_
  the result counter reads "18 of 17" (off-by-one / data bug). Investigate the results-list
  container's max-height + the count source.
- **A2.2** is borderline at 820px — confirm by capturing a narrower width (e.g. 768px) to show the
  mid-word chip clipping the prior audit flagged.
- **A2.1** needs the `translateX(-50%)` clear at `≤360px` (already noted as confounded with the
  welcome overlay) — verify after the overlay-dismiss path.
- **A3 / B1** are clean at desktop width — no action needed beyond the non-critical header truncation.

## Raw grader output

Produced by worker `ocw_ab60e93b` (route `router-agnes/agnes-2.0-flash`, 2891 output tokens, exit 0).
Full transcript: `.opencode/opencode-workers/ocw_ab60e93b-ee61-49d9-8dd6-e2e916a2bace/stdout.log`.
