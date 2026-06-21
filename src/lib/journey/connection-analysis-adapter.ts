// connection-analysis-adapter.ts
// TypeScript shadow of connection-analysis-adapter.js
// Thin adapter boundary: decouples connection-analysis.js from raw global DOM ids and raw state shape.

import { appState as _state } from '@lib/state/app.svelte'

const state = _state as any

/**
 * Returns a snapshot of the state fields connection-analysis.js cares about.
 */
export function getConnectionStateSnapshot(): {
    focusedNode: number | null
    points: any[]
    currentSearchSummary: unknown
} {
    return {
        focusedNode: state.focusedNode,
        points: state.points,
        currentSearchSummary: state.currentSearchSummary
    }
}

/**
 * Returns DOM element by id.
 */
export function getElementById(id: string): Element | null {
    return document.getElementById(id)
}

/** summary-text: shown on early-return when no search/focus is available */
export function getSummaryTextEl(): HTMLElement | null {
    return document.getElementById('summary-text')
}

/** semantic-summary-card: receives is-synthesizing class during load */
export function getSummaryCardEl(): HTMLElement | null {
    return document.getElementById('semantic-summary-card')
}

/** summary-gemma-story: toggled visible/hidden during load */
export function getStoryNoteEl(): HTMLElement | null {
    return document.getElementById('summary-gemma-story')
}

/** summary-gemma-story-text: populated with story text or error message */
export function getStoryTextEl(): HTMLElement | null {
    return document.getElementById('summary-gemma-story-text')
}

/** summary-gemma-story-source: populated with source name / cache age info */
export function getStorySourceEl(): HTMLElement | null {
    return document.getElementById('summary-gemma-story-source')
}
