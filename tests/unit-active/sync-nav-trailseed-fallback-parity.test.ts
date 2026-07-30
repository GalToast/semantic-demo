/**
 * @vitest-environment node
 *
 * F1 regression guard — trailSeedIndex parity across the legacy→Svelte nav mirror.
 *
 * Bug (fixed 2026-07-29, read side): in `syncSvelteNavFromLegacy`
 * (window-actions.ts), the `writeNavStateMirror` block preserved trailSeedIndex
 * via `asFiniteNumber(navState.trailSeedIndex) ?? cur.trailSeedIndex` but the
 * `journeyStore.update` block CLOBBERED it with the bare
 * `asFiniteNumber(navState.trailSeedIndex)` (no `?? state.trailSeedIndex`).
 * Because `asFiniteNumber` returns null when the field is missing, the missing
 * fallback silently reset the journey-side trailSeedIndex to null on every
 * syncSvelteNavFromLegacy call when legacy navState lacked trailSeedIndex.
 *
 * Bug (fixed 2026-07-30, write side — W58 F1): the `CAMERA_NODE_FOCUSED`
 * subscriber in triggers.ts wrote focusedIndex/mode/surface/trailDepth to
 * writeNavStateMirror but OMITTED trailSeedIndex, while the parallel
 * SEARCH_FOCUS_REQUESTED subscriber wrote `trailSeedIndex: focusIndex`. So a
 * canvas-click focus left navState.trailSeedIndex stale until setTrailFromSeed
 * fired via setTimeout(0); any syncSvelteNavFromLegacy in that window propagated
 * the stale value to the Svelte store.
 *
 * This static contract test guards BOTH sides so the inconsistency cannot
 * silently return. (A runtime test would require exporting non-exported loaders
 * just for testability — not worth it for a one-line pattern fix; the static
 * guard directly protects the fixed pattern.)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve('src/lib/orchestration/window-actions.ts')
const source = readFileSync(SRC, 'utf-8')

const TRIGGERS_SRC = resolve('src/lib/orchestration/triggers.ts')
const triggersSource = readFileSync(TRIGGERS_SRC, 'utf-8')

describe('F1 read-side: trailSeedIndex fallback parity in syncSvelteNavFromLegacy', () => {
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

describe('F1 write-side: CAMERA_NODE_FOCUSED handler writes trailSeedIndex', () => {
    // The canvas-click focus path (CAMERA_NODE_FOCUSED subscriber) must write
    // trailSeedIndex alongside focusedIndex/mode/surface/trailDepth, mirroring
    // the SEARCH_FOCUS_REQUESTED subscriber. Anchor on EVENTS.* (unique to the
    // subscribe call, not comments) and slice to the next subscribeKeyed.
    const extractBlock = (anchor: string): string => {
        const start = triggersSource.indexOf(anchor)
        expect(start).toBeGreaterThan(-1)
        const next = triggersSource.indexOf('subscribeKeyed', start + 1)
        return next > -1 ? triggersSource.slice(start, next) : triggersSource.slice(start)
    }

    it('CAMERA_NODE_FOCUSED writeNavStateMirror includes trailSeedIndex: index', () => {
        const block = extractBlock('EVENTS.CAMERA_NODE_FOCUSED')
        expect(block).toMatch(/trailSeedIndex:\s*index/)
    })

    it('SEARCH_FOCUS_REQUESTED writeNavStateMirror includes trailSeedIndex: focusIndex (parity anchor)', () => {
        const block = extractBlock('EVENTS.SEARCH_FOCUS_REQUESTED')
        expect(block).toMatch(/trailSeedIndex:\s*focusIndex/)
    })
})