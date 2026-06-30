/**
 * @lib/engine/three-engine-frame-updates.ts — Frame-update concerns extracted from animate()
 *
 * Phase 4 quick-pick extraction (5 low-risk concerns) from the render loop
 * in three-engine-core.ts. Each function takes an explicit `state` argument
 * for read-only state access (Phase 1 pattern from three-engine-helpers.ts).
 * Render-loop-mutated bookkeeping (lastHoveredNode, hoverEmissiveFlash,
 * pulsePhase) goes through the engineState singleton.
 *
 * References:
 *   - docs/three-engine-decomposition-plan.md §4 (A4, A7, A11, A12, A14)
 */

import type { LegacyState } from '@lib/state/legacy-state'
import type { MeshPhongMaterial } from 'three'
import { engineState } from './three-engine-state'
import { webglContext } from '@lib/engine/webgl-context'
import { CONFIG } from '@lib/engine/config'
import { SCENE_ATMOSPHERE as PORT_SCENE_ATMOSPHERE } from '@lib/engine/node-manager'
import { shouldRenderThreads } from '@lib/engine/thread-manager'
import { easeOutQuint, easeInOutCubic } from '@lib/utils/math-easing'
import * as sceneRevealMod from './scene-reveal'

// ── A4 — Reveal progression ──────────────────────────────────────────────────

/**
 * Compute scene reveal progress and derived eased curves.
 *
 * @param now — current frame timestamp (ms, from performance.now())
 * @returns `{ revealed, points, camera }` — raw reveal fraction, eased
 *   points-material progress (quint), and eased camera progress (cubic).
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A4)
 */
export function computeRevealProgress(now: number): { revealed: number; points: number; camera: number } {
    const revealed = sceneRevealMod.getSceneRevealProgress(now) ?? 0
    const points = easeOutQuint(Math.min(1, Math.max(0, revealed / 0.7)))
    const camera = easeInOutCubic(Math.min(1, Math.max(0, revealed)))
    return { revealed, points, camera }
}

// ── A7 — Points material update ──────────────────────────────────────────────

/**
 * Update points material opacity, size, and shader uniforms based on
 * reveal progress and focus/semantic-dive state.
 *
 * @param pointsRevealProgress — eased reveal fraction for points (0–1)
 * @param state — subset of LegacyState for focusedNode/semanticDiveMode/trailDepth reads
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A7)
 */
export function updatePointsMaterial(
    pointsRevealProgress: number,
    state:
        | Pick<LegacyState, 'focusedNode' | 'trailDepth'> &
              { semanticDiveMode?: boolean }
        | null
        | undefined
): void {
    if (!webglContext.pointsMaterial) return
    const isFocused = Number.isFinite(state?.focusedNode)
    const isSemanticDive = state?.semanticDiveMode === true || (state?.trailDepth ?? 0) >= 2
    const pointsOpacityScale = isSemanticDive ? 0.06 : isFocused ? 0.46 : 1.0
    const pointsSizeScale = isSemanticDive ? 0.36 : isFocused ? 0.8 : 1.0
    webglContext.pointsMaterial.opacity =
        0.32 * (PORT_SCENE_ATMOSPHERE.pointOpacityScale ?? 1) * pointsRevealProgress * pointsOpacityScale
    webglContext.pointsMaterial.size =
        CONFIG.POINTS_MATERIAL_BASE_SIZE * (1.06 + pointsRevealProgress * 0.46) * pointsSizeScale
    if (webglContext.pointsMaterial.userData.shader) {
        const prefersReduced =
            typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        webglContext.pointsMaterial.userData.shader.uniforms.uRevealProgress.value = pointsRevealProgress
        if (!prefersReduced) {
            webglContext.pointsMaterial.userData.shader.uniforms.uTime.value = performance.now() * 0.001
        }
    }
}

// ── A11 — Hover emissive flash ───────────────────────────────────────────────

/**
 * Track hover transitions on the spore material, decay the emissive flash
 * intensity, and write `emissiveIntensity` to `nodeSporeMaterial`.
 *
 * Reads `state.hoverHighlightIndex` to detect hover. Mutates
 * `engineState.lastHoveredNode` and `engineState.hoverEmissiveFlash`.
 *
 * @param state — subset of LegacyState for hoverHighlightIndex reads
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A11)
 */
