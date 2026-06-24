/**
 * choreography.ts — start-race re-entrancy contract test
 *
 * Lock-in: ensures the W47 race fix on src/lib/demo/choreography.ts
 * does not regress. The race being prevented:
 *
 *   1. startMicroDemo() is called, claims _startGuardClaimed = true.
 *   2. App not ready, retry setTimeout is scheduled.
 *   3. setTimeout fires: in the BROKEN design it released the guard
 *      BEFORE calling startMicroDemo() recursively, opening a 1-2ms
 *      window where a UI click could grab the freed guard and start
 *      a parallel demo.
 *
 * The fix moves the guard to the public `startMicroDemo()` entry point
 * and has the retry's setTimeout call `_startMicroDemo()` directly,
 * bypassing the public guard check. The guard stays claimed across the
 * 150ms retry wait.
 *
 * What this guards (structural — runtime race detection in vitest is
 * fragile, so we lock the structural invariants):
 *   1. startMicroDemo() owns the re-entry guard (claims + checks it).
 *   2. _startMicroDemo() does NOT re-check the guard (no
 *      `if (_startGuardClaimed) return` inside it).
 *   3. The setTimeout callback calls `_startMicroDemo()` directly, NOT
 *      `startMicroDemo()`.
 *   4. The setTimeout callback does NOT release the guard.
 *   5. `runDemo(cancelMicroDemo)` is inside a try/catch.
 *   6. The success path releases the guard exactly once.
 *   7. A `_releaseStartGuard()` helper centralizes guard release for
 *      the 4 terminal exit paths.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { fileURLToPath } from 'node:url'
// @ts-ignore
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_PATH = resolve(__dirname, '../../src/lib/demo/choreography.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

// Extract the body of a function declaration: from `function NAME` (or
// `export function NAME` or `async function NAME`) up to its matching
// closing brace.
function extractFunctionBody(src: string, name: string): string {
    const re = new RegExp(`((?:async\\s+)?function\\s+${name}\\b[^{]*\\{)`, 'm')
    const m = re.exec(src)
    if (!m) throw new Error(`Could not find function ${name} in source`)
    const start = m.index + m[0].length
    let depth = 1
    let i = start
    while (i < src.length && depth > 0) {
        const c = src[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        i++
    }
    return src.slice(start, i - 1)
}

describe('choreography.ts — start-race re-entrancy contract (W47)', () => {
    const src = readSource()

    it('startMicroDemo owns the re-entry guard (claims + checks _startGuardClaimed)', () => {
        const body = extractFunctionBody(src, 'startMicroDemo')
        expect(body).toMatch(/if\s*\(\s*_startGuardClaimed\s*\)\s*return/)
        expect(body).toMatch(/_startGuardClaimed\s*=\s*true/)
    })

    it('startMicroDemo does NOT call _releaseStartGuard on early return (phase check exits before claim)', () => {
        // The phase check happens BEFORE the guard claim, so the early
        // return for non-IDLE phase doesn't need a release. Verify the
        // phase-check is positioned correctly.
        const body = extractFunctionBody(src, 'startMicroDemo')
        const phaseCheckIdx = body.search(/demoPhase\s*\(\s*\)/)
        const guardClaimIdx = body.search(/_startGuardClaimed\s*=\s*true/)
        expect(phaseCheckIdx, 'phase check not found').toBeGreaterThan(-1)
        expect(guardClaimIdx, 'guard claim not found').toBeGreaterThan(-1)
        expect(phaseCheckIdx).toBeLessThan(guardClaimIdx)
    })

    it('_startMicroDemo does NOT re-check the guard (public entry owns it)', () => {
        const body = extractFunctionBody(src, '_startMicroDemo')
        // The guard check is owned by startMicroDemo. _startMicroDemo
        // does the work and uses _releaseStartGuard for terminal exits.
        expect(body, 're-entry check must not live in _startMicroDemo').not.toMatch(
            /if\s*\(\s*_startGuardClaimed\s*\)\s*return/
        )
    })

    it('the setTimeout callback calls _startMicroDemo() directly, NOT startMicroDemo()', () => {
        // Strip the startMicroDemo body so we don't false-positive on the
        // public entry. The remaining code is _startMicroDemo.
        const startIdx = src.indexOf('async function _startMicroDemo')
        expect(startIdx, '_startMicroDemo not found').toBeGreaterThan(-1)
        const body = extractFunctionBody(src, '_startMicroDemo')

        // Find the setTimeout callback. Slice from window.setTimeout to
        // its matching }, 150) closer.
        const setTimeoutMatch = body.match(/window\.setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{/)
        expect(setTimeoutMatch, 'setTimeout not found in retry path').toBeTruthy()

        const cbStart = setTimeoutMatch!.index! + setTimeoutMatch![0].length
        let depth = 1
        let i = cbStart
        while (i < body.length && depth > 0) {
            const c = body[i]
            if (c === '{') depth++
            else if (c === '}') depth--
            i++
        }
        const callback = body.slice(cbStart, i - 1)

        // The callback should call _startMicroDemo directly (bypassing
        // the public guard check), not the public startMicroDemo.
        expect(callback, 'callback should call _startMicroDemo() directly').toMatch(/void\s+_startMicroDemo\s*\(\s*\)/)
        expect(callback, 'callback must NOT call the public startMicroDemo()').not.toMatch(/\bstartMicroDemo\s*\(\s*\)/)
    })

    it('the setTimeout callback does NOT release the guard (keeps it claimed across the 150ms wait)', () => {
        const body = extractFunctionBody(src, '_startMicroDemo')
        const setTimeoutMatch = body.match(/window\.setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{/)
        if (!setTimeoutMatch) return // setTimeout test already covers absence

        const cbStart = setTimeoutMatch!.index! + setTimeoutMatch![0].length
        let depth = 1
        let i = cbStart
        while (i < body.length && depth > 0) {
            const c = body[i]
            if (c === '{') depth++
            else if (c === '}') depth--
            i++
        }
        const callback = body.slice(cbStart, i - 1)

        // The fix: do NOT release the guard in the setTimeout. The guard
        // stays claimed until _startMicroDemo exits via a terminal path.
        expect(callback, 'callback must NOT release the guard').not.toMatch(
            /_startGuardClaimed\s*=\s*false|_releaseStartGuard\s*\(/
        )
    })

    it('runDemo(cancelMicroDemo) is wrapped in try/catch so a throw does not leak the guard', () => {
        const body = extractFunctionBody(src, '_startMicroDemo')
        // The runDemo call must be inside a try { ... } catch { ... } block.
        // We check the structure: there's a `try {` before `runDemo` and a
        // `catch` after it (before the terminal release).
        const runDemoIdx = body.indexOf('runDemo(cancelMicroDemo)')
        expect(runDemoIdx, 'runDemo call not found').toBeGreaterThan(-1)

        // Look for the nearest preceding `try {` and following `catch` or
        // `finally` block.
        const before = body.slice(0, runDemoIdx)
        const after = body.slice(runDemoIdx)

        // Find the last `try {` before runDemo
        const lastTryIdx = before.lastIndexOf('try {')
        expect(lastTryIdx, 'try { block not found before runDemo').toBeGreaterThan(-1)
        // And there should be a `catch` after runDemo within the same block
        const afterTryBlock = after.slice(0, 500) // the block should be small
        expect(afterTryBlock, 'catch block not found after runDemo').toMatch(/catch\s*\(/)
    })

    it('declares a _releaseStartGuard() helper that resets all guard/retry state', () => {
        const helper = extractFunctionBody(src, '_releaseStartGuard')
        expect(helper).toMatch(/_startGuardClaimed\s*=\s*false/)
        expect(helper).toMatch(/_startRetryDeadline\s*=\s*0/)
        expect(helper).toMatch(/_clearRetryTimer\s*\(/)
    })

    it('all 4 terminal exit paths in _startMicroDemo call _releaseStartGuard()', () => {
        // The 4 terminal paths:
        //   1. sessionStorage raw (already seen) early return
        //   2. !guardNotSeen() early return
        //   3. out-of-retries terminal (notifyDemoUnableToStart + release)
        //   4. no-node terminal
        //   5. success path (after runDemo)
        // Each must call _releaseStartGuard() exactly once.
        const body = extractFunctionBody(src, '_startMicroDemo')
        const releaseCount = (body.match(/_releaseStartGuard\s*\(\s*\)/g) ?? []).length
        expect(releaseCount, 'expected 4-5 _releaseStartGuard() calls').toBeGreaterThanOrEqual(4)
        expect(releaseCount, 'expected at most 5 _releaseStartGuard() calls').toBeLessThanOrEqual(5)
    })

    it('success path releases the guard exactly once after runDemo', () => {
        const body = extractFunctionBody(src, '_startMicroDemo')
        // The last statement in the function should be _releaseStartGuard()
        // (or near the end, after the try/catch around runDemo).
        const trimmed = body.trimEnd()
        // Walk backwards over whitespace and a single closing brace
        const tail = trimmed.replace(/}\s*$/, '').trimEnd()
        expect(tail, 'success path should end with _releaseStartGuard()').toMatch(
            /_releaseStartGuard\s*\(\s*\)\s*;?\s*$/
        )
    })

    it('no inline `_startGuardClaimed = false` remains (replaced by _releaseStartGuard)', () => {
        // A future contributor who reaches for a quick `_startGuardClaimed = false`
        // in a new exit path will fail this test, prompting them to use the
        // helper instead (which also clears the retry timer and deadline).
        const body = extractFunctionBody(src, '_startMicroDemo')
        const inline = body.match(/_startGuardClaimed\s*=\s*false/g)
        expect(inline, 'inline guard release in _startMicroDemo').toBeNull()
    })
})
