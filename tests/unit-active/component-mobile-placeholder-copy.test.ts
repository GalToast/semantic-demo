/**
 * S5 (2026-08-19): mobile placeholder copy + capability probe unit guards.
 * - D2: the placeholder copy no longer promises the scene is desktop-only
 *   ("full 3D on desktop") — a tap loads the full scene on-device, so the
 *   copy says "tap to explore in 3D" / "Open in 3D".
 * - D1: `supportsCapableWebGL()` is the probe behind the (default-ON,
 *   opt-out via `VITE_S5_AUTO_ENTER_3D=0`) `VITE_S5_AUTO_ENTER_3D` flag.
 *   Tests inject a `ProbeEnv` seam — no global stubbing (happy-dom globals
 *   are non-redefinable in vitest here).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../../src/components/Placeholder2D.svelte'), 'utf8')

const { supportsCapableWebGL, S5_AUTO_ENTER_AFTER } = await import('../../src/lib/orchestration/responsive-renderer.ts')

const fakeCanvas = (gl: unknown) => ({ getContext: () => gl })
// Minimal hardware-like WebGL2 stub: enough surface for the probe's calls.
const fakeHardwareGl = {
    getExtension: () => ({ loseContext: () => undefined })
}

describe('Placeholder2D mobile copy (S5-D2)', () => {
    it('no longer promises the 3D is desktop-only anywhere in the file', () => {
        expect(SRC).not.toContain('full 3D on desktop')
        expect(SRC).not.toContain('Open full 3D experience')
    })

    it('tells mobile users the scene loads here', () => {
        expect(SRC).toContain('tap to explore in 3D')
        expect(SRC).toContain('Open in 3D')
        expect(SRC).not.toContain('open on desktop')
    })
})

describe('S5 capability probe (S5-D1)', () => {
    it('auto-enter flag is ON by default (opt-out; the capability probe is the gate)', () => {
        expect(S5_AUTO_ENTER_AFTER).toBe(true)
    })

    it('refuses when no window/document (SSR / test seam empty)', () => {
        expect(supportsCapableWebGL({})).toBe(false)
        expect(supportsCapableWebGL(undefined)).toBe(false)
    })

    it('refuses prefers-reduced-motion devices', () => {
        const env = {
            window: { innerWidth: 375 },
            document: { createElement: () => fakeCanvas(fakeHardwareGl) },
            matchMedia: () => ({ matches: true })
        }
        expect(supportsCapableWebGL(env)).toBe(false)
    })

    it('refuses a software/null WebGL2 context (failIfMajorPerformanceCaveat)', () => {
        const env = {
            window: { innerWidth: 375 },
            document: { createElement: () => fakeCanvas(null) },
            matchMedia: () => ({ matches: false })
        }
        expect(supportsCapableWebGL(env)).toBe(false)
    })

    it('accepts a hardware-backed WebGL2 context', () => {
        const env = {
            window: { innerWidth: 375 },
            document: { createElement: () => fakeCanvas(fakeHardwareGl) },
            matchMedia: () => ({ matches: false }),
            deviceMemory: 8,
            hardwareConcurrency: 8
        }
        expect(supportsCapableWebGL(env)).toBe(true)
    })

    it('refuses low-memory (< 4GB) devices even with a GL context', () => {
        const env = {
            window: { innerWidth: 375 },
            document: { createElement: () => fakeCanvas(fakeHardwareGl) },
            matchMedia: () => ({ matches: false }),
            deviceMemory: 2,
            hardwareConcurrency: 8
        }
        expect(supportsCapableWebGL(env)).toBe(false)
    })
})