export function updateHoverEmissiveFlash(
    state: Partial<Pick<LegacyState, 'hoverHighlightIndex'>> | null | undefined
): void {
    const hoveredNode = state?.hoverHighlightIndex ?? -1
    const hasHover = Number.isFinite(hoveredNode) && hoveredNode >= 0
    const lastHadHover =
        engineState.lastHoveredNode !== null &&
        Number.isFinite(engineState.lastHoveredNode) &&
        engineState.lastHoveredNode >= 0
    if (hasHover !== lastHadHover || (hasHover && hoveredNode !== engineState.lastHoveredNode)) {
        engineState.hoverEmissiveFlash = 1.0
    }
    engineState.lastHoveredNode = hoveredNode
    if (engineState.hoverEmissiveFlash > 0.001 && webglContext.nodeSporeMaterial) {
        // W48-T1A: base intensity bumped from 0.34 → 0.55 to match the
        // new spore material baseline (was 0.34, raised for bioluminescent
        // identity). Without this sync, the post-flash settle would set
        // emissive back to 0.34 — dimmer than the resting state.
        const baseIntensity = 0.55
        const flashPeak = 1.8
        const targetIntensity = baseIntensity + (flashPeak - baseIntensity) * engineState.hoverEmissiveFlash
        ;(webglContext.nodeSporeMaterial as MeshPhongMaterial).emissiveIntensity = targetIntensity
        engineState.hoverEmissiveFlash *= 0.92
        if (engineState.hoverEmissiveFlash < 0.005) {
            engineState.hoverEmissiveFlash = 0
            ;(webglContext.nodeSporeMaterial as MeshPhongMaterial).emissiveIntensity = baseIntensity
        }
    }
}

// ── A12 — Mycelium visibility + pulse ────────────────────────────────────────

/**
 * Toggle mycelium group visibility via `shouldRenderThreads()` and advance
 * the pulse phase based on wind speed and reduced-motion preference.
 *
 * Reads `state.weather.wind_speed_10m`, mutates `state.pulsePhase`.
 *
 * @param state — subset of LegacyState for weather (wind_speed_10m) + pulsePhase
 * @returns `threadsVisible` — whether mycelium threads should be rendered,
 *   consumed by the thread-opacity block (A13) that remains in animate().
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A12)
 */
export function updateMyceliumPulse(
    state:
        | (Pick<LegacyState, 'pulsePhase'> & { weather?: { wind_speed_10m?: number } | null })
        | null
        | undefined
): boolean {
    const threadsVisible = shouldRenderThreads()
    if (webglContext.myceliumGroup) {
        webglContext.myceliumGroup.visible = threadsVisible
    }
    const prefersReduced =
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const basePulseSpeed = prefersReduced ? 0.0 : 0.015
    const windSpeed = state?.weather?.wind_speed_10m ?? 8.0
    const pulseIncrement = basePulseSpeed * (0.6 + windSpeed / 15.0)
    if (state) state.pulsePhase = (state.pulsePhase + pulseIncrement) % (Math.PI * 2)
    return threadsVisible
}

// ── A14 — Points shader hover boost ──────────────────────────────────────────

/**
 * Lerp the `uHoverBoost` uniform toward 1.5 when hovering and set
 * `uHoverNodePos` to the hovered node's world position.
 *
 * @param hoveredNode — index of the currently hovered node (-1 if none)
 * @param state — subset of LegacyState for nodePositions reads
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A14)
 */
export function updatePointsShaderHoverBoost(
    hoveredNode: number,
    state: Pick<LegacyState, 'nodePositions'> | null | undefined
): void {
    if (!webglContext.pointsMaterial?.userData?.shader) return
    const shader = webglContext.pointsMaterial.userData.shader
    const hasHover = Number.isFinite(hoveredNode) && hoveredNode >= 0
    const targetBoost = hasHover ? 1.5 : 1.0
    shader.uniforms.uHoverBoost.value += (targetBoost - shader.uniforms.uHoverBoost.value) * 0.2
    if (hasHover && state?.nodePositions[hoveredNode]) {
        const hoverPos = state.nodePositions[hoveredNode]
        shader.uniforms.uHoverNodePos.value.set(hoverPos.x, hoverPos.y, hoverPos.z)
    }
}
