/**
 * @lib/engine/three-search-animations.ts — Search-results Three.js animations
 *
 * Three coordinated animations that fire during/after a search:
 *
 *   1. Hero moment (`triggerSearchHeroMoment`) — a brief bloom at the
 *      anchor node when search results land; synchronized with audio via
 *      `audio-scape.triggerCorridorBloom`.
 *   2. Per-node corridor glow (`triggerCorridorNodeGlow` + update) — each
 *      discovered candidate node receives a soft persistent glow as the
 *      corridor animates. Uses seeded-random for deterministic per-node
 *      stagger.
 *   3. Path corridor animation (`triggerSearchCorridorAnimation` + update) —
 *      a 2.8s soft-draw of the connecting lines between anchor and route.
 *
 * The anchor retains a residual glow for `ANCHOR_GLOW_PERSIST_MS` (4.2s)
 * after the hero bloom peaks — visual continuity between the search
 * landing and the user exploring results.
 *
 * Per-frame updates are driven by `updateCorridorNodeGlow` /
 * `updateSearchCorridorAnimation` (called from three-engine-core's animate()).
 *
 * Constants are tuned for the W46 visual identity; do not adjust without
 * re-running `npm run qa:surface:mobile-idle` and the focus-pocket-state
 * contract tests.
 */
import { webglContext } from '@lib/engine/webgl-context'
import {
    Vector3,
    InstancedBufferAttribute,
    BufferGeometry,
    BufferAttribute,
    ShaderMaterial,
    AdditiveBlending,
    Points,
    LineSegments,
    Group
} from 'three'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { disposeObject3D } from '@lib/engine/resource-tracker'
import { triggerCorridorBloom } from '@lib/audio/audio-scape'
import { seededUnit } from '@lib/utils/seeded-random'
import { prefersReducedMotion } from '@lib/utils/environment'

// ── Constants ───────────────────────────────────────────────────────────────

const CORRIDOR_NODE_BOOST = 1.18
const CORRIDOR_NODE_REDUCED_BOOST = 1.06
const CORRIDOR_NODE_FADE_DELAY = 480
const CORRIDOR_NODE_FADE_DURATION = 900
const CORRIDOR_NODE_REDUCED_FADE_DELAY = 0
const CORRIDOR_NODE_REDUCED_FADE_DURATION = 260

const CORRIDOR_SOFT_DRAW_DURATION = 950
const CORRIDOR_SOFT_TOTAL_DURATION = 2800

// Persistent anchor glow: after the hero bloom peaks, the anchor node
// retains a subtle residual glow for visual continuity.
const ANCHOR_GLOW_PERSIST_MS = 4200
const ANCHOR_GLOW_PERSIST_INTENSITY = 0.28

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Per-node glow state, populated by triggerCorridorNodeGlow and consumed
 * by updateCorridorNodeGlow. May be `null` while a node's glow is
 * dormant; the key is kept in the record so iteration order is stable.
 */
export interface CorridorGlowState {
    startedAt: number
    fadeStartDelay: number
    fadeDuration: number
    targetBoost: number
}

/**
 * Per-animation state, populated by triggerSearchCorridorAnimation and
 * consumed by updateSearchCorridorAnimation. `null` when no animation
 * is in flight. `line` and `material` are required; `particles` is
 * optional because the helper can return null when no targets remain.
 */
export interface CorridorAnimState {
    anchorIndex: number
    routeIndices: number[]
    line: LineSegments
    particles: Points | null
    material: ShaderMaterial
    done: boolean
}

// ── Private State ───────────────────────────────────────────────────────────

let _corridorGlowToken = 0
const _corridorGlowNodes: Record<number, CorridorGlowState | null> = {}
const _corridorGlowTimers = new Set<ReturnType<typeof setTimeout>>()

let _corridorAnimState: CorridorAnimState | null = null
let _corridorAnimStartTime: number | null = null
let _heroRafId = 0

