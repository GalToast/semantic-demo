import { test, expect } from '@playwright/test'
import { openApp, isValidNodeIndex, projectedCandidates, focusNodeViaApp } from './helpers/3d-interaction-helpers.js'

async function getHoverState(page) {
    return page.evaluate(() => {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        return {
            hoverHighlightIndex: state.hoverHighlightIndex ?? null,
            stableCanvasHover: state.stableCanvasHover
                ? {
                      index: state.stableCanvasHover.index,
                      source: state.stableCanvasHover.source || '',
                      distance: state.stableCanvasHover.distance ?? null
                  }
                : null,
            lastCanvasNodeHover: state.lastCanvasNodeHover
                ? {
                      index: state.lastCanvasNodeHover.index,
                      source: state.lastCanvasNodeHover.source || '',
                      distance: state.lastCanvasNodeHover.distance ?? null
                  }
                : null,
            canvasCursor: state.renderer?.domElement?.style?.cursor ?? '',
            pointCount: state.points?.length ?? 0,
            focusedNode: state.focusedNode ?? null
        }
    })
}

function screenDistance(a, b) {
    return Math.hypot((a.screenX ?? 0) - (b.screenX ?? 0), (a.screenY ?? 0) - (b.screenY ?? 0))
}

async function findHoverableNode(page, { maxCandidates = 16 } = {}) {
    const passes = [
        { marginRatio: 0.08, maxResults: maxCandidates },
        { marginRatio: 0.05, maxResults: Math.max(maxCandidates, 24) },
        { marginRatio: 0.03, maxResults: Math.max(maxCandidates, 36) }
    ]
    for (const pass of passes) {
        const candidates = await projectedCandidates(page, pass)
        for (const candidate of candidates) {
            await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 1 })
            await page
                .waitForFunction(
                    () => {
                        const h = window.__TEST_STATE__?.hoverHighlightIndex
                        return h !== null && h !== undefined && Number.isFinite(h)
                    },
                    { timeout: 5000 }
                )
                .catch(() => {})
            const state = await getHoverState(page)
            if (isValidNodeIndex(state.hoverHighlightIndex, state.pointCount) && state.canvasCursor === 'pointer') {
                return {
                    ...candidate,
                    resolvedIndex: state.hoverHighlightIndex,
                    stableCanvasHover: state.stableCanvasHover,
                    lastCanvasNodeHover: state.lastCanvasNodeHover
                }
            }
        }
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
    }
    return null
}

async function collectDistinctHoverTargets(page, { maxCandidates = 28, minDistance = 36, count = 2 } = {}) {
    const passes = [
        { marginRatio: 0.08, maxResults: maxCandidates },
        { marginRatio: 0.05, maxResults: Math.max(maxCandidates, 36) },
        { marginRatio: 0.03, maxResults: Math.max(maxCandidates, 48) }
    ]
    const targets = []
    for (const pass of passes) {
        const candidates = await projectedCandidates(page, pass)
        for (const candidate of candidates) {
            await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 1 })
            await page
                .waitForFunction(
                    () => {
                        const h = window.__TEST_STATE__?.hoverHighlightIndex
                        return h !== null && h !== undefined && Number.isFinite(h)
                    },
                    { timeout: 5000 }
                )
                .catch(() => {})
            const state = await getHoverState(page)
            if (!isValidNodeIndex(state.hoverHighlightIndex, state.pointCount) || state.canvasCursor !== 'pointer')
                continue
            const target = { ...candidate, resolvedIndex: state.hoverHighlightIndex }
            const duplicateOrSticky = targets.some(
                (existing) =>
                    existing.resolvedIndex === target.resolvedIndex || screenDistance(existing, target) < minDistance
            )
            if (duplicateOrSticky) continue
            targets.push(target)
            if (targets.length >= count) return targets
        }
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
    }
    return targets
}

async function moveToValidHover(page, target, { excludeIndex = null, timeout = 4000 } = {}) {
    await page.mouse.move(target.screenX, target.screenY, { steps: 1 })
    await page.waitForFunction(
        ({ exclude }) => {
            const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            const pointCount = state.points?.length ?? 0
            const hover = state.hoverHighlightIndex
            const cursor = state.renderer?.domElement?.style?.cursor ?? ''
            const valid = Number.isFinite(hover) && hover >= 0 && hover < pointCount
            return valid && cursor === 'pointer' && (exclude === null || hover !== exclude)
        },
        { exclude: excludeIndex },
        { timeout }
    )
    return getHoverState(page)
}

