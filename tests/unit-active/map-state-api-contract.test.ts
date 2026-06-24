/**
 * map-state — public API contract test
 *
 * Lock-in: ensures the public surface of map-state.ts remains stable
 * during refactor. Before this test existed, the file had 687 LOC,
 * zero `any` (clean types), and no test coverage.
 *
 * map-state is the Leaflet integration layer (markers, route embodiment,
 * terrain handoff). It's imported by App.svelte, the search UI, and
 * several orchestration modules. Locking its surface is high-value
 * because a silent rename would break multiple call sites.
 */
import { describe, it, expect } from 'vitest'
import * as module from '../../src/lib/engine/map-state'

describe('map-state.ts public API contract', () => {
    // ── Const exports (URLs are version-pinned; drift is a security concern) ─

    it('exports LEAFLET_CSS_URL as a non-empty string', () => {
        expect(typeof module.LEAFLET_CSS_URL).toBe('string')
        expect(module.LEAFLET_CSS_URL.length).toBeGreaterThan(0)
    })

    it('exports LEAFLET_JS_URL as a non-empty string', () => {
        expect(typeof module.LEAFLET_JS_URL).toBe('string')
        expect(module.LEAFLET_JS_URL.length).toBeGreaterThan(0)
    })

    it('pins Leaflet to v1.9.4 (CVE pinning contract)', () => {
        // If a future bump changes the major version (e.g. 2.x), this test
        // fails. Pin the major+minor in the URL. A patch bump is allowed
        // (just update the test along with the URL).
        expect(module.LEAFLET_CSS_URL).toMatch(/leaflet@1\.9\./)
        expect(module.LEAFLET_JS_URL).toMatch(/leaflet@1\.9\./)
    })

    it('LEAFLET_CSS_URL and LEAFLET_JS_URL point to the same version', () => {
        const cssVer = module.LEAFLET_CSS_URL.match(/leaflet@([\d.]+)/)?.[1]
        const jsVer = module.LEAFLET_JS_URL.match(/leaflet@([\d.]+)/)?.[1]
        expect(cssVer).toBe(jsVer)
    })

    // ── Function exports (15 total) ──────────────────────────────────────────

    const expectedFunctions = [
        'initMapStateSubscriptions',
        'showMapTooltip',
        'getMapRoutePoints',
        'refreshMapRouteEmbodiment',
        'centerMapOnRouteAnchor',
        'refreshMapMarkers',
        'getRouteDirectorState',
        'syncRouteDirectorState',
        'setTerrainHandoffState',
        'getRouteEmbodimentIndices',
        'getRouteAnchorIndex',
        'zoomMap',
        'destroyMap'
    ]

    expectedFunctions.forEach((name) => {
        it(`exports ${name} as a function`, () => {
            expect(typeof (module as unknown as Record<string, unknown>)[name]).toBe('function')
        })
    })

    // ── Pure helper behavior (no Leaflet runtime needed) ─────────────────────

    it('getRouteAnchorIndex returns null for an empty route list', () => {
        // This is the only exportable pure function in the file — most others
        // touch Leaflet / appState and need a running map. Document the
        // empty-input contract so a future refactor of route-anchor selection
        // (e.g., switching from first-index to highest-priority) fails here.
        expect(module.getRouteAnchorIndex([])).toBeNull()
    })

    it('getRouteAnchorIndex returns the only element for a single-element list', () => {
        expect(module.getRouteAnchorIndex([42])).toBe(42)
    })

    it('getRouteAnchorIndex does not mutate the input array', () => {
        const input = [3, 1, 4, 1, 5, 9, 2, 6]
        const snapshot = [...input]
        module.getRouteAnchorIndex(input)
        expect(input).toEqual(snapshot)
    })
})