// Persistent anchor glow state: tracks the anchor node and remaining
// lifetime so updateCorridorNodeGlow can sustain a residual glow after
// the hero bloom peaks.
let _anchorGlowIndex = -1
let _anchorGlowRemaining = 0
let _anchorGlowLastFrame: number | null = null

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a bezier-approximated corridor path from anchor to a target point.
 * Returns an array of Vector3 positions along the curve.
 */
function getCorridorPathPoints(
    anchorPos: { x: number; y: number; z: number },
    targetPos: { x: number; y: number; z: number },
    segments = 20
): Vector3[] {
    const points: Vector3[] = []
    for (let i = 0; i <= segments; i++) {
        const t = i / segments
        // Slight arch upward in Y for the corridor feel
        const x = anchorPos.x + (targetPos.x - anchorPos.x) * t
        const y = anchorPos.y + (targetPos.y - anchorPos.y) * t + Math.sin(t * Math.PI) * 0.04
        const z = anchorPos.z + (targetPos.z - anchorPos.z) * t
        points.push(new Vector3(x, y, z))
    }
    return points
}

/**
 * Builds corridor line geometry using LineGeometry for thick strands.
 * Each segment carries a progress value used by the shader to clip un-drawn parts.
 */
function buildCorridorLineGeometry(anchorIndex: number, routeIndices: number[]) {
    const anchorPos = state.nodePositions[anchorIndex]
    if (!anchorPos) return null

    const targetIndices = (routeIndices || [])
        .filter((i: number) => Number.isFinite(i) && i !== anchorIndex)
        .slice(0, 12)

    if (targetIndices.length === 0) return null

    const SEGMENTS = 24
    const positions: number[] = []
    const colors: number[] = []

    targetIndices.forEach((targetIdx: number) => {
        const targetPos = state.nodePositions[targetIdx]
        if (!targetPos) return
        const pathPoints = getCorridorPathPoints(anchorPos, targetPos, SEGMENTS)

        // Build continuous path for LineGeometry
        for (let s = 0; s <= SEGMENTS; s++) {
            const p = pathPoints[s]
            if (!p) continue
            const t = s / SEGMENTS
            positions.push(p.x, p.y, p.z)
            colors.push(0.42 + (0.74 - 0.42) * t, 0.92 + (0.86 - 0.92) * t, 0.88 + (0.68 - 0.88) * t)
        }
    })

    const geometry = new LineGeometry()
    geometry.setPositions(positions)
    geometry.setColors(colors)

    const segmentCount = targetIndices.length * (SEGMENTS + 1)
    const progressArr = new Float32Array(segmentCount)
    for (let i = 0; i < targetIndices.length; i++) {
        for (let s = 0; s <= SEGMENTS; s++) {
            progressArr[i * (SEGMENTS + 1) + s] = s / SEGMENTS
        }
    }
    geometry.setAttribute('progress', new InstancedBufferAttribute(progressArr, 1))

    return geometry
}

/**
 * Builds the particle trail geometry — sparse particles that flow along each corridor path.
 */
