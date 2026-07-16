/**
 * ui-friendly-copy.test.ts — Lock in user-friendly copy for the UI surfaces
 * touched by the UI-hardening pass (W48 / UI sweep):
 *   - DemoChoreography.svelte (welcome/demo tour copy)
 *   - LoadingOverlay.svelte (aria-label)
 *   - Legend.svelte (tooltip title)
 *
 * Per docs/ux-copy-rules.md, the words semantic / cluster / signal / thread /
 * node / mycelium must never appear in strings a user sees. This test locks
 * the friendly wording (same source-inspection pattern as
 * thread-lens-friendly-copy.test.ts) so a revert can't silently reintroduce
 * jargon. We assert the old jargon strings are GONE and the new friendly
 * strings are PRESENT — a focused regression lock-in rather than a noisy
 * blanket scan, because .svelte files legitimately contain those words in
 * import paths and storage keys (not user-visible copy).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const FILES = [
    resolve(__dirname, '../../src/components/DemoChoreography.svelte'),
    resolve(__dirname, '../../src/components/LoadingOverlay.svelte'),
    resolve(__dirname, '../../src/components/Legend.svelte')
]

function readAll(): string {
    return FILES.map((f) => readFileSync(f, 'utf8')).join('\n')
}

describe('UI friendly copy (UI-hardening pass)', () => {
    const src = readAll()

    it('locks the friendly demo/tour copy', () => {
        // New friendly phrasings present
        expect(src).toContain("'Follow the trail back to its source…'")
        expect(src).toContain("'…or dive into a whole kind of business.'")
        // Old jargon gone
        expect(src).not.toContain('Follow a thread to its source')
        expect(src).not.toContain('dive inside a whole cluster')
    })

    it('locks the friendly loading aria-label', () => {
        expect(src).toContain("aria-label={isError ? 'Loading failed' : 'Loading…'}")
        expect(src).not.toContain('Loading semantic explorer')
    })

    it('locks the friendly legend tooltip', () => {
        expect(src).toContain('The 12 categories are color-coded in the legend.')
        expect(src).not.toContain('The 12 clusters are color-coded')
    })
})
