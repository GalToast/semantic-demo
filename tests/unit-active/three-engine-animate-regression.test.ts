import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// animate() moved from src/lib/engine/three-engine.ts to
// src/lib/engine/three-engine-core.ts during the W47 submodule split
// (commit ae4770aa·family). three-engine.ts is now a barrel re-export
// and no longer contains the function source. The two tests below guard
// the same animate() body via its real source path.
const SRC_PATH = resolve(__dirname, '../../src/lib/engine/three-engine-core.ts')

function animateSource() {
    const src = readFileSync(SRC_PATH, 'utf8')
    const start = src.indexOf('export function animate()')
    const nextExport = src.indexOf('\nexport function ', start + 1)
    const end = nextExport === -1 ? src.length : nextExport

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    return src.slice(start, end)
}

describe('three-engine animate RAF bookkeeping', () => {
    it('clears consumed RAF id before guard returns so the loop can reschedule', () => {
        const src = readFileSync(SRC_PATH, 'utf8')
        const body = animateSource()

        // W49 refactor: `_rafId`/`_circuitBreakerTripped` module locals were
        // lifted onto `engineState` (engineState.rafId / engineState.circuitBreakerTripped)
        // and the rescheduling call moved into scheduleNextAnimationFrame().
        // The guard intent is unchanged: clear the RAF id at the top of every
        // callback (before the circuit-breaker early return) so the loop can
        // be rescheduled, and ensure a reschedule path still exists.
        const clearIndex = body.indexOf('engineState.rafId = null')
        const circuitBreakerIndex = body.indexOf('engineState.circuitBreakerTripped')

        // The rescheduling call was refactored into scheduleNextAnimationFrame
        const scheduleIndexInFile = src.indexOf('scheduleNextAnimationFrame(')

        expect(clearIndex).toBeGreaterThanOrEqual(0)
        expect(clearIndex).toBeLessThan(circuitBreakerIndex)
        expect(scheduleIndexInFile).toBeGreaterThan(0)
    })

    it('does not bail from inside animate just because the current callback had an id', () => {
        // Guard against reintroducing the old `_rafId !== null` early-bail
        // (either the pre-W49 module-local form or the lifted engineState form).
        expect(animateSource()).not.toContain('if (_rafId !== null) return')
        expect(animateSource()).not.toContain('if (engineState.rafId !== null) return')
    })
})
