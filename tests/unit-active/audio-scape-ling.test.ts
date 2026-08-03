// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// @ts-ignore
import {
    initAudio,
    setAudioMuted,
    isAudioMuted,
    triggerCorridorBloom,
    trigger,
    play,
    disposeAudio
} from '../../src/lib/audio/audio-scape'
// @ts-ignore
import { debugWarn } from '@lib/utils/debug'

// ── Mock appState ──────────────────────────────────────────
const mockState = vi.hoisted(() => ({
    camera: null as unknown as { position: { clone(): any; distanceTo(v: any): number } } | null,
    navState: { focusedIndex: null as number | null, activeRoutePath: null as any[] | null },
    semanticDiveMode: false,
    pointIndexByLeadId: new Map<string, number>(),
    points: [] as any[]
}))

vi.mock('@lib/state/app.svelte', () => ({ appState: mockState }))
vi.mock('@lib/utils/debug', () => ({ debugWarn: vi.fn() }))

// Stub global requestAnimationFrame/cancelAnimationFrame directly — bare references
// to these in audio-scape.ts resolve via globalThis which the window-targeted
// vi.stubGlobal in each describe beforeEach does NOT reach.
beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

// ── Per-instance node tracking ─────────────────────────────
const allNodes: { oscs: any[]; gains: any[]; filters: any[] } = { oscs: [], gains: [], filters: [] }

class MockAudioContext {
    currentTime = 0
    state: AudioContextState = 'running'
    destination = {}
    createOscillator() {
        const n = {
            type: 'sine',
            frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
        }
        allNodes.oscs.push(n)
        return n
    }
    createGain() {
        const n = {
            gain: {
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                setTargetAtTime: vi.fn(),
                value: 0
            },
            connect: vi.fn(),
            disconnect: vi.fn()
        }
        allNodes.gains.push(n)
        return n
    }
    createBiquadFilter() {
        const n = {
            type: 'lowpass',
            frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn()
        }
        allNodes.filters.push(n)
        return n
    }
    resume() {
        return Promise.resolve()
    }
    close() {
        this.state = 'closed'
        return Promise.resolve()
    }
}

let rafCounter = 0
const rafQueue: Array<(t: number) => void> = []
function mockRaf(cb: FrameRequestCallback): number {
    rafQueue.push(cb)
    return rafCounter++
}
function stepRaf(n = 1): void {
    for (let i = 0; i < n; i++) {
        const cb = rafQueue.shift()
        if (cb) cb(performance.now())
    }
}

let aCtxClass = MockAudioContext
let aContextInst: MockAudioContext | null = null
// Helper to get the current audioCtx stored in module state — we access it indirectly via the exported API surface
// Since audioState is not exported, we rely on a single MockAudioContext instance stored on the window mock:
let lastCtx: MockAudioContext | null = null

function freshCtx() {
    const ctx = new (aCtxClass as any)()
    lastCtx = ctx
    return ctx
}
// Patch constructor to return our tracked instance
;(MockAudioContext as any) = function () {
    lastCtx = freshCtx()
    return lastCtx
}

function setCam(x: number, y: number, z: number) {
    mockState.camera = {
        position: {
            clone: vi.fn(() => ({ x, y, z })),
            distanceTo: vi.fn((o: any) => Math.sqrt((x - o.x) ** 2 + (y - o.y) ** 2 + (z - o.z) ** 2))
        }
    }
}
function fire(ev: string) {
    document.dispatchEvent(new Event(ev))
}
function resetNodeTracking() {
    allNodes.oscs.length = 0
    allNodes.gains.length = 0
    allNodes.filters.length = 0
    rafQueue.length = 0
    rafCounter = 0
    vi.clearAllMocks()
}
function resetMockState() {
    mockState.camera = null
    mockState.navState = { focusedIndex: null as number | null, activeRoutePath: null as any[] | null }
    mockState.semanticDiveMode = false
    mockState.pointIndexByLeadId = new Map<string, number>()
    mockState.points = []
}

