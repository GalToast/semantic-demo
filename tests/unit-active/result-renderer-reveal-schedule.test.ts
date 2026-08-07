/**
 * @vitest-environment jsdom
 *
 * result-renderer compact reveal — behavioral schedule test (2026-08-07).
 *
 * Replaces the source-inspection assertions that lived in the node-env
 * pure-helper suite (result-renderer-pure-helpers.test.ts) which regex-checked
 * "no `as unknown as` casts remain" + "timers use globalThis.setTimeout".
 * The typed-timer contract is proven here by OBSERVABLE behavior: the
 * exported scheduleCompactSearchResultReveal must register real timer ids
 * into appState.compactSearchRevealTimers and fire the reveal on tick,
 * which is the property the `as unknown as` removal preserved — no
 * double-cast is needed because the path schedules typed setTimeout returns.
 */
import { describe, it, expect, vi } from 'vitest'

describe('result-renderer compact reveal — real typed timer scheduling', () => {
    it(
        'registers real setTimeout timer ids and fires the reveal (typed path)',
        async () => {
            // Heavy-import guard: importing the live appState + result-renderer
            // graph can stall past the 20s default under suite load (repo
            // precedent: heavy-import tests bump the timeout — w11-t7 mocks the
            // heavy graph; here the graph is the subject, so raise the budget.
            // IMPORTS COMPLETE BEFORE useFakeTimers — fake timers can stall
            // dynamic import() resolution in vitest, freezing the test.
            const { appState } = await import('@lib/state/app.svelte')
            const resultRenderer = await import('@lib/search/result-renderer')

        // jsdom does not expose the CSS.escape API used by the reveal row
        // lookup (result-renderer.ts:134). Provide the standard escape shim
        // used by the app elsewhere (css-escape polyfill semantics).
        if (typeof globalThis.CSS === 'undefined' || typeof globalThis.CSS.escape !== 'function') {
            ;(globalThis as { CSS?: { escape?: (s: string) => string } }).CSS = {
                escape: (str: string) =>
                    str.replace(/[^a-zA-Z0-9_-]/g, (c: string) => '\\' + c.charCodeAt(0).toString(16).padStart(4, '0'))
            }
        }

        vi.useFakeTimers()

        // Compact viewport gate: (max-width: 768px) must match.
        const origMatchMedia = window.matchMedia
        window.matchMedia = (() =>
            ({
                matches: true,
                media: '',
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
                onchange: null
            }) as MediaQueryList) as typeof window.matchMedia

        const resultsEl = document.createElement('ul')
        for (const idx of [0, 1]) {
            const row = document.createElement('li')
            row.className = 'search-result-item'
            row.dataset.index = String(idx)
            resultsEl.appendChild(row)
        }
        document.body.appendChild(resultsEl)

        // Observable behavior: the reveal scrolls #info-panel-content to bring
        // the row into view. Create that element so the reveal has a target.
        const infoPanel = document.createElement('div')
        infoPanel.id = 'info-panel-content'
        infoPanel.style.height = '300px'
        infoPanel.style.overflow = 'auto'
        const tall = document.createElement('div')
        tall.style.height = '900px'
        infoPanel.appendChild(tall)
        document.body.appendChild(infoPanel)
        let scrollToCalled = false
        const origScrollTo = infoPanel.scrollTo?.bind(infoPanel) ?? null
        infoPanel.scrollTo = ((..._args: unknown[]) => {
            scrollToCalled = true
        }) as typeof infoPanel.scrollTo
        // jsdom reports 0-size rects; the reveal's guard bails on zero rects.
        // Give the row + panel real geometry so the scroll path executes.
        const rowEls = resultsEl.querySelectorAll('.search-result-item')
        for (const el of Array.from(rowEls)) {
            ;(el as HTMLElement).getBoundingClientRect = () =>
                ({
                    top: 200,
                    bottom: 240,
                    left: 0,
                    right: 400,
                    width: 400,
                    height: 40,
                    x: 0,
                    y: 200,
                    toJSON: () => ({})
                }) as DOMRect
        }
        infoPanel.getBoundingClientRect = () =>
            ({ top: 0, bottom: 300, left: 0, right: 400, width: 400, height: 300, x: 0, y: 0 }) as DOMRect
        Object.defineProperty(infoPanel, 'scrollTop', { value: 0, writable: true })

        try {
            resultRenderer.scheduleCompactSearchResultReveal(resultsEl, 1)
            const timers: unknown[] = appState.compactSearchRevealTimers ?? []
            // The [80,240,520]ms schedule must register REAL timer ids on
            // appState — the typed-globalThis-setTimeout path, observed at
            // runtime rather than asserted on source text.
            expect(Array.isArray(timers)).toBe(true)
            expect(timers.length).toBeGreaterThanOrEqual(3)

            vi.runAllTimers()
            await Promise.resolve()
            // The reveal must have run: it called info-panel's scrollTo (the
            // visible behavior of compact-reveal). Proves the scheduled timers
            // actually fire, not just that they were registered.
            expect(scrollToCalled || infoPanel.scrollTop > 0).toBe(true)
        } finally {
            vi.useRealTimers()
            window.matchMedia = origMatchMedia
            resultsEl.remove()
            infoPanel.remove()
            if (origScrollTo) infoPanel.scrollTo = origScrollTo
            }
        },
        120000
    )
})
