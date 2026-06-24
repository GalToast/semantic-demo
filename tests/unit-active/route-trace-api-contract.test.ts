/**
 * route-trace — public API contract test
 *
 * Locks in the public surface of src/lib/journey/route-trace.ts so
 * future tightening / refactor work doesn't accidentally rename
 * exported symbols (no public-API contract test existed before
 * W47-Bite-H preparation).
 *
 * Pattern mirrors tests/unit-active/focus-ui-api-contract.test.ts
 * and tests/unit-active/thread-settler-api-contract.test.ts.
 *
 * What this guards:
 *   - 6 function exports + 1 const export (refreshRouteTraceOverlay)
 *     are present
 *   - Public functions are callable in a Node test environment
 *     without throwing (the file imports three.js, so all rendering
 *     paths need early-outs for missing canvas/scene)
 *   - The debounced refreshRouteTraceOverlay is a function (currently
 *     the wrap uses `_refreshRouteTraceOverlayRaw as any` — a smell
 *     tracked in the type-system-smell-audit.md for Bite-H)
 */
import { describe, it, expect } from 'vitest'
import * as module from '../../src/lib/journey/route-trace'

describe('route-trace.ts public API contract', () => {
    // ── Function exports ──────────────────────────────────────────────

    const expectedFunctions = [
        'resetRouteTraceDiagnostics',
        'removeRouteTraceOverlay',
        'setRouteChoreographyPhase',
        'initRouteTraceSubscriptions',
        'updateRouteTraceOverlayPositions'
    ]

    expectedFunctions.forEach((name) => {
        it(`exports ${name} as a function`, () => {
            expect(typeof (module as unknown as Record<string, unknown>)[name]).toBe('function')
        })
    })

    // ── Debounced const export ────────────────────────────────────────

    it('exports refreshRouteTraceOverlay as a function (debounced wrapper)', () => {
        // L262: `export const refreshRouteTraceOverlay = debounceRAF(_refreshRouteTraceOverlayRaw as any)`
        // The debounceRAF wrap means refreshRouteTraceOverlay is a
        // function (callable). We don't call it because it would
        // schedule a real RAF request that the test environment
        // can't service — just check the typeof.
        expect(typeof module.refreshRouteTraceOverlay).toBe('function')
    })

    // ── Behavior locks ────────────────────────────────────────────────

    it('resetRouteTraceDiagnostics is void-returning (safe to call in Node)', () => {
        // With default reason 'inactive' or custom string.
        expect(() => module.resetRouteTraceDiagnostics()).not.toThrow()
        expect(() => module.resetRouteTraceDiagnostics('test-reason')).not.toThrow()
    })

    it('resetRouteTraceDiagnostics is idempotent', () => {
        expect(() => module.resetRouteTraceDiagnostics()).not.toThrow()
        expect(() => module.resetRouteTraceDiagnostics()).not.toThrow()
    })

    it('removeRouteTraceOverlay is void-returning (safe to call in Node)', () => {
        // Removes the overlay if present. In Node there's no Three.js
        // scene so the function exits early (no throw).
        expect(() => module.removeRouteTraceOverlay()).not.toThrow()
    })

    it('setRouteChoreographyPhase is void-returning (safe to call in Node)', () => {
        // Takes optional phase + details object. Both defaults work.
        expect(() => module.setRouteChoreographyPhase()).not.toThrow()
        expect(() => module.setRouteChoreographyPhase('overview')).not.toThrow()
        expect(() => module.setRouteChoreographyPhase('focused', { testDetail: 1 })).not.toThrow()
    })

    it('initRouteTraceSubscriptions is void-returning (safe to call in Node)', () => {
        // Subscribes to events; idempotent re-subscribe is allowed.
        // In Node the event bus may or may not exist — we just
        // check that calling doesn't throw.
        expect(() => module.initRouteTraceSubscriptions()).not.toThrow()
    })

    it('updateRouteTraceOverlayPositions accepts optional now parameter', () => {
        // Without argument: uses performance.now() (Node 16+ has it).
        // With explicit argument: uses the provided time.
        // Both should be safe to call without throwing.
        expect(() => module.updateRouteTraceOverlayPositions()).not.toThrow()
        expect(() => module.updateRouteTraceOverlayPositions(1000)).not.toThrow()
    })

    // ── Structure guard: route-trace.ts must NOT export any internal helpers ──

    it('does not export internal buildRouteTraceMaterial (not in public API)', () => {
        // buildRouteTraceMaterial is an internal helper (not exported).
        // If a future refactor accidentally exports it, this test
        // fails and forces review of whether it should be public.
        expect((module as unknown as Record<string, unknown>).buildRouteTraceMaterial).toBeUndefined()
    })
})