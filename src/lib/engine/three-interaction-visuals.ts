/**
 * @lib/engine/three-interaction-visuals.ts — Three.js visuals that respond to user interaction
 *
 * Manages the dynamic Three.js objects that animate based on hover, focus,
 * and search state: focus anchor indicator, semantic lens (the ambient
 * particle field around focused nodes), and the search manifold (the
 * glowing corridor between the anchor and discovered candidates).
 *
 * Architecture (W12, refactored 2026-06):
 *   - Per-frame update driven by `updateInteractionVisuals(now, hoveredNode, focusedNode)`
 *     from the main render loop (see three-engine-core.ts animate()).
 *   - Initialization is split per-visual (`initSemanticManifold`, `initSemanticLens`)
 *     because they have different lifecycle windows (some tied to scene init,
 *     others to specific mode entries).
 *   - Disposal is split per-visual to match (`disposeInteractionVisuals`,
 *     `disposeSemanticLens`); called from three-engine-core's dispose path
 *     and on mode transitions that hide the visual.
 *
 * Public API:
 *   - initSemanticManifold()    — wire up the search corridor mesh; called once at scene init
 *   - initSemanticLens()        — wire up the focus-mode ambient lens; called once at scene init
 *   - updateInteractionVisuals() — per-frame driver; reads hovered/focused, updates transforms/colors
 *   - disposeInteractionVisuals() — tear down all visuals; called at full scene disposal
 *   - disposeSemanticLens()      — tear down only the lens; called on focus-mode exit
 *
 * Internal helpers narrow Three.js's `Material | Material[]` union at the
 * interop boundary (`asSingleMaterial`, `asShaderMaterial`, `asColorMaterial`).
 */
import {
    Material,
    Vector3,
    CircleGeometry,
    PlaneGeometry,
    LineBasicMaterial,
    MeshBasicMaterial,
    ShaderMaterial,
    DoubleSide,
    NormalBlending,
    Mesh,
    BufferGeometry,
    BufferAttribute,
    LineSegments,
    AdditiveBlending,
    Color,
    Group
} from 'three'
import type { MeshBasicMaterialParameters, LineBasicMaterialParameters } from 'three'
import { appState as _state } from '@lib/state/app.svelte'
import { disposeFocusPocketSizeMesh } from './focus-pocket-size-mesh'
const state = _state
import { disposeHeroAnimation } from './three-search-animations'
import { calculateSignalScore } from '@lib/utils/geo-data'
import {
    createFocusAnchorIndicator,
    updateFocusAnchorIndicator,
    disposeFocusAnchorIndicator
} from '@lib/journey/focus-anchor-indicator'
import { disposeObject3D } from '@lib/engine/resource-tracker'
import { SCENE_PALETTE } from '@lib/utils/design-tokens'
import { debugWarn } from '@lib/utils/debug'
import { prefersReducedMotion } from '@lib/utils/environment'
import { updateSelectedNodeMotes } from './three-lens-motes'
import { updateSelectedNodePetals } from './three-lens-petals'
import { updateSelectedNodeFilaments } from './three-lens-filaments'
import { initLensGlowSpoke } from './three-lens-glow-spoke'
import { initFocusLens } from './three-lens-focusgeo'
import { initAnchorBloomLight } from './three-lens-anchor-bloom'

// ── Three.js material narrowing helpers ───────────────────────────────────────
// All focus/mote/petal/halo objects in this codebase are constructed with a single
// Material. These helpers narrow the union type at the Three.js interop boundary.

/** Narrow a single-material object's material to a single Material instance.
 *
 * Every focus/mote/petal/halo/lens object in this codebase is constructed
 * with exactly one Material, so the `Material[]` branch of three.js's
 * `material` union never occurs at runtime. Rather than run a per-frame
 * `Array.isArray` guard (and a defensive throw) for a case that cannot
 * happen, we narrow at the interop boundary with a single assertion.
 */
function asSingleMaterial(mat: Material | Material[]): Material {
    return mat as Material
}

