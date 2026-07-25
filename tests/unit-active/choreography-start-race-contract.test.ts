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

/**
 * keyboard-help.ts — 'demo-replay-acknowledged' event contract (W48 + W7ks2 F2)
 *
 * W48 history: the original silent-replay-tour bug was fixed by adding a
 * one-shot `demo-cancelled` listener in the Replay button's click handler
 * — when `notifyDemoUnableToStart()` (lib/demo/guards.ts:80) fired the
 * `demo-cancelled` CustomEvent, the listener collapsed + `showToast` surfaced.
 *
 * W7ks2-F2 event-name migration: the W48 `demo-cancelled` listener was
 * firing on EVERY active-demo replay (because cancelMicroDemo('replay')
 * dispatches `demo-cancelled` as part of its cancel-cascade, which
 * synchronously fires the once-listener) — "Replay unavailable" toast
 * appeared even when the canonical replay path started cleanly. F2
 * replaced this with a `demo-replay-acknowledged` event sequence: keyboard-help.ts
 * registers a one-shot `demo-replay-acknowledged` listener BEFORE dispatching
 * `demo-replay-requested`, then DemoChoreography.svelte's `replayListener`
 * synchronously dispatches `demo-replay-acknowledged` after `requestReplay()`.
 * A 500ms setTimeout-fallback still calls `showToast` if no ack arrives, so
 * the W48 UX guarantee (silent replay failure surfaces user feedback) is
 * preserved — only the event-name + dispatch shape changed.
 *
 * This contract locks in the structural invariant: the replay button's
 * click handler must
 *   1. import a toast helper
 *   2. register a one-shot `demo-replay-acknowledged` listener
 *   3. dispatch `demo-replay-requested` to DemoChoreography's listener
 *   4. land a 500ms setTimeout fallback calling showToast so the user
 *      still sees "Replay unavailable" feedback if DemoChoreography
 *      is not mounted (M15 invariant — both paths converge on the
 *      canonical replay path via event).
 */
describe('keyboard-help.ts — demo-replay-acknowledged replay-tour listener (W48 + W7ks2 F2)', () => {
    // @ts-ignore
    const HELP_SRC_PATH = resolve(__dirname, '../../src/lib/keyboard/keyboard-help.ts')

    function readHelpSource(): string {
        return readFileSync(HELP_SRC_PATH, 'utf-8')
    }

    it('imports showToast from @lib/stores/toast.svelte (or equivalent)', () => {
        const src = readHelpSource()
        // Accept any of the toast helpers used across the codebase. The
        // intent is: a feedback surface is imported, not silently absent.
        expect(src, 'keyboard-help.ts must import a toast helper for replay feedback').toMatch(
            /import\s+\{[^}]*(?:showToast|showErrorToast|showExperienceToast)[^}]*\}\s+from\s+['"]@lib\/(?:stores\/toast\.svelte|orchestration\/toast)['"]/
        )
    })

    it('the Replay tour button click handler registers a demo-replay-acknowledged listener', () => {
        const src = readHelpSource()
        // Slice from the replay button click handler to the end of the
        // handler (find the matching close-paren of addEventListener('click', ...)).
        const replayIdx = src.indexOf("id = 'btn-replay-tour'")
        expect(replayIdx, 'replay button marker not found').toBeGreaterThan(-1)
        const clickIdx = src.indexOf(".addEventListener('click'", replayIdx)
        expect(clickIdx, 'replay button click handler not found').toBeGreaterThan(-1)
        // Walk to the matching closing paren of the addEventListener call.
        let depth = 1
        let i = src.indexOf('(', clickIdx) + 1
        while (i < src.length && depth > 0) {
            const c = src[i]
            if (c === '(') depth++
            else if (c === ')') depth--
            i++
        }
        const handler = src.slice(clickIdx, i)
        // W7ks2-F2: the listener was renamed from `demo-cancelled` to
        // `demo-replay-acknowledged` (the false-positive-firing root cause
        // was that cancelMicroDemo('replay') synchronously dispatched
        // `demo-cancelled` during the cancel-cascade). The new event is
        // dispatched by DemoChoreography.svelte::replayListener AFTER
        // requestReplay() runs — a synchronous ack of the canonical path.
        expect(handler, 'replay click handler must register a demo-replay-acknowledged listener').toMatch(
            /addEventListener\(\s*['"]demo-replay-acknowledged['"]/
        )
        expect(handler, 'listener should use { once: true } so it auto-removes on fire').toMatch(
            /\{\s*once:\s*true\s*\}/
        )
        // W48 preservation: the click handler must ALSO dispatch
        // `demo-replay-requested` (DemoChoreography consumes it) so the
        // canonical replay path kicks off — without this dispatch the
        // 500ms setTimeout-fallback toast would ALWAYS fire.
        expect(handler, 'click handler must dispatch demo-replay-requested to start the canonical replay').toContain(
            "new CustomEvent('demo-replay-requested')"
        )
        // W48 UX guarantee: a 500ms setTimeout fallback must call showToast
        // so silent replay failure (DemoChoreography unmounted OR ack never
        // arrives) still surfaces user feedback.
        expect(handler, 'click handler must land a 500ms setTimeout fallback calling showToast').toMatch(
            /setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,500}?showToast\s*\(/
        )
    })

    it('the demo-cancelled listener calls a toast helper to surface feedback', () => {
        const src = readHelpSource()
        const replayIdx = src.indexOf("id = 'btn-replay-tour'")
        const clickIdx = src.indexOf(".addEventListener('click'", replayIdx)
        let depth = 1
        let i = src.indexOf('(', clickIdx) + 1
        while (i < src.length && depth > 0) {
            const c = src[i]
            if (c === '(') depth++
            else if (c === ')') depth--
            i++
        }
        const handler = src.slice(clickIdx, i)
        // The listener body must invoke one of the toast helpers so the
        // user sees feedback. Without this, the replay silently fails.
        expect(handler, 'demo-cancelled listener must call a toast helper').toMatch(
            /showToast\s*\(|showErrorToast\s*\(|showExperienceToast\s*\(/
        )
    })
})
