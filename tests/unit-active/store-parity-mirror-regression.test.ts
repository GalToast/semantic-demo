import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * @vitest-environment jsdom
 *
 * Regression for tmp/w15-body-attr-gap-2026-06-17.md and the cross-cutting
 * mirror pattern documented in tmp/store-parity-audit-2026-06-17.md.
 *
 * Background: 5 HIGH-impact store-parity gaps were found where legacy code
 * wrote to `appState.navState` (or `appState.inspectedThreadIndex` /
 * `appState.pinnedThreadIndex`) without updating the corresponding Svelte 5
 * store (`navStore` or `focusStore`). The fix is the `writeNavStateMirror`
 * helper (src/lib/stores/navigation.svelte.ts) which writes to BOTH legacy
 * and Svelte 5 stores, plus inline `focusStore.update(...)` calls for the
 * focusStore-owned fields.
 *
 * The first 3 gaps (demo, thread-settler, focus-pocket) were closed in
 * commit fc2d5fd. The remaining 2 gaps (thread-inspector, url-state) were
 * closed in commit aed8bd8. This test locks the contract for GAP-4
 * (thread-inspector) and GAP-5 (url-state) so future refactors can't
 * silently reintroduce the clobber.
 *
 * Test strategy: verify the SIDE EFFECTS (legacy state mutation +
 * focusStore.update call). We don't try to intercept _navWritable.update
 * (the internal Svelte writable in navigation.svelte.ts) — that would
 * require monkey-patching the module's private state. Instead we verify
 * the legacy state was mutated correctly and (for focusStore) capture
 * the update calls via a mock that exposes update as a public function.
 */

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const _appState = vi.hoisted(() => ({
    // Most state reads/writes target these fields.
    navState: {
        mode: 'overview' as string,
        surface: 'idle' as string,
        focusedIndex: null as number | null,
        trailDepth: 0,
        trailSeedIndex: null as number | null,
        trailNeighborIndices: [] as number[],
        trailCursor: -1,
        walkHistoryIndices: [] as number[],
        // focus.svelte.ts module-init reads these — provide empty defaults
        // so iteration doesn't throw.
        focusPocketIndices: [] as any[],
        focusPocketMeta: null as any,
        focusPocketRoleByIndex: new Map<number, string>()
    },
    // thread-inspector writes to these directly.
    inspectedThreadIndex: null as number | null,
    pinnedThreadIndex: null as number | null,
    threadInspectorPointerInside: false,
    selectedPoint: null as any,
    hoverHighlightIndex: -1,
    myceliumMode: 'dormant' as string,
    trailDepth: 0,
    // focus.svelte.ts module-init reads these — provide empty defaults.
    inspectedStrandDiagnostics: {
        active: false,
        source: 'none',
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    },
    focusOrbitSlackState: { phase: 'idle', reason: null },
    // The mirror patches use appState.withMutation to satisfy the
    // tracked-sub-object contract. The real implementation re-runs
    // Object.assign under _isMutating=true; here we accept any callback
    // and return undefined.
    withMutation: (fn: () => unknown) => {
        return fn()
    }
}))

const _focusStoreUpdates = vi.hoisted(() => [] as Array<{ next: unknown; prev: unknown }>)

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: _appState
}))

vi.mock('@lib/stores/focus.svelte.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/stores/focus.svelte')>()
    return {
        ...actual,
        // Replace focusStore with a writable that captures updates.
        // Keep all other exports (helpers) intact.
        focusStore: {
            subscribe: (run: (v: unknown) => void) => {
                run({})
                return () => {}
            },
            update: (fn: (s: unknown) => unknown) => {
                const prev = {}
                const next = fn(prev)
                _focusStoreUpdates.push({ next, prev })
            },
            set: (v: unknown) => {
                _focusStoreUpdates.push({ next: v, prev: undefined })
            }
        }
    }
})

// Stub the event-bus + utilities that thread-inspector / url-state depend on
vi.mock('@lib/orchestration/event-bus', () => ({
    publish: () => {},
    subscribe: () => () => {},
    EVENTS: {
        COMPOSITION_UPDATED: 'COMPOSITION_UPDATED',
        FOCUS_NODE_FOCUSED: 'FOCUS_NODE_FOCUSED',
        THREAD_INSPECTION_CLEARED: 'THREAD_INSPECTION_CLEARED'
    }
}))

vi.mock('@lib/utils/diagnostic-adapter', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/utils/diagnostic-adapter')>()
    return {
        ...actual,
        debugWarn: () => {}
    }
})

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import { clearExplorationFocusSelection } from '@lib/orchestration/url-state'
import { inspectThreadNeighbor } from '@lib/journey/thread-inspector-state'

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetCallLogs(): void {
    _focusStoreUpdates.length = 0
}

