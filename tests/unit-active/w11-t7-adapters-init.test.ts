/**
 * w11-t7-adapters-init.test.ts
 *
 * Regression detector for Ticket W11-T7 (Adapter Init Svelte Port, Wave 1).
 *
 * Verifies:
 *  - src/lib/orchestration/adapters.ts exists and exports initAdapters
 *  - adapters.ts imports all 8 adapter init functions from their canonical owners
 *  - adapters.ts body calls all 8 init functions
 *  - calling initAdapters() with mock deps doesn't throw and invokes all 9
 *    adapter init functions exactly once
 *  - adapters.ts tracks initialization state via areAdaptersInitialized()
 *
 * Strangler-fig invariant: the Svelte orchestration path must call the same
 * engine-kernel adapter init functions as the legacy initAdapters() in
 * :141-186.
 *
 * Post a3a0d94f ("fold adapter archipelago — 5 deleted, 8 re-pointed"):
 * `initThreadInspectorAdapter` was INLINED into adapters.ts itself (the
 * separate thread-inspector-adapter.ts module was retired and folded here).
 * The structural-import assertion cannot target an inlined function, so
 * this test list now targets `initCanvasHoverPreviewSubscription` (the
 * W48-B parity addition) — a real external adapter import that the
 * `initAdapters` body calls. The inlined thread-inspector init remains
 * exercised transitively through the `threadInspector` mock-deps slice
 * passed to `initAdapters`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// ── Source file paths for structural checks ───────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ORCHESTRATION_PATH = resolve(__dirname, '../../src/lib/orchestration/adapters.ts')

function readOrchestrationSource(): string {
    return readFileSync(ORCHESTRATION_PATH, 'utf-8')
}

// ── Module-scope mock store (hoisted before vi.mock) ──────────────────────────
// vi.mock factories are hoisted to module load, before any `it` body runs.
// The runtime test below references this binding from inside its `vi.mock`
// factory, so it must be declared at module scope (not inside the test body).

const W11_MUTABLE_MOCK_FNS: Record<AdapterInitName, ReturnType<typeof vi.fn>> = {} as Record<
    AdapterInitName,
    ReturnType<typeof vi.fn>
>

// ── The adapter init functions (canonical names) ──────────────────────────

const ADAPTER_INIT_NAMES = [
    'initJourneyLifecycleAdapter',
    'initJourneyCompassAdapter',
    'initJourneySelectedCard',
    'initSemanticDiveUiSubscriptions',
    'initCanvasHoverPreviewSubscription',
    // initRouteTraceSubscriptions REMOVED 2026-08-23: ownership moved to
    // main.ts engineReady.subscribe so three.js stays off the pre-gesture
    // cold-load path (see adapters.ts note 7).
    'initMapStateSubscriptions',
    'initViewControllerAdapter',
    'setupMobileSearchSheetToggle'
] as const

type AdapterInitName = (typeof ADAPTER_INIT_NAMES)[number]

const ADAPTER_IMPORT_SOURCES: Record<AdapterInitName, string> = {
    initJourneyLifecycleAdapter: '@lib/journey/lifecycle-adapter',
    initJourneyCompassAdapter: '@lib/orchestration/compass-controller',
    initJourneySelectedCard: '@lib/journey/selected-card',
    initSemanticDiveUiSubscriptions: '@lib/journey/semantic-dive',
    initCanvasHoverPreviewSubscription: '@lib/journey/canvas-hover-preview',
    initMapStateSubscriptions: '@lib/engine/map-state',
    initViewControllerAdapter: '@lib/orchestration/view-controller',
    setupMobileSearchSheetToggle: '@lib/search/search-panel-adapter'
}

// ── Structural Tests ─────────────────────────────────────────────────────────

describe('W11-T7: adapters.ts exports initAdapters API', () => {
    it('orchestration file exports initAdapters function', () => {
        const src = readOrchestrationSource()
        expect(src).toContain('export function initAdapters')
    })

    it('orchestration file exports areAdaptersInitialized', () => {
        const src = readOrchestrationSource()
        expect(src).toContain('export function areAdaptersInitialized')
    })
})

describe('W11-T7: adapters.ts imports all 8 adapter init functions from canonical owners', () => {
    const src = readOrchestrationSource()

    for (const name of ADAPTER_INIT_NAMES) {
        it(`imports ${name}`, () => {
            const source = ADAPTER_IMPORT_SOURCES[name]
            const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // Accept either a static `import { name } from source` or a
            // dynamic `import(source)` (map-state is loaded dynamically).
            const staticPattern = new RegExp(
                `import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+['"]${escapedSource}['"]`
            )
            const dynamicPattern = new RegExp(`import\\(\\s*['"]${escapedSource}['"]\\s*\\)`)
            expect(staticPattern.test(src) || dynamicPattern.test(src)).toBe(true)
        })
    }
})

describe('W11-T7: adapters.ts body calls all 8 init functions', () => {
    const src = readOrchestrationSource()

    for (const name of ADAPTER_INIT_NAMES) {
        it(`calls ${name}() in initAdapters body`, () => {
            // Verify the function is called (not just imported) inside the file
            const callPattern = new RegExp(`${name}\\(`)
            expect(callPattern.test(src)).toBe(true)
        })
    }
})

// ── Runtime Test ─────────────────────────────────────────────────────────────

describe('W11-T7: runtime — initAdapters() invokes all 8 adapters', () => {
    beforeEach(async () => {
        // Reset the module state by re-importing (vitest module cache)
        vi.resetModules()
        vi.restoreAllMocks()
        for (const name of ADAPTER_INIT_NAMES) {
            W11_MUTABLE_MOCK_FNS[name] = vi.fn()
        }
    })

    it('calls all 8 adapter init functions exactly once without throwing', async () => {
        for (const [name, source] of Object.entries(ADAPTER_IMPORT_SOURCES) as [AdapterInitName, string][]) {
            vi.doMock(source, () => ({ [name]: W11_MUTABLE_MOCK_FNS[name] }))
        }

        // Mock handleError — it's used inside the dynamic-import catch path
        // (adapters.ts:155). Real handleError pulls in @lib/utils/debug +
        // @lib/orchestration/toast which transitively load @lib/stores/toast.svelte;
        // the dynamic-import mock we want to short-circuit here doesn't
        // throw, so the catch handler is never invoked. Mocking handleError
        // removes ~7s of module loading that was pushing this test near
        // the 20s vitestTimeout in the full suite.
        vi.doMock('@lib/utils/error-handler', () => ({
            handleError: () => () => {}
        }))

        const { initAdapters, areAdaptersInitialized } = await import('../../src/lib/orchestration/adapters')

        // Should not be initialized before calling
        expect(areAdaptersInitialized()).toBe(false)

        // Provide minimal deps — each adapter init will receive its slice
        const mockDeps = {
            journeyLifecycle: {
                previewInsideNextThread: vi.fn(),
                getNextWalkCandidateForIndex: vi.fn(),
                applyLocalNeighborhoodFocus: vi.fn(),
                setSemanticDiveMode: vi.fn(),
                getInterestingBusinessNote: vi.fn(),
                buildSelectedMatchNarrative: vi.fn(),
                hasColdDegradedSemanticFallback: vi.fn(),
                getColdDegradedRouteCopy: vi.fn(),
                getSelectedBusinessRoleLabel: vi.fn(),
                isFieldNodeFocusContext: vi.fn(),
                revealSelectedBusinessCard: vi.fn(),
                describeThreadLensForPoint: vi.fn(),
                hydrateLeadContext: vi.fn(),
                shouldUseFloatingFocusJourneyOnly: vi.fn(),
                setLastCanvasNodePick: vi.fn(),
                setLastCanvasNodeHover: vi.fn(),
                setLastCanvasNodeFocusPick: vi.fn()
            },
            switchView: vi.fn(),
            journeySelectedCard: {
                getStrandArrivalNote: vi.fn(),
                updateTraversalUi: vi.fn(),
                hydrateLeadContext: vi.fn()
            },
            threadInspector: {
                summarizeNeighborReason: vi.fn(),
                getInsideRelationshipLabel: vi.fn(),
                getCurrentTrailFocusIndex: vi.fn(),
                getFocusThreadCurvePoint: vi.fn()
            },
            refreshCompositionState: vi.fn(),
            isCompactSearchViewport: vi.fn()
        }

        // Should not throw
        expect(() => initAdapters(mockDeps)).not.toThrow()

        // initAdapters is synchronous for all 8 remaining adapters, but we
        // still poll to stay resilient to microtask ordering in the mock
        // environment.
        await vi.waitFor(
            () => {
                for (const name of ADAPTER_INIT_NAMES) {
                    expect(W11_MUTABLE_MOCK_FNS[name]).toHaveBeenCalledTimes(1)
                }
            },
            { timeout: 2000, interval: 5 }
        )

        // All 9 should have been called exactly once (redundant with waitFor
        // above but documents the invariant for human readers).
        for (const name of ADAPTER_INIT_NAMES) {
            expect(W11_MUTABLE_MOCK_FNS[name]).toHaveBeenCalledTimes(1)
        }

        // Should now be initialized
        expect(areAdaptersInitialized()).toBe(true)

        // Calling again should be a no-op (still 1 call each). Wait briefly
        // to confirm no additional adapter init calls fire — _adaptersInitialized
        // is synchronous so the second call returns immediately.
        initAdapters(mockDeps)
        const noopDeadline = Date.now() + 100
        while (Date.now() < noopDeadline) {
            await new Promise((resolve) => setTimeout(resolve, 5))
        }
        for (const name of ADAPTER_INIT_NAMES) {
            expect(W11_MUTABLE_MOCK_FNS[name]).toHaveBeenCalledTimes(1)
        }
    }, 60000)
})
