/**
 * @lib/engine/three-search-animations.ts — Search-results animation hub
 *
 * The search animation cluster was split (three-star SA carve) into two
 * cohesive modules; this file is the stable import surface that re-exports
 * both so existing consumers keep resolving through the original path:
 *
 *   - `three-search-hero-animations.ts` (SA-1) — hero moment
 *     (`triggerSearchHeroMoment`) plus its self-scheduled rAF loop and the
 *     hero-only teardown `disposeHeroAnimation`.
 *   - `three-search-corridor-animations.ts` (SA-2) — per-node corridor glow
 *     (`triggerCorridorNodeGlow` / `updateCorridorNodeGlow`), the path corridor
 *     animation (`triggerSearchCorridorAnimation` / `updateSearchCorridorAnimation`
 *     / `disposeSearchCorridorAnimation`), the geometry + particle + shared
 *     uniform pipeline, the `CorridorGlowState` / `CorridorAnimState` types, the
 *     anchor-glow arm point (`armAnchorGlow`), and the corridor-glow teardown
 *     (`disposeCorridorGlow`).
 *
 * Disposal boundary (SA carve §3.1): `disposeHeroAnimation` is hero-only —
 * it cancels the hero rAF task and nothing else. Corridor/anchor glow teardown
 * lives in `disposeCorridorGlow`. `disposeInteractionVisuals`
 * (three-interaction-visuals.ts) calls BOTH, and it runs on every teardown path
 * that previously relied on the fat `disposeHeroAnimation`:
 *   - `lifecycle.ts` destroyEngine → `disposeInteractionVisuals()` then
 *     `disposeHeroAnimation()`
 *   - `three-engine-teardown.ts` deinit → `disposeHeroAnimation()` then
 *     `threeInteractionVisuals.disposeInteractionVisuals()`
 *
 * Per-frame updates are still driven by `updateCorridorNodeGlow` /
 * `updateSearchCorridorAnimation` (called from three-engine-core's animate()).
 *
 * Constants live with their owning module and are tuned for the W46 visual
 * identity; do not adjust without re-running `npm run qa:surface:mobile-idle`
 * and the focus-pocket-state contract tests.
 */

export * from './three-search-hero-animations'
export * from './three-search-corridor-animations'
