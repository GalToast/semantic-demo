/**
 * Bug #3 (2026-08-24/25) regression pin — compass header must re-derive on
 * nav-driven phase transitions.
 *
 * Root cause being guarded: JourneyCompass.svelte's refresh $effect replaced
 * its navStore subscription with a bare `void navState` (which reads NO
 * properties, so Svelte 5 fine-grained tracking subscribed to nothing) and
 * did not track the parity feeds either. Mode/surface transitions like
 * galaxy Inside entry notify neither journeyStore nor focusStore, so the
 * compass kicker/title/node kept the previous phase's copy ("Trail | …"
 * persisting into Inside) while data-phase updated via parity.
 *
 * Contract: the refresh effect must (a) subscribe navStore, and
 * (b) read tracked parity keys (journeyPhase / panelSurface) so nav-driven
 * phase flips re-run getJourneyCompassState().
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(
    resolve(import.meta.dirname, '../../src/components/JourneyCompass.svelte'),
    'utf8'
)

describe('JourneyCompass compass refresh wiring (bug #3 regression)', () => {
    it('refresh effect still subscribes to navStore', () => {
        expect(src).toMatch(/const\s+unsubNav\s*=\s*navStore\.subscribe/)
    })

    it('refresh effect tracks parity phase/surface keys (auto-tracked deps)', () => {
        expect(src).toMatch(/void\s+parityMap\.journeyPhase/)
        expect(src).toMatch(/void\s+parityMap\.panelSurface/)
    })

    it('effect cleanup unsubscribes the nav subscription', () => {
        expect(src).toMatch(/unsubNav\(\)/)
    })
})
