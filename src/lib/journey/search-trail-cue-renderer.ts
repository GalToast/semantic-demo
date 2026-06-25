/**
 * search-trail-cue-renderer.ts
 *
 * Dedicated module for updating the search-trail-cue DOM overlay with narrative framing.
 *
 * Ported from js/modules/search-trail-cue-renderer.ts (W15 Wave E).
 */

import { appState as _state } from '@lib/state/app.svelte'

const state = _state;

export interface SearchTrailCue {
    beat?: string;
    kicker?: string;
    title?: string;
    note?: string;
    stage?: string;
}

/**
 * Updates the search-trail-cue DOM overlay with narrative framing for the search lifecycle.
 */
export function updateSearchTrailCue(nextCue: SearchTrailCue = {}): void {
    const cueEl = document.getElementById('search-trail-cue');
    const kickerEl = document.getElementById('search-trail-cue-kicker');
    const titleEl = document.getElementById('search-trail-cue-title');
    const noteEl = document.getElementById('search-trail-cue-note');
    if (!cueEl || !kickerEl || !titleEl || !noteEl) return;

    if (nextCue.beat === 'idle' || (!nextCue.title && !nextCue.stage)) {
        cueEl.hidden = true;
        cueEl.classList.remove('active');
        return;
    }

    const query = (state.currentSearchSummary as Record<string, unknown> | null)?.query || 'the network';
    const kicker = nextCue.kicker || (nextCue.stage === 'query' ? 'Scanning...' : 'Connection cue');
    const title = nextCue.title || (
        nextCue.stage === 'query' ? `Sifting 8,406 records for '${query}' patterns.` :
        nextCue.stage === 'anchor' ? 'Anchor identified. Trail initialized.' :
        nextCue.stage === 'explore' ? 'Search opens a trail.' :
        'Search opens a trail.'
    );
    const note = nextCue.note || (
        nextCue.stage === 'query' ? 'High-fidelity semantic analysis is aligning relevant business clusters.' :
        nextCue.stage === 'anchor' ? 'The strongest match has become the anchor. You can now center it and explore its neighborhood.' :
        nextCue.stage === 'explore' ? 'Enter the neighborhood to explore related businesses and discover record-backed connections.' :
        'The first strong match becomes the anchor; from there you can center it and continue through related businesses.'
    );

    kickerEl.textContent = kicker;
    titleEl.textContent = title;
    noteEl.textContent = note;

    const stage = nextCue.stage || 'query';
    cueEl.querySelectorAll<HTMLElement>('.search-trail-cue-step').forEach(el => {
        el.classList.toggle('active', el.dataset.cueStage === stage);
    });

    cueEl.hidden = false;
    cueEl.classList.add('active');
    state.searchTrailCueLastRenderedAt = performance.now();
}
