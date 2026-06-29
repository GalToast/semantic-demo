// connection-analysis-adapter.ts
// TypeScript shadow of connection-analysis-adapter.js
// Thin adapter boundary: decouples connection-analysis.js from raw global DOM ids and raw state shape.
//
// DOM elements are resolved through the Svelte 5 state-class in app.svelte.ts,
// so this file no longer needs the legacy local DOM helpers.
// `getConnectionStateSnapshot` is kept for the render-state contract test
// (tests/connection-analysis-render-state-contract.mjs).

import { appState as _state } from '@lib/state/app.svelte'

import type { BusinessRecord } from '@lib/types/business'

/**
 * Returns a snapshot of the state fields connection-analysis.js cares about.
 */
export function getConnectionStateSnapshot(): {
    focusedNode: number | null
    points: BusinessRecord[]
    currentSearchSummary: unknown
} {
    return {
        focusedNode: _state.focusedNode,
        points: _state.points as unknown as BusinessRecord[],
        currentSearchSummary: _state.searchState.currentSearchSummary
    }
}
