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
import { readFileSync } from 'node:fs'
// @ts-ignore
import { fileURLToPath } from 'node:url'
// @ts-ignore
import { dirname, resolve } from 'node:path'
// @ts-ignore
const mockAppState = vi.hoisted(() => ({
    camera: null as any,
    navState: { focusedIndex: null as number | null } as any,
    semanticDiveMode: false,
    pointIndexByLeadId: new Map(),
    points: [] as Array<{ cluster: number; position: any }>
}))
// @ts-ignore
vi.mock('@lib/state/app.svelte', () => ({ appState: mockAppState }))
// @ts-ignore
const mockPointIndex = vi.hoisted(() => new Map<string, number>())
// @ts-ignore
vi.mock('@lib/data-store', () => ({
    pointIndexByLeadId: {
        getSnapshot: () => mockPointIndex
    }
}))
// @ts-ignore
const mockWarn = vi.hoisted(() => vi.fn())
vi.mock('@lib/utils/debug', () => ({ debugWarn: mockWarn }))

let rafCb: FrameRequestCallback | null = null
const rafSpy = vi.fn((cb: FrameRequestCallback) => {
    rafCb = cb
    return 1
})
vi.stubGlobal('requestAnimationFrame', rafSpy)
const cancelSpy = vi.fn()
vi.stubGlobal('cancelAnimationFrame', cancelSpy)

let addSpy: any
let remSpy: any

class M {
    connect = vi.fn()
    disconnect = vi.fn()
}
class MOsc extends M {
    type = 'sine'
    frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
    start = vi.fn()
    stop = vi.fn()
}
class MGain extends M {
    gain = {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        value: 0
    }
}
class MFilter extends M {
    type = 'lowpass'
    frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
}

let activeCtx: any = null
class MockAudioCtx {
    currentTime = 0
    state = 'running'
    destination = {}
    nodes: any[] = []
    constructor() {
        activeCtx = this
    }
    createOscillator() {
        activeCtx = this
        const o = new MOsc()
        this.nodes.push(o)
        return o as any
    }
    createGain() {
        activeCtx = this
        const g = new MGain()
        this.nodes.push(g)
        return g as any
    }
    createBiquadFilter() {
        activeCtx = this
        const f = new MFilter()
        this.nodes.push(f)
        return f as any
    }
    resume() {
        return Promise.resolve()
    }
    close = vi.fn(() => Promise.resolve())
}
window.AudioContext = MockAudioCtx as any
// @ts-ignore — harness: webkitAudioContext is a browser extension property not in lib.dom.d.ts
declare const testWindow: typeof window & { webkitAudioContext: any }
;(window as any).webkitAudioContext = MockAudioCtx as any

const reset = () => {
    mockAppState.camera = null
    mockAppState.navState.focusedIndex = null
    mockAppState.semanticDiveMode = false
    mockAppState.pointIndexByLeadId = new Map()
    mockPointIndex.clear()
    mockAppState.points = []
    activeCtx = null
    rafCb = null
}
const start = () => {
    initAudio()
    document.dispatchEvent(new Event('mousedown'))
}

beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    addSpy = vi.spyOn(document, 'addEventListener')
    remSpy = vi.spyOn(document, 'removeEventListener')
    rafSpy.mockClear()
    cancelSpy.mockClear()
    mockWarn.mockClear()
    reset()
    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false })
})
afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.AudioContext = MockAudioCtx as any
    // @ts-ignore — harness: webkitAudioContext is a browser extension property not in lib.dom.d.ts
    ;(window as any).webkitAudioContext = MockAudioCtx as any
    if (activeCtx?.state === 'closed') activeCtx.state = 'running'
    disposeAudio()
})

describe('initAudio', () => {
    it('early-returns if audioCtx already exists', () => {
        start()
        addSpy.mockClear()
        initAudio()
        expect(addSpy).not.toHaveBeenCalled()
    })
    it('early-returns when navigator.webdriver is true', () => {
        Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => true })
        initAudio()
        expect(addSpy).not.toHaveBeenCalled()
    })
    it('registers 3 once-listeners and 1 visibilitychange listener', () => {
        initAudio()
        expect(addSpy).toHaveBeenCalledTimes(4)
        const names = addSpy.mock.calls.map((c: any[]) => c[0])
        expect(names).toEqual(expect.arrayContaining(['mousedown', 'keydown', 'touchstart', 'visibilitychange']))
        expect(addSpy.mock.calls.filter((c: any[]) => c[0] !== 'visibilitychange').map((c: any[]) => c[2])).toEqual([
            { once: true },
            { once: true },
            { once: true }
        ])
    })
})

