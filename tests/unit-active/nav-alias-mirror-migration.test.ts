/**
 * @vitest-environment node
 *
 * Focused regression coverage for the nav alias/mirror hardening slice.
 *
 * Verifies the three high-severity call sites now route through canonical
 * helpers instead of the flat alias door (which wrote nested navState without
 * mirror notification):
 *   - main.ts proxy currentView   → setCurrentView   (canonical view transition)
 *   - compass-controller ENTER_INSIDE semanticDiveMode → writeNavStateMirror({trailDepth:2})
 *   - thread-settler setFocusedNode → setFocusedIndex (canonical focused-index write)
 *
 * These assert the INTENDED mirror/event behavior is preserved.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setFocusedNode } from '@lib/journey/thread-settler'
import {
    focusedIndex,
    setFocusedIndex,
    currentView,
    setCurrentView,
    resetNavState,
    writeNavStateMirror
} from '@lib/stores/navigation.svelte'
import { appState } from '@lib/state/app.svelte.ts'
import { subscribe, EVENTS } from '@lib/orchestration/event-bus'

describe('setFocusedNode routes through canonical focused-index writer', () => {
    beforeEach(() => {
        resetNavState()
    })

    it('mirrors focusedNode → navState.focusedIndex via setFocusedIndex', () => {
        setFocusedNode(7)
        // Alias getter + nested canonical field both observe the write.
        expect(focusedIndex()).toBe(7)
        expect(appState.navState.focusedIndex).toBe(7)
        expect(appState.focusedNode).toBe(7)
    })

    it('normalizes non-finite to null (preserves the alias setter contract)', () => {
        setFocusedNode(7)
        setFocusedNode(NaN)
        expect(focusedIndex()).toBe(null)
        expect(appState.focusedNode).toBe(null)
    })

    it('accepts null (de-selection path)', () => {
        setFocusedNode(7)
        setFocusedNode(null)
        expect(focusedIndex()).toBe(null)
        expect(appState.focusedNode).toBe(null)
    })

    it('delegates to the same writer as setFocusedIndex (no drift between paths)', () => {
        setFocusedIndex(11)
        expect(focusedIndex()).toBe(11)
        setFocusedNode(12)
        expect(focusedIndex()).toBe(12)
    })
})

describe('setCurrentView canonical view transition (main.ts proxy path)', () => {
    beforeEach(() => {
        resetNavState()
    })

    it('mirrors currentView into navState + appState alias', () => {
        expect(currentView()).toBe('galaxy') // INITIAL_NAV_STATE baseline
        setCurrentView('map')
        expect(currentView()).toBe('map')
        expect(appState.navState.currentView).toBe('map')
        expect(appState.currentView).toBe('map')
    })

    it('fires VIEW_CHANGED (mirror notification preserved)', () => {
        let firedView: string | null = null
        const unsub = subscribe(EVENTS.VIEW_CHANGED, (payload) => {
            firedView = (payload as { view?: string }).view ?? null
        })
        try {
            setCurrentView('map')
            expect(firedView).toBe('map')
        } finally {
            unsub()
        }
    })
})

describe('canonical trail-depth write drives semanticDiveMode (compass-controller ENTER_INSIDE path)', () => {
    beforeEach(() => {
        resetNavState()
    })

    it('writeNavStateMirror({ trailDepth: 2 }) sets the semanticDiveMode alias', () => {
        expect(appState.semanticDiveMode).toBe(false)
        // This is the canonical writer the ENTER_INSIDE dive now routes through
        // instead of the `appState.semanticDiveMode = true` alias door.
        writeNavStateMirror({ trailDepth: 2 })
        expect(appState.navState.trailDepth).toBe(2)
        expect(appState.semanticDiveMode).toBe(true)
    })

    it('semanticDiveMode is a pure alias over trailDepth===2 (no parallel state)', () => {
        setFocusedIndex(0)
        writeNavStateMirror({ trailDepth: 0 })
        expect(appState.semanticDiveMode).toBe(false)
        writeNavStateMirror({ trailDepth: 2 })
        expect(appState.semanticDiveMode).toBe(true)
    })
})
