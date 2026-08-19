/**
 * component-MapStatusOverlay.test.ts — MapStatusOverlay.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * loading shimmer, status overlay, error state, ready state (nothing rendered).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import MapStatusOverlay from '../../src/lib/components/MapStatusOverlay.svelte'

afterEach(() => cleanup())

describe('MapStatusOverlay component', () => {
    it('renders shimmer when status is loading', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'loading', statusDetail: 'Loading map...', friendlyError: null, onRetry: vi.fn() }
        })
        expect(container.querySelector('.map-shimmer')).not.toBeNull()
        expect(container.querySelectorAll('.shimmer-row')).toHaveLength(3)
    })

    it('renders status overlay when status is not ready', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'loading', statusDetail: 'Loading map...', friendlyError: null, onRetry: vi.fn() }
        })
        const status = container.querySelector('.map-status')
        expect(status).not.toBeNull()
        expect(status?.getAttribute('role')).toBe('status')
        expect(status?.getAttribute('aria-live')).toBe('polite')
    })

    it('renders status detail text when not error', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'loading', statusDetail: 'Loading map tiles...', friendlyError: null, onRetry: vi.fn() }
        })
        expect(container.textContent).toContain('Loading map tiles...')
    })

    it('renders nothing when status is ready', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'ready', statusDetail: '', friendlyError: null, onRetry: vi.fn() }
        })
        expect(container.querySelector('.map-shimmer')).toBeNull()
        expect(container.querySelector('.map-status')).toBeNull()
    })

    it('applies is-error class when status is error', () => {
        const { container } = render(MapStatusOverlay, {
            props: {
                status: 'error',
                statusDetail: '',
                friendlyError: { title: 'Map failed', detail: 'Network issue', technical: 'ERR_MAP' },
                onRetry: vi.fn()
            }
        })
        const status = container.querySelector('.map-status')
        expect(status?.classList.contains('is-error')).toBe(true)
    })

    it('renders error dot without pulse animation when error', () => {
        const { container } = render(MapStatusOverlay, {
            props: {
                status: 'error',
                statusDetail: '',
                friendlyError: { title: 'Map failed', detail: null, technical: null },
                onRetry: vi.fn()
            }
        })
        const dot = container.querySelector('.map-status-dot')
        expect(dot).not.toBeNull()
    })

    it('renders loading dot with pulse animation when loading', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'loading', statusDetail: 'Loading...', friendlyError: null, onRetry: vi.fn() }
        })
        const dot = container.querySelector('.map-status-dot')
        expect(dot).not.toBeNull()
    })

    it('renders shimmer rows with different widths', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'loading', statusDetail: '', friendlyError: null, onRetry: vi.fn() }
        })
        const rows = [...container.querySelectorAll('.shimmer-row')]
        expect(rows).toHaveLength(3)
        expect(rows[0]?.classList.contains('short')).toBe(false)
        expect(rows[1]?.classList.contains('short')).toBe(true)
        expect(rows[2]?.classList.contains('medium')).toBe(true)
    })

    it('has aria-hidden on shimmer', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'loading', statusDetail: '', friendlyError: null, onRetry: vi.fn() }
        })
        const shimmer = container.querySelector('.map-shimmer')
        expect(shimmer?.getAttribute('aria-hidden')).toBe('true')
    })

    it('calls onRetry when retry button is clicked (error state)', async () => {
        const onRetry = vi.fn()
        const { container } = render(MapStatusOverlay, {
            props: {
                status: 'error',
                statusDetail: '',
                friendlyError: { title: 'Map failed', detail: null, technical: null },
                onRetry
            }
        })
        const retryBtn = container.querySelector('button')
        expect(retryBtn).not.toBeNull()
        await retryBtn!.click()
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('does not render retry button when not in error state', () => {
        const { container } = render(MapStatusOverlay, {
            props: { status: 'loading', statusDetail: 'Loading...', friendlyError: null, onRetry: vi.fn() }
        })
        expect(container.querySelector('button')).toBeNull()
    })
})