function buildCorridorParticleTrail(anchorIndex: number, routeIndices: number[]) {
    const anchorPos = state.nodePositions[anchorIndex]
    if (!anchorPos) return null

    const targetIndices = (routeIndices || [])
        .filter((i: number) => Number.isFinite(i) && i !== anchorIndex)
        .slice(0, 12)

    if (targetIndices.length === 0) return null

    const PARTICLE_COUNT = 36
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const progressValues = new Float32Array(PARTICLE_COUNT)
    const lifetimes = new Float32Array(PARTICLE_COUNT)
    const segmentOffsets = new Float32Array(PARTICLE_COUNT)
    const speeds = new Float32Array(PARTICLE_COUNT)

    let pIdx = 0
    targetIndices.forEach((targetIdx: number) => {
        const targetPos = state.nodePositions[targetIdx]
        if (!targetPos) return
        const pathPoints = getCorridorPathPoints(anchorPos, targetPos, 24)
        const particlesForPath = Math.floor(PARTICLE_COUNT / Math.max(targetIndices.length, 1))

        for (let p = 0; p < particlesForPath && pIdx < PARTICLE_COUNT; p++, pIdx++) {
            const baseProgress = p / particlesForPath
            const offset = (seededUnit(pIdx, 0x5eed) - 0.5) * 0.08
            const segIdx = Math.min(Math.floor(baseProgress * (pathPoints.length - 1)), pathPoints.length - 1)
            const pt = pathPoints[segIdx]
            if (!pt) continue

            positions[pIdx * 3] = pt.x + offset
            positions[pIdx * 3 + 1] = pt.y + offset * 0.5
            positions[pIdx * 3 + 2] = pt.z + offset

            progressValues[pIdx] = baseProgress
            lifetimes[pIdx] = 0.5 + seededUnit(pIdx, 0xbeef) * 0.5
            segmentOffsets[pIdx] = offset
            speeds[pIdx] = 0.3 + seededUnit(pIdx, 0xcafe) * 0.7
        }
    })

    for (let i = pIdx; i < PARTICLE_COUNT; i++) {
        positions[i * 3] = 0
        positions[i * 3 + 1] = -9999
        positions[i * 3 + 2] = 0
        progressValues[i] = 1.0
        lifetimes[i] = 0
        segmentOffsets[i] = 0
        speeds[i] = 1.0
    }

    const particleGeometry = new BufferGeometry()
    particleGeometry.setAttribute('position', new BufferAttribute(positions, 3))
    particleGeometry.setAttribute('aProgress', new BufferAttribute(progressValues, 1))
    particleGeometry.setAttribute('aLifetime', new BufferAttribute(lifetimes, 1))
    particleGeometry.setAttribute('aOffset', new BufferAttribute(segmentOffsets, 1))
    particleGeometry.setAttribute('aSpeed', new BufferAttribute(speeds, 1))

    const particleMaterial = new ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uDrawProgress: { value: 0 },
            uFadeOpacity: { value: 1.0 }
        },
        vertexShader: `
            attribute float aProgress;
            attribute float aLifetime;
            attribute float aOffset;
            attribute float aSpeed;
            uniform float uTime;
            uniform float uDrawProgress;
            uniform float uFadeOpacity;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                float particleT = clamp((uDrawProgress - aProgress * 0.5) / max(aLifetime, 0.001), 0.0, 1.0);
                vProgress = particleT;
                vAlpha = smoothstep(0.0, 0.15, particleT) * smoothstep(1.0, 0.7, particleT);

                vec3 pos = position;
                pos.x += sin(uTime * 3.0 + aOffset * 20.0) * 0.006;
                pos.y += cos(uTime * 2.5 + aOffset * 15.0) * 0.004;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = clamp((1.4 + aSpeed * 0.9) * (300.0 / -mvPosition.z), 1.0, 64.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vAlpha;
            varying float vProgress;
            uniform float uFadeOpacity;

            void main() {
                vec2 gl_PointCoord_centered = gl_PointCoord - 0.5;
                float dist = length(gl_PointCoord_centered);
                if (dist > 0.5) discard;
                float alpha = (1.0 - dist * 2.0) * vAlpha * 0.34 * uFadeOpacity;
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 ember = vec3(0.74, 0.86, 0.68);
                vec3 color = mix(teal, ember, vProgress);
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
    })

    const particles = new Points(particleGeometry, particleMaterial)
    particles.frustumCulled = false
    return particles
}

// ── Public API ──────────────────────────────────────────────────────────────

export function triggerSearchHeroMoment(anchorIndex: number) {
    if (!webglContext.pointsMaterial || !webglContext.pointsMaterial.userData.shader || !state.nodePositions) return
    const shader = webglContext.pointsMaterial.userData.shader

    cancelAnimationFrame(_heroRafId)
    _heroRafId = 0

    // Arm persistent anchor glow so the anchor node stays visually distinct
    // after the bloom peaks.
    _anchorGlowIndex = Number.isFinite(anchorIndex) ? anchorIndex : -1
    _anchorGlowRemaining = ANCHOR_GLOW_PERSIST_MS

    if (Number.isFinite(anchorIndex) && state.nodePositions[anchorIndex]) {
        const pos = state.nodePositions[anchorIndex]
        shader.uniforms.uRippleCenter.value.set(pos.x, pos.y, pos.z)
    } else {
        shader.uniforms.uRippleCenter.value.set(0, 0, 0)
    }

    shader.uniforms.uRippleTime.value = 0.0

    const duration = 2400
    const startTime = performance.now()

    function animateHero(now: number) {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1.0)

        if (webglContext.pointsMaterial && webglContext.pointsMaterial.userData.shader) {
            const currentShader = webglContext.pointsMaterial.userData.shader
            currentShader.uniforms.uRippleTime.value = progress * 15.0

            const bloom = Math.sin(progress * Math.PI)
            currentShader.uniforms.uGlowIntensity.value = bloom * 3.0
        }

        if (progress < 1.0) {
            _heroRafId = requestAnimationFrame(animateHero)
        } else {
            _heroRafId = 0
            if (webglContext.pointsMaterial && webglContext.pointsMaterial.userData.shader) {
                // Do NOT reset uGlowIntensity to zero — the persistent anchor
                // glow in updateCorridorNodeGlow will sustain a residual level.
                webglContext.pointsMaterial.userData.shader.uniforms.uRippleTime.value = -1000.0
            }
        }
    }

    _heroRafId = requestAnimationFrame(animateHero)
}

export function triggerCorridorNodeGlow(anchorIndex: number, routeIndices: number[] = []) {
    if (!webglContext.pointsMaterial?.userData?.shader || !state.nodePositions) return
    const shader = webglContext.pointsMaterial.userData.shader

    // Clear any in-progress glow from a previous call
    for (const k of Object.keys(_corridorGlowNodes)) {
        delete _corridorGlowNodes[Number(k)]
    }

    const allIndices = [...new Set([anchorIndex, ...(routeIndices || [])])].filter((i): i is number =>
        Number.isFinite(i)
    )
    const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const targetBoost = reduceMotion ? CORRIDOR_NODE_REDUCED_BOOST : CORRIDOR_NODE_BOOST
    const fadeStartDelay = reduceMotion ? CORRIDOR_NODE_REDUCED_FADE_DELAY : CORRIDOR_NODE_FADE_DELAY
    const fadeDuration = reduceMotion ? CORRIDOR_NODE_REDUCED_FADE_DURATION : CORRIDOR_NODE_FADE_DURATION
    const token = ++_corridorGlowToken

    allIndices.forEach((idx: number, order: number) => {
        const delay = idx === anchorIndex ? 0 : 80 + order * 40
        // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
        const outerId = setTimeout(() => {
            _corridorGlowTimers.delete(outerId)
            if (token !== _corridorGlowToken) return
            if (!state.nodePositions[idx]) return

            const pos = state.nodePositions[idx]
            shader.uniforms.uHoverNodePos.value.set(pos.x, pos.y, pos.z)

            _corridorGlowNodes[idx] = {
                startedAt: performance.now(),
                fadeStartDelay,
                fadeDuration,
                targetBoost
            }
            shader.uniforms.uHoverBoost.value = targetBoost

            // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
            const innerId = setTimeout(() => {
                _corridorGlowTimers.delete(innerId)
                if (token !== _corridorGlowToken) return
                _corridorGlowNodes[idx] = null
            }, fadeStartDelay + fadeDuration)
            _corridorGlowTimers.add(innerId)
        }, delay)
        _corridorGlowTimers.add(outerId)
    })
}

export function updateCorridorNodeGlow(frameNow: number): boolean {
    if (!webglContext.pointsMaterial?.userData?.shader) return false
    const shader = webglContext.pointsMaterial.userData.shader
    let anyActive = false
    let maxBoost = 1.0
    for (const idx of Object.keys(_corridorGlowNodes)) {
        const key = Number(idx)
        const glowState = _corridorGlowNodes[key]
        if (!glowState) continue
        const startedAt = glowState.startedAt
        const fadeStartDelay = glowState.fadeStartDelay
        const fadeDuration = glowState.fadeDuration
        const targetBoost = glowState.targetBoost
        const elapsed = frameNow - startedAt
        if (elapsed > fadeStartDelay) {
            const fadeProgress = Math.min((elapsed - fadeStartDelay) / fadeDuration, 1)
            const boost = 1.0 + (targetBoost - 1.0) * (1.0 - fadeProgress)
            maxBoost = Math.max(maxBoost, boost)
            if (fadeProgress >= 1.0) {
                _corridorGlowNodes[key] = null
            } else {
                anyActive = true
            }
        } else {
            anyActive = true
        }
    }
    shader.uniforms.uHoverBoost.value = maxBoost

    // Persistent anchor glow: sustain a subtle residual glow on the anchor
    // node after the hero bloom peaks, decaying over ANCHOR_GLOW_PERSIST_MS.
    if (_anchorGlowRemaining > 0 && _anchorGlowIndex >= 0 && state.nodePositions?.[_anchorGlowIndex]) {
        const dt = _anchorGlowLastFrame !== null ? frameNow - _anchorGlowLastFrame : 0
        _anchorGlowLastFrame = frameNow
        _anchorGlowRemaining = Math.max(0, _anchorGlowRemaining - dt)
        const fadeRatio = _anchorGlowRemaining / ANCHOR_GLOW_PERSIST_MS
        const anchorBoost = 1.0 + ANCHOR_GLOW_PERSIST_INTENSITY * fadeRatio
        shader.uniforms.uHoverBoost.value = Math.max(shader.uniforms.uHoverBoost.value, anchorBoost)
        const pos = state.nodePositions[_anchorGlowIndex]
        if (pos) {
            shader.uniforms.uHoverNodePos.value.set(pos.x, pos.y, pos.z)
            anyActive = true
        }
    } else {
        _anchorGlowLastFrame = frameNow
    }

    return anyActive
}

export function triggerSearchCorridorAnimation(anchorIndex: number, routeIndices: number[] = []) {
    disposeSearchCorridorAnimation()
    const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return
    triggerCorridorBloom()
    if (!state.scene) return

    const lineGeometry = buildCorridorLineGeometry(anchorIndex, routeIndices)
    if (!lineGeometry) return

    const lineMaterial = new ShaderMaterial({
        uniforms: {
            uDrawProgress: { value: 0.0 },
            uFadeOpacity: { value: 1.0 },
            uTime: { value: 0 }
        },
        vertexShader: `
            attribute float progress;
            varying float vProgress;
            varying float vDrawProgress;
            varying vec3 vColor;
            uniform float uDrawProgress;
            uniform float uTime;

            void main() {
                vProgress = progress;
                vDrawProgress = uDrawProgress;
                vColor = color;

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                if (progress > uDrawProgress) {
                    mvPosition.xy = vec2(99999.0, 99999.0);
                }
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vProgress;
            varying float vDrawProgress;
            varying vec3 vColor;
            uniform float uFadeOpacity;
            uniform float uTime;

            void main() {
                float fadeStart = max(0.0, vDrawProgress - 0.2);
                float tipFade = 1.0 - smoothstep(fadeStart, vDrawProgress, vProgress);
                float alpha = tipFade * 0.38 * uFadeOpacity;
                float pulse = 0.72 + sin(uTime * 1.8 + vProgress * 8.0) * 0.055;
                vec3 finalColor = vColor * pulse;
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexColors: true
    })

    const corridorLine = new LineSegments(lineGeometry, lineMaterial)
    const particles = buildCorridorParticleTrail(anchorIndex, routeIndices)

    const corridorGroup = new Group()
    corridorGroup.name = 'search-corridor-hero'
    corridorGroup.add(corridorLine)
    if (particles) corridorGroup.add(particles)

    state.scene.add(corridorGroup)
    state.searchCorridorGroup = corridorGroup

    _corridorAnimStartTime = performance.now()
    _corridorAnimState = {
        anchorIndex,
        routeIndices,
        line: corridorLine,
        particles,
        material: lineMaterial,
        done: false
    }
}

