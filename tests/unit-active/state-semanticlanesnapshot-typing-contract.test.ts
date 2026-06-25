/**
 * @file state-semanticlanesnapshot-typing-contract.test.ts
 *
 * Lock-in test for the engine-boundary refactor Phase 2-3: semanticLaneSnapshot
 * field tightening. Ensures the appState.semanticLaneSnapshot field is typed
 * `LaneHealthPayload | null` (not `unknown`), and that consumers no longer
 * use `(appState.semanticLaneSnapshot as any)` escape hatches.
 *
 * LaneHealthPayload already exists in src/lib/orchestration/semantic-lane.ts
 * with a [key: string]: unknown index signature for back-compat. Phase 2-3
 * re-exports it from state-types.ts so appState can declare the field's shape.
 *
 * Run: npx vitest run tests/unit-active/state-semanticlanesnapshot-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('engine-boundary refactor / Phase 2-3 / semanticLaneSnapshot field typing', () => {
    it('appState declares semanticLaneSnapshot with LaneHealthPayload | null', () => {
        const appState = readSource('src/lib/state/app.svelte.ts')
        const declMatch = appState.match(/semanticLaneSnapshot\s*=\s*\$state<([^>]+)>\(/)
        expect(declMatch, 'appState.semanticLaneSnapshot declaration not found').not.toBeNull()
        const declaredType = declMatch![1]
        const normalized = declaredType.replace(/\s+/g, ' ').trim()
        expect(
            normalized,
            `appState.semanticLaneSnapshot declared as "${declaredType}" — must be LaneHealthPayload | null`
        ).toBe('LaneHealthPayload | null')
        expect(declaredType).not.toMatch(/^unknown$/)
    })

    it('state-types.ts re-exports LaneHealthPayload from semantic-lane', () => {
        const stateTypes = readSource('src/lib/state/state-types.ts')
        expect(stateTypes).toMatch(
            /export\s+type\s*\{[^}]*\bLaneHealthPayload\b[^}]*\}\s+from\s+['"][^'"]*semantic-lane['"]/
        )
    })

    it('LaneHealthPayload interface has expected fields + index signature', () => {
        const semanticLane = readSource('src/lib/orchestration/semantic-lane.ts')
        // The interface declaration must exist and have the key fields
        expect(semanticLane).toMatch(/export\s+interface\s+LaneHealthPayload\b/)
        expect(semanticLane).toMatch(/interface\s+LaneHealthPayload\s*\{[\s\S]*state\?\s*:\s*string/)
        expect(semanticLane).toMatch(/interface\s+LaneHealthPayload\s*\{[\s\S]*query\?\s*:\s*string/)
        expect(semanticLane).toMatch(/interface\s+LaneHealthPayload\s*\{[\s\S]*\[key:\s*string\]:\s*unknown/)
    })

    it('compass-state.ts drops (appState.semanticLaneSnapshot as any) escape hatch', () => {
        const compassState = readSource('src/lib/journey/compass-state.ts')
        // The escape hatch pattern must be gone
        expect(compassState).not.toMatch(/\(appState\.semanticLaneSnapshot\s+as\s+any\)/)
        // W47-B discovery feature was removed (the dead feature never shipped).
        // compass-state.ts no longer references semanticLaneSnapshot at all —
        // the idle-note cache block that used it is gone. The typed-access
        // assertion is no longer needed: there's nothing left to type-check.
        expect(
            compassState,
            'compass-state.ts should no longer reference semanticLaneSnapshot after discovery removal'
        ).not.toMatch(/semanticLaneSnapshot/)
    })

    it('focus-ui.ts drops (appState.semanticLaneSnapshot as any) escape hatch', () => {
        const focusUi = readSource('src/lib/journey/focus-ui.ts')
        expect(focusUi).not.toMatch(/\(appState\.semanticLaneSnapshot\s+as\s+any\)/)
        // Both query accesses should be typed now
        expect(focusUi).toMatch(/appState\.semanticLaneSnapshot\?\.query/)
    })

    it('recordSemanticLaneSnapshot() in semantic-lane.ts still produces LaneHealthPayload', () => {
        const semanticLane = readSource('src/lib/orchestration/semantic-lane.ts')
        // The function must still exist and return LaneHealthPayload
        expect(semanticLane).toMatch(/export\s+function\s+recordSemanticLaneSnapshot[\s\S]*:\s*LaneHealthPayload/)
        // The body must assign a LaneHealthPayload-shaped object (query, state, etc. supported)
        expect(semanticLane).toMatch(/state\.semanticLaneSnapshot\s*=\s*\{/)
    })
})