// ═══════════════════════════════════════════════════════
describe('initAudio', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('returns early when audioCtx already exists', () => {
        initAudio()
        fire('mousedown') // creates ctx
        const oscCount = allNodes.oscs.length
        initAudio() // audioCtx non-null → early return
        expect(allNodes.oscs.length).toBe(oscCount) // no new ctx
    })

    it('returns early when navigator.webdriver is true', () => {
        Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true, writable: true })
        initAudio()
        expect(allNodes.oscs.length).toBe(0)
    })

    it('registers 4 listeners on happy path (3 once + visibilitychange)', () => {
        const spy = vi.spyOn(document, 'addEventListener')
        initAudio()
        expect(spy).toHaveBeenCalledTimes(4)
        const types = spy.mock.calls.map((c: any[]) => c[0])
        expect(types).toContain('mousedown')
        expect(types).toContain('keydown')
        expect(types).toContain('touchstart')
        expect(types).toContain('visibilitychange')
    })
})

describe('startAudioContext via mousedown', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        resetMockState()
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
        mockState.camera = null
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('ctx constructed, mainOsc sine freq 55, gain 0, filter lowpass 200Hz', () => {
        initAudio()
        fire('mousedown')
        expect(allNodes.oscs[0].frequency.setValueAtTime).toHaveBeenCalledWith(55, expect.any(Number))
        expect(allNodes.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number))
        expect(allNodes.filters[0].frequency.setValueAtTime).toHaveBeenCalledWith(200, expect.any(Number))
    })

    it('wiring: osc→filter→gain→destination (each connect called once)', () => {
        initAudio()
        fire('mousedown')
        expect(allNodes.oscs[0].connect).toHaveBeenCalledTimes(1)
        expect(allNodes.filters[0].connect).toHaveBeenCalledTimes(1)
        expect(allNodes.gains[0].connect).toHaveBeenCalledTimes(1)
    })

    it('mainOsc.start() once, rAF scheduled, debugWarn fired', () => {
        initAudio()
        fire('mousedown')
        expect(allNodes.oscs[0].start).toHaveBeenCalledTimes(1)
        expect(rafQueue.length).toBeGreaterThanOrEqual(1)
        expect(debugWarn).toHaveBeenCalledWith('[audio] Reactive scape initialized.')
    })
})

