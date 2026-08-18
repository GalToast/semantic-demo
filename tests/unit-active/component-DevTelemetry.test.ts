/**
 * component-DevTelemetry.test.ts — DevTelemetry.svelte behavioral contract.
 *
 * DevTelemetry is a floating dev overlay that renders a snapshot of the
 * in-process telemetry ring buffer: per-event counts, the last 8 events,
 * total/dropped/buffer stats, plus Clear + auto-scroll toggle. It is the
 * only one of the four dev-tool components with real user-facing chrome, so
 * its test exercises the render path directly against the real telemetry
 * store (no mocks) — the other three are pure lazy-component or bridge
 * aggregators covered by their own component tests.
 *
 * Privacy invariant asserted here: the overlay shows event NAMES + key
 * counts only. A regression that starts echoing raw payload values into the
 * DOM would fail the snapshot assertion, because the store never stores
 * payloads in the first place.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import DevTelemetry from '../../src/components/DevTelemetry.svelte'
import { telemetryStore, recordTelemetry, configureTelemetry, clearTelemetry, getSnapshot } from '@lib/telemetry'

// recordTelemetry is a no-op while the store is disabled (the default in
// tests). Enable it once for the whole file so the record/clear/overlay
// assertions below exercise real state instead of empty snapshots.
configureTelemetry({ enabled: true, mirrorToConsole: false })

describe('DevTelemetry component', () => {
    // afterEach clears events AND disables the store so the next test starts
    // from a clean slate; beforeEach re-enables it so recordTelemetry works.
    beforeEach(() => {
        configureTelemetry({ enabled: true, mirrorToConsole: false })
    })
    afterEach(() => {
        clearTelemetry()
        configureTelemetry({ enabled: false, mirrorToConsole: false })
        cleanup()
    })

    it('renders nothing when visible is false', () => {
        const { container } = render(DevTelemetry, { props: { visible: false } })
        expect(container.querySelectorAll('*').length).toBe(0)
    })

    it('shows the empty state before any events are recorded', async () => {
        clearTelemetry()
        const { getByText, container } = render(DevTelemetry, { props: { visible: true } })
        // The component gates its DOM on `visible && mounted`, and `mounted`
        // is set in onMount — which runs after the first render. tick() is
        // not enough; poll until the overlay actually mounts.
        await vi.waitFor(() => {
            if (!container.querySelector('.dev-telemetry')) {
                throw new Error('overlay not yet mounted')
            }
        })
        expect(getByText('No events recorded yet.')).toBeTruthy()
    })

    it('renders per-event counts and recent events after recordTelemetry', async () => {
        clearTelemetry()
        recordTelemetry('search-query', { q: 'coffee' })
        recordTelemetry('search-query', { q: 'tea' })
        recordTelemetry('focus-node', { id: 5 })

        const { container } = render(DevTelemetry, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!container.querySelector('.dev-telemetry')) {
                throw new Error('overlay not yet mounted')
            }
        })

        // The count table shows each event name + its count.
        // search-query appears in BOTH the count table (as `<code>`) and the
        // recent list (as `.event-name`), so getByText is ambiguous — query
        // each section by class instead.
        const countNames = [...container.querySelectorAll('.dev-telemetry-table code')].map((el) => el.textContent)
        expect(countNames).toContain('search-query')
        expect(countNames).toContain('focus-node')
        expect(container.textContent).toContain('2')

        // The recent-events list shows the last 8 events newest-first.
        const emptyPlaceholder = container.querySelector('.dev-telemetry-recent .dev-telemetry-empty')
        expect(emptyPlaceholder, 'recent list must not show the empty placeholder').toBeNull()
        const eventNames = [...container.querySelectorAll('.event-name')].map((el) => el.textContent)
        expect(eventNames).toContain('focus-node')
        expect(eventNames).toContain('search-query')
    })

    it('shows total / dropped / buffer stats from the live snapshot', async () => {
        clearTelemetry()
        recordTelemetry('evt-a', {})
        recordTelemetry('evt-b', {})
        const { container } = render(DevTelemetry, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!container.querySelector('.dev-telemetry')) {
                throw new Error('overlay not yet mounted')
            }
        })

        const text = container.textContent ?? ''
        expect(text).toContain('total:')
        expect(text).toContain('buffer:')
        // The snapshot's totalRecorded is 2.
        expect(text).toContain('2')
    })

    it('Clear button wipes the store and the overlay re-renders the empty state', async () => {
        clearTelemetry()
        recordTelemetry('search-query', { q: 'coffee' })
        const { container } = render(DevTelemetry, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!container.querySelector('.dev-telemetry')) {
                throw new Error('overlay not yet mounted')
            }
        })
        // search-query appears in both the count table and the recent list,
        // so assert via scoped class queries rather than getByText.
        const countNames = [...container.querySelectorAll('.dev-telemetry-table code')].map((el) => el.textContent)
        expect(countNames, 'count row must be rendered').toContain('search-query')

        // The Clear button calls telemetryStore.clear().
        const clearBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'clear')
        expect(clearBtn, 'Clear button must be rendered').toBeTruthy()
        await fireEvent.click(clearBtn!)
        await vi.waitFor(() => {
            if (getSnapshot().totalRecorded !== 0) {
                throw new Error('store not cleared yet')
            }
        })

        expect(getSnapshot().totalRecorded).toBe(0)
        const emptyText = container.querySelector('.dev-telemetry-counts .dev-telemetry-empty')?.textContent
        expect(emptyText, 'count table must re-render the empty state after clear').toContain('No events recorded yet.')
    })

    it('auto-scroll toggle flips aria-pressed', async () => {
        clearTelemetry()
        recordTelemetry('evt-a', {})
        const { container } = render(DevTelemetry, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!container.querySelector('.dev-telemetry')) {
                throw new Error('overlay not yet mounted')
            }
        })

        const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
            /auto-scroll/i.test(b.textContent ?? '')
        )
        expect(toggle, 'auto-scroll toggle must be rendered').toBeTruthy()
        expect(toggle?.getAttribute('aria-pressed')).toBe('true')

        await fireEvent.click(toggle!)
        await vi.waitFor(() => {
            if (toggle?.getAttribute('aria-pressed') !== 'false') {
                throw new Error('aria-pressed not yet false')
            }
        })
        expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    })

    it('never echoes raw payload values into the DOM (privacy invariant)', async () => {
        clearTelemetry()
        // Record events carrying PII-shaped payloads. The store only keeps
        // keys + types + byte size, so the overlay cannot surface them.
        recordTelemetry('search-query', { q: 'confidential-query', email: 'a@b.com' })
        recordTelemetry('focus-node', { name: 'Secret Business LLC' })

        const { container } = render(DevTelemetry, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!container.querySelector('.dev-telemetry')) {
                throw new Error('overlay not yet mounted')
            }
        })

        const text = container.textContent ?? ''
        expect(text, 'overlay must not echo raw payload values').not.toContain('confidential-query')
        expect(text, 'overlay must not echo raw payload values').not.toContain('a@b.com')
        expect(text, 'overlay must not echo raw payload values').not.toContain('Secret Business LLC')
        // But the event NAME is still surfaced (that's the point of the overlay).
        expect(text).toContain('search-query')
    })
})