/** Narrow material to ShaderMaterial when possible. Returns null for non-shader materials. */
function asShaderMaterial(mat: Material | Material[]): ShaderMaterial | null {
    const m = asSingleMaterial(mat)
    return m instanceof ShaderMaterial ? m : null
}

function asColorMaterial(mat: Material | Material[]): (Material & { color: Color }) | null {
    const m = asSingleMaterial(mat)
    return 'color' in m && m.color instanceof Color ? (m as Material & { color: Color }) : null
}

function isSemanticDiveActive() {
    return state.semanticDiveMode === true || state.trailDepth === 2
}

// ── Local Types ───────────────────────────────────────────────────────────────

// ── Constants ───────────────────────────────────────────────────────────────

const FOCUS_WISP_COUNT = 18
const FOCUS_WISP_SEGMENTS = 18

// ── Focus-index cache (avoid recomputing every frame) ───────────────────────

let lastFocusIdx: number | null = null
let cachedSignalScore = 0
let cachedNeighborIndices: number[] = []

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSemanticLensNeighborIndices(focusedNode: number): number[] {
    const point = state.points?.[focusedNode]
    const leadId = point?.lead_id === null || point?.lead_id === undefined ? '' : String(point.lead_id)
    if (!leadId) return []
    const semanticNode = state.semanticNeighborMapByLeadId ? state.semanticNeighborMapByLeadId.get(leadId) : null
    if (!semanticNode?.neighbors?.length || !state.pointIndexByLeadId?.size) return []
    return semanticNode.neighbors
        .map((neighbor: { leadId: string | number | null }) => state.pointIndexByLeadId.get(String(neighbor.leadId)))
        .filter(
            (index: number | undefined): index is number =>
                Number.isFinite(index) && index !== focusedNode && Boolean(state.nodePositions?.[index as number])
        )
        .slice(0, 12)
}

/** Internal factory for additive-blended visuals.
 *
 * Wraps the repeated `MeshBasicMaterial`/`LineBasicMaterial` additive
 * boilerplate (`transparent`, `opacity: 0`, `depthWrite: false`,
 * `AdditiveBlending`) plus the initial `visible = false` / `scene.add`
 * pattern shared by the focus halo/core/hover/mote/petal/filament
 * meshes in `initSemanticLens`.
 */
function createAdditiveMesh(
    geometry: BufferGeometry,
    MaterialCtor: new (params: MeshBasicMaterialParameters) => MeshBasicMaterial,
    materialParams: MeshBasicMaterialParameters
): Mesh
function createAdditiveMesh(
    geometry: BufferGeometry,
    MaterialCtor: new (params: LineBasicMaterialParameters) => LineBasicMaterial,
    materialParams: LineBasicMaterialParameters
): LineSegments
function createAdditiveMesh(
    geometry: BufferGeometry,
    MaterialCtor: new (
        params: MeshBasicMaterialParameters | LineBasicMaterialParameters
    ) => MeshBasicMaterial | LineBasicMaterial,
    materialParams: MeshBasicMaterialParameters | LineBasicMaterialParameters
): Mesh | LineSegments {
    const material = new MaterialCtor({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        ...materialParams
    })
    const Ctor = material instanceof LineBasicMaterial ? LineSegments : Mesh
    const object = new Ctor(geometry, material)
    object.visible = false
    return object
}

// ── Public API ──────────────────────────────────────────────────────────────

export function disposeInteractionVisuals() {
    disposeSemanticLens()
    disposeFocusAnchorIndicator()
    disposeHeroAnimation()
}

