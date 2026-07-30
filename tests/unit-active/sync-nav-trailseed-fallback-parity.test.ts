/**
 * @vitest-environment node
 *
 * F1 regression guard — trailSeedIndex fallback parity in syncSvelteNavFromLegacy.
 *
 * Bug (fixed 2026-07-29): in `syncSvelteNavFromLegacy` (window-actions.ts), the
 * `writeNavStateMirror` block preserved trailSeedIndex via
 *   `asFiniteNumber(navState.trailSeedIndex) ?? cur.trailSeedIndex`
 * but the `journeyStore.update` block CLOBBERED it with
 *   `asFiniteNumber(navState.trailSeedIndex)`  (no `?? state.trailSeedIndex`).
 * Because `asFiniteNumber` returns null when the field is missing, the missing
 * fallback silently reset the journey-side trailSeedIndex to null on every
 * syncSvelteNavFromLegacy call when legacy navState lacked trailSeedIndex.
 *
 * This static contract test asserts the fallback is present in BOTH blocks so
 * the inconsistency cannot silently return. (A runtime test would require
 * exporting the non-exported `legacyModules` loader just for testability — not
 * worth it for a one-line pattern fix; the static guard directly protects the
 * fixed pattern.)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve('src/lib/orchestration/window-actions.ts')
const source = readFileSync(SRC, 'utf-8')

describe('F1: trailSeedIndex fallback parity in syncSvelteNavFromLegacy', () => {
    it('writeNavStateMirror block preserves trailSeedIndex (?? cur.trailSeedIndex)', () => {
        // The navStore mirror line must keep its preservation fallback.
        expect(source).toMatch(
            /trailSeedIndex:\s*asFiniteNumber\(navState\.trailSeedIndex\)\s*\?\?\s*cur\.trailSeedIndex/
        )
    })

    it('journeyStore.update block preserves trailSeedIndex (?? state.trailSeedIndex)', () => {
        // The journeyStore mirror line must ALSO preserve — this is the F1 fix.
        // It must NOT be the bare clobber form (no `?? state.trailSeedIndex`).
        expect(source).toMatch(
            /trailSeedIndex:\s*asFiniteNumber\(navState\.trailSeedIndex\)\s*\?\?\s*state\.trailSeedIndex/
        )
        // Guard against the old buggy bare form returning.
        expect(source).not.toMatch(/trailSeedIndex:\s*asFiniteNumber\(navState\.trailSeedIndex\),/)
    })
})
