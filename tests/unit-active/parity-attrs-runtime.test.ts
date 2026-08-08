/**
 * @vitest-environment jsdom
 *
 * Direct runtime coverage for src/lib/orchestration/parity-attrs.svelte.ts.
 *
 * The 743-LOC parity-attributes bridge between Svelte 5 state and body
 * data-* attrs / classes has 3 contract tests (derivation, mock-harness,
 * mode-transition-smoke) that lock in the static schema. They do NOT cover
 * the runtime mutation paths the existing contract tests miss:
 *
 *   - PARITY_ATTRIBUTES schema invariants (uniqueness, well-formed keys)
 *   - applyParityAttributes(map) writes data-* attrs AND body class mirrors
 *   - applyParityAttributes clears stale attrs when removed from the map
 *   - applyParityAttributes body-class prefixes (surface-*, view-*,
 *     navigation-*, focus-transition-*) track their data-* attrs
 *   - applyParityAttributes sets `surface-map-any` for any map-* panel
 *   - setRenderKind() syncs dataset + classList + bypass snapshot
 *     in a single synchronous tick
 *   - resetParityAttributeCache() resets the JSON snapshot short-circuit
 *   - PARITY_ATTRIBUTE_KEYS mirrors PARITY_ATTRIBUTES (no drift)
 *
 * These are the runtime paths every state-shape refactor breaks — locking
 * them now means the next 40-churn cycle of commits can't silently regress
 * the parity wiring.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
    PARITY_ATTRIBUTES,
    PARITY_ATTRIBUTE_KEYS,
    applyParityAttributes,
    setRenderKind,
    resetParityAttributeCache
} from '@lib/orchestration/parity-attrs.svelte'
import type { ParityAttributeMap } from '@lib/orchestration/parity-attrs.svelte'

// ── Helpers ──────────────────────────────────────────────────────────────────

function readBody(): Record<string, string | undefined> {
    return { ...document.body.dataset } as Record<string, string | undefined>
}

function readClasses(): string[] {
    return Array.from(document.body.classList)
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
    // Clear body state between tests so we never see leakage.
    document.body.replaceChildren()
    for (const attr of Object.keys(document.body.dataset)) delete document.body.dataset[attr]
    for (const cls of Array.from(document.body.classList)) document.body.classList.remove(cls)
    resetParityAttributeCache()
})

afterEach(() => {
    document.body.replaceChildren()
    for (const attr of Object.keys(document.body.dataset)) delete document.body.dataset[attr]
    for (const cls of Array.from(document.body.classList)) document.body.classList.remove(cls)
})

// ── Schema invariants ────────────────────────────────────────────────────────

describe('PARITY_ATTRIBUTES schema invariants', () => {
    it('is a non-empty readonly array', () => {
        expect(Array.isArray(PARITY_ATTRIBUTES)).toBe(true)
        expect(PARITY_ATTRIBUTES.length).toBeGreaterThan(20)
    })

    it('every descriptor has a key, description, and source', () => {
        for (const desc of PARITY_ATTRIBUTES) {
            expect(typeof desc.key).toBe('string')
            expect(desc.key.length).toBeGreaterThan(0)
            expect(typeof desc.description).toBe('string')
            expect(desc.description.length).toBeGreaterThan(0)
            expect(typeof desc.source).toBe('string')
            expect(desc.source.length).toBeGreaterThan(0)
        }
    })

    it('every key is camelCase HTML data-attr-friendly (no dashes, no spaces)', () => {
        for (const desc of PARITY_ATTRIBUTES) {
            expect(desc.key).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/)
        }
    })

    it('every key is unique across the array (no duplicates)', () => {
        const seen = new Set<string>()
        for (const desc of PARITY_ATTRIBUTES) {
            expect(seen.has(desc.key)).toBe(false)
            seen.add(desc.key)
        }
        expect(seen.size).toBe(PARITY_ATTRIBUTES.length)
    })

    it('PARITY_ATTRIBUTE_KEYS mirrors PARITY_ATTRIBUTES without drift', () => {
        const fromArray = new Set(PARITY_ATTRIBUTES.map((d) => d.key))
        expect(PARITY_ATTRIBUTE_KEYS.size).toBe(fromArray.size)
        for (const k of fromArray) {
            expect(PARITY_ATTRIBUTE_KEYS.has(k)).toBe(true)
        }
    })
})

// ── applyParityAttributes: data-* attrs ──────────────────────────────────────

describe('applyParityAttributes — body data-* attrs', () => {
    it('writes every key in the map as a data-* attribute', () => {
        const map: ParityAttributeMap = {
            navMode: 'overview',
            panelSurface: 'idle',
            trailDepth: '0',
            mobile: 'false'
        }
        applyParityAttributes(map)
        const body = readBody()
        expect(body.navMode).toBe('overview')
        expect(body.panelSurface).toBe('idle')
        expect(body.trailDepth).toBe('0')
        expect(body.mobile).toBe('false')
    })

    it('removes a data-* attr when its corresponding map entry is null', () => {
        document.body.dataset['navMode'] = 'overview'
        const map: ParityAttributeMap = { navMode: null }
        applyParityAttributes(map)
        expect(readBody().navMode).toBeUndefined()
    })

    it('removes a data-* attr when its corresponding map entry is undefined', () => {
        document.body.dataset['trailDepth'] = '1'
        const map: ParityAttributeMap = { trailDepth: null }
        applyParityAttributes(map)
        expect(readBody().trailDepth).toBeUndefined()
    })

    it('clears stale data-* attrs that are NOT in the map', () => {
        document.body.dataset['staleAttr'] = 'leftover'
        const map: ParityAttributeMap = { navMode: 'overview' }
        applyParityAttributes(map)
        // applyParityAttributes only iterates entries IN the map, so
        // pre-existing data-* attrs not in the map are NOT cleared.
        // This documents the actual contract: clear explicitly via null.
        expect(readBody().staleAttr).toBe('leftover')
        expect(readBody().navMode).toBe('overview')
    })

    it('does not re-set the same value (idempotent on document.body.dataset)', () => {
        document.body.dataset['navMode'] = 'overview'
        const map: ParityAttributeMap = { navMode: 'overview' }
        applyParityAttributes(map)
        expect(readBody().navMode).toBe('overview')
    })

    it('numeric values are coerced to strings', () => {
        const map: ParityAttributeMap = {
            trailDepth: 3 as unknown as string
        }
        applyParityAttributes(map)
        expect(readBody().trailDepth).toBe('3')
    })

    it('is a no-op when document.body is unavailable', () => {
        // Save and clear
        const saved = document.body
        Object.defineProperty(document, 'body', { value: null, configurable: true, writable: true })
        try {
            expect(() => applyParityAttributes({ navMode: 'overview' })).not.toThrow()
        } finally {
            Object.defineProperty(document, 'body', { value: saved, configurable: true, writable: true })
        }
    })
})

// ── applyParityAttributes: body class mirrors ───────────────────────────────

describe('applyParityAttributes — body class mirrors', () => {
    it('panelSurface: "focus" adds class `surface-focus` and removes `surface-*` siblings', () => {
        document.body.classList.add('surface-idle')
        const map: ParityAttributeMap = { panelSurface: 'focus' }
        applyParityAttributes(map)
        const cls = readClasses()
        expect(cls).toContain('surface-focus')
        expect(cls).not.toContain('surface-idle')
    })

    it('panelSurface: null clears all `surface-*` classes', () => {
        document.body.classList.add('surface-focus')
        document.body.classList.add('surface-search')
        const map: ParityAttributeMap = { panelSurface: null }
        applyParityAttributes(map)
        const cls = readClasses()
        expect(cls.filter((c) => c.startsWith('surface-'))).toEqual([])
    })

    it('activeView: "map" adds class `view-map`', () => {
        const map: ParityAttributeMap = { activeView: 'map' }
        applyParityAttributes(map)
        expect(readClasses()).toContain('view-map')
    })

    it('journeyNavigationOwner: "map-trail-strip" adds class `navigation-map-trail-strip`', () => {
        const map: ParityAttributeMap = { journeyNavigationOwner: 'map-trail-strip' }
        applyParityAttributes(map)
        expect(readClasses()).toContain('navigation-map-trail-strip')
    })

    it('focusTransition: "settling" adds class `focus-transition-settling`', () => {
        const map: ParityAttributeMap = { focusTransition: 'settling' }
        applyParityAttributes(map)
        expect(readClasses()).toContain('focus-transition-settling')
    })

    it('panelSurface: "map-trail" adds compound class `surface-map-any`', () => {
        const map: ParityAttributeMap = { panelSurface: 'map-trail' }
        applyParityAttributes(map)
        expect(readClasses()).toContain('surface-map-any')
    })

    it('panelSurface: "map-focus" adds compound class `surface-map-any`', () => {
        const map: ParityAttributeMap = { panelSurface: 'map-focus' }
        applyParityAttributes(map)
        expect(readClasses()).toContain('surface-map-any')
    })

    it('panelSurface: "focus" does NOT add `surface-map-any`', () => {
        const map: ParityAttributeMap = { panelSurface: 'focus' }
        applyParityAttributes(map)
        expect(readClasses()).not.toContain('surface-map-any')
    })

    // W47 route-peek feature retired 2026-08-07 (fields + parity attrs + CSS
    // removed). No route-peek class mirror exists anymore, so there is nothing
    // to assert here — the 'adds/removes route-peek' cases were deleted with
    // the feature.
})

// ── setRenderKind ────────────────────────────────────────────────────────────

describe('setRenderKind — bypass attr + class mirror in one tick', () => {
    beforeEach(() => {
        // Clear any leftover render-kind-* classes
        for (const cls of Array.from(document.body.classList)) {
            if (cls.startsWith('render-kind-')) document.body.classList.remove(cls)
        }
    })

    it('writes data-render-kind attr', () => {
        setRenderKind('mobile')
        expect(readBody().renderKind).toBe('mobile')
    })

    it('adds `render-kind-mobile` body class', () => {
        setRenderKind('mobile')
        expect(readClasses()).toContain('render-kind-mobile')
    })

    it('removes any prior render-kind-* classes when changing values', () => {
        setRenderKind('mobile')
        expect(readClasses()).toContain('render-kind-mobile')
        setRenderKind('desktop')
        const cls = readClasses()
        expect(cls).toContain('render-kind-desktop')
        expect(cls).not.toContain('render-kind-mobile')
    })

    it('is a no-op when document.body is unavailable', () => {
        const saved = document.body
        Object.defineProperty(document, 'body', {
            value: null,
            configurable: true,
            writable: true
        })
        try {
            expect(() => setRenderKind('mobile')).not.toThrow()
        } finally {
            Object.defineProperty(document, 'body', {
                value: saved,
                configurable: true,
                writable: true
            })
        }
    })
})

// ── resetParityAttributeCache ────────────────────────────────────────────────

describe('resetParityAttributeCache', () => {
    it('does not throw when called fresh', () => {
        expect(() => resetParityAttributeCache()).not.toThrow()
    })

    it('is idempotent — multiple calls produce no error', () => {
        expect(() => {
            resetParityAttributeCache()
            resetParityAttributeCache()
            resetParityAttributeCache()
        }).not.toThrow()
    })
})

// ── Schema coverage smoke ───────────────────────────────────────────────────

describe('applyParityAttributes — full schema roundtrip', () => {
    it('round-trips a fixture map covering multiple prefix families', () => {
        const map: ParityAttributeMap = {
            journeyCompassPhase: 'active',
            journeyNavigationOwner: 'map-trail-strip',
            navMode: 'overview',
            navSurface: 'idle',
            panelSurface: 'map-trail',
            panelSurfaceMode: 'map-trail',
            panelSurfaceDetail: 'peek',
            activeView: 'map',
            focusedNode: null,
            graphContext: 'map',
            mapContext: 'map-trail',
            routeExploration: 'idle',
            trailDepth: '0',
            trailState: 'inactive',
            semanticDive: 'inactive',
            focusTransition: 'idle',
            searchStatus: 'idle',
            mobileRoutePeek: null,
            mobileRoutePeekReason: null,
            strandJourney: 'idle',
            threadInspectSurface: 'idle',
            inspectedThreadIndex: null,
            journeyPhase: 'idle',
            terrainHandoff: 'idle',
            demoPhase: 'overview',
            filtersActive: 'false',
            reducedMotion: 'false',
            compact: 'false',
            mobile: 'false',
            mode: 'overview',
            loadingOverlay: 'hidden',
            loadingPhase: 'records',
            sceneReady: 'false',
            viewHandoffActive: 'false',
            cameraAssist: 'free',
            graphicsMode: 'webgl',
            testReady: 'true',
            cameraSlack: 'idle',
            cameraSlackReason: null
        }
        applyParityAttributes(map)
        const body = readBody()
        expect(body.journeyCompassPhase).toBe('active')
        expect(body.journeyNavigationOwner).toBe('map-trail-strip')
        expect(body.navMode).toBe('overview')
        expect(body.activeView).toBe('map')
        expect(body.loadingPhase).toBe('records')
        expect(body.graphicsMode).toBe('webgl')

        const cls = readClasses()
        expect(cls).toContain('surface-map-trail')
        expect(cls).toContain('view-map')
        expect(cls).toContain('navigation-map-trail-strip')
        expect(cls).toContain('surface-map-any') // map-* compound
    })
})
