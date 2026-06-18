import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC_PATH = resolve(__dirname, '../../src/lib/engine/three-engine.ts')

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
        const body = animateSource()
        const clearIndex = body.indexOf('_rafId = null')
        const circuitBreakerIndex = body.indexOf('if (_circuitBreakerTripped)')
        const scheduleIndex = body.indexOf('_rafId = requestAnimationFrame(animate)')

        expect(clearIndex).toBeGreaterThanOrEqual(0)
        expect(clearIndex).toBeLessThan(circuitBreakerIndex)
        expect(scheduleIndex).toBeGreaterThan(circuitBreakerIndex)
    })

    it('does not bail from inside animate just because the current callback had an id', () => {
        expect(animateSource()).not.toContain('if (_rafId !== null) return')
    })
})
