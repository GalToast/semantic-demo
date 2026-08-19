/**
 * Regression test for the w12 journey bugsweep L1: the CompassRail map-step
 * and the Header chip map-step must converge on the same navState.mode.
 *
 * Background: CompassRail.handleAction() called selectMode() without the
 * setJourneyPhase context key that Header.svelte passes. selectMode('map')
 * dispatches SET_VIEW + SET_SURFACE('map'), and SET_SURFACE('map') derives
 * mode from `current.mode` (e.g. 'trail'), so the rail left navState.mode on
 * the pre-switch mode while the chip + keyboard paths forced 'overview' via
 * setJourneyPhase('map' → 'overview'). data-nav-mode therefore differed by
 * entry path.
 *
 * Fix shape: CompassRail now passes setJourneyPhase in its SelectModeContext,
 * exactly like Header.svelte. The two source files are asserted below
 * (source-contract style, same as global-shortcuts-journey-phase.test.ts),
 * plus a behavioral check that selectMode('map') with the phase funnel
 * records 'overview' — the value all three entry paths converge on.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { selectMode } from '@lib/components/header/mode-nav'

const SRC_DIR = resolve(import.meta.dirname, '../../src')
let railSrc: string
let headerSrc: string
beforeAll(() => {
    railSrc = readFileSync(resolve(SRC_DIR, 'components/CompassRail.svelte'), 'utf-8')
    headerSrc = readFileSync(resolve(SRC_DIR, 'components/Header.svelte'), 'utf-8')
})

describe('W12-L1 — CompassRail map-step converges with the Header chip map-step', () => {
    it('CompassRail imports setJourneyPhase from the journey store (like Header)', () => {
        expect(railSrc).toMatch(
            /import\s*\{[^}]*setJourneyPhase[^}]*\}\s*from\s*['"]@lib\/stores\/journey\.svelte(?:\.ts)?['"]/
        )
        expect(headerSrc).toMatch(
            /import\s*\{[^}]*setJourneyPhase[^}]*\}\s*from\s*['"]@lib\/stores\/journey\.svelte(?:\.ts)?['"]/
        )
    })

    it('the rail selectMode context includes setJourneyPhase — same context shape as Header', () => {
        const railCallIdx = railSrc.indexOf('applyModeSelect(phase as NavMode')
        expect(railCallIdx).toBeGreaterThan(-1)
        expect(railSrc.slice(railCallIdx, railCallIdx + 600)).toMatch(/setJourneyPhase,/)

        const headerCallIdx = headerSrc.indexOf('applyModeSelect(modeId')
        expect(headerCallIdx).toBeGreaterThan(-1)
        expect(headerSrc.slice(headerCallIdx, headerCallIdx + 600)).toMatch(/setJourneyPhase,/)
    })

    it('the rail Inside step enters the semantic dive after a successful mode select', () => {
        expect(railSrc).toContain("import { executeJourneyCompassAction } from '@lib/orchestration/compass-controller';")
        expect(railSrc).toContain("import { JOURNEY_ACTIONS } from '@lib/journey/compass-state';")

        const selectIdx = railSrc.indexOf('const selectedIndex = applyModeSelect(phase as NavMode')
        expect(selectIdx).toBeGreaterThan(-1)
        const actionIdx = railSrc.indexOf('executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE)', selectIdx)
        expect(actionIdx).toBeGreaterThan(selectIdx)

        const actionBlock = railSrc.slice(selectIdx, actionIdx + 100)
        expect(actionBlock).toContain("phase === 'inside'")
        expect(actionBlock).toContain('selectedIndex >= 0')
    })

    it('selectMode("map") with the phase funnel records phase "overview" (chip/rail/keyboard converge)', () => {
        const calls: string[] = []
        const phases: string[] = []
        const navActions = { RETURN_OVERVIEW: 'RET' as const, SET_VIEW: 'SETV' as const, SET_SURFACE: 'SETS' as const }
        const idx = selectMode('map', false, {
            navActions,
            dispatchNavTransition: (action, payload) => {
                calls.push(`${String(action)}${payload ? ':' + JSON.stringify(payload) : ''}`)
                return null
            },
            updateUrlState: () => {
                calls.push('URL')
            },
            debugWarn: () => {},
            setJourneyPhase: (phase) => {
                phases.push(phase)
            }
        })
        expect(idx).toBe(5)
        expect(calls).toEqual(['SETV:{"view":"map"}', 'SETS:{"surface":"map"}', 'URL'])
        // The phase funnel must fire for the map step: this is the write that
        // normalizes nav mode to 'overview' after SET_SURFACE('map') preserved
        // the pre-switch mode — identical for rail, chip, and keyboard paths.
        expect(phases).toEqual(['overview'])
    })
})