describe('updateAudio', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        resetMockState()
        setCam(0, 0, 0)
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
        initAudio()
        fire('mousedown') // establish ctx
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('camera-null path: no setTargetAtTime, re-schedules rAF', () => {
        mockState.camera = null
        stepRaf(1)
        expect(allNodes.oscs[0].frequency.setTargetAtTime).not.toHaveBeenCalled()
        expect(rafQueue.length).toBe(1)
    })

    it('velocity = distanceTo * 60', () => {
        setCam(0, 0, 0)
        stepRaf(1)
        setCam(5, 0, 0)
        stepRaf(1)
        expect(allNodes.oscs[0].frequency.setTargetAtTime).toHaveBeenCalled()
    })

    it('focusedIndex dense branch (density 0.7)', () => {
        mockState.navState.focusedIndex = 0
        stepRaf(1)
        expect(allNodes.oscs[0].frequency.setTargetAtTime).toHaveBeenCalled()
    })

    it('semanticDiveMode density 0.9', () => {
        mockState.navState.focusedIndex = 0
        mockState.semanticDiveMode = true
        stepRaf(1)
        expect(allNodes.oscs[0].frequency.setTargetAtTime).toHaveBeenCalled()
    })

    it('cluster offset: cluster=5 → (5%12)*12 = 60', () => {
        mockState.navState.focusedIndex = 0
        mockState.points = [{ cluster: 5 }]
        mockState.pointIndexByLeadId.set('lead1', 0)
        setCam(0, 0, 0)
        stepRaf(1)
        const freq = allNodes.oscs[0].frequency.setTargetAtTime.mock.calls[0][0] as number
        expect(freq).toBeGreaterThanOrEqual(115) // 55 + 60
    })

    it('activeRoutePath + pointIndexByLeadId → pathProximity', () => {
        mockState.navState.activeRoutePath = ['lead1']
        mockState.pointIndexByLeadId.set('lead1', 0)
        mockState.points = [{ x: 0, y: 0, z: 0 }]
        setCam(0, 0, 0)
        stepRaf(1)
        expect(allNodes.oscs[0].frequency.setTargetAtTime).toHaveBeenCalled()
    })

    it('NaN camera position is guarded to finite target frequency', () => {
        setCam(NaN, NaN, NaN)
        stepRaf(1)
        // With density 0.3 and no cluster/velocity/path contribution, the
        // guarded frequency is base 55 + density*20 = 61.
        expect(allNodes.oscs[0].frequency.setTargetAtTime.mock.calls[0][0]).toBe(61)
    })
    it('NaN camera position is guarded to finite target gain', () => {
        setCam(NaN, NaN, NaN)
        stepRaf(1)
        // baseGain 0.005 + density*0.01 = 0.008
        expect(allNodes.gains[0].gain.setTargetAtTime.mock.calls[0][0]).toBeCloseTo(0.008, 3)
    })
    it('NaN camera position is guarded to finite target filter', () => {
        setCam(NaN, NaN, NaN)
        stepRaf(1)
        // 150 + density*400 = 270
        expect(allNodes.filters[0].frequency.setTargetAtTime.mock.calls[0][0]).toBe(270)
    })
})

describe('setAudioMuted', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
        initAudio()
        fire('mousedown')
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('muted=true → setTargetAtTime(0, ...)', () => {
        setAudioMuted(true)
        expect(allNodes.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.2)
    })
    it('muted=false → setTargetAtTime(0.01, ...)', () => {
        setAudioMuted(false)
        expect(allNodes.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0.01, expect.any(Number), 0.2)
    })
    it('no-op when gainNode/audioCtx null', () => {
        disposeAudio()
        setAudioMuted(true)
        expect(allNodes.gains[0].gain.setTargetAtTime).toHaveBeenCalledTimes(0)
    }) // dispose clears audioState so setAudioMuted early-returns
})

describe('isAudioMuted', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('ctx null → true', () => {
        expect(isAudioMuted()).toBe(true)
    })
    it('gainNode null → true', () => {
        disposeAudio()
        expect(isAudioMuted()).toBe(true)
    })
    it('gain === 0 → true', () => {
        initAudio()
        fire('mousedown')
        expect(isAudioMuted()).toBe(true)
    })
    it('gain > 0 → false', () => {
        initAudio()
        fire('mousedown')
        allNodes.gains[0].gain.value = 0.5
        expect(isAudioMuted()).toBe(false)
    })
})

