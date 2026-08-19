/**
 * component-FocusNeighborhood.test.ts — FocusNeighborhood.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * role filter chips, neighbor rail, empty-state fallback.
 *
 * Note: FocusNeighborhood has heavy store dependencies (focusStore, viewport,
 * threadInspector). This test focuses on the conditional rendering branches
 * that are prop-driven (chromeHasFocus, threadCandidates).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import FocusNeighborhood from '../../src/lib/components/journey/FocusNeighborhood.svelte'

afterEach(() => cleanup())

// Minimal mock — the component imports stores that aren't available in jsdom.
// We test the empty-state branch which is gated by chromeHasFocus + no candidates.
describe('FocusNeighborhood component', () => {
    it('renders empty-state when chromeHasFocus but no candidates', async () => {
        // The component imports focusStore and viewport which may not be set up.
        // We test that the component renders without throwing when given minimal props.
        // The empty-state branch is: chromeHasFocus && filteredCandidates.length === 0 && !threadInspectorActive()
        // Since threadCandidates is empty, filteredCandidates will be empty.
        const { container } = render(FocusNeighborhood, {
            props: {
                chromeHasFocus: true,
                threadCandidates: [],
                focusedIndex: null,
                getPointForIndex: () => null
            }
        })
        // Should render the empty-state container
        const empty = container.querySelector('#focus-stage-neighbors')
        expect(empty).not.toBeNull()
        expect(container.textContent).toContain('0 visible neighbors')
    })

    it('does not render neighbor rail when chromeHasFocus is false', async () => {
        const { container } = render(FocusNeighborhood, {
            props: {
                chromeHasFocus: false,
                threadCandidates: [],
                focusedIndex: null,
                getPointForIndex: () => null
            }
        })
        // When chromeHasFocus is false, neither role filters nor rail nor empty state render
        expect(container.querySelector('#focus-role-filters')).toBeNull()
        expect(container.querySelector('#focus-stage-neighbors')).toBeNull()
    })

    it('renders role filter chips when chromeHasFocus and candidates have roles', async () => {
        const candidates = [
            { index: 1, relationshipRole: 'direct' as const, relationshipAxis: 'x', roleReason: 'r', reason: 'nearby' },
            { index: 2, relationshipRole: 'support' as const, relationshipAxis: 'y', roleReason: 'r', reason: 'nearby' }
        ]
        const { container } = render(FocusNeighborhood, {
            props: {
                chromeHasFocus: true,
                threadCandidates: candidates,
                focusedIndex: null,
                getPointForIndex: () => null
            }
        })
        // Role filter chips should render because candidates have non-unclassified roles
        const filters = container.querySelector('#focus-role-filters')
        expect(filters).not.toBeNull()
        const chips = [...container.querySelectorAll('.focus-role-filter-chip')]
        expect(chips.length).toBeGreaterThan(0)
    })

    it('does not render role filters when all candidates are unclassified', async () => {
        const candidates = [
            {
                index: 1,
                relationshipRole: 'unclassified' as const,
                relationshipAxis: 'x',
                roleReason: 'r',
                reason: 'nearby'
            }
        ]
        const { container } = render(FocusNeighborhood, {
            props: {
                chromeHasFocus: true,
                threadCandidates: candidates,
                focusedIndex: null,
                getPointForIndex: () => null
            }
        })
        expect(container.querySelector('#focus-role-filters')).toBeNull()
    })
})