describe('startAudioContext', () => {
    beforeEach(() => {
        initAudio()
    })
    it('creates context, osc sine 55Hz, gain 0, filter lowpass 200Hz', () => {
        document.dispatchEvent(new Event('mousedown'))
        expect(activeCtx).toBeDefined()
        const [osc, gain, filter] = activeCtx.nodes
        expect(osc.type).toBe('sine')
        expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(55, 0)
        expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0)
        expect(filter.type).toBe('lowpass')
        expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(200, 0)
    })
    it('chains osc -> filter -> gain -> destination', () => {
        document.dispatchEvent(new Event('mousedown'))
        const [osc, gain, filter] = activeCtx.nodes
        expect(osc.connect).toHaveBeenCalledWith(filter)
        expect(filter.connect).toHaveBeenCalledWith(gain)
        expect(gain.connect).toHaveBeenCalledWith(activeCtx.destination)
    })
    it('starts mainOsc once and schedules rAF', () => {
        document.dispatchEvent(new Event('mousedown'))
        expect(activeCtx.nodes[0].start).toHaveBeenCalledTimes(1)
        expect(rafSpy).toHaveBeenCalledTimes(1)
    })
    it('logs success debugWarn', () => {
        document.dispatchEvent(new Event('mousedown'))
        expect(mockWarn).toHaveBeenCalledWith('[audio] Reactive scape initialized.')
    })
    it('logs failure debugWarn on error', () => {
        window.AudioContext = class extends MockAudioCtx {
            createOscillator() {
                throw new Error('boom')
            }
        } as any
        document.dispatchEvent(new Event('mousedown'))
        expect(mockWarn).toHaveBeenCalledWith('[audio] Web Audio API initialization failed.', expect.anything())
    })
})

