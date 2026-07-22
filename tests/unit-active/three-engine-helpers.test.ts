import { describe, expect, it } from 'vitest'
import { hasFiniteNodeIndex, sceneNeedsContinuousFrame } from '@lib/engine/three-engine-helpers'

// ---------------------------------------------------------------------------
// hasFiniteNodeIndex — table-driven
// ---------------------------------------------------------------------------

describe('hasFiniteNodeIndex', () => {
    it.each([
        ['NaN', NaN, false],
        ['Infinity', Infinity, false],
        ['-Infinity', -Infinity, false],
        ['negative', -1, false],
        ['zero', 0, true],
        ['positive integer', 42, true],
        ['positive float', 3.14, true],
        ['string "3"', '3', false],
        ['null', null, false],
        ['undefined', undefined, false],
        ['object', {}, false],
        ['array', [1], false]
    ])('returns %s for %j', (_label, input, expected) => {
        expect(hasFiniteNodeIndex(input)).toBe(expected)
    })
})

// ---------------------------------------------------------------------------
// sceneNeedsContinuousFrame — flag-combination matrix
// ---------------------------------------------------------------------------

describe('sceneNeedsContinuousFrame', () => {
    // -----------------------------------------------------------------------
    // Null-state baseline
    // -----------------------------------------------------------------------
    it('returns true when state is null', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), null)).toBe(true)
    })

    // -----------------------------------------------------------------------
    // Minimal mock factory — only the fields the function actually reads
    // -----------------------------------------------------------------------
    function mockState(partial: Record<string, unknown>) {
        const focusState = {
            pocketMotionByIndex: undefined as unknown,
            nodesAreSettling: false,
            inspectedThreadIndex: null as number | null,
            pinnedThreadIndex: null as number | null,
            ...((partial.focusState as Record<string, unknown> | undefined) || {})
        }
        const navState = {
            autoRotate: false,
            autoRotateSuspended: false,
            ...((partial.navState as Record<string, unknown> | undefined) || {})
        }
        const { focusState: _focusOverride, navState: _navOverride, ...rest } = partial
        return { focusState, navState, ...rest } as unknown as ReturnType<typeof sceneNeedsContinuousFrame> extends (
            _now: number,
            state: infer S
        ) => boolean
            ? S
            : never
    }

    // -----------------------------------------------------------------------
    // Each individual truthy flag forces true
    // -----------------------------------------------------------------------
    it('returns true when forceAnimate is true', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ forceAnimate: true }))).toBe(true)
    })

    it('returns true when sceneRevealActive is true', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ sceneRevealActive: true }))).toBe(true)
    })

    it('returns true when nodesAreSettling is true', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { nodesAreSettling: true } }))).toBe(true)
    })

    it('returns true when myceliumDirty is true', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ myceliumDirty: true }))).toBe(true)
    })

    it('returns true when routeTraceLines is truthy', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ routeTraceLines: {} }))).toBe(true)
    })

    it('returns true when routeTraceLines is falsy (empty)', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ routeTraceLines: undefined }))).toBe(false)
    })

    it('returns true when focusPocketMotion is a non-empty array', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { pocketMotionByIndex: [{}] } }))).toBe(
            true
        )
    })

    it('returns true when focusPocketMotion is a non-empty Map', () => {
        const m = new Map()
        m.set('k', 'v')
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { pocketMotionByIndex: m } }))).toBe(true)
    })

    it('returns false when focusPocketMotion is an empty array', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { pocketMotionByIndex: [] } }))).toBe(
            false
        )
    })

    it('returns false when focusPocketMotion is an empty Map', () => {
        const m = new Map()
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { pocketMotionByIndex: m } }))).toBe(false)
    })

    it('returns true when autoRotate is true and autoRotateSuspended is false', () => {
        expect(
            sceneNeedsContinuousFrame(
                Date.now(),
                mockState({ navState: { autoRotate: true, autoRotateSuspended: false } })
            )
        ).toBe(true)
    })

    it('returns false when autoRotate is true but autoRotateSuspended is also true', () => {
        expect(
            sceneNeedsContinuousFrame(
                Date.now(),
                mockState({ navState: { autoRotate: true, autoRotateSuspended: true } })
            )
        ).toBe(false)
    })

    it('returns false when autoRotate is false', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ navState: { autoRotate: false } }))).toBe(false)
    })

    it('returns true when autoRotateResumeDueAt is in the future', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ autoRotateResumeDueAt: Date.now() + 60_000 }))).toBe(
            true
        )
    })

    it('returns false when autoRotateResumeDueAt is in the past', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ autoRotateResumeDueAt: Date.now() - 60_000 }))).toBe(
            false
        )
    })

    it('returns false when autoRotateResumeDueAt is not a number', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ autoRotateResumeDueAt: 'soon' }))).toBe(false)
    })

    it('returns true when searchState.searchGlowActive is true', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ searchState: { searchGlowActive: true } }))).toBe(true)
    })

    it('returns true when hoverHighlightIndex is a finite non-negative number', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ hoverHighlightIndex: 5 }))).toBe(true)
    })

    it('returns false when hoverHighlightIndex is NaN', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ hoverHighlightIndex: NaN }))).toBe(false)
    })

    it('returns false when hoverHighlightIndex is negative', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ hoverHighlightIndex: -1 }))).toBe(false)
    })

    it('returns true when focusedNode is a finite non-negative number', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusedNode: 3 }))).toBe(true)
    })

    it('returns false when focusedNode is null', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusedNode: null }))).toBe(false)
    })

    it('returns true when inspectedThreadIndex is a finite non-negative number', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { inspectedThreadIndex: 2 } }))).toBe(true)
    })

    it('returns false when inspectedThreadIndex is null', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { inspectedThreadIndex: null } }))).toBe(
            false
        )
    })

    it('returns true when pinnedThreadIndex is a finite non-negative number', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { pinnedThreadIndex: 7 } }))).toBe(true)
    })

    it('returns false when pinnedThreadIndex is null', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({ focusState: { pinnedThreadIndex: null } }))).toBe(
            false
        )
    })

    // -----------------------------------------------------------------------
    // All-clear scenario — every flag falsy / empty
    // -----------------------------------------------------------------------
    it('returns false when every flag is falsy and all indices are invalid', () => {
        expect(sceneNeedsContinuousFrame(Date.now(), mockState({}))).toBe(false)
    })

    it('returns false with explicit all-clear values', () => {
        expect(
            sceneNeedsContinuousFrame(
                Date.now(),
                mockState({
                    forceAnimate: false,
                    sceneRevealActive: false,
                    focusState: {
                        nodesAreSettling: false,
                        pocketMotionByIndex: [],
                        inspectedThreadIndex: null,
                        pinnedThreadIndex: null
                    },
                    myceliumDirty: false,
                    routeTraceLines: undefined,
                    navState: {
                        autoRotate: false,
                        autoRotateSuspended: false
                    },
                    autoRotateResumeDueAt: undefined,
                    searchState: { searchGlowActive: false },
                    hoverHighlightIndex: NaN,
                    focusedNode: null
                })
            )
        ).toBe(false)
    })

    // -----------------------------------------------------------------------
    // Multiple flags simultaneously truthy
    // -----------------------------------------------------------------------
    it('returns true when multiple flags are set', () => {
        expect(
            sceneNeedsContinuousFrame(
                Date.now(),
                mockState({
                    forceAnimate: true,
                    sceneRevealActive: true,
                    nodesAreSettling: true
                })
            )
        ).toBe(true)
    })
})
