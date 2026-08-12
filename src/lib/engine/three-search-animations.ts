/**
 * @lib/engine/three-search-animations.ts — Search-results Three.js animations (hub)
 *
 * This file is the hero half of the original `three-search-animations.ts`
 * (SA-1/SA-2 split):
 *
 *   - Hero moment (`triggerSearchHeroMoment`) — a brief bloom at the anchor
 *     node when search results land; synchronized with audio via
 *     `audio-scape.triggerCorridorBloom`. Self-schedules a rAF loop via
 *     `scheduleFrameTask`; its only module-local handle is `_heroFrameTaskCancel`.
 *   - `disposeHeroAnimation` — cancels that rAF loop (hero-only teardown).
 *
 * The corridor cluster (per-node glow, path corridor animation, geometry /
 * particle pipeline, and the shared buffer/uniform writers) now lives in
 * `three-search-corridor-animations.ts` and is re-exported below so existing
 * consumers (`three-engine-state.ts`, `lifecycle.ts`, the barrel) keep
 * resolving through this module path. `disposeInteractionVisuals` should call
 * BOTH `disposeHeroAnimation()` and `disposeCorridorGlow()` on teardown.
 */
import { webglContext } from '@lib/engine/webgl-context'
import { scheduleFrameTask } from './frame-scheduler'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state
import { armAnchorGlow } from './three-search-corridor-animations'

// ── Private State ───────────────────────────────────────────────────────────

// The only self-scheduled rAF handle in this file: created by
// `scheduleFrameTask(animateHero)` in `triggerSearchHeroMoment` and consumed

// ── Corridor re-export (SA-2 split target) ──────────────────────────────────
// All corridor symbols — triggerCorridorNodeGlow, updateCorridorNodeGlow,
// triggerSearchCorridorAnimation, updateSearchCorridorAnimation,
// disposeSearchCorridorAnimation, disposeCorridorGlow, the CorridorGlowState /
// CorridorAnimState interfaces, and the shared geometry/particle/uniform
// helpers — are defined in the corridor module and re-exported here so the
// original `three-search-animations` import surface stays stable.
export * from './three-search-corridor-animations'
export * from './three-search-hero-animations'