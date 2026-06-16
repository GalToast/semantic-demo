import { describe, it, expect, beforeEach } from 'vitest';
import { setActiveSearchResultRow } from '../../src/lib/search/result-renderer.ts';
import { state, withStateMutation } from '../../js/state';

describe('search-result-renderer', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="search-results" class="search-results active">
                <button class="search-result-item active-focus" data-index="988" aria-current="true">Coffee anchor</button>
                <button class="search-result-item" data-index="1617">Coffee result</button>
            </div>
        `;
        withStateMutation(() => {
            Object.assign(state, {
                focusedNode: 0,
                navState: {
                    mode: 'focus',
                    focusedIndex: 0,
                    explorationHistoryIndices: [0]
                },
                currentSearchSummary: {
                    query: 'coffee',
                    anchorIndex: 988,
                    topIndex: 988,
                    resultIndices: [988, 1617]
                }
            });
        });
    });

    it('does not mark a search row current when focused node is outside the result trail', () => {
        const resultsEl = document.getElementById('search-results');

        setActiveSearchResultRow(resultsEl, 988, { reveal: false });

        const activeRows = [...resultsEl.querySelectorAll('.search-result-item.active-focus')];
        expect(activeRows).toHaveLength(0);
        expect(resultsEl.querySelector('[aria-current="true"]')).toBeNull();
    });
});
