/**
 * w11-t7-adapters-init.test.ts
 *
 * Regression detector for Ticket W11-T7 (Adapter Init Svelte Port, Wave 1).
 *
 * Verifies:
 *  - src/lib/orchestration/adapters.ts exists and exports initAdapters
 *  - adapters.ts imports all 10 adapter init functions from their canonical owners
 *  - adapters.ts body calls all 10 init functions
 *  - calling initAdapters() with mock deps doesn't throw and invokes all 10
 *    adapter init functions exactly once
 *  - adapters.ts tracks initialization state via areAdaptersInitialized()
 *
 * Strangler-fig invariant: the Svelte orchestration path must call the same
 * engine-kernel adapter init functions as the legacy initAdapters() in
 * :141-186.
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

// ── The 10 adapter init functions (canonical names) ──────────────────────────

const ADAPTER_INIT_NAMES = [
    'initJourneyLifecycleAdapter',
    'initJourneyCompassAdapter',
    'initJourneySelectedCard',
    'initSemanticDiveUiSubscriptions',
    'initFocusNeighborRailSubscriptions',
    'initRouteTraceSubscriptions',
    'initThreadInspectorAdapter',
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
    initFocusNeighborRailSubscriptions: '@lib/journey/focus-ui',
    initRouteTraceSubscriptions: '@lib/journey/route-trace',
    initThreadInspectorAdapter: '@lib/journey/thread-inspector-adapter',
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

describe('W11-T7: adapters.ts imports all 10 adapter init functions from canonical owners', () => {
    const src = readOrchestrationSource()

    for (const name of ADAPTER_INIT_NAMES) {
        it(`imports ${name}`, () => {
            const source = ADAPTER_IMPORT_SOURCES[name]
            const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // Accept either a static `import { name } from source` or a
            // dynamic `import(source)` (the route-trace adapter is loaded
            // dynamically as part of W45 perf work to keep three.js out of
            // the cold-load modulepreload set).
            const staticPattern = new RegExp(
                `import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+['"]${escapedSource}['"]`
            )
            const dynamicPattern = new RegExp(`import\\(\\s*['"]${escapedSource}['"]\\s*\\)`)
            expect(staticPattern.test(src) || dynamicPattern.test(src)).toBe(true)
        })
    }
})

describe('W11-T7: adapters.ts body calls all 10 init functions', () => {
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

describe('W11-T7: runtime — initAdapters() invokes all 10 adapters', () => {
    beforeEach(async () => {
        // Reset the module state by re-importing (vitest module cache)
        vi.resetModules()
        vi.restoreAllMocks()
        for (const name of ADAPTER_INIT_NAMES) {
            W11_MUTABLE_MOCK_FNS[name] = vi.fn()
        }
    })

    it('calls all 10 adapter init functions exactly once without throwing', async () => {
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

        // W45: initRouteTraceSubscriptions is now loaded via dynamic import
        // (route-trace statically imports three.js for WebGL overlay rendering;
        // deferring keeps three out of the cold-load modulepreload set). The
        // dynamic import is fire-and-forget inside initAdapters, so we poll
        // for all 10 adapter inits to complete instead of a fixed 50ms wait.
        await vi.waitFor(() => {
            for (const name of ADAPTER_INIT_NAMES) {
                expect(W11_MUTABLE_MOCK_FNS[name]).toHaveBeenCalledTimes(1)
            }
        }, { timeout: 2000, interval: 5 })

        // All 10 should have been called exactly once (redundant with waitFor
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
    })
})
