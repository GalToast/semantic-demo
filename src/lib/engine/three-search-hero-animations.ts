/**
 * @lib/engine/three-search-hero-animations.ts — Hero moment (SA-1)
 *
 * Part of the three-star search-animation split. This module owns the hero
 * moment (`triggerSearchHeroMoment`) — a brief bloom at the anchor node when
 * search results land — plus its self-scheduled rAF loop and the hero-only
 * teardown `disposeHeroAnimation`. It also arms the persistent anchor glow
 * (`armAnchorGlow`, owned by the corridor module).
 *
 * The corridor cluster (per-node glow, path corridor animation, geometry /
 * particle pipeline) lives in `three-search-corridor-animations.ts`. Consumers
 * keep importing through the `three-search-animations.ts` hub, which re-exports
 * this module alongside the corridor module.
 */
import { scheduleFrameTask } from './frame-scheduler'
import { webglContext } from '@lib/engine/webgl-context'
import { appState as _state } from '@lib/state/app.svelte'
import { armAnchorGlow } from './three-search-corridor-animations'

const state = _state

// ── Private State ───────────────────────────────────────────────────────────

// The only self-scheduled rAF handle in this file: created by
// `scheduleFrameTask(animateHero)` in `triggerSearchHeroMoment` and consumed
// by `disposeHeroAnimation`. All other per-frame search animation state
// (corridor glow + path animation) lives in three-search-corridor-animations.ts.
let _heroFrameTaskCancel: (() => void) | null = null

// ── Public API ──────────────────────────────────────────────────────────────

export function triggerSearchHeroMoment(anchorIndex: number) {
    if (!webglContext.pointsMaterial || !webglContext.pointsMaterial.userData.shader || !state.nodePositions) return
    const shader = webglContext.pointsMaterial.userData.shader

    _heroFrameTaskCancel?.()
    _heroFrameTaskCancel = null

    // Arm persistent anchor glow so the anchor node stays visually distinct
    // after the bloom peaks. The glow state lives in the corridor module and
    // is sustained/decayed by `updateCorridorNodeGlow`.
    armAnchorGlow(anchorIndex)

    if (Number.isFinite(anchorIndex) && state.nodePositions[anchorIndex]) {
        const pos = state.nodePositions[anchorIndex]
        shader.uniforms.uRippleCenter.value.set(pos.x, pos.y, pos.z)
    } else {
        shader.uniforms.uRippleCenter.value.set(0, 0, 0)
    }

    shader.uniforms.uRippleTime.value = 0.0

    const duration = 2400
    const startTime = performance.now()

    function animateHero(now: number): boolean {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1.0)

        if (webglContext.pointsMaterial && webglContext.pointsMaterial.userData.shader) {
            const currentShader = webglContext.pointsMaterial.userData.shader
            currentShader.uniforms.uRippleTime.value = progress * 15.0

            const bloom = Math.sin(progress * Math.PI)
            currentShader.uniforms.uGlowIntensity.value = bloom * 3.0
        }

        if (progress < 1.0) {
            return false
        } else {
            _heroFrameTaskCancel = null
            if (webglContext.pointsMaterial && webglContext.pointsMaterial.userData.shader) {
                // Do NOT reset uGlowIntensity to zero — the persistent anchor
                // glow in updateCorridorNodeGlow will sustain a residual level.
                webglContext.pointsMaterial.userData.shader.uniforms.uRippleTime.value = -1000.0
            }
            return true
        }
    }

    _heroFrameTaskCancel = scheduleFrameTask(animateHero)
}

/**
 * Dispose the hero-moment self-scheduled frame task. Corridor/anchor glow
 * teardown moved to `disposeCorridorGlow` (three-search-corridor-animations.ts)
 * as part of the SA-2 corridor split; `disposeInteractionVisuals` calls both.
 */
export function disposeHeroAnimation() {
    _heroFrameTaskCancel?.()
    _heroFrameTaskCancel = null
}