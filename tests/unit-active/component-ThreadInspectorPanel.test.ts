/**
 * component-ThreadInspectorPanel.test.ts — ThreadInspectorPanel.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * inspector section, header, title, copy, meta (populated/empty), action buttons.
 *
 * Note: ThreadInspectorPanel has heavy store dependencies (focusStore,
 * navigation, appState, viewport, journey). This test focuses on the
 * DOM structure and conditional rendering branches that are prop-driven.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import ThreadInspectorPanel from '../../src/lib/components/journey/ThreadInspectorPanel.svelte'

afterEach(() => cleanup())

const baseSnapshot = {
    threadInspector: {
        active: false,
        inspectedIndex: null,
        pinnedIndex: null,
        source: undefined,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    },
    inspectedStrandIndex: null,
    strandContinuityPhase: 'idle' as const
}

function renderPanel(overrides: Partial<{}> = {}) {
    const defaults = {
        focusSnapshot: baseSnapshot,
        bodyThreadInspectSurface: 'idle',
        bodyStrandJourney: 'idle'
    }
    return render(ThreadInspectorPanel, { props: { ...defaults, ...overrides } })
}

describe('ThreadInspectorPanel component', () => {
    it('renders the inspector section', () => {
        const { container } = renderPanel()
        const section = container.querySelector('section.focus-thread-inspector')
        expect(section).not.toBeNull()
    })

    it('has id="focus-thread-inspector"', () => {
        const { container } = renderPanel()
        expect(container.querySelector('#focus-thread-inspector')).not.toBeNull()
    })

    it('has aria-labelledby pointing to title', () => {
        const { container } = renderPanel()
        const section = container.querySelector('section')
        expect(section?.getAttribute('aria-labelledby')).toBe('focus-thread-inspector-title')
    })

    it('renders the inspector header with kicker', () => {
        const { container } = renderPanel()
        const kicker = container.querySelector('.focus-thread-inspector-kicker')
        expect(kicker?.textContent).toBe('Similar-Business Preview')
    })

    it('renders the close button in header', () => {
        const { container } = renderPanel()
        const closeBtn = container.querySelector('.inspector-close')
        expect(closeBtn).not.toBeNull()
        expect(closeBtn?.getAttribute('aria-label')).toBe('Close inspector')
    })

    it('renders the title heading', () => {
        const { container } = renderPanel()
        const title = container.querySelector('#focus-thread-inspector-title')
        expect(title).not.toBeNull()
        expect(title?.textContent).toContain('Similar-Business Inspector')
    })

    it('renders the copy paragraph', () => {
        const { container } = renderPanel()
        const copy = container.querySelector('#focus-thread-inspector-copy')
        expect(copy).not.toBeNull()
        expect(copy?.textContent).toContain('Select a nearby stop')
    })

    it('renders empty meta when inspector is inactive', () => {
        const { container } = renderPanel()
        const meta = container.querySelector('#focus-thread-inspector-meta-empty')
        expect(meta).not.toBeNull()
        expect(container.textContent).toContain('Preview similar businesses')
    })

    it('renders populated meta when inspector has stats', () => {
        const snap = {
            ...baseSnapshot,
            threadInspector: {
                active: true,
                inspectedIndex: 5,
                pinnedIndex: null,
                source: 'rail-hover',
                segmentCount: 3,
                braidCount: 1,
                endpointCount: 2
            }
        }
        const { container } = renderPanel({ focusSnapshot: snap })
        const meta = container.querySelector('#focus-thread-inspector-meta-populated')
        expect(meta).not.toBeNull()
        expect(container.textContent).toContain('3 stops')
        expect(container.textContent).toContain('1 overlapping paths')
        expect(container.textContent).toContain('2 destinations')
    })

    it('does not render populated meta when inspector is inactive', () => {
        const { container } = renderPanel()
        expect(container.querySelector('#focus-thread-inspector-meta-populated')).toBeNull()
    })

    it('renders action buttons', () => {
        const { container } = renderPanel()
        expect(container.querySelector('#btn-thread-pin')).not.toBeNull()
        expect(container.querySelector('#btn-thread-follow')).not.toBeNull()
        expect(container.querySelector('#btn-thread-clear')).not.toBeNull()
    })

    it('has actions container with aria-label', () => {
        const { container } = renderPanel()
        const actions = container.querySelector('.focus-thread-inspector-actions')
        expect(actions?.getAttribute('aria-label')).toBe('Connection actions')
    })

    it('disables pin button when no inspected index', () => {
        const { container } = renderPanel()
        const pinBtn = container.querySelector('#btn-thread-pin')
        expect(pinBtn?.hasAttribute('disabled')).toBe(true)
    })

    it('enables pin button when inspected index is set', () => {
        const snap = {
            ...baseSnapshot,
            threadInspector: {
                active: true,
                inspectedIndex: 5,
                pinnedIndex: null,
                source: 'rail-hover',
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        }
        const { container } = renderPanel({ focusSnapshot: snap })
        const pinBtn = container.querySelector('#btn-thread-pin')
        expect(pinBtn?.hasAttribute('disabled')).toBe(false)
    })

    it('shows "Pin Connection" label when not pinned (desktop)', () => {
        const snap = {
            ...baseSnapshot,
            threadInspector: {
                active: true,
                inspectedIndex: 5,
                pinnedIndex: null,
                source: 'rail-hover',
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        }
        const { container } = renderPanel({ focusSnapshot: snap })
        const pinBtn = container.querySelector('#btn-thread-pin')
        expect(pinBtn?.textContent).toContain('Pin Connection')
    })

    it('shows "Unpin Connection" when pinned', () => {
        const snap = {
            ...baseSnapshot,
            threadInspector: {
                active: true,
                inspectedIndex: 5,
                pinnedIndex: 5,
                source: 'rail-hover',
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        }
        const { container } = renderPanel({ focusSnapshot: snap })
        const pinBtn = container.querySelector('#btn-thread-pin')
        expect(pinBtn?.textContent).toContain('Unpin Connection')
        expect(pinBtn?.getAttribute('aria-pressed')).toBe('true')
    })

    it('renders Close on the clear button', () => {
        const { container } = renderPanel()
        const clearBtn = container.querySelector('#btn-thread-clear')
        expect(clearBtn?.textContent).toBe('Close')
    })

    it('applies .active class when inspector is active', () => {
        const snap = {
            ...baseSnapshot,
            threadInspector: {
                active: true,
                inspectedIndex: 5,
                pinnedIndex: null,
                source: 'rail-hover',
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        }
        const { container } = renderPanel({ focusSnapshot: snap })
        const section = container.querySelector('section')
        expect(section?.classList.contains('active')).toBe(true)
    })

    it('does not apply .active class when inspector is inactive', () => {
        const { container } = renderPanel()
        const section = container.querySelector('section')
        expect(section?.classList.contains('active')).toBe(false)
    })

    it('has data-thread-inspect-surface attribute', () => {
        const { container } = renderPanel({ bodyThreadInspectSurface: 'rail-inspect' })
        const section = container.querySelector('section')
        expect(section?.getAttribute('data-thread-inspect-surface')).toBe('rail-inspect')
    })

    it('has data-strand-journey attribute', () => {
        const { container } = renderPanel({ bodyStrandJourney: 'exploring' })
        const section = container.querySelector('section')
        expect(section?.getAttribute('data-strand-journey')).toBe('exploring')
    })
})