describe('updateAudio', () => {
    it('early-returns when ctx is closed without rescheduling rAF', () => {
        start()
        activeCtx.state = 'closed'
        rafCb!(performance.now())
        expect(rafSpy).toHaveBeenCalledTimes(1)
    })
    it('camera-null path schedules rAF but skips node mutation', () => {
        mockAppState.camera = null
        start()
        rafCb!(performance.now())
        expect(rafSpy).toHaveBeenCalledTimes(2)
        const [, gain] = activeCtx.nodes
        expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled()
    })
    it('computes velocity from distanceTo * 60', () => {
        const distSpy = vi.fn(() => 10)
        mockAppState.camera = { position: { clone: () => ({ x: 0, y: 0, z: 0 }), distanceTo: distSpy } }
        start()
        rafCb!(performance.now())
        rafCb!(performance.now())
        expect(distSpy).toHaveBeenCalled()
    })
    it('re-assigns lastCameraPos via clone', () => {
        const cloneSpy = vi.fn(() => ({ x: 0, y: 0, z: 0 }))
        mockAppState.camera = { position: { clone: cloneSpy, distanceTo: () => 10 } }
        start()
        rafCb!(performance.now())
        expect(cloneSpy).toHaveBeenCalledTimes(1)
    })
    it('resets smoothVelocity to 0 when distance is Infinity', () => {
        mockAppState.camera = { position: { clone: () => ({ x: 0, y: 0, z: 0 }), distanceTo: () => Infinity } }
        start()
        rafCb!(performance.now())
        rafCb!(performance.now())
        expect(activeCtx.nodes[0].frequency.setTargetAtTime).toHaveBeenCalledWith(61, 0, 0.1)
    })
    it('boosts density to 0.7 (0.9 with semanticDiveMode)', () => {
        mockAppState.navState.focusedIndex = 5
        // @ts-ignore — harness: test fixture shape is flexible; source accepts sparse point shapes
        mockAppState.points = Array.from({ length: 6 }, (_, i) => ({ cluster: i }))
        mockAppState.camera = { position: { clone: () => ({ x: 0, y: 0, z: 0 }), distanceTo: () => 0 } }
        start()
        rafCb!(performance.now())
        const freq = activeCtx.nodes[0].frequency.setTargetAtTime.mock.calls[0][0]
        expect(freq).toBeCloseTo(115 + 0.7 * 20, 5)
        mockAppState.semanticDiveMode = true
        rafCb!(performance.now())
        const freq2 = activeCtx.nodes[0].frequency.setTargetAtTime.mock.calls[1][0]
        expect(freq2).toBeCloseTo(115 + 0.9 * 20, 5)
    })
    it('applies cluster offset (cluster=5 => 60)', () => {
        mockAppState.navState.focusedIndex = 5
        // @ts-ignore — harness: test fixture shape is flexible; source accepts sparse point shapes
        mockAppState.points = Array.from({ length: 6 }, (_, i) => ({ cluster: i }))
        mockAppState.camera = { position: { clone: () => ({ x: 0, y: 0, z: 0 }), distanceTo: () => 0 } }
        start()
        rafCb!(performance.now())
        // baseFreq = 55 + (5%12)*12 = 115; density 0.7 (focused) => +14 => 129
        expect(activeCtx.nodes[0].frequency.setTargetAtTime).toHaveBeenCalledWith(129, 0, 0.1)
    })
    it('honors activeRoutePath + pointIndexByLeadId pathProximity', () => {
        mockPointIndex.set('1', 0)
        // @ts-ignore — harness: test fixture shape is flexible; source accepts sparse point shapes
        mockAppState.points = [{ x: 0, y: 0, z: 0 } as any]
        mockAppState.navState.activeRoutePath = ['1']
        mockAppState.camera = {
            position: {
                clone: () => ({ x: 1, y: 1, z: 1, distanceTo: (v: any) => Math.hypot(1 - v.x, 1 - v.y, 1 - v.z) }),
                distanceTo: () => 0
            }
        }
        start()
        rafCb!(performance.now())
        const freq = activeCtx.nodes[0].frequency.setTargetAtTime.mock.calls[0][0]
        expect(freq).toBeGreaterThan(70)
        expect(freq).toBeLessThan(85)
    })
    it('skips pathProximity when pointIndexByLeadId misses a route id', () => {
        mockPointIndex.set('missing', 0)
        mockAppState.points = []
        mockAppState.navState.activeRoutePath = ['missing']
        mockAppState.camera = { position: { clone: () => ({ x: 0, y: 0, z: 0 }), distanceTo: () => 0 } }
        start()
        expect(() => rafCb!(performance.now())).not.toThrow()
        expect(rafSpy).toHaveBeenCalledTimes(2)
    })
    it('guards NaN rawTargetFreq to 55 via smoothVelocity clamping', () => {
        mockAppState.navState.focusedIndex = null
        mockAppState.camera = { position: { clone: () => ({ x: 0, y: 0, z: 0 }), distanceTo: () => Infinity } }
        start()
        rafCb!(performance.now())
        rafCb!(performance.now())
        expect(activeCtx.nodes[0].frequency.setTargetAtTime).toHaveBeenCalledWith(61, 0, 0.1)
    })
})

describe('setAudioMuted', () => {
    beforeEach(() => {
        start()
    })
    it('sets target 0 when muted=true', () => {
        setAudioMuted(true)
        expect(activeCtx.nodes[1].gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.2)
    })
    it('sets target 0.01 when muted=false', () => {
        setAudioMuted(false)
        expect(activeCtx.nodes[1].gain.setTargetAtTime).toHaveBeenCalledWith(0.01, 0, 0.2)
    })
    it('no-ops when nodes are null', () => {
        disposeAudio()
        expect(() => setAudioMuted(true)).not.toThrow()
    })
})

describe('isAudioMuted', () => {
    it('returns true when audioCtx is null', () => {
        expect(isAudioMuted()).toBe(true)
    })
    it('returns true when gainNode is null', () => {
        expect(isAudioMuted()).toBe(true)
    })
    it('returns true when gain value is 0', () => {
        start()
        expect(isAudioMuted()).toBe(true)
    })
    it('returns false when gain value is positive', () => {
        start()
        activeCtx.nodes[1].gain.value = 0.5
        expect(isAudioMuted()).toBe(false)
    })
})

