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
import type { AppState } from '@lib/state/app.svelte'
import type { MeshPhongMaterial, Material } from 'three'
import { FogExp2 } from 'three'
import type { NodePosition } from '@lib/state/state-types'
import { engineState } from './three-engine-state'
import { webglContext } from '@lib/engine/webgl-context'
import { CONFIG } from '@lib/engine/config'
import {
    SCENE_ATMOSPHERE as PORT_SCENE_ATMOSPHERE,
    setNodeSporeInstanceMatrix as setNodeSporeInstanceMatrixPort,
    SPORE_EMISSIVE_INTENSITY_BASE,
    SPORE_EMISSIVE_FLASH_PEAK
} from '@lib/engine/node-manager'
import {
    shouldRenderThreads,
    markNodesDirty,
    getThreadPulseOpacity as getThreadPulseOpacityPort,
    getMyceliumPresentationProfile as getMyceliumPresentationProfilePort
} from '@lib/engine/thread-manager'
import { easeOutQuint, easeInOutCubic } from '@lib/utils/math-easing'
import * as sceneRevealMod from './scene-reveal'

// ── F1 Fix: Points-layer pocket gather ──────────────────────────────────────

/**
 * Push lerp'd node positions into the Points geometry so the dominant
 * points-instanced-field layer gathers with the spore layer during focus.
 *
 * Called once per frame from `lerpNodesForFrame` after `nodePositions`
 * has been updated; writes only the moved indices and batches a single
 * `needsUpdate` flag.
 */
function syncPointsGeometryPositions(movedIndices: readonly number[]): void {
    const pointsMesh = webglContext.pointsMesh
    if (!pointsMesh) return
    const attr = pointsMesh.geometry.attributes.position
    if (!attr) return
    const arr = attr.array as Float32Array
    if (!arr) return
    // nodePositions rides the runtime state object (LegacyState index-signature
    // member); assert the structural shape like camera-choreography/routes.ts does.
    const nodePositions = engineState.state?.nodePositions as NodePosition[] | undefined
    if (!nodePositions) return
    for (const i of movedIndices) {
        const pos = nodePositions[i]
        if (!pos) continue
        arr[i * 3] = pos.x
        arr[i * 3 + 1] = pos.y
        arr[i * 3 + 2] = pos.z
    }
    attr.needsUpdate = true
}

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
    state: (Pick<AppState, 'focusedNode' | 'trailDepth'> & { semanticDiveMode?: boolean }) | null | undefined
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
        // W54: base / peak are now exported from node-manager so the flash
        // settles back to the spore material's resting emissive intensity.
        const baseIntensity = SPORE_EMISSIVE_INTENSITY_BASE
        const flashPeak = SPORE_EMISSIVE_FLASH_PEAK
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
export function updateMyceliumPulse(state: Pick<AppState, 'pulsePhase' | 'weather'> | null | undefined): boolean {
    const threadsVisible = shouldRenderThreads()
    if (webglContext.myceliumGroup) {
        webglContext.myceliumGroup.visible = threadsVisible
    }
    const prefersReduced =
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const basePulseSpeed = prefersReduced ? 0.0 : 0.015
    const windSpeed = state?.weather?.windSpeed ?? 8.0
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

// ── A5 — Node position lerp + focus-pocket breathing ────────────────────────

/**
 * Lerp per-node positions toward their targets each frame (A5), then apply
 * focus-pocket breathing and mark the GPU buffers dirty when anything moved.
 *
 * Divergence from the file's read-only-state pattern: A5 mutates `state`
 * (nodePositions, myceliumDirty) and must observe a *live* read of
 * `engineState.state` so the defensive bail below still catches teardowns
 * that null the singleton mid-frame (matching the pre-extraction in-line
 * block). The pure read-only frame updates (A4/A7/A11/A12/A14) thread state
 * through an explicit parameter instead.
 *
 * @param now — current frame timestamp (ms, from performance.now()); passed
 *   through to `focusPocket.applyFocusPocketBreathing`.
 * @returns `true` if `animate()` should abort this frame (state was torn down
 *   mid-lerp — defensive guard preserved verbatim from pre-extraction L425);
 *   `false` to continue.
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A5)
 */
export function lerpNodesForFrame(now: number): boolean {
    const state = engineState.state
    if (!state?.nodePositions || !state?.targetPositions) return false
    let anyNodeMoved = false
    const movedIndices: number[] = []
    const lerpFactor = state.focusState?.nodesAreSettling ? 0.14 : 0.08
    state.nodePositions.forEach((pos: NodePosition, i: number) => {
        const target = state.targetPositions[i]
        if (!target) return
        const dx = target.x - pos.x
        const dy = target.y - pos.y
        const dz = target.z - pos.z
        if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001 || Math.abs(dz) > 0.0001) {
            pos.x += dx * lerpFactor
            pos.y += dy * lerpFactor
            pos.z += dz * lerpFactor
            setNodeSporeInstanceMatrixPort(i)
            anyNodeMoved = true
            movedIndices.push(i)
        }
    })

    // Defensive: preserve the original `if (!engineState.state) return` bail
    // from animate() (pre-extraction L425). Reading the singleton live (not
    // the captured `state`) so a mid-frame teardown is observable.
    if (!engineState.state) return true

    if (engineState.focusPocket?.applyFocusPocketBreathing(now, engineState.state.nodePositions)) {
        // Focus pocket breathing mutates nodePositions. Make sure the GPU
        // instance matrices for every breathing node are refreshed this frame.
        const pocketMotionByIndex =
            engineState.state?.focusState.pocketMotionByIndex ?? engineState.focusPocket?.getFocusPocketMotionByIndex()
        const pocketMotionIndices = pocketMotionByIndex ? Array.from(pocketMotionByIndex.keys()) : undefined
        pocketMotionIndices?.forEach((idx: number) => {
            setNodeSporeInstanceMatrixPort(idx)
            movedIndices.push(idx)
        })
        anyNodeMoved = true
    }

    if (anyNodeMoved) {
        // Feed the dirty-node set BEFORE myceliumDirty flips so that
        // updateMyceliumThreads() can filter pairs on the next call.
        markNodesDirty(movedIndices)
        if (webglContext.nodeSporeMesh) webglContext.nodeSporeMesh.instanceMatrix.needsUpdate = true
        if (engineState.state) engineState.state.myceliumDirty = true
        // F1 Fix: push lerp'd positions into the Points geometry so the
        // dominant points-instanced-field layer gathers with the spore layer.
        syncPointsGeometryPositions(movedIndices)
    }
    return false
}

