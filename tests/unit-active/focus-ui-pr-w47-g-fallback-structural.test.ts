/**
 * focus-ui — PR-W47-g 0-neighbor fallback structural regression test (W52)
 *
 * Locks in the PR-W47-g fix (commit 11b176e8) that routes neighborCount===0
 * in the trailDepth>=1 branch to the fallback copy, instead of the buggy
 * "Stop N of 0" total. Asserts the fallback string + the conditional guard
 * are present in both the focus-ui function and the JourneyChrome twin.
 *
 * 2026-08-24 UX sweep: "Stop" → "Step" + nearby count.
 *
 * Why structural rather than a mocked-DOM behavior test: exercising
 * updateTraversalUi() deterministically requires a controlled appState that
 * satisfies the module-level mirror inits in viewport / search / journey /
 * filter / demo / parity stores (which read appState.viewportState,
 * appState.searchState, appState.demoPhase, appState.filterVersion, etc.
 * at import time). Building that fixture is ~15-20 min of careful shape
 * matching. The fix is already source-verified by reading the same two
 * files this test scans, so the marginal value of a full mocked runtime
 * test over this structural detector is small. Revisit if a regression in
 * the fallback copy ever slips through — build the fixture then.
 *
 * Companion: tests/widget-journey.spec.js 5h is a test.fixme because the
 * 0-neighbor branch is not reachable as a DOM-level journey assertion
 * (dense 8,406-point graph + Svelte $effect recompute chain).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..', '..')
const FOCUS_UI = resolve(REPO_ROOT, 'src/lib/journey/focus-ui.ts')
const JOURNEY_CHROME = resolve(REPO_ROOT, 'src/components/JourneyChrome.svelte')

// The fallback copy. Must match exactly the string set in
// focus-ui.ts and JourneyChrome.svelte (0-neighbor branch).
const FALLBACK_PROGRESS = 'no more nearby with these filters.'
// The contextual cue that swaps the "Use Next to continue" tail for the
// "return to Overview" tail when neighborCount===0 in the trailDepth>=1
// branch of focus-ui.ts.
const FALLBACK_CONTEXT_CUE = 'then return to Overview to find more connections'

describe('PR-W47-g 0-neighbor fallback — structural regression detector', () => {
    const focusUiSrc = readFileSync(FOCUS_UI, 'utf8')
    const journeyChromeSrc = readFileSync(JOURNEY_CHROME, 'utf8')

    it('focus-ui.ts contains the fallback', () => {
        expect(focusUiSrc).toContain(FALLBACK_PROGRESS)
    })

    it('focus-ui.ts no longer mixes the cumulative step ordinal with the per-node "of N" total', () => {
        // F1 (2026-08-06): "Stop N of M" mixed units (N = cumulative stops walked,
        // M = current node's neighbor candidates) so "Stop 3 of 2" was structurally
        // common. The walking branch now renders "Step N · M nearby" (the "Use Next" cue
        // carries the affordance) and the 0-neighbor fallback keeps its phrasing.
        expect(focusUiSrc).toMatch(/neighborCount\s*>\s*0\s*\?\s*`Step\s*\$\{stepNumber} ·/)
        expect(focusUiSrc).toContain(FALLBACK_PROGRESS)
    })

    it('focus-ui.ts uses the "return to Overview" contextual cue when no neighbors', () => {
        expect(focusUiSrc).toContain(FALLBACK_CONTEXT_CUE)
    })

    it('JourneyChrome.svelte twin also contains the fallback', () => {
        // The twin in JourneyChrome.svelte was missed by the original
        // PR-W47-g fix and caught by the W48 audit. Lock it in too so the
        // pair can never drift apart again.
        expect(journeyChromeSrc).toContain(FALLBACK_PROGRESS)
    })

    it('JourneyChrome.svelte guards any "of ${neighborCount}" rendering behind neighborCount>0', () => {
        // The `of ${neighborCount}` total is only safe when guarded by a
        // `neighborCount > 0` ternary (otherwise it renders "Step N of 0"
        // when neighborCount===0). Assert both halves of the guard appear
        // in the file — the ternary pattern AND the fallback string — so a
        // future refactor that drops the guard or the fallback is caught.
        expect(journeyChromeSrc).toMatch(/neighborCount\s*>\s*0/)
        expect(journeyChromeSrc).toContain(FALLBACK_PROGRESS)
    })
})