export function disposeSemanticLens() {
    disposeFocusPocketSizeMesh()
    // P2 (2026-08-07): module-level focus cache survives engine re-init — a
    // same-index focus after rebuild would reuse the stale signal score /
    // neighbor list for one frame. Reset so the next focus recomputes.
    lastFocusIdx = null
    cachedSignalScore = 0
    cachedNeighborIndices = []
    if (state.anchorBloomLight) {
        state.scene?.remove(state.anchorBloomLight)
        state.anchorBloomLight.dispose?.()
        state.anchorBloomLight = null
    }
    if (state.semanticManifold) {
        state.scene?.remove(state.semanticManifold)
        disposeObject3D(state.semanticManifold)
        state.semanticManifold = null
    }
    if (state.semanticLensGroup) {
        state.scene?.remove(state.semanticLensGroup)
        disposeObject3D(state.semanticLensGroup)
        state.semanticLensGroup = null
    }
    if (state.focusLens) {
        state.scene?.remove(state.focusLens)
        disposeObject3D(state.focusLens)
        state.focusLens = null
    }
    if (state.semanticLensGlow) {
        disposeObject3D(state.semanticLensGlow)
        state.semanticLensGlow = null
    }
    if (state.semanticLensSpokes) {
        disposeObject3D(state.semanticLensSpokes)
        state.semanticLensSpokes = null
    }
    if (state.focusHalo) {
        state.scene?.remove(state.focusHalo)
        disposeObject3D(state.focusHalo)
        state.focusHalo = null
    }
    if (state.focusCore) {
        state.scene?.remove(state.focusCore)
        disposeObject3D(state.focusCore)
        state.focusCore = null
    }
    if (state.hoverHalo) {
        state.scene?.remove(state.hoverHalo)
        disposeObject3D(state.hoverHalo)
        state.hoverHalo = null
    }
    if (state.focusMoteGroup) {
        state.scene?.remove(state.focusMoteGroup)
        disposeObject3D(state.focusMoteGroup)
        state.focusMoteGroup = null
        state.focusMotes = []
    }
    if (state.focusPetalGroup) {
        state.scene?.remove(state.focusPetalGroup)
        disposeObject3D(state.focusPetalGroup)
        state.focusPetalGroup = null
        state.focusPetals = []
    }
    if (state.focusFilaments) {
        state.scene?.remove(state.focusFilaments)
        disposeObject3D(state.focusFilaments)
        state.focusFilaments = null
    }
    if (state.focusSemanticConnectionPairs) state.focusSemanticConnectionPairs.length = 0
}