export function updateSearchCorridorAnimation(frameNow: number): boolean {
    const st = _corridorAnimState
    if (!st || !st.line) return false
    if (_corridorAnimStartTime === null) return false
    const elapsed = frameNow - _corridorAnimStartTime
    const reducedMotion = prefersReducedMotion()

    const drawProgress = Math.min(elapsed / CORRIDOR_SOFT_DRAW_DURATION, 1.0)

    if (st.material?.uniforms?.uDrawProgress && st.material.uniforms.uTime) {
        st.material.uniforms.uDrawProgress.value = drawProgress
        st.material.uniforms.uTime.value = reducedMotion ? 0 : frameNow / 1000
    }

    // particles.material is typed Material | Material[] in three.js but we
    // assign a ShaderMaterial in buildCorridorParticleTrail; narrow here
    // so the uniform access doesn't go through `as any`.
    const particlesMaterial = st.particles?.material as ShaderMaterial | undefined
    if (particlesMaterial?.uniforms?.uDrawProgress && particlesMaterial.uniforms.uTime) {
        particlesMaterial.uniforms.uDrawProgress.value = drawProgress
        particlesMaterial.uniforms.uTime.value = reducedMotion ? 0 : frameNow / 1000
    }

    if (elapsed > CORRIDOR_SOFT_DRAW_DURATION) {
        const fadeProgress = Math.min(
            (elapsed - CORRIDOR_SOFT_DRAW_DURATION) / (CORRIDOR_SOFT_TOTAL_DURATION - CORRIDOR_SOFT_DRAW_DURATION),
            1.0
        )
        const lineOpacity = 1.0 - fadeProgress
        if (st.material?.uniforms?.uFadeOpacity) st.material.uniforms.uFadeOpacity.value = lineOpacity
        if (st.material) st.material.opacity = lineOpacity
        if (particlesMaterial?.uniforms?.uFadeOpacity) particlesMaterial.uniforms.uFadeOpacity.value = lineOpacity
        if (particlesMaterial) particlesMaterial.opacity = lineOpacity
    }

    if (elapsed >= CORRIDOR_SOFT_TOTAL_DURATION) {
        disposeSearchCorridorAnimation()
        return false
    }
    return true
}

export function disposeSearchCorridorAnimation() {
    if (state.searchCorridorGroup) {
        if (state.scene) state.scene.remove(state.searchCorridorGroup)
        disposeObject3D(state.searchCorridorGroup)
        state.searchCorridorGroup = null
    }
    _corridorAnimState = null
    _corridorAnimStartTime = null
}

/**
 * Dispose hero-moment rAF and corridor-glow timers.
 * Called during engine teardown via disposeInteractionVisuals → here.
 */
export function disposeHeroAnimation() {
    if (_heroRafId) {
        cancelAnimationFrame(_heroRafId)
        _heroRafId = 0
    }
    // Clear persistent anchor glow state on teardown.
    _anchorGlowIndex = -1
    _anchorGlowRemaining = 0
    _anchorGlowLastFrame = null
    // Bump token to invalidate any glow timers that may fire between now
    // and the clear loop below, preventing inner-timer leaks.
    _corridorGlowToken++
    for (const id of _corridorGlowTimers) {
        clearTimeout(id)
    }
    _corridorGlowTimers.clear()
    for (const k of Object.keys(_corridorGlowNodes)) {
        delete _corridorGlowNodes[Number(k)]
    }
}