// ── A6 — Camera reveal lerp ────────────────────────────────────────────────

/**
 * Lerp the camera from its scene-reveal start position to its end
 * position over the eased camera progress. When the reveal completes
 * (revealProgress >= 1), clear the reveal state and schedule the
 * auto-rotate soft resume.
 *
 * @param cameraRevealProgress — eased camera progress fraction (0–1), from computeRevealProgress().camera
 * @param revealProgress — raw scene reveal fraction (0–1), from computeRevealProgress().revealed
 * @param state — the full LegacyState (or null), used inside withStateMutation to clear reveal flags
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A6)
 */
export function lerpCameraForReveal(
    cameraRevealProgress: number,
    revealProgress: number,
    state: AppState | null | undefined
): void {
    if (
        engineState.state?.sceneRevealActive &&
        engineState.state?.sceneRevealCameraStart &&
        engineState.state?.sceneRevealCameraEnd &&
        engineState.state?.focusedNode === null &&
        webglContext.camera
    ) {
        webglContext.camera.position.lerpVectors(
            engineState.state.sceneRevealCameraStart,
            engineState.state.sceneRevealCameraEnd,
            cameraRevealProgress
        )
        if (webglContext.controls) {
            webglContext.controls.target.set(0, 0, 0)
        }
        if (revealProgress >= 1) {
            engineState.withStateMutation?.(() => {
                if (!state) return
                state.sceneRevealActive = false
                state.sceneRevealCameraStart = null
                state.sceneRevealCameraEnd = null
            })
            sceneRevealMod.setSceneRevealDataset(false)
            engineState.cameraControls?.scheduleAutoRotateResume(1200)
        }
    }
}

// ── A8 — Fog density adjustment ──────────────────────────────────────────────

/**
 * Scale scene fog density by the eased reveal progress so the fog
 * fades in during the entry animation.
 *
 * @param pointsRevealProgress — eased reveal fraction for points (0–1)
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A8)
 */
export function updateFogDensity(pointsRevealProgress: number): void {
    if (webglContext.scene?.fog && 'density' in webglContext.scene.fog) {
        ;(webglContext.scene.fog as FogExp2).density = (PORT_SCENE_ATMOSPHERE.fogDensity ?? 0.62) * pointsRevealProgress
    }
}

// ── A9 — Reference sphere wireframe opacity boost ────────────────────────────

/**
 * Peak the reference sphere wireframe opacity mid-reveal so the first 2s
 * of entry gives users a clear "structured network" cue, then settle back
 * to the steady-state 0.03 opacity. Sin curve: 0 → 0.05 → 0.
 *
 * @param revealProgress — raw reveal fraction (0–1, not eased)
 * @param sceneRevealActive — whether the scene reveal animation is running
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A9)
 */
