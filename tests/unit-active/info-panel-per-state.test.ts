/**
 * info-panel-per-state.test.ts
 *
 * Tests for Ticket UI-5: Info Panel content per panelSurface state.
 * Verifies that the InfoPanel component adapts its content based on
 * the body[data-panel-surface] attribute.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const INFO_PANEL_PATH = resolve(__dirname, '../../src/components/InfoPanel.svelte')
const HELPER_PATH = resolve(__dirname, '../../src/lib/orchestration/info-panel-state.ts')

describe('Info Panel per-state content', () => {
    let infoPanelSource: string
    let helperSource: string

    beforeAll(() => {
        infoPanelSource = readFileSync(INFO_PANEL_PATH, 'utf-8')
        helperSource = readFileSync(HELPER_PATH, 'utf-8')
    })

    it('InfoPanel imports the info-panel-state helper', () => {
        expect(infoPanelSource).toContain("from '@lib/orchestration/info-panel-state'")
    })

    it('InfoPanel uses getInfoPanelContent to derive content descriptor', () => {
        expect(infoPanelSource).toContain('getInfoPanelContent')
        expect(infoPanelSource).toContain('contentDescriptor')
    })

    it('InfoPanel renders dynamic header text from contentDescriptor', () => {
        // Should NOT have a hardcoded "Business Details" in the template
        // (it's now driven by contentDescriptor.headerText)
        expect(infoPanelSource).toContain('contentDescriptor.headerText')
        // Should have the conditional header rendering
        expect(infoPanelSource).toContain('contentDescriptor.headerVisible')
    })

    it('InfoPanel renders dynamic empty state copy from contentDescriptor', () => {
        expect(infoPanelSource).toContain('contentDescriptor.emptyHeadline')
        expect(infoPanelSource).toContain('contentDescriptor.emptySubtext')
    })

    it('InfoPanel uses contentDescriptor.selectionSuppressed', () => {
        expect(infoPanelSource).toContain('contentDescriptor.selectionSuppressed')
    })

    it('info-panel-state helper defines content for idle surface', () => {
        expect(helperSource).toContain('idle:')
        expect(helperSource).toContain("headerText: 'Business Details'")
        expect(helperSource).toContain('headerVisible: true')
    })

    it('info-panel-state helper defines content for focus surface', () => {
        expect(helperSource).toContain('focus:')
        expect(helperSource).toContain("headerText: 'Business Details'")
    })

    it('info-panel-state helper defines content for search surface with hidden header', () => {
        expect(helperSource).toContain('search:')
        expect(helperSource).toContain('headerVisible: false')
        expect(helperSource).toContain('selectionSuppressed: true')
    })

    it('info-panel-state helper defines content for semantic-dive surface', () => {
        expect(helperSource).toContain("'semantic-dive':")
        expect(helperSource).toContain("headerText: 'Semantic Dive'")
    })

    it('info-panel-state helper hides panel for map surfaces', () => {
        expect(helperSource).toContain('MAP_SURFACES')
        expect(helperSource).toContain("'map-idle'")
        expect(helperSource).toContain("'map-focus'")
        expect(helperSource).toContain("'map-search'")
        expect(helperSource).toContain('panelVisible: false')
    })

    it('info-panel-state helper exports all required functions', () => {
        expect(helperSource).toContain('export function getInfoPanelContent')
        expect(helperSource).toContain('export function getInfoPanelHeaderText')
        expect(helperSource).toContain('export function isInfoHeaderVisible')
        expect(helperSource).toContain('export function isSelectionSuppressed')
        expect(helperSource).toContain('export function isInfoPanelVisible')
        expect(helperSource).toContain('export function getEmptyHeadline')
        expect(helperSource).toContain('export function getEmptySubtext')
    })

    it('info-panel-state helper has InfoPanelContentDescriptor interface', () => {
        expect(helperSource).toContain('export interface InfoPanelContentDescriptor')
        expect(helperSource).toContain('headerText: string')
        expect(helperSource).toContain('headerVisible: boolean')
        expect(helperSource).toContain('emptyHeadline: string')
        expect(helperSource).toContain('emptySubtext: string')
        expect(helperSource).toContain('panelVisible: boolean')
        expect(helperSource).toContain('selectionSuppressed: boolean')
    })

    it('InfoPanel conditionally renders header based on contentDescriptor.headerVisible', () => {
        // Should have {#if contentDescriptor.headerVisible} block
        expect(infoPanelSource).toMatch(/\{#if contentDescriptor\.headerVisible\}/)
    })

    // Regression: previously, surfaces like 'inside', 'thread-inspect', and 'trail'
    // fell through to the FALLBACK_DESCRIPTOR (which is the 'idle' search-first
    // panel). The InfoPanel silently showed search-first idle content when users
    // entered deep-dive, thread inspection, or trail modes. Each of these surfaces
    // must now have its own contextually appropriate descriptor in the helper.
    it('info-panel-state helper has a content descriptor for the inside surface (regression: was idle fallback)', () => {
        // Must have a 'inside' key in CONTENT_BY_SURFACE, not just the FALLBACK.
        expect(helperSource).toMatch(/'inside':\s*\{/)
    })

    it('info-panel-state helper has a content descriptor for the thread-inspect surface (regression: was idle fallback)', () => {
        expect(helperSource).toMatch(/'thread-inspect':\s*\{/)
    })

    it('info-panel-state helper has a content descriptor for the trail surface (regression: was idle fallback)', () => {
        expect(helperSource).toMatch(/'trail':\s*\{/)
    })

    it('info-panel-state helper has content descriptors for transition states (walking/arriving/settling)', () => {
        expect(helperSource).toMatch(/\bwalking:\s*\{/)
        expect(helperSource).toMatch(/\barriving:\s*\{/)
        expect(helperSource).toMatch(/\bsettling:\s*\{/)
    })

    // W48 mock-fallback regression contract.
    // The previous InfoPanel.svelte had a 'Test fallback' branch that returned
    // hardcoded 'Downtown Coffee Collective' / '(936) 555-0123' data when
    // !getIsDataReady() OR records.length === 0. If the data load ever failed
    // AND the user had a focused index, they would see fake business info
    // presented as real — a trust-destroying UX bug.
    //
    // The fix routes the data-not-ready path through the existing empty-state
    // copy (COPY.selectedEmptyName etc.) by returning null from selectedRecord.
    // These tests lock that in: any future contributor who re-introduces a
    // hardcoded mock in InfoPanel.svelte will fail this contract.
    describe('W48: no hardcoded mock business in InfoPanel', () => {
        it('does not contain the placeholder business name "Downtown Coffee Collective"', () => {
            expect(infoPanelSource, 'hardcoded "Downtown Coffee Collective" mock must not be re-introduced').not.toContain('Downtown Coffee Collective')
        })

        it('does not contain the placeholder phone "(936) 555-0123"', () => {
            expect(infoPanelSource, 'hardcoded "(936) 555-0123" mock must not be re-introduced').not.toContain('555-0123')
        })

        it('does not contain the placeholder domain "downtowncoffee.example"', () => {
            expect(infoPanelSource, 'hardcoded mock domain must not be re-introduced').not.toContain('downtowncoffee.example')
        })

        it('does not cast "as unknown as BusinessRecord" (no escape hatch for a fake BusinessRecord)', () => {
            // The mock required this cast because BusinessRecord has required
            // fields (id, category, zip, geocoded) that the fake object
            // didn't provide. With the mock removed, the cast should not
            // appear in InfoPanel.svelte.
            expect(
                infoPanelSource,
                'InfoPanel must not use "as unknown as BusinessRecord" casts'
            ).not.toMatch(/as\s+unknown\s+as\s+BusinessRecord/)
        })

        it('routes data-not-ready state through selectedRecord=null (not a mock object)', () => {
            // The fix: when data isn't ready, return null so the viewModel
            // falls through to the empty-state copy path. The previous
            // version returned a hardcoded object literal here.
            // We verify the function returns null (not an object literal) by
            // checking the structure around the !getIsDataReady() guard.
            const guardIdx = infoPanelSource.indexOf('!getIsDataReady()')
            expect(guardIdx, '!getIsDataReady() guard must exist').toBeGreaterThan(-1)
            // Within ~400 chars after the guard, we should see "return null"
            // (or a path that returns null), not an object literal.
            const window = infoPanelSource.slice(guardIdx, guardIdx + 600)
            expect(window, 'data-not-ready path must return null, not a mock object').toMatch(/return\s+null/)
            expect(window, 'data-not-ready path must not return an object literal').not.toMatch(/return\s*\{[^}]*name:/)
        })
    })
})
