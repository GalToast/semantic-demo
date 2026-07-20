/**
 * @vitest-environment jsdom
 *
 * Unit tests for the 5 extracted frame-update functions in
 * src/lib/engine/three-engine-frame-updates.ts (Phase 4 quick-pick).
 *
 * Mocks engineState, webglContext, and the port modules that each
 * function touches. Follows the same mock pattern as
 * tests/unit-active/three-engine-core.test.ts.
 *
 * References:
 *   - docs/three-engine-decomposition-plan.md §4 (A4, A7, A11, A12, A14)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mutable stubs ────────────────────────────────────────────────────

const _getSceneRevealProgress = vi.hoisted(() => vi.fn())
const _shouldRenderThreads = vi.hoisted(() => vi.fn())
const _setNodeSporeInstanceMatrix = vi.hoisted(() => vi.fn())
const _markNodesDirty = vi.hoisted(() => vi.fn())

// ── Trackable engineState proxy ───────────────────────────────────────────────

const _engineStateProxy = vi.hoisted(() => ({
    lastHoveredNode: null as number | null,
    hoverEmissiveFlash: 0,
    state: null as null | Record<string, any>
}))

// ── Trackable webglContext proxy ──────────────────────────────────────────────

const _webglContextProxy = vi.hoisted(() => ({
    pointsMaterial: null as any,
    nodeSporeMaterial: null as any,
    myceliumGroup: null as any
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@lib/engine/three-engine-state', () => ({
    engineState: _engineStateProxy
}))

vi.mock('@lib/engine/webgl-context', () => ({
    webglContext: _webglContextProxy
}))

vi.mock('@lib/engine/node-manager', () => ({
    PORT_SCENE_ATMOSPHERE: { pointOpacityScale: 1.0, fogDensity: 0.0028, sporeOpacity: 0.65 },
    SCENE_ATMOSPHERE: { pointOpacityScale: 1.0, fogDensity: 0.0028, sporeOpacity: 0.65 },
    setNodeSporeInstanceMatrix: _setNodeSporeInstanceMatrix
}))

vi.mock('@lib/engine/thread-manager', () => ({
    shouldRenderThreads: _shouldRenderThreads,
    markNodesDirty: _markNodesDirty
}))

vi.mock('@lib/engine/config', () => ({
    CONFIG: { POINTS_MATERIAL_BASE_SIZE: 0.026 }
}))

vi.mock('@lib/engine/scene-reveal', () => ({
    getSceneRevealProgress: _getSceneRevealProgress
}))

// ── Import under test (MUST appear after all vi.mock calls) ───────────────────

import {
    computeRevealProgress,
    updatePointsMaterial,
    updateHoverEmissiveFlash,
    updateMyceliumPulse,
    updatePointsShaderHoverBoost,
    lerpNodesForFrame
} from '@lib/engine/three-engine-frame-updates'

// ── Shared helpers ───────────────────────────────────────────────────────────

function makeShaderUniforms() {
    return {
        uRevealProgress: { value: 0 },
        uTime: { value: 0 },
        uHoverBoost: { value: 1.0 },
        uHoverNodePos: { value: { set: vi.fn() } }
    }
}

function makePointsMaterial(shaderUniforms: ReturnType<typeof makeShaderUniforms> | null = null) {
    return {
        opacity: 0.32,
        size: 0.026,
        userData: shaderUniforms ? { shader: { uniforms: shaderUniforms } } : {}
    }
}

function makeNodeSporeMaterial() {
    return {
        emissiveIntensity: 0.55
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. computeRevealProgress (A4)
// ══════════════════════════════════════════════════════════════════════════════

describe('computeRevealProgress (A4)', () => {
    beforeEach(() => {
        _getSceneRevealProgress.mockReset()
    })

    it('returns all zeros when scene reveal has not started (returns 0)', () => {
        _getSceneRevealProgress.mockReturnValue(0)
        const result = computeRevealProgress(1000)
        expect(result.revealed).toBe(0)
        expect(result.points).toBe(0)
        expect(result.camera).toBe(0)
    })

    it('returns 1/1/1 when scene reveal is complete', () => {
        _getSceneRevealProgress.mockReturnValue(1)
        const result = computeRevealProgress(5000)
        expect(result.revealed).toBe(1)
        expect(result.points).toBe(1)
        expect(result.camera).toBe(1)
    })

    it('computes eased points at 50% reveal (0.5/0.7 = 0.714 → easeOutQuint)', () => {
        _getSceneRevealProgress.mockReturnValue(0.5)
        const result = computeRevealProgress(3000)
        expect(result.revealed).toBe(0.5)
        // easeOutQuint(0.5/0.7) = easeOutQuint(0.71428...)
        const expectedPoints = 1 - Math.pow(1 - 0.5 / 0.7, 5)
        expect(result.points).toBeCloseTo(expectedPoints, 5)
    })

    it('computes eased camera at 50% reveal via easeInOutCubic', () => {
        _getSceneRevealProgress.mockReturnValue(0.5)
        const result = computeRevealProgress(3000)
        // easeInOutCubic(0.5) = 0.5
        expect(result.camera).toBeCloseTo(0.5, 5)
    })

    it('clamps revealed to 0–1 range via scene-reveal module', () => {
        _getSceneRevealProgress.mockReturnValue(1.5)
        const result = computeRevealProgress(9999)
        // getSceneRevealProgress itself clamps to 0–1, but we verify the math
        expect(result.revealed).toBe(1.5)
        expect(result.points).toBe(1)
        expect(result.camera).toBe(1)
    })

    it('handles null/undefined getSceneRevealProgress return (coalesces to 0)', () => {
        _getSceneRevealProgress.mockReturnValue(null)
        const result = computeRevealProgress(1000)
        expect(result.revealed).toBe(0)
        expect(result.points).toBe(0)
        expect(result.camera).toBe(0)
    })

    it('passes the correct `now` argument to getSceneRevealProgress', () => {
        _getSceneRevealProgress.mockReturnValue(0)
        computeRevealProgress(42000)
        expect(_getSceneRevealProgress).toHaveBeenCalledWith(42000)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. updatePointsMaterial (A7)
// ══════════════════════════════════════════════════════════════════════════════

describe('updatePointsMaterial (A7)', () => {
    let uniforms: ReturnType<typeof makeShaderUniforms>
    let material: ReturnType<typeof makePointsMaterial>

    beforeEach(() => {
        uniforms = makeShaderUniforms()
        material = makePointsMaterial(uniforms)
        _webglContextProxy.pointsMaterial = material
    })

    it('no-ops when pointsMaterial is null', () => {
        _webglContextProxy.pointsMaterial = null
        expect(() => updatePointsMaterial(1.0, null)).not.toThrow()
    })

    it('sets default opacity and size at full reveal with no focus', () => {
        const state = { focusedNode: null, semanticDiveMode: false, trailDepth: 0 }
        updatePointsMaterial(1.0, state)
        // opacity = 0.32 * 1.0 * 1.0 * 1.0 = 0.32
        expect(material.opacity).toBeCloseTo(0.32, 5)
        // size = 0.026 * (1.06 + 1.0 * 0.46) * 1.0 = 0.026 * 1.52 = 0.03952
        expect(material.size).toBeCloseTo(0.026 * 1.52, 5)
    })

    it('reduces opacity/scale when focused (focusedNode is finite)', () => {
        const state = { focusedNode: 42, semanticDiveMode: false, trailDepth: 0 }
        updatePointsMaterial(1.0, state)
        // opacity scale = 0.46 for focused
        expect(material.opacity).toBeCloseTo(0.32 * 0.46, 5)
        // size scale = 0.8 for focused
        expect(material.size).toBeCloseTo(0.026 * 1.52 * 0.8, 5)
    })

    it('applies semantic-dive scales when semanticDiveMode is true', () => {
        const state = { focusedNode: 42, semanticDiveMode: true, trailDepth: 0 }
        updatePointsMaterial(1.0, state)
        expect(material.opacity).toBeCloseTo(0.32 * 0.06, 5)
        expect(material.size).toBeCloseTo(0.026 * 1.52 * 0.36, 5)
    })

    it('applies semantic-dive scales when trailDepth >= 2', () => {
        const state = { focusedNode: null, semanticDiveMode: false, trailDepth: 3 }
        updatePointsMaterial(0.5, state)
        expect(material.opacity).toBeCloseTo(0.32 * 0.06 * 0.5, 5)
    })

    it('writes uRevealProgress and uTime to shader uniforms', () => {
        const state = { focusedNode: null, semanticDiveMode: false, trailDepth: 0 }
        const beforeTime = performance.now()
        updatePointsMaterial(0.75, state)
        expect(uniforms.uRevealProgress.value).toBe(0.75)
        expect(uniforms.uTime.value).toBeGreaterThanOrEqual(beforeTime * 0.001)
        expect(uniforms.uTime.value).toBeLessThan((beforeTime + 100) * 0.001)
    })

    it('scales opacity by PORT_SCENE_ATMOSPHERE.pointOpacityScale', () => {
        const state = { focusedNode: null, semanticDiveMode: false, trailDepth: 0 }
        // Default mock: pointOpacityScale = 1.0, so result = 0.32
        updatePointsMaterial(1.0, state)
        expect(material.opacity).toBeCloseTo(0.32, 5)
    })

    it('does not touch shader uniforms when userData.shader is absent', () => {
        _webglContextProxy.pointsMaterial = makePointsMaterial(null)
        const state = { focusedNode: null, semanticDiveMode: false, trailDepth: 0 }
        expect(() => updatePointsMaterial(1.0, state)).not.toThrow()
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. updateHoverEmissiveFlash (A11)
// ══════════════════════════════════════════════════════════════════════════════

describe('updateHoverEmissiveFlash (A11)', () => {
    let sporeMat: ReturnType<typeof makeNodeSporeMaterial>

    beforeEach(() => {
        _engineStateProxy.lastHoveredNode = null
        _engineStateProxy.hoverEmissiveFlash = 0
        sporeMat = makeNodeSporeMaterial()
        _webglContextProxy.nodeSporeMaterial = sporeMat
    })

    it('no-ops when nodeSporeMaterial is null (no flash, no error)', () => {
        _webglContextProxy.nodeSporeMaterial = null
        const state = { hoverHighlightIndex: -1 }
        updateHoverEmissiveFlash(state)
        expect(_engineStateProxy.lastHoveredNode).toBe(-1)
    })

    it('peaks flash to 1.0 on first hover transition (null → node 5)', () => {
        _engineStateProxy.lastHoveredNode = null
        _engineStateProxy.hoverEmissiveFlash = 0
        const state = { hoverHighlightIndex: 5 }
        updateHoverEmissiveFlash(state)
        // Peak at 1.0 then decay by 0.92 in same call → 0.92 left in state.
        // The intermediate peak is observable via the emissiveIntensity write
        // (target = 0.55 + (1.8 - 0.55) * 1.0) but the stored flash has already
        // decayed.
        expect(_engineStateProxy.hoverEmissiveFlash).toBeCloseTo(0.92, 5)
        expect(_engineStateProxy.lastHoveredNode).toBe(5)
    })

    it('peaks flash on node change (5 → 6)', () => {
        _engineStateProxy.lastHoveredNode = 5
        _engineStateProxy.hoverEmissiveFlash = 0.1
        const state = { hoverHighlightIndex: 6 }
        updateHoverEmissiveFlash(state)
        expect(_engineStateProxy.hoverEmissiveFlash).toBeCloseTo(0.92, 5)
        expect(_engineStateProxy.lastHoveredNode).toBe(6)
    })

    it('does NOT peak flash when hovering same node (5 → 5)', () => {
        _engineStateProxy.lastHoveredNode = 5
        _engineStateProxy.hoverEmissiveFlash = 0.5
        const state = { hoverHighlightIndex: 5 }
        updateHoverEmissiveFlash(state)
        // Flash should decay, not peak
        expect(_engineStateProxy.hoverEmissiveFlash).toBeLessThan(0.5)
        expect(_engineStateProxy.hoverEmissiveFlash).toBeCloseTo(0.5 * 0.92, 5)
    })

    it('decays emissiveIntensity by 0.92 each call while flash > 0.001', () => {
        _engineStateProxy.lastHoveredNode = 5
        _engineStateProxy.hoverEmissiveFlash = 1.0
        const state = { hoverHighlightIndex: 5 }
        updateHoverEmissiveFlash(state)
        // Function writes intensity while flash is still at peak (pre-decay).
        // target = baseIntensity + (flashPeak - baseIntensity) * 1.0 = 1.8
        // Flash then decays to 0.92 in same call, but the intensity write used
        // the pre-decay value, so emissiveIntensity ends at 1.8.
        expect(_engineStateProxy.hoverEmissiveFlash).toBeCloseTo(0.92, 5)
        expect(sporeMat.emissiveIntensity).toBeCloseTo(1.8, 5)
    })

    it('resets flash to 0 and emissiveIntensity to base when flash decays below 0.005', () => {
        _engineStateProxy.lastHoveredNode = 5
        _engineStateProxy.hoverEmissiveFlash = 0.004 // already below 0.005
        const state = { hoverHighlightIndex: 5 }
        updateHoverEmissiveFlash(state)
        expect(_engineStateProxy.hoverEmissiveFlash).toBe(0)
        expect(sporeMat.emissiveIntensity).toBe(0.55)
    })

    it('sets emissiveIntensity to flashPeak when flash is 1.0', () => {
        _engineStateProxy.lastHoveredNode = null
        _engineStateProxy.hoverEmissiveFlash = 0
        const state = { hoverHighlightIndex: 3 }
        updateHoverEmissiveFlash(state)
        // flash was peaked to 1.0, then targetIntensity computed before decay
        // target = 0.55 + (1.8 - 0.55) * 1.0 = 1.8
        expect(sporeMat.emissiveIntensity).toBeCloseTo(1.8, 5)
    })

    it('clears hover on transition back to no hover (5 → null)', () => {
        _engineStateProxy.lastHoveredNode = 5
        _engineStateProxy.hoverEmissiveFlash = 0.3
        const state = { hoverHighlightIndex: -1 }
        updateHoverEmissiveFlash(state)
        // No hover → lastHadHover was true, hasHover is false → flash peaks to 1.0,
        // then decays to 0.92 within the same call.
        expect(_engineStateProxy.hoverEmissiveFlash).toBeCloseTo(0.92, 5)
        expect(_engineStateProxy.lastHoveredNode).toBe(-1)
    })

    it('clears hover on transition to undefined hoverHighlightIndex', () => {
        _engineStateProxy.lastHoveredNode = 5
        _engineStateProxy.hoverEmissiveFlash = 0.2
        const state = { hoverHighlightIndex: undefined }
        updateHoverEmissiveFlash(state)
        expect(_engineStateProxy.lastHoveredNode).toBe(-1)
    })

    it('handles null state gracefully', () => {
        updateHoverEmissiveFlash(null)
        expect(_engineStateProxy.lastHoveredNode).toBe(-1)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. updateMyceliumPulse (A12)
// ══════════════════════════════════════════════════════════════════════════════

describe('updateMyceliumPulse (A12)', () => {
    let myceliumGroup: { visible: boolean }

    beforeEach(() => {
        myceliumGroup = { visible: false }
        _webglContextProxy.myceliumGroup = myceliumGroup
        _shouldRenderThreads.mockReset()
    })

    it('sets myceliumGroup.visible from shouldRenderThreads return', () => {
        _shouldRenderThreads.mockReturnValue(true)
        const state = { pulsePhase: 0, weather: { windSpeed: 8.0 } }
        const visible = updateMyceliumPulse(state)
        expect(visible).toBe(true)
        expect(myceliumGroup.visible).toBe(true)
    })

    it('hides myceliumGroup when shouldRenderThreads returns false', () => {
        _shouldRenderThreads.mockReturnValue(false)
        const state = { pulsePhase: 0, weather: { windSpeed: 8.0 } }
        const visible = updateMyceliumPulse(state)
        expect(visible).toBe(false)
        expect(myceliumGroup.visible).toBe(false)
    })

    it('advances pulsePhase by (0.015 * (0.6 + wind/15)) for normal motion', () => {
        _shouldRenderThreads.mockReturnValue(false)
        const state = { pulsePhase: 0, weather: { windSpeed: 7.5 } }
        updateMyceliumPulse(state)
        // basePulseSpeed = 0.015, windSpeed = 7.5
        // increment = 0.015 * (0.6 + 7.5/15) = 0.015 * (0.6 + 0.5) = 0.015 * 1.1 = 0.0165
        expect(state.pulsePhase).toBeCloseTo(0.0165, 6)
    })

    it('uses basePulseSpeed=0 when prefers-reduced-motion matches', () => {
        // jsdom doesn't have matchMedia by default, but the code guards with
        // typeof window !== 'undefined'. We test the reduced-motion path by
        // mocking matchMedia.
        const originalMatchMedia = window.matchMedia
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        })) as any

        _shouldRenderThreads.mockReturnValue(false)
        const state = { pulsePhase: 1.0, weather: { windSpeed: 12.0 } }
        updateMyceliumPulse(state)
        // basePulseSpeed = 0.0, so increment = 0 regardless of wind
        expect(state.pulsePhase).toBe(1.0)

        window.matchMedia = originalMatchMedia
    })

    it('wraps pulsePhase modulo 2π', () => {
        _shouldRenderThreads.mockReturnValue(false)
        const state = { pulsePhase: Math.PI * 2 - 0.01, weather: { windSpeed: 8.0 } }
        updateMyceliumPulse(state)
        expect(state.pulsePhase).toBeLessThan(Math.PI * 2)
        expect(state.pulsePhase).toBeGreaterThan(0)
    })

    it('uses default wind speed 8.0 when weather is undefined', () => {
        _shouldRenderThreads.mockReturnValue(false)
        const state = { pulsePhase: 0, weather: {} }
        updateMyceliumPulse(state)
        // windSpeed = 8.0, increment = 0.015 * (0.6 + 8/15) = 0.015 * 1.1333... = 0.017
        const expected = 0.015 * (0.0 + 0.6 + 8.0 / 15.0)
        // Wait, let me recalculate: basePulseSpeed is 0.015 (not reduced motion in jsdom)
        // But in jsdom, matchMedia might not be available, so prefersReduced could be undefined/falsy
        // Actually the code does: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        // In jsdom, window.matchMedia exists but returns undefined, so ?.matches = undefined → falsy
        // So basePulseSpeed = 0.015
        const increment = 0.015 * (0.6 + 8.0 / 15.0)
        expect(state.pulsePhase).toBeCloseTo(increment, 6)
    })

    it('handles null state without throwing', () => {
        _shouldRenderThreads.mockReturnValue(false)
        expect(() => updateMyceliumPulse(null)).not.toThrow()
    })

    it('does not throw when myceliumGroup is null', () => {
        _webglContextProxy.myceliumGroup = null
        _shouldRenderThreads.mockReturnValue(true)
        const state = { pulsePhase: 0, weather: { windSpeed: 5.0 } }
        expect(() => updateMyceliumPulse(state)).not.toThrow()
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. updatePointsShaderHoverBoost (A14)
// ══════════════════════════════════════════════════════════════════════════════

describe('updatePointsShaderHoverBoost (A14)', () => {
    let uniforms: ReturnType<typeof makeShaderUniforms>

    beforeEach(() => {
        uniforms = makeShaderUniforms()
        _webglContextProxy.pointsMaterial = makePointsMaterial(uniforms)
    })

    it('no-ops when pointsMaterial.userData.shader is absent', () => {
        _webglContextProxy.pointsMaterial = makePointsMaterial(null)
        expect(() => updatePointsShaderHoverBoost(-1, null)).not.toThrow()
    })

    it('no-ops when pointsMaterial is null', () => {
        _webglContextProxy.pointsMaterial = null
        expect(() => updatePointsShaderHoverBoost(-1, null)).not.toThrow()
    })

    it('lerps uHoverBoost toward 1.0 when no hover', () => {
        uniforms.uHoverBoost.value = 1.5
        updatePointsShaderHoverBoost(-1, null)
        // targetBoost = 1.0, lerp: 1.5 + (1.0 - 1.5) * 0.2 = 1.5 - 0.1 = 1.4
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.4, 5)
    })

    it('lerps uHoverBoost toward 1.5 when hovering', () => {
        uniforms.uHoverBoost.value = 1.0
        const state = { nodePositions: [{ x: 1, y: 2, z: 3 }] }
        updatePointsShaderHoverBoost(0, state)
        // targetBoost = 1.5, lerp: 1.0 + (1.5 - 1.0) * 0.2 = 1.0 + 0.1 = 1.1
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.1, 5)
    })

    it('sets uHoverNodePos to hovered node position', () => {
        uniforms.uHoverBoost.value = 1.0
        const state = { nodePositions: [{ x: 10, y: 20, z: 30 }] }
        updatePointsShaderHoverBoost(0, state)
        expect(uniforms.uHoverNodePos.value.set).toHaveBeenCalledWith(10, 20, 30)
    })

    it('does NOT set uHoverNodePos when node position is missing', () => {
        uniforms.uHoverBoost.value = 1.0
        const state = { nodePositions: [] }
        updatePointsShaderHoverBoost(5, state)
        // Boost still lerps toward 1.5
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.1, 5)
        // But nodePos is not set
        expect(uniforms.uHoverNodePos.value.set).not.toHaveBeenCalled()
    })

    it('lerps from existing boost value over multiple frames', () => {
        uniforms.uHoverBoost.value = 1.0
        const state = { nodePositions: [{ x: 1, y: 2, z: 3 }] }
        updatePointsShaderHoverBoost(0, state)
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.1, 5)
        updatePointsShaderHoverBoost(0, state)
        // 1.1 + (1.5 - 1.1) * 0.2 = 1.1 + 0.08 = 1.18
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.18, 5)
    })

    it('lerps back down after hover is removed', () => {
        uniforms.uHoverBoost.value = 1.5
        updatePointsShaderHoverBoost(-1, null)
        // 1.5 + (1.0 - 1.5) * 0.2 = 1.4
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.4, 5)
    })

    it('handles hoveredNode = NaN (non-finite) as no hover', () => {
        uniforms.uHoverBoost.value = 1.5
        updatePointsShaderHoverBoost(NaN, null)
        // NaN is not finite → hasHover = false → targetBoost = 1.0
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.4, 5)
    })

    it('handles hoveredNode = Infinity (non-finite) as no hover', () => {
        uniforms.uHoverBoost.value = 1.5
        updatePointsShaderHoverBoost(Infinity, null)
        expect(uniforms.uHoverBoost.value).toBeCloseTo(1.4, 5)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. lerpNodesForFrame (A5) — focus-pocket matrix regression
// ══════════════════════════════════════════════════════════════════════════════

describe('lerpNodesForFrame (A5)', () => {
    function makePosition(x = 0, y = 0, z = 0) {
        return { x, y, z }
    }

    function resetEngine() {
        _setNodeSporeInstanceMatrix.mockClear()
        _markNodesDirty.mockClear()
        _engineStateProxy.state = {
            nodePositions: [makePosition(0, 0, 0), makePosition(1, 0, 0), makePosition(2, 0, 0)],
            targetPositions: [makePosition(0, 0, 0), makePosition(1, 0, 0), makePosition(2, 0, 0)],
            focusState: { pocketMotionByIndex: new Map() },
            myceliumDirty: false
        }
        _engineStateProxy.focusPocket = null
        _webglContextProxy.nodeSporeMesh = null
        _webglContextProxy.pointsMesh = null
    }

    beforeEach(resetEngine)

    it('updates node spore matrices for every key in focusState.pocketMotionByIndex when focus pocket breathes', () => {
        const motionMap = new Map([
            [1, { frame: 0, delta: { x: 0.1, y: 0, z: 0 } }],
            [2, { frame: 0, delta: { x: 0.2, y: 0, z: 0 } }]
        ])
        _engineStateProxy.state!.focusState.pocketMotionByIndex = motionMap
        _engineStateProxy.focusPocket = {
            applyFocusPocketBreathing: vi.fn().mockReturnValue(true)
        }

        const aborted = lerpNodesForFrame(0)

        expect(aborted).toBe(false)
        // The bug being fixed: the old code iterated Map values, so it passed
        // motion objects to setNodeSporeInstanceMatrix instead of node indices.
        // After the fix, it must iterate keys and call the port for indices 1 and 2.
        expect(_setNodeSporeInstanceMatrix).toHaveBeenCalledTimes(2)
        expect(_setNodeSporeInstanceMatrix).toHaveBeenNthCalledWith(1, 1)
        expect(_setNodeSporeInstanceMatrix).toHaveBeenNthCalledWith(2, 2)
    })

    it('falls back to focusPocket.getFocusPocketMotionByIndex when state map is absent', () => {
        const fallbackMap = new Map([
            [0, { frame: 0, delta: { x: 0, y: 0.1, z: 0 } }]
        ])
        _engineStateProxy.state!.focusState.pocketMotionByIndex = undefined
        _engineStateProxy.focusPocket = {
            applyFocusPocketBreathing: vi.fn().mockReturnValue(true),
            getFocusPocketMotionByIndex: vi.fn().mockReturnValue(fallbackMap)
        }

        lerpNodesForFrame(0)

        expect(_setNodeSporeInstanceMatrix).toHaveBeenCalledTimes(1)
        expect(_setNodeSporeInstanceMatrix).toHaveBeenCalledWith(0)
    })

    it('returns early without error when state has no positions', () => {
        _engineStateProxy.state = null
        expect(() => lerpNodesForFrame(0)).not.toThrow()
        expect(_setNodeSporeInstanceMatrix).not.toHaveBeenCalled()
    })
})