export function updateReferenceSphereOpacity(revealProgress: number, sceneRevealActive: boolean | undefined): void {
    if (!webglContext.scene) return
    const refSphere = webglContext.scene.getObjectByName('county-depth-reference') as
        | (import('three').Mesh & { material: import('three').MeshBasicMaterial })
        | undefined
    if (refSphere?.material) {
        const baseRefOpacity = 0.03
        const revealBoost = sceneRevealActive ? Math.sin(revealProgress * Math.PI) * 0.05 : 0
        refSphere.material.opacity = baseRefOpacity + revealBoost
    }
}

// ── A10 — Spore material opacity lerp ────────────────────────────────────────

/**
 * Lerp node-spore material opacity toward a reveal- and focus-scaled target
 * each frame for a smooth fade-in.
 *
 * @param pointsRevealProgress — eased reveal fraction for points (0–1)
 * @param state — subset of LegacyState for semanticDiveMode/trailDepth reads
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A10)
 */
export function updateSporeOpacity(
    pointsRevealProgress: number,
    state: (Pick<LegacyState, 'trailDepth'> & { semanticDiveMode?: boolean }) | null | undefined
): void {
    if (webglContext.nodeSporeMaterial) {
        const isSemanticDive = state?.semanticDiveMode === true || (state?.trailDepth ?? 0) >= 2
        const focusBoost = isSemanticDive ? 0.22 : 1.0
        const targetSporeOpacity = (PORT_SCENE_ATMOSPHERE.sporeOpacity ?? 0.5) * pointsRevealProgress * focusBoost
        webglContext.nodeSporeMaterial.opacity += (targetSporeOpacity - webglContext.nodeSporeMaterial.opacity) * 0.12
    }
}

// ── A13 — Thread per-layer opacity ─────────────────────────────────────────

/**
 * Compute per-layer opacity for core/wispy/bridge mycelium lines based on
 * the pulse phase, graph profile, thread reveal progress, and semantic-dive
 * scale factor.
 *
 * When threads are not visible, all three layer opacities are zeroed.
 *
 * @param threadsVisible — whether mycelium threads should render (from A12)
 * @param pointsRevealProgress — eased points-material reveal fraction (0–1),
 *   used to compute threadRevealProgress (threads fade in after points)
 * @param state — subset of LegacyState for pulsePhase/semanticDiveMode/trailDepth reads
 *   Plan reference: docs/three-engine-decomposition-plan.md §4 (A13)
 */
export function updateThreadLayerOpacities(
    threadsVisible: boolean,
    pointsRevealProgress: number,
    state:
        | (Pick<LegacyState, 'pulsePhase'> & {
              semanticDiveMode?: boolean
              trailDepth?: number
          })
        | null
        | undefined
): void {
    const threadRevealProgress = easeOutQuint(Math.min(1.0, Math.max(0.0, (pointsRevealProgress - 0.25) / 0.5)))
    const graphProfile = getMyceliumPresentationProfilePort() as ReturnType<typeof getMyceliumPresentationProfilePort>
    const semanticDiveThreadScale = state?.semanticDiveMode === true || (state?.trailDepth ?? 0) >= 2 ? 0.42 : 1
    if (threadsVisible) {
        if (webglContext.myceliumCoreLines)
            (webglContext.myceliumCoreLines.material as Material).opacity =
                (getThreadPulseOpacityPort(
                    graphProfile.core,
                    Math.sin(state?.pulsePhase ?? 0),
                    graphProfile.pulse,
                    threadRevealProgress
                ) ?? 0) * semanticDiveThreadScale
        if (webglContext.myceliumWispyLines)
            (webglContext.myceliumWispyLines.material as Material).opacity =
                (getThreadPulseOpacityPort(
                    graphProfile.wispy,
                    Math.sin((state?.pulsePhase ?? 0) * 0.7),
                    graphProfile.pulse * 0.36,
                    threadRevealProgress
                ) ?? 0) * semanticDiveThreadScale
        if (webglContext.myceliumBridgeLines)
            (webglContext.myceliumBridgeLines.material as Material).opacity =
                (getThreadPulseOpacityPort(
                    graphProfile.bridge,
                    Math.sin((state?.pulsePhase ?? 0) * 0.45),
                    graphProfile.pulse * 0.28,
                    threadRevealProgress
                ) ?? 0) * semanticDiveThreadScale
    } else {
        if (webglContext.myceliumCoreLines) (webglContext.myceliumCoreLines.material as Material).opacity = 0
        if (webglContext.myceliumWispyLines) (webglContext.myceliumWispyLines.material as Material).opacity = 0
        if (webglContext.myceliumBridgeLines) (webglContext.myceliumBridgeLines.material as Material).opacity = 0
    }
}
