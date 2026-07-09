/**
 * trail-depth-single-source.test.ts — F3 drift fix regression
 *
 * Verifies that `appState.trailDepth` is a single source of truth that
 * proxies `appState.navState.trailDepth` (canonical), so the two can never
 * disagree — including through the `semanticDiveMode` setter, which previously
 * wrote only the canonical copy and relied on callers to re-sync the flat
 * mirror. The getter/setter follows the same alias pattern as `focusedNode`.
 *
 * This intentionally exercises the real AppState singleton at runtime (the
 * proxy instantiates it on first property access). That is safe in jsdom —
 * see canvas-keyboard-nav.test.ts, which writes `appState.navState.*` at
 * runtime without cascading.
 */

import { describe, it, expect } from 'vitest'
import { appState } from '@lib/state/app.svelte'

describe('trailDepth single-source-of-truth (F3 drift fix)', () => {
    it('semanticDiveMode setter keeps appState.trailDepth synced to navState.trailDepth', () => {
        const restore = appState.navState.trailDepth
        try {
            appState.semanticDiveMode = true
            expect(appState.trailDepth).toBe(2)
            expect(appState.navState.trailDepth).toBe(2)
            expect(appState.semanticDiveMode).toBe(true)

            appState.semanticDiveMode = false
            expect(appState.trailDepth).toBe(0)
            expect(appState.navState.trailDepth).toBe(0)
            expect(appState.semanticDiveMode).toBe(false)
        } finally {
            appState.trailDepth = restore
        }
    })

    it('appState.trailDepth getter/setter proxy navState.trailDepth (no drift)', () => {
        const restore = appState.navState.trailDepth
        try {
            // Write through the alias → canonical updates.
            appState.trailDepth = 5
            expect(appState.navState.trailDepth).toBe(5)
            expect(appState.trailDepth).toBe(5)

            // Write the canonical copy directly → alias reflects it immediately.
            appState.navState.trailDepth = 1
            expect(appState.trailDepth).toBe(1)
            expect(appState.navState.trailDepth).toBe(1)
        } finally {
            appState.trailDepth = restore
        }
    })
})