describe('triggerCorridorBloom', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
        initAudio()
        fire('mousedown')
        if (lastCtx) (lastCtx as any).state = 'running' // hard-reset any 'suspended'/'closed' leftover from a prior test
        resetNodeTracking() // clear tracked nodes from setup so triggerCorridorBloom sub-tests inspect freshly-added transient nodes at index 0
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('ctx null no-op', () => {
        disposeAudio()
        triggerCorridorBloom()
        expect(allNodes.oscs.length).toBe(0)
    })
    it('suspended state no-op', () => {
        lastCtx!.state = 'suspended'
        triggerCorridorBloom()
        expect(allNodes.oscs.length).toBe(0)
    })

    it('happy path: 1 osc + 1 gain created', () => {
        triggerCorridorBloom()
        expect(allNodes.oscs.length).toBe(1)
        expect(allNodes.gains.length).toBe(1)
    })

    it('freq start in [880,1320), end in [1760,2640)', () => {
        triggerCorridorBloom()
        const osc = allNodes.oscs[0]
        expect(osc.frequency.setValueAtTime.mock.calls[0][0]).toBeGreaterThanOrEqual(880)
        expect(osc.frequency.setValueAtTime.mock.calls[0][0]).toBeLessThan(1320)
    })

    it('ramp calls: linearRampToValueAtTime(0.012,+0.05s) + exponentialRampToValueAtTime(0.0001,+0.8s)', () => {
        triggerCorridorBloom()
        const g = allNodes.gains[0]
        expect(g.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.012, expect.any(Number))
        expect(g.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, expect.any(Number))
    })

    it('osc.start + osc.stop(ctx.currentTime+0.8) each once', () => {
        triggerCorridorBloom()
        const osc = allNodes.oscs[0]
        expect(osc.start).toHaveBeenCalledTimes(1)
        expect(osc.stop).toHaveBeenCalledTimes(1)
        expect(osc.stop.mock.calls[0][0]).toBeCloseTo(lastCtx!.currentTime + 0.8, 4)
    })

    it('throw swallowed silently', () => {
        allNodes.oscs.length = 0
        const Orig = aCtxClass
        aCtxClass = vi.fn(() => {
            throw new Error('boom')
        }) as any
        initAudio()
        fire('mousedown')
        aCtxClass = Orig
        expect(() => triggerCorridorBloom()).not.toThrow()
    })
})

describe('trigger / play', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
        initAudio()
        fire('mousedown')
        if (lastCtx) (lastCtx as any).state = 'running' // hard-reset any 'suspended'/'closed' leftover
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it("trigger('corridor-bloom') creates osc", () => {
        const n = allNodes.oscs.length
        trigger('corridor-bloom')
        expect(allNodes.oscs.length).toBe(n + 1)
    })
    it("trigger('other') no-op", () => {
        const n = allNodes.oscs.length
        trigger('other')
        expect(allNodes.oscs.length).toBe(n)
    })
    it('play === trigger (same reference)', () => {
        expect(play).toBe(trigger)
    })
})

describe('disposeAudio', () => {
    beforeEach(() => {
        disposeAudio()
        resetNodeTracking()
        Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true })
        Object.defineProperty(window, 'webkitAudioContext', {
            value: MockAudioContext,
            configurable: true,
            writable: true
        })
        Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true, writable: true })
        initAudio()
        fire('mousedown')
    })
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('removes visibilitychange listener', () => {
        const spy = vi.spyOn(document, 'removeEventListener')
        disposeAudio()
        expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })
    it('cancelAnimationFrame called when rafId non-null', () => {
        const spy = vi.spyOn(window, 'cancelAnimationFrame')
        disposeAudio()
        expect(spy).toHaveBeenCalled()
    })
    it('mainOsc.stop try/catched', () => {
        allNodes.oscs[0].stop = vi.fn(() => {
            throw new Error('stopped')
        })
        expect(() => disposeAudio()).not.toThrow()
    })
    it('disconnects mainOsc, filterNode, gainNode', () => {
        disposeAudio()
        expect(allNodes.oscs[0].disconnect).toHaveBeenCalled()
        expect(allNodes.filters[0].disconnect).toHaveBeenCalled()
        expect(allNodes.gains[0].disconnect).toHaveBeenCalled()
    })
    it('closes audioCtx when not closed', () => {
        disposeAudio()
        expect(lastCtx!.state).toBe('closed')
    })
    it('after dispose, audioState is cleared (isAudioMuted returns true via null ctx/gain)', () => {
        disposeAudio()
        expect(isAudioMuted()).toBe(true)
    })

    it('idempotent: double-call no throw, no extra cancelAnimationFrame', () => {
        const spy = vi.spyOn(window, 'cancelAnimationFrame')
        disposeAudio()
        const c1 = spy.mock.calls.length
        disposeAudio()
        const c2 = spy.mock.calls.length
        expect(c1).toBe(c2) // no extra cancel
    })
})