export function initSemanticManifold() {
    if (!state.scene) {
        debugWarn('[three-interaction-visuals] initSemanticManifold: state.scene is null, skipping manifold init')
        return
    }
    const manifoldGeo = new CircleGeometry(4, 64)
    const manifoldMat = new ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uRippleTime: { value: -1000.0 },
            uRippleCenter: { value: new Vector3(0, 0, 0) },
            uColor: { value: new Color(SCENE_PALETTE.threadTint) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vUv = uv;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uRippleTime;
            uniform vec3 uRippleCenter;
            uniform vec3 uColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vec2 centeredUv = vUv - 0.5;
                float distToCenter = length(centeredUv) * 2.0;

                // Ripple interaction
                float d = distance(vWorldPosition, uRippleCenter);
                float rippleWave = (uRippleTime - d * 2.0);
                float rippleActive = (rippleWave > 0.0 && rippleWave < 1.0) ? (1.0 - rippleWave) : 0.0;

                float horizonFade = smoothstep(1.0, 0.0, distToCenter);
                float innerFade = smoothstep(0.08, 0.36, distToCenter);
                float breathingMist = 0.5 + sin(uTime * 0.45 + distToCenter * 7.0) * 0.5;
                float contourA = 1.0 - smoothstep(0.0, 0.016, abs(sin(distToCenter * 31.0 + uTime * 0.08)));
                float contourB = 1.0 - smoothstep(0.0, 0.012, abs(sin((vWorldPosition.x * 0.85 + vWorldPosition.z * 0.42) * 7.0)));
                float contours = contourA * 0.18 + contourB * 0.055;

                float opacity = (0.012 + contours + breathingMist * 0.005) * horizonFade * innerFade;
                vec3 finalColor = mix(vec3(0.1, 0.2, 0.2), uColor, 0.54 + breathingMist * 0.16);
                if (rippleActive > 0.0) {
                    opacity += rippleActive * 0.065;
                    finalColor = mix(finalColor, vec3(1.0, 0.88, 0.48), rippleActive);
                }

                gl_FragColor = vec4(finalColor, opacity);
            }
        `,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        blending: NormalBlending
    })
    state.semanticManifold = new Mesh(manifoldGeo, manifoldMat)
    state.semanticManifold.rotation.x = -Math.PI / 2
    state.semanticManifold.position.y = -0.8
    state.scene.add(state.semanticManifold)
}

export function initSemanticLens() {
    if (!state.scene) {
        debugWarn('[three-interaction-visuals] initSemanticLens: state.scene is null, skipping lens init')
        return
    }
    disposeSemanticLens()
    state.semanticLensGroup = new Group()
    state.semanticLensGroup.visible = false
    state.scene.add(state.semanticLensGroup)

    initLensGlowSpoke(state, state.semanticLensGroup)

    initFocusLens(state, state.scene)

    initAnchorBloomLight(state, state.scene)

    // Size + ring + pulse focus anchor indicator (see focus-anchor-indicator.js
    // for the cues chosen and the rationale).  Lives in the 3D scene — CSS
    // class treatment would not reach a Three.js mesh.
    createFocusAnchorIndicator()

    // === FOCUS HALO + CORE (soft glow + bright dot at focused node) ===
    const haloGeo = new CircleGeometry(1, 64)
    state.focusHalo = createAdditiveMesh(haloGeo, MeshBasicMaterial, {
        side: DoubleSide,
        color: 0x7ce7dd
    })
    state.scene.add(state.focusHalo)

    const coreGeo = new CircleGeometry(1, 32)
    state.focusCore = createAdditiveMesh(coreGeo, MeshBasicMaterial, {
        side: DoubleSide,
        color: 0xcffcf4
    })
    state.scene.add(state.focusCore)

    // Hover halo: follows mouse hover, distinct from focus halo
    const hoverHaloGeo = new CircleGeometry(1, 32)
    state.hoverHalo = createAdditiveMesh(hoverHaloGeo, MeshBasicMaterial, {
        color: 0x8ff8ed
    })
    state.scene.add(state.hoverHalo)

    // === FOCUS MOTES (orbital sprites around focused node) ===
    state.focusMoteGroup = new Group()
    state.focusMoteGroup.visible = false
    state.scene.add(state.focusMoteGroup)
    state.focusMotes = []
    const moteGeo = new CircleGeometry(1, 16)
    const MOTE_COUNT = 12
    for (let i = 0; i < MOTE_COUNT; i += 1) {
        const mote = createAdditiveMesh(moteGeo, MeshBasicMaterial, {
            color: SCENE_PALETTE.threadTint
        })
        mote.userData = {
            phase: (i / MOTE_COUNT) * Math.PI * 2,
            speed: 0.35 + (i % 4) * 0.06,
            radius: 0.024 + (i % 4) * 0.006,
            scale: 0.006 + (i % 3) * 0.002,
            lift: 0.008 + (i % 3) * 0.004,
            drift: 0.5 + (i % 3) * 0.1,
            tilt: 0.72
        }
        state.focusMotes.push(mote)
        state.focusMoteGroup.add(mote)
    }

    // === FOCUS PETALS (radial mesh petals around focused node) ===
    state.focusPetalGroup = new Group()
    state.focusPetalGroup.visible = false
    state.scene.add(state.focusPetalGroup)
    state.focusPetals = []
    const petalGeo = new PlaneGeometry(1, 1)
    const PETAL_COUNT = 8
    for (let i = 0; i < PETAL_COUNT; i += 1) {
        const petal = createAdditiveMesh(petalGeo, MeshBasicMaterial, {
            color: 0x7ce7dd,
            side: DoubleSide
        })
        petal.userData = {
            phase: (i / PETAL_COUNT) * Math.PI * 2,
            speed: 0.18 + (i % 3) * 0.05,
            radius: 0.02 + (i % 3) * 0.008,
            length: 0.03 + (i % 3) * 0.012,
            thickness: 0.005 + (i % 2) * 0.002,
            lift: 0.004 + (i % 3) * 0.003,
            tilt: 0.72
        }
        state.focusPetals.push(petal)
        state.focusPetalGroup.add(petal)
    }

    // === FOCUS FILAMENTS (wispy line segments around focused node) ===
    const filamentPosArray = new Float32Array(FOCUS_WISP_COUNT * (FOCUS_WISP_SEGMENTS + 1) * 2 * 3)
    const filamentGeo = new BufferGeometry()
    filamentGeo.setAttribute('position', new BufferAttribute(filamentPosArray, 3))
    state.focusFilaments = createAdditiveMesh(filamentGeo, LineBasicMaterial, {
        color: SCENE_PALETTE.threadTint
    })
    state.focusFilaments.visible = false
    state.scene.add(state.focusFilaments)
}

// ── updateInteractionVisuals helpers ────────────────────────────────────────

function updateHoverHalo(): void {
    if (state.hoverHalo) {
        asSingleMaterial(state.hoverHalo.material).opacity = 0
        state.hoverHalo.visible = false
    }
}

function updateFocusCoreVisuals(
    time: number,
    reducedMotion: boolean,
    focusedNode: number | null,
    isFocused: boolean
): void {
    if (state.focusCore) {
        // Narrow the nullable focusedNode once at the top. `hasFocus` is
        // derived from this narrowed value so subsequent uses can rely on
        // `focusIdx !== null` for index access.
        const focusIdx: number | null = focusedNode !== null && focusedNode >= 0 ? focusedNode : null
        const hasFocus = focusIdx !== null
        const isInside = isSemanticDiveActive()
        const isActive = hasFocus && isFocused
        const auraTargetOpacity = hasFocus ? (isInside ? 0.065 : 0.135) : 0.0
        const coreTargetOpacity = hasFocus ? (isInside ? 0.26 : 0.74) : 0.0
        const baseScale = isActive ? (isInside ? 0.021 : 0.036) : isInside ? 0.021 : 0.032

        if (state.focusHalo) {
            const haloMat = asColorMaterial(state.focusHalo.material)
            haloMat?.color.setHex(isActive ? 0x8ff8ed : 0x7ce7dd)
            const haloOpacityMat = asSingleMaterial(state.focusHalo.material)
            haloOpacityMat.opacity += (auraTargetOpacity - haloOpacityMat.opacity) * 0.1
            state.focusHalo.visible = haloOpacityMat.opacity > 0.01
        }

        const coreColorMat = asColorMaterial(state.focusCore.material)
        if (isActive) {
            coreColorMat?.color.setHex(0xeafffb)
            const corePulse = reducedMotion ? 1.0 : 1.0 + Math.sin(time * 1.2) * 0.09
            state.focusCore.scale.set(baseScale * corePulse, baseScale * corePulse, 1)
        } else if (hasFocus) {
            coreColorMat?.color.setHex(0xcffcf4)
            const corePulse = reducedMotion
                ? 1.0
                : isInside
                  ? 1.0 + Math.sin(time * 1.25) * 0.09
                  : 1.0 + Math.sin(time * 2.4) * 0.045
            state.focusCore.scale.set(baseScale * corePulse, baseScale * corePulse, 1)
        }

        const coreMat = asSingleMaterial(state.focusCore.material)
        coreMat.opacity += (coreTargetOpacity - coreMat.opacity) * 0.15
        state.focusCore.visible = coreMat.opacity > 0.01

        if (focusIdx !== null && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx]
            const worldPos = new Vector3(pos.x, pos.y, pos.z)
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos)

            if (state.focusHalo) {
                const auraPulse = reducedMotion
                    ? 1.0
                    : 1.0 + Math.sin(time * 0.82) * 0.09 + Math.sin(time * 0.31 + 1.4) * 0.035
                state.focusHalo.position.copy(worldPos)
                const auraScale = isInside ? 0.06 : 0.085
                state.focusHalo.scale.set(auraScale * auraPulse, auraScale * auraPulse, 1)
                if (state.camera) state.focusHalo.lookAt(state.camera.position)
            }
            state.focusCore.position.copy(worldPos)
            if (state.camera) state.focusCore.lookAt(state.camera.position)
            updateSelectedNodeMotes(worldPos, time, isInside)
            updateSelectedNodePetals(worldPos, time, isInside)
            updateSelectedNodeFilaments(worldPos, time, isInside)
        } else {
            updateSelectedNodeMotes(null, time, false)
            updateSelectedNodePetals(null, time, false)
            updateSelectedNodeFilaments(null, time, false)
        }
    } else {
        updateSelectedNodeMotes(null, time, false)
        updateSelectedNodePetals(null, time, false)
        updateSelectedNodeFilaments(null, time, false)
    }
}

function updateSemanticLensVisuals(time: number, focusedNode: number | null): void {
    if (state.semanticLensGroup && state.semanticLensGlow && state.semanticLensSpokes) {
        const focusIdx: number | null = focusedNode !== null && focusedNode >= 0 ? focusedNode : null
        const focusPos = focusIdx !== null ? state.nodePositions?.[focusIdx] : undefined
        const hasFocus = Boolean(focusPos)
        const isInside = isSemanticDiveActive()

        if (focusIdx !== lastFocusIdx) {
            cachedSignalScore =
                focusIdx !== null && typeof calculateSignalScore === 'function'
                    ? calculateSignalScore(state.points?.[focusIdx])
                    : 0
            cachedNeighborIndices = focusIdx !== null ? (getSemanticLensNeighborIndices(focusIdx) ?? []) : []
            lastFocusIdx = focusIdx
        }

        const group = state.semanticLensGroup
        const glowMat = state.semanticLensGlow.material ? asShaderMaterial(state.semanticLensGlow.material) : null
        const glowUniforms = glowMat?.uniforms
        const spokes = state.semanticLensSpokes
        const opacityUniform = glowUniforms?.uOpacity

        if (!hasFocus || !focusPos || !glowUniforms || !opacityUniform) {
            if (opacityUniform) opacityUniform.value += (0 - opacityUniform.value) * 0.12
            group.visible = Boolean(opacityUniform?.value > 0.01)
            spokes.visible = false
        } else {
            const worldPos = new Vector3(focusPos.x, focusPos.y, focusPos.z)
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos)
            group.position.copy(worldPos)
            group.visible = true
            if (!isInside) {
                spokes.visible = false
            }
            const targetOpacity = isInside ? 0.2 : 0.11
            opacityUniform.value += (targetOpacity - opacityUniform.value) * 0.12

            if (glowUniforms.uSignalScore) {
                glowUniforms.uSignalScore.value += (cachedSignalScore - glowUniforms.uSignalScore.value) * 0.12
            }

            const positionAttr = spokes.geometry.attributes.position
            const alphaAttr = spokes.geometry.attributes.alpha
            if (!positionAttr || !alphaAttr) {
                spokes.visible = false
            } else {
                const positions = positionAttr.array
                const alphas = alphaAttr.array
                positions.fill(0)
                alphas.fill(0)

                if (isInside && focusIdx !== null) {
                    const maxSpokeLength = 0.12
                    let positionOffset = 0
                    let alphaOffset = 0
                    cachedNeighborIndices.forEach((neighborIndex: number) => {
                        const neighborPos = state.nodePositions[neighborIndex]
                        if (!neighborPos) return
                        const neighborWorld = new Vector3(neighborPos.x, neighborPos.y, neighborPos.z)
                        if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(neighborWorld)
                        neighborWorld.sub(worldPos)
                        const distance = neighborWorld.length()
                        if (distance <= 0.0001) return
                        neighborWorld.normalize().multiplyScalar(Math.min(distance, maxSpokeLength))
                        positions[positionOffset++] = 0
                        positions[positionOffset++] = 0
                        positions[positionOffset++] = 0
                        positions[positionOffset++] = neighborWorld.x
                        positions[positionOffset++] = neighborWorld.y
                        positions[positionOffset++] = neighborWorld.z
                        alphas[alphaOffset++] = 0.025
                        alphas[alphaOffset++] = 0.18
                    })
                    spokes.visible = positionOffset > 0
                }
                positionAttr.needsUpdate = true
                alphaAttr.needsUpdate = true
            }
        }
    }
}

function updateFocusLensVisuals(time: number, reducedMotion: boolean, focusedNode: number | null): void {
    if (state.focusLens) {
        const focusIdx: number | null = focusedNode !== null && focusedNode >= 0 ? focusedNode : null
        const hasFocus = focusIdx !== null
        const isDiving = hasFocus && state.semanticDiveMode

        const targetOpacity = hasFocus ? (isDiving ? 0.36 : 0.24) : 0.0
        const lerpSpeed = isDiving ? 0.15 : 0.09

        const lensMat = asShaderMaterial(state.focusLens.material)
        const lensUniforms = lensMat?.uniforms
        const opacityUniform = lensUniforms?.opacity
        const timeUniform = lensUniforms?.time
        const colorUniform = lensUniforms?.color
        if (opacityUniform && timeUniform && colorUniform) {
            opacityUniform.value += (targetOpacity - opacityUniform.value) * lerpSpeed
            timeUniform.value = reducedMotion ? 0 : time
            colorUniform.value.setHex(isDiving ? 0xd8fff8 : 0x9fffee)
        }
        state.focusLens.visible = (opacityUniform?.value ?? 0) > 0.01

        if (state.focusLens.visible && focusIdx !== null && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx]
            const worldPos = new Vector3(pos.x, pos.y, pos.z)
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos)
            state.focusLens.position.copy(worldPos)

            const rotationSpeed = isDiving ? 0.02 : 0.008
            const pulseFreq = isDiving ? 1.35 : 0.82
            const pulseAmp = isDiving ? 0.17 : 0.09
            const baseScale = isDiving ? 1.55 : 1.28
            const pulse = reducedMotion
                ? baseScale
                : baseScale + Math.sin(time * pulseFreq) * pulseAmp + Math.sin(time * 0.37 + 1.7) * 0.04

            if (!reducedMotion) {
                state.focusLens.rotation.y += rotationSpeed
                state.focusLens.rotation.z += rotationSpeed * 0.5
            }
            state.focusLens.scale.set(pulse, pulse, pulse)
        }
    }
}

function updateAnchorBloomLight(focusedNode: number | null): void {
    // 4. Step Inside anchor bloom light
    if (state.anchorBloomLight) {
        const focusIdx: number | null = focusedNode !== null && focusedNode >= 0 ? focusedNode : null
        const hasFocus = focusIdx !== null
        const isInside = isSemanticDiveActive()
        const targetIntensity = hasFocus ? (isInside ? 0.14 : 0.24) : 0.0
        state.anchorBloomLight.intensity += (targetIntensity - state.anchorBloomLight.intensity) * 0.08
        if (focusIdx !== null && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx]
            state.anchorBloomLight.position.set(pos.x, pos.y, pos.z)
            if (state.pointsMesh) state.anchorBloomLight.position.applyMatrix4(state.pointsMesh.matrixWorld)
        }
        state.anchorBloomLight.visible = state.anchorBloomLight.intensity > 0.01
    }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export function updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number | null): void {
    if (!state.pointsMesh) return
    const reducedMotion = prefersReducedMotion()
    const time = reducedMotion ? 0 : now / 1000

    const activeNode =
        focusedNode !== null && Number.isFinite(focusedNode) && focusedNode >= 0
            ? focusedNode
            : Number.isFinite(hoveredNode) && hoveredNode >= 0
              ? hoveredNode
              : null
    const isFocused = activeNode === focusedNode

    updateHoverHalo()
    updateFocusCoreVisuals(time, reducedMotion, focusedNode, isFocused)
    updateSemanticLensVisuals(time, focusedNode)
    updateFocusLensVisuals(time, reducedMotion, focusedNode)
    updateAnchorBloomLight(focusedNode)

    // 5. Focus anchor indicator (size + ring + pulse).  Honors
    //    prefers-reduced-motion inside the module — the pulse is dropped
    //    and the ring + size alone carry the cue for reduced-motion users.
    updateFocusAnchorIndicator(now, focusedNode)
}

// ── Micro-demo Visual Bridge (retired 2026-08-07 W52) ─────────────────────
// three-micro-demo-bridge.ts was deleted: initMicroDemoBridge() was a no-op and
// never wired (the 10-phase DemoChoreography.svelte store owns the micro-demo),
// so disposeMicroDemoBridge() removed listeners nobody registered. dead code — the
// micro-demo events fired by demo-choreography.ts have no bridge listeners.
