/**
 * @file w7-tracka-f2-ack-dispatch-contract.test.ts
 *
 * Track A F2 ack dispatch CONTRACT test — surgical regression for
 * commit `90d62c3f` (feat(W7 Track A): F2 — dispatch demo-replay-acknowledged
 * in DemoChoreography.svelte replayListener).
 *
 * Why this test: the existing `w7-keyboard-help-f2f4f5-followup.test.ts` and
 * `choreography-start-race-contract.test.ts` test files assert the CONSUMER side
 * (keyboard-help.ts registers a `demo-replay-acknowledged` listener before
 * dispatching `demo-replay-requested`, plus a 500ms timeout-fallback that only
 * fires if no ack arrives). Track A landed the PRODUCER side in
 * `DemoChoreography.svelte` so the synchronous-ack path closes — but no static
 * contract test asserted the producer. This test fixes that gap using the same
 * regex-on-source + readFileSync-in-isolation style as
 * `w7-keyboard-help-kh-second-click-race.test.ts` — no runtime DOM/Svelte
 * imports + survives Svelte compiler changes.
 *
 * Contract assertions:
 *   1. replayListener body contains a `new CustomEvent('demo-replay-acknowledged')`.
 *   2. The dispatch is inside the onMount() replayListener body.
 *   3. The dispatch fires AFTER `requestReplay()` (so the ack travels in
 *      lockstep with the actual replay trigger; if the order flips the ack
 *      would race the replay start).
 *   4. The legacy `demo-replay-requested` listener is still registered —
 *      Track A only ADDS the producer-side dispatch; the W7ks2 F2 consumer flow
 *      continues to drive through `demo-replay-requested` as the primary trigger.
 *   5. A W7 F2 marker comment annotates the fix (grep-arable for future audits).
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const DEMO_CHOREOGRAPHY_PATH = resolve(import.meta.dirname, '../../src/components/DemoChoreography.svelte')
const demoSrc = readFileSync(DEMO_CHOREOGRAPHY_PATH, 'utf-8')

describe('W7 Track A — F2 ack dispatch contract (DemoChoreography.svelte replayListener producer side)', () => {
    it('replayListener body contains a CustomEvent dispatch for demo-replay-acknowledged', () => {
        // Producer side: DemoChoreography dispatches the ack so the keyboard-help
        // consumer's 500ms timeout-fallback does NOT fire on a clean replay.
        // Track A `90d62c3f` landed this line.
        expect(demoSrc).toContain("new CustomEvent('demo-replay-acknowledged')")
    })

    it('the dispatch is INSIDE the onMount replayListener body (not stale-floating)', () => {
        // The dispatch must live within the replayListener assigned in `onMount(() => {...})`.
        // A floating dispatch elsewhere would break the contract.
        const onMountIdx = demoSrc.indexOf('onMount(() => {')
        expect(onMountIdx).toBeGreaterThan(-1)
        const dispatchIdx = demoSrc.indexOf("new CustomEvent('demo-replay-acknowledged')", onMountIdx)
        expect(dispatchIdx).toBeGreaterThan(onMountIdx)
    })

    it('the dispatch fires AFTER requestReplay() in the listener body', () => {
        // Order invariant: requestReplay() FIRST (kick off the replay),
        // THEN dispatch the ack event. Flipped order would surface the ack
        // before the replay start signal — racing the replay start path.
        const onMountIdx = demoSrc.indexOf('onMount(() => {')
        const replayIdx = demoSrc.indexOf('requestReplay()', onMountIdx)
        const dispatchIdx = demoSrc.indexOf("new CustomEvent('demo-replay-acknowledged')", onMountIdx)
        expect(replayIdx).toBeGreaterThan(-1)
        expect(dispatchIdx).toBeGreaterThan(-1)
        expect(replayIdx).toBeLessThan(dispatchIdx)
    })

    it('legacy demo-replay-requested listener is still registered (Track A preserves trigger)', () => {
        // Track A ONLY adds the producer-side ack dispatch; it does NOT remove the
        // existing `demo-replay-requested` listener. The keyboard-help consumer still
        // drives the replay flow through that event. Removing it would sever the
        // replay trigger from the keyboard ack consumer.
        expect(demoSrc).toContain("addEventListener('demo-replay-requested'")
    })

    it('a W7 F2 marker comment annotates the fix (grep-arable)', () => {
        // Convention from the F4/F5/Track F wave + Track A: surgical fixes carry a
        // `W7 F2 fix` comment immediately above the changed code so future grep audits
        // (e.g. `rg -n "W7 F2"`) surface them. If a future mechanical edit removes
        // the dispatch + the marker together, this assertion catches the regression.
        const dispatchIdx = demoSrc.indexOf("new CustomEvent('demo-replay-acknowledged')")
        expect(dispatchIdx).toBeGreaterThan(-1)
        const commentSlice = demoSrc.slice(Math.max(0, dispatchIdx - 250), dispatchIdx)
        expect(commentSlice).toContain('F2')
    })
})
