/**
 * search-trail-cue-renderer.ts
 *
 * Dedicated module for updating the search-trail-cue DOM overlay with narrative framing.
 *
 * Ported from (W15 Wave E).
 */

import { appState as _state } from '@lib/state/app.svelte'

const state = _state

export interface SearchTrailCue {
    beat?: string
    kicker?: string
    title?: string
    note?: string
    stage?: string
}

/**
 * Updates the search-trail-cue DOM overlay with narrative framing for the search lifecycle.
 */
export function updateSearchTrailCue(nextCue: SearchTrailCue = {}): void {
    const cueEl = document.getElementById('search-trail-cue')
    const kickerEl = document.getElementById('search-trail-cue-kicker')
    const titleEl = document.getElementById('search-trail-cue-title')
    const noteEl = document.getElementById('search-trail-cue-note')
    if (!cueEl || !kickerEl || !titleEl || !noteEl) return

    if (nextCue.beat === 'idle') {
        cueEl.hidden = true
        cueEl.classList.remove('active')
        return
    }

    const query = (state.searchState.currentSearchSummary as Record<string, unknown> | null)?.query || 'the network'
    const kicker = nextCue.kicker || (nextCue.stage === 'query' ? 'Scanning...' : 'Connection cue')
    const title =
        nextCue.title ||
        (nextCue.stage === 'query'
            ? `Sifting 8,406 records for '${query}' patterns.`
            : nextCue.stage === 'anchor'
              ? 'Anchor identified. Trail initialized.'
              : nextCue.stage === 'empty'
                ? 'No matching anchor found.'
                : nextCue.stage === 'explore'
                  ? 'Search opens a trail.'
                  : 'Search opens a trail.')
    const note =
        nextCue.note ||
        (nextCue.stage === 'query'
            ? 'High-fidelity semantic analysis is aligning relevant business clusters.'
            : nextCue.stage === 'anchor'
              ? 'The strongest match has become the anchor. You can now center it and explore its neighborhood.'
              : nextCue.stage === 'empty'
                ? 'Try a different term or filter to discover a trail.'
                : nextCue.stage === 'explore'
                  ? 'Enter the neighborhood to explore related businesses and discover record-backed connections.'
                  : 'The first strong match becomes the anchor; from there you can center it and continue through related businesses.')

    kickerEl.textContent = kicker
    titleEl.textContent = title
    noteEl.textContent = note

    const stage =
        nextCue.stage ??
        // PR-I (2026-06-30): derive the highlighted chip from the beat when
        // no explicit stage is passed. Without this, ui-feedback.ts calls
        // with { beat: 'focus', ... } (anchor locked) and { beat: 'walk', ... }
        // (trail walking) — both omit stage — fall through to the default
        // 'query' chip highlight, which contradicts the user's actual
        // progress. Map 'focus' → 'anchor' (chip 2) and 'walk' → 'explore'
        // (chip 3) to match the narrative.
        (nextCue.beat === 'focus' ? 'anchor' : nextCue.beat === 'walk' ? 'explore' : 'query')
    cueEl.querySelectorAll<HTMLElement>('.search-trail-cue-step').forEach((el) => {
        el.classList.toggle('active', el.dataset.cueStage === stage)
    })

    cueEl.hidden = false
    cueEl.classList.add('active')
    state.searchTrailCueLastRenderedAt = performance.now()
}