async function moveUntilHoverClears(page) {
    const viewport = page.viewportSize() || { width: 1440, height: 900 }
    const points = [
        [8, 8],
        [viewport.width - 8, 8],
        [8, viewport.height - 8],
        [viewport.width - 8, viewport.height - 8],
        [viewport.width / 2, 8],
        [8, viewport.height / 2]
    ]

    let lastState = null
    for (const [x, y] of points) {
        await page.mouse.move(x, y, { steps: 1 })
        try {
            await page.waitForFunction(
                () => {
                    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                    const cleared = state.hoverHighlightIndex === -1 || state.hoverHighlightIndex === null
                    const cursor = state.renderer?.domElement?.style?.cursor ?? ''
                    return cleared && cursor !== 'pointer'
                },
                undefined,
                { timeout: 800 }
            )
            return await getHoverState(page)
        } catch (_e) {
            lastState = await getHoverState(page)
        }
    }
    return lastState
}

test.describe('3D node hover affordance', () => {
    test('desktop: real mouse hover resolves a selectable node and pointer cursor', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 1440, height: 900 })

        const target = await findHoverableNode(page)
        expect(target, 'at least one projected canvas coordinate must produce node hover').not.toBeNull()

        const hoverState = await getHoverState(page)
        expect(
            isValidNodeIndex(hoverState.hoverHighlightIndex, hoverState.pointCount),
            'hoverHighlightIndex must resolve to a valid node'
        ).toBe(true)
        expect(hoverState.canvasCursor, 'canvas cursor should indicate pointer hover').toBe('pointer')
        expect(
            hoverState.lastCanvasNodeHover || hoverState.stableCanvasHover,
            'hover debug state should identify the resolved node'
        ).not.toBeNull()
    })

    test('desktop: moving away clears hover state and cursor affordance', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 1440, height: 900 })

        const target = await findHoverableNode(page)
        expect(target, 'a hoverable node must exist before testing clear behavior').not.toBeNull()

        const hoverAfter = await moveUntilHoverClears(page)
        const cleared = hoverAfter.hoverHighlightIndex === -1 || hoverAfter.hoverHighlightIndex === null
        expect(cleared, `hoverHighlightIndex should clear after move-away, got ${hoverAfter.hoverHighlightIndex}`).toBe(
            true
        )
        expect(hoverAfter.canvasCursor, 'canvas cursor should reset after hover clear').not.toBe('pointer')
    })

    test('desktop: two hoverable coordinates keep hover valid without corrupting focus', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 1440, height: 900 })

        const focusBeforeHover = (await getHoverState(page)).focusedNode
        const first = await findHoverableNode(page)
        expect(first, 'first hoverable node must exist').not.toBeNull()
        const firstState = await getHoverState(page)

        await page.mouse.move(first.screenX + 220, first.screenY + 180, { steps: 1 })
        await page
            .waitForFunction(
                () => {
                    const h = window.__TEST_STATE__?.hoverHighlightIndex
                    return h !== null && h !== undefined && Number.isFinite(h)
                },
                { timeout: 5000 }
            )
            .catch(() => {})
        const secondState = await getHoverState(page)

        const secondIsValid = isValidNodeIndex(secondState.hoverHighlightIndex, secondState.pointCount)
        const secondIsCleared = secondState.hoverHighlightIndex === -1 || secondState.hoverHighlightIndex === null
        expect(
            secondIsValid || secondIsCleared,
            'moving to another canvas coordinate should leave hover valid or cleanly cleared'
        ).toBe(true)
        expect(firstState.focusedNode, 'hover must not CHANGE focus by itself').toBe(focusBeforeHover)
    })

    test.skip('mobile portrait: projected coordinate hover path remains deterministic — narrow-viewport branch ships placeholder (no hover surface)', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 390, height: 844 })

        const target = await findHoverableNode(page)
        expect(target, 'mobile portrait should expose at least one hoverable/pickable projected node').not.toBeNull()

        const hoverState = await getHoverState(page)
        expect(
            isValidNodeIndex(hoverState.hoverHighlightIndex, hoverState.pointCount),
            'mobile hoverHighlightIndex must be valid'
        ).toBe(true)
        expect(hoverState.canvasCursor, 'mobile canvas cursor should reflect node hover in browser pointer mode').toBe(
            'pointer'
        )
    })

    test('desktop focus mode: hover remains separate from focused node state', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 1440, height: 900 })

        await focusNodeViaApp(page, 0)
        await page.waitForFunction(
            () => (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus',
            { timeout: 15000 }
        )

        const target = await findHoverableNode(page)
        expect(target, 'focus mode should still allow deterministic hover probing or clean hover clear').not.toBeNull()

        const hoverState = await getHoverState(page)
        expect(
            isValidNodeIndex(hoverState.focusedNode, hoverState.pointCount),
            'focused node should remain valid'
        ).toBe(true)
        expect(typeof hoverState.hoverHighlightIndex, 'hover state should remain independently tracked').toBe('number')
    })

    test('desktop: hover state clears cleanly when focus is reset via Escape', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 1440, height: 900 })

        const target = await findHoverableNode(page)
        expect(target, 'a hoverable node must exist before testing reset').not.toBeNull()

        // Enter focus
        await focusNodeViaApp(page, target.resolvedIndex)
        await page.waitForFunction(
            () => (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus',
            { timeout: 15000 }
        )
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
            .catch(() => {})

        // Verify we are in focus
        const focusState = await getHoverState(page)
        expect(focusState.focusedNode, 'should be in focus state').not.toBeNull()

        // Press Escape to reset
        await page.keyboard.press('Escape')
        await page.waitForFunction(
            () => (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'overview',
            { timeout: 12000 }
        )
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
            .catch(() => {})

        // Hover should be cleared (null or -1) after reset
        const afterReset = await getHoverState(page)
        const cleared = afterReset.hoverHighlightIndex === -1 || afterReset.hoverHighlightIndex === null
        expect(cleared, `hover should clear after Escape reset, got ${afterReset.hoverHighlightIndex}`).toBe(true)
    })

    test.skip('mobile portrait: hover resolves on a real node at 390x844 — narrow-viewport branch ships placeholder (no hover surface)', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 390, height: 844 })

        const target = await findHoverableNode(page)
        expect(target, 'mobile portrait should expose at least one hoverable node').not.toBeNull()

        const hoverState = await getHoverState(page)
        expect(
            isValidNodeIndex(hoverState.hoverHighlightIndex, hoverState.pointCount),
            'mobile hoverHighlightIndex must be valid'
        ).toBe(true)
        expect(hoverState.canvasCursor, 'mobile canvas cursor should be pointer').toBe('pointer')
    })

    test('desktop: rapid mouse movements keep hover state valid and cursor accurate', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 1440, height: 900 })

        const [first, second] = await collectDistinctHoverTargets(page)
        expect(first, 'first resolved hover target must exist').not.toBeNull()
        expect(second, 'second distinct resolved hover target outside sticky-hover range must exist').not.toBeNull()

        await moveToValidHover(page, first)
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
        await moveToValidHover(page, second, { excludeIndex: first.resolvedIndex })

        const state = await getHoverState(page)
        expect(state.hoverHighlightIndex, 'rapid move must not leave stale first hover selected').not.toBe(
            first.resolvedIndex
        )
        expect(state.canvasCursor, 'cursor should be pointer after final hover').toBe('pointer')
    })

    test('desktop: stale hover state from rapid move clears cleanly without focus corruption', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 1440, height: 900 })
        const focusBeforeHover = (await getHoverState(page)).focusedNode

        // First establish a solid hover on one node.
        const first = await findHoverableNode(page, { maxCandidates: 24 })
        expect(first, 'need a resolved hover target for stale-state test').not.toBeNull()
        await moveToValidHover(page, first)

        const initial = await getHoverState(page)
        expect(isValidNodeIndex(initial.hoverHighlightIndex, initial.pointCount), 'initial hover must be valid').toBe(
            true
        )

        // Rapid-move away — simulates losing hover before state update propagates
        await page.mouse.move(16, 16, { steps: 1 })
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {}) // intentionally too short for full hover settle

        const mid = await getHoverState(page)
        const midValid = isValidNodeIndex(mid.hoverHighlightIndex, mid.pointCount)
        const midCleared = mid.hoverHighlightIndex === -1 || mid.hoverHighlightIndex === null

        // Intermediate state is allowed to be mid-transition; just ensure it's not garbage
        expect(midValid || midCleared, `mid-hover must be valid or cleared, got ${mid.hoverHighlightIndex}`).toBe(true)

        // Wait for full settle
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})

        const settled = await getHoverState(page)
        const settledCleared = settled.hoverHighlightIndex === -1 || settled.hoverHighlightIndex === null
        expect(
            settledCleared,
            `settled hover should be null/-1 after move-away, got ${settled.hoverHighlightIndex}`
        ).toBe(true)
        expect(settled.canvasCursor, 'cursor should not be pointer after hover clears').not.toBe('pointer')

        // Focus must NOT be corrupted by the stale hover event
        expect(settled.focusedNode, 'stale hover must not CHANGE focus').toBe(focusBeforeHover)
    })

    test.skip('mobile portrait: rapid hover movements keep state valid without cascading errors — narrow-viewport branch ships placeholder (no hover surface)', async ({ page }) => {
        test.setTimeout(180000)
        await openApp(page, { width: 390, height: 844 })

        const candidates = await collectDistinctHoverTargets(page, { maxCandidates: 24, minDistance: 12, count: 4 })
        expect(candidates.length, 'need resolved hover candidates for mobile rapid-move test').toBeGreaterThan(0)

        // Rapid movement across candidates
        for (const candidate of candidates.slice(0, 4)) {
            await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 1 })
        }
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})

        const state = await getHoverState(page)
        const valid = isValidNodeIndex(state.hoverHighlightIndex, state.pointCount)
        const cleared = state.hoverHighlightIndex === -1 || state.hoverHighlightIndex === null
        expect(valid || cleared, `mobile hover state must be valid or cleared, got ${state.hoverHighlightIndex}`).toBe(
            true
        )
        expect(state.pointCount, 'pointCount must still be valid after rapid moves').toBeGreaterThan(0)
    })
})
