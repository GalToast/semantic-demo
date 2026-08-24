/**
 * s5-capability-gate-matrix.test.ts — P8 hardware-acceptance Layer 1.
 *
 * Exhaustive decision-matrix for supportsCapableWebGL(), the gate behind the
 * S5 auto-enter-3D mobile posture. Real handsets vary in exactly the inputs
 * this gate reads (GPU class, deviceMemory, cores, reduced-motion), so the
 * full cross-product is pinned here via the ProbeEnv seam instead of being
 * validated only on whatever device happens to run the suite.
 *
 * Canvas factory variants simulate GPU classes:
 *   - 'capable'     : hardware webgl2 honors failIfMajorPerformanceCaveat
 *   - 'swiftshader' : software renderer — returns null when the caveat flag
 *                     is set (mirrors failIfMajorPerformanceCaveat behavior)
 *   - 'no-webgl2'   : context creation always fails
 *   - 'throwing'    : getContext throws (driver crash path)
 */
import { describe, expect, it } from 'vitest'
import { supportsCapableWebGL, type ProbeEnv } from '@lib/orchestration/responsive-renderer'

type CtxFactory = (type: string, ctxOpts: Record<string, unknown>) => unknown

function makeCtxFactory(kind: 'capable' | 'swiftshader' | 'no-webgl2' | 'throwing'): {
    factory: CtxFactory
    seenOpts: Record<string, unknown>[]
    lostContexts: number
} {
    const seenOpts: Record<string, unknown>[] = []
    const lostContexts = { count: 0 }
    const factory: CtxFactory = (_type, ctxOpts) => {
        seenOpts.push({ ...ctxOpts })
        if (kind === 'throwing') throw new Error('driver exploded')
        if (kind === 'no-webgl2') return null
        if (kind === 'swiftshader' && ctxOpts.failIfMajorPerformanceCaveat === true) return null
        return {
            getExtension(name: string) {
                if (name === 'WEBGL_lose_context') {
                    return {
                        loseContext() {
                            lostContexts.count += 1
                        }
                    }
                }
                return null
            }
        }
    }
    return { factory, seenOpts, lostContexts }
}

interface EnvOverrides {
    innerWidth?: number
    reducedMotion?: boolean
    deviceMemory?: number
    hardwareConcurrency?: number
    canvas?: 'capable' | 'swiftshader' | 'no-webgl2' | 'throwing'
}

function makeEnv(o: EnvOverrides = {}): { env: ProbeEnv; probe: ReturnType<typeof makeCtxFactory> } {
    const probe = makeCtxFactory(o.canvas ?? 'capable')
    const env: ProbeEnv = {
        window: { innerWidth: o.innerWidth ?? 390 },
        document: { createElement: () => ({ getContext: probe.factory }) as unknown as HTMLCanvasElement },
        matchMedia: (q: string) => ({ matches: o.reducedMotion === true && q.includes('reduce') }),
        ...(o.deviceMemory !== undefined ? { deviceMemory: o.deviceMemory } : {}),
        ...(o.hardwareConcurrency !== undefined ? { hardwareConcurrency: o.hardwareConcurrency } : {})
    }
    return { env, probe }
}

describe('P8 layer-1: supportsCapableWebGL decision matrix', () => {
    it('capable mid/high-tier phone profile (4GB+, 4+ cores) passes', () => {
        const { env } = makeEnv({ deviceMemory: 4, hardwareConcurrency: 4 })
        expect(supportsCapableWebGL(env)).toBe(true)
    })

    it('high-tier phone profile passes with generous hints', () => {
        const { env } = makeEnv({ deviceMemory: 8, hardwareConcurrency: 8 })
        expect(supportsCapableWebGL(env)).toBe(true)
    })

    it('low-memory phone (< 4GB deviceMemory) falls back', () => {
        const { env } = makeEnv({ deviceMemory: 2, hardwareConcurrency: 8 })
        expect(supportsCapableWebGL(env)).toBe(false)
    })

    it('few-cores phone (< 4 cores) falls back', () => {
        const { env } = makeEnv({ deviceMemory: 8, hardwareConcurrency: 2 })
        expect(supportsCapableWebGL(env)).toBe(false)
    })

    it('missing hints do NOT disqualify (older iOS reports neither)', () => {
        const { env } = makeEnv({})
        expect(supportsCapableWebGL(env)).toBe(true)
    })

    it('prefers-reduced-motion falls back even on capable hardware', () => {
        const { env } = makeEnv({ deviceMemory: 8, hardwareConcurrency: 8, reducedMotion: true })
        expect(supportsCapableWebGL(env)).toBe(false)
    })

    it('SwiftShader-class software GL falls back via performance caveat', () => {
        const { env, probe } = makeEnv({
            deviceMemory: 8,
            hardwareConcurrency: 8,
            canvas: 'swiftshader'
        })
        expect(supportsCapableWebGL(env)).toBe(false)
        // The caveat contract: the probe must REQUEST failIfMajorPerformanceCaveat
        expect(probe.seenOpts[0]?.failIfMajorPerformanceCaveat).toBe(true)
    })

    it('no-webgl2 at all falls back (ancient/blocked GPU)', () => {
        const { env } = makeEnv({ deviceMemory: 8, hardwareConcurrency: 8, canvas: 'no-webgl2' })
        expect(supportsCapableWebGL(env)).toBe(false)
    })

    it('throwing getContext falls back instead of crashing cold boot', () => {
        const { env } = makeEnv({ deviceMemory: 8, hardwareConcurrency: 8, canvas: 'throwing' })
        expect(supportsCapableWebGL(env)).toBe(false)
    })

    it('probe cleans up its WebGL context (WEBGL_lose_context)', () => {
        const { env, probe } = makeEnv({ deviceMemory: 8, hardwareConcurrency: 8 })
        expect(supportsCapableWebGL(env)).toBe(true)
        expect(probe.lostContexts.count).toBe(1)
    })

    it('caveat option is ALWAYS requested — contract against silent software-GL acceptance', () => {
        for (const canvas of ['capable', 'swiftshader', 'no-webgl2'] as const) {
            const { env, probe } = makeEnv({ canvas })
            supportsCapableWebGL(env)
            expect(probe.seenOpts.at(-1)?.failIfMajorPerformanceCaveat).toBe(true)
        }
    })
})