describe('triggerCorridorBloom', () => {
    it('no-ops when ctx is null', () => {
        expect(() => triggerCorridorBloom()).not.toThrow()
    })
    it('no-ops when ctx is suspended', () => {
        start()
        activeCtx.state = 'suspended'
        expect(() => triggerCorridorBloom()).not.toThrow()
    })
    it('creates osc + gain with correct frequency/gain schedules', () => {
        start()
        triggerCorridorBloom()
        expect(activeCtx.nodes.length).toBe(5)
        const [osc, gain] = [activeCtx.nodes[3], activeCtx.nodes[4]]
        const startF = osc.frequency.setValueAtTime.mock.calls[0][0]
        expect(startF).toBeGreaterThanOrEqual(880)
        expect(startF).toBeLessThan(1320)
        expect(osc.frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBeGreaterThanOrEqual(1760)
        expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.012, expect.any(Number))
        expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, expect.any(Number))
        expect(osc.connect).toHaveBeenCalledWith(gain)
        expect(gain.connect).toHaveBeenCalledWith(activeCtx.destination)
        expect(osc.start).toHaveBeenCalledTimes(1)
        expect(osc.stop).toHaveBeenCalledTimes(1)
    })
    it('swallows errors silently', () => {
        start()
        activeCtx.createOscillator = () => {
            throw new Error('boom')
        }
        expect(() => triggerCorridorBloom()).not.toThrow()
    })
})

describe('trigger / play', () => {
    it('dispatches corridor-bloom to triggerCorridorBloom', () => {
        start()
        trigger('corridor-bloom')
        expect(activeCtx.nodes.length).toBe(5)
    })
    it('is a no-op for non-bloom names', () => {
        start()
        const before = activeCtx.nodes.length
        trigger('unknown')
        expect(activeCtx.nodes.length).toBe(before)
    })
    it('play is identical to trigger reference', () => {
        expect(play).toBe(trigger)
    })
})

describe('disposeAudio', () => {
    it('removes visibilitychange listener', () => {
        start()
        disposeAudio()
        expect(remSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })
    it('cancels rAF once and stops/disconnects nodes', () => {
        start()
        disposeAudio()
        expect(cancelSpy).toHaveBeenCalledTimes(1)
        expect(activeCtx.nodes[0].stop).toHaveBeenCalledTimes(1)
        activeCtx.nodes.forEach((n: any) => expect(n.disconnect).toHaveBeenCalledTimes(1))
    })
    it('closes audioCtx when not closed', () => {
        start()
        disposeAudio()
        expect(activeCtx!.close).toHaveBeenCalledTimes(1)
    })
    it('skips close when audioCtx is already closed', () => {
        start()
        activeCtx.state = 'closed'
        disposeAudio()
        expect(activeCtx!.close).not.toHaveBeenCalled()
    })
    it('is idempotent', () => {
        start()
        disposeAudio()
        disposeAudio()
        expect(cancelSpy).toHaveBeenCalledTimes(1)
    })
    it('resets audioState (isAudioMuted post-dispose is true)', () => {
        start()
        disposeAudio()
        expect(isAudioMuted()).toBe(true)
    })
})

describe('audio-scape — as unknown as cast lock-in (laneC-dsfree)', () => {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const src = readFileSync(resolve(__dirname, '../../src/lib/audio/audio-scape.ts'), 'utf-8')
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    it('no `as unknown as` casts remain in audio-scape.ts', () => {
        // The three boundary double-casts (window / camera / navState) were
        // replaced with typed single-cast or cast-free accessors (laneC-dsfree).
        const castMatches = stripped.match(/as\s+unknown\s+as\b/g) ?? []
        expect(castMatches.length).toBe(0)
    })

    it('window accessor uses the typed single-cast form', () => {
        expect(stripped).toMatch(/return window as WindowWithAudioContext\b/)
    })

    it('camera accessor is cast-free (returns the typed camera, null-guarded at call site)', () => {
        expect(stripped).toMatch(/function getCameraLike\(\): CameraLike \| null \{\s*return state\.camera\s*\}/)
    })

    it('navState accessor uses the typed single-cast form (NavState extension)', () => {
        expect(stripped).toMatch(/interface NavStateWithRoute extends NavState\s*\{/)
        expect(stripped).toMatch(/return state\.navState as NavStateWithRoute\b/)
    })
})
