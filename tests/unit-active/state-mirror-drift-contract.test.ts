/**
 * state-mirror-drift-contract.test.ts — Runtime mirror-drift contract test
 *
 * Detects latent drift between parallel state mirrors in AppState:
 *   - appState.trailDepth (flat getter/setter alias) ↔ appState.navState.trailDepth
 *   - appState.currentView (flat) ↔ appState.navState.currentView
 *   - appState.focusedNode (getter/setter) ↔ appState.navState.focusedIndex
 *   - appState.semanticDiveMode (derived) ↔ appState.navState.trailDepth
 *   - journeyStore().trailDepth / journeyStore().depth ↔ appState.navState.trailDepth
 *
 * After each mutation, assertMirrors() verifies ALL checked pairs agree.
 * A failing assertion is the valuable deliverable — it exposes the exact
 * field + writer + observed left/right that drifted.
 *
 * Pattern: mirrors trail-depth-single-source.test.ts and
 * canvas-keyboard-nav.test.ts (direct runtime appState access, no mocks).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { appState } from '@lib/state/app.svelte'
import { writeNavStateMirror, updateNavState } from '@lib/stores/navigation.svelte'
import { journeyStore } from '@lib/stores/journey.svelte'

// ── Snapshot initial values for afterEach restoration ────────────────────────

const initial = {
    trailDepth: appState.navState.trailDepth,
    currentView: appState.currentView,
    focusedIndex: appState.navState.focusedIndex,
    semanticDiveMode: appState.semanticDiveMode,
    journeyTrailDepth: journeyStore().trailDepth
}

afterEach(() => {
    // Restore all mutated state to initial values so we don't pollute other tests.
    appState.trailDepth = initial.trailDepth
    appState.currentView = initial.currentView as 'galaxy'
    appState.focusedNode = initial.focusedIndex
    // journeyStore is read-only from the outside (computeFromAppState), but
    // writeNavStateMirror writes appState.navState which journeyStore mirrors.
    writeNavStateMirror({
        currentView: initial.currentView as 'galaxy',
        focusedIndex: initial.focusedIndex
    })
})

// ── Helper ───────────────────────────────────────────────────────────────────

interface MirrorDisagreement {
    field: string
    writer: string
    left: unknown
    right: unknown
}

function assertMirrors(label: string): MirrorDisagreement[] {
    const disagreements: MirrorDisagreement[] = []

    // 1. trailDepth flat ↔ navState.trailDepth
    const flatTd = appState.trailDepth
    const navTd = appState.navState.trailDepth
    if (flatTd !== navTd) {
        disagreements.push({
            field: 'trailDepth',
            writer: label,
            left: flatTd,
            right: navTd
        })
    }

    // 2. currentView flat ↔ navState.currentView
    const flatCv = appState.currentView
    const navCv = appState.navState.currentView
    if (flatCv !== navCv) {
        disagreements.push({
            field: 'currentView',
            writer: label,
            left: flatCv,
            right: navCv
        })
    }

    // 3. focusedNode (getter) ↔ navState.focusedIndex
    const flatFn = appState.focusedNode
    const navFi = appState.navState.focusedIndex
    if (flatFn !== navFi) {
        disagreements.push({
            field: 'focusedNode ↔ focusedIndex',
            writer: label,
            left: flatFn,
            right: navFi
        })
    }

    // 4. semanticDiveMode ↔ (navState.trailDepth === 2)
    const sdm = appState.semanticDiveMode
    const sdmExpected = navTd === 2
    if (sdm !== sdmExpected) {
        disagreements.push({
            field: 'semanticDiveMode ↔ (trailDepth === 2)',
            writer: label,
            left: sdm,
            right: sdmExpected
        })
    }

    // 5. journeyStore().trailDepth ↔ navState.trailDepth
    const jTd = journeyStore().trailDepth
    if (jTd !== navTd) {
        disagreements.push({
            field: 'journeyStore().trailDepth',
            writer: label,
            left: jTd,
            right: navTd
        })
    }

    // 6. journeyStore().depth ↔ navState.trailDepth (alias within journey)
    const jDepth = journeyStore().depth
    if (jDepth !== navTd) {
        disagreements.push({
            field: 'journeyStore().depth',
            writer: label,
            left: jDepth,
            right: navTd
        })
    }

    return disagreements
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('state-mirror-drift contract', () => {
    it('semanticDiveMode = true → all mirrors agree', () => {
        appState.semanticDiveMode = true
        const d = assertMirrors('semanticDiveMode = true')
        expect(d).toEqual([])
    })

    it('semanticDiveMode = false → all mirrors agree', () => {
        appState.semanticDiveMode = true
        appState.semanticDiveMode = false
        const d = assertMirrors('semanticDiveMode = false')
        expect(d).toEqual([])
    })

    it('writeNavStateMirror({ trailDepth:3, currentView:"map", ... }) → mirrors agree', () => {
        writeNavStateMirror({
            trailDepth: 3,
            currentView: 'map',
            mode: 'trail',
            surface: 'focus'
        })
        const d = assertMirrors('writeNavStateMirror(trailDepth=3, currentView=map)')
        expect(d).toEqual([])
    })

    it('writeNavStateMirror({ currentView: "map" }) → flat currentView mirrors navState (KEY PATH)', () => {
        // writeNavStateMirror only syncs appState.currentView when the new
        // value is 'galaxy' or 'map'. This is the KEY DRIFT TEST: setting
        // currentView to a valid view through the mirror should keep both
        // copies in sync.
        writeNavStateMirror({ currentView: 'map' })
        const d = assertMirrors('writeNavStateMirror(currentView=map)')
        expect(d).toEqual([])
    })

    it('updateNavState({ trailDepth:1, currentView:"galaxy" }) → mirrors agree', () => {
        updateNavState({ trailDepth: 1, currentView: 'galaxy' })
        const d = assertMirrors('updateNavState(trailDepth=1, currentView=galaxy)')
        expect(d).toEqual([])
    })

    it('appState.trailDepth = 4 → mirrors agree', () => {
        appState.trailDepth = 4
        const d = assertMirrors('appState.trailDepth = 4')
        expect(d).toEqual([])
    })

    it('appState.currentView = "map" → mirrors agree', () => {
        appState.currentView = 'map'
        const d = assertMirrors('appState.currentView = map')
        expect(d).toEqual([])
    })

    it('appState.currentView = "galaxy" → mirrors agree', () => {
        // Direct flat write — should propagate to navState.currentView via the setter.
        appState.currentView = 'galaxy'
        const d = assertMirrors('appState.currentView = galaxy')
        expect(d).toEqual([])
    })

    it('journeyStore.update() → all mirrors agree', () => {
        // The journey store's update() calls withJourneyNotify which bridges
        // back to appState.navState via writeNavStateMirror.
        journeyStore.update((s) => ({ ...s, depth: 2, trailDepth: 2 }))
        const d = assertMirrors('journeyStore.update(depth=2)')
        expect(d).toEqual([])
    })
})