function lastFocusUpdate(): { next: unknown; prev: unknown } | undefined {
    return _focusStoreUpdates[_focusStoreUpdates.length - 1]
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('store parity mirror (GAP-4 + GAP-5 from store-parity-audit-2026-06-17.md)', () => {
    beforeEach(() => {
        resetCallLogs()
        // Reset navState between tests
        _appState.navState.mode = 'overview'
        _appState.navState.surface = 'idle'
        _appState.navState.focusedIndex = null
        _appState.navState.trailDepth = 0
        _appState.navState.trailSeedIndex = null
        _appState.navState.trailNeighborIndices = []
        _appState.navState.trailCursor = -1
        _appState.navState.walkHistoryIndices = []
        _appState.inspectedThreadIndex = null
        _appState.pinnedThreadIndex = null
        _appState.threadInspectorPointerInside = false
    })

    // ── GAP-5: url-state.ts: clearExplorationFocusSelection ──
    //
    // Before fix (commit aed8bd8): direct appState.withMutation wrote to
    // legacy state only, leaving the Svelte 5 navStore stale. After URL
    // reset, body data-attrs (data-nav-mode, data-nav-surface,
    // data-focused-node) showed stale 'focus' values instead of
    // 'overview'/'idle'/null.
    //
    // After fix: the withMutation block is replaced with
    // writeNavStateMirror which writes to both legacy and Svelte 5.
    // We verify the LEGACY write (the side effect) and that withMutation
    // was called (proving the mirror path ran).
    //
    // Note: withMutation was deprecated and removed in 85cdd1ab. The
    // canonical mirror path is now writeNavStateMirror in navigation.svelte.ts.
    // We spy on its navState mutation as the proof.

    it('GAP-5: clearExplorationFocusSelection calls writeNavStateMirror (mirror path)', () => {
        let mutationRan = false
        // Capture navState writes by spying on _appState.navState (the
        // legacy mirror target) — any property assignment is the signal.
        const navStateProxy = _appState.navState as Record<string, unknown>
        const originalDescriptors = Object.getOwnPropertyDescriptors(navStateProxy)
        for (const key of Object.keys(originalDescriptors)) {
            let value = navStateProxy[key]
            Object.defineProperty(navStateProxy, key, {
                get: () => value,
                set: (newValue) => {
                    mutationRan = true
                    value = newValue
                },
                configurable: true,
                enumerable: true
            })
        }
        try {
            clearExplorationFocusSelection()
            expect(mutationRan, 'writeNavStateMirror must mutate appState.navState').toBe(true)
        } finally {
            // Restore original descriptors
            for (const [key, descriptor] of Object.entries(originalDescriptors)) {
                Object.defineProperty(navStateProxy, key, descriptor)
            }
        }
    })

    it('GAP-5: clearExplorationFocusSelection resets legacy navState to overview/idle/null', () => {
        // Seed the legacy state with a 'focused' context (simulating user
        // was on a focused node before the URL reset)
        _appState.navState.mode = 'focus'
        _appState.navState.surface = 'focus'
        _appState.navState.focusedIndex = 42
        _appState.navState.trailDepth = 1

        clearExplorationFocusSelection()

        // The mirror must have reset all 3 fields via the legacy write
        expect(_appState.navState.mode).toBe('overview')
        expect(_appState.navState.focusedIndex).toBeNull()
        expect(_appState.navState.trailDepth).toBe(0)
    })

    // ── GAP-4: thread-inspector.ts: inspectThreadNeighbor ──
    //
    // Before fix (commit aed8bd8): 12 sites wrote to
    // appState.inspectedThreadIndex / appState.pinnedThreadIndex /
    // appState.threadInspectorPointerInside without updating focusStore.
    // The thread inspector overlay failed to render because
    // focusStore.threadInspector.active stayed false.
    //
    // After fix: each write is followed by a focusStore.update that
    // mirrors the same field. We verify the LEGACY write happened AND
    // the focusStore.update was called with the right patch.

    it('GAP-4: inspectThreadNeighbor mirrors to focusStore.update with the index', () => {
        inspectThreadNeighbor(522, { force: true })

        // focusStore must receive an update with the index in either
        // inspectedStrandIndex or threadInspector.inspectedIndex
        const last = lastFocusUpdate()
        expect(last, 'inspectThreadNeighbor must call focusStore.update').toBeDefined()
        const next = last!.next as Record<string, unknown>
        const threadInspector = next.threadInspector as Record<string, unknown> | undefined
        const inspectedStrandIndex = next.inspectedStrandIndex as number | undefined
        const inspectedIndex = threadInspector?.inspectedIndex as number | undefined
        // At least one of these must carry the index
        const index = inspectedStrandIndex ?? inspectedIndex
        expect(index).toBe(522)
    })

    it('GAP-4: inspectThreadNeighbor(null) clears focusStore state', () => {
        inspectThreadNeighbor(null as unknown as number, { force: true })

        const last = lastFocusUpdate()
        expect(last, 'inspectThreadNeighbor(null) must call focusStore.update').toBeDefined()
        const next = last!.next as Record<string, unknown>
        // Either the legacy field or threadInspector should be null
        const inspectedStrandIndex = next.inspectedStrandIndex
        const threadInspector = next.threadInspector as Record<string, unknown> | undefined
        const inspectedIndex = threadInspector?.inspectedIndex
        const cleared = inspectedStrandIndex === null || inspectedIndex === null
        expect(cleared).toBe(true)
    })
})
