/**
 * ui-renderers.ts
 *
 * TypeScript shadow for ui-renderers.js
 * Orchestration shim for building and updating HTML strings and DOM components.
 */

import * as searchRendererModule from './search-result-renderer.ts';
import * as legendRendererModule from './legend-ui.ts';
import * as focusRendererModule from './focus-stage-renderer.ts';
import * as trailCueRendererModule from './search-trail-cue-renderer.ts';

import './weather-ui.js';
import './semantic-guide-ui.js';

type RendererFn = (...args: unknown[]) => unknown;
type RendererModule = Record<string, RendererFn>;

const searchRenderers = searchRendererModule as unknown as RendererModule;
const legendRenderers = legendRendererModule as unknown as RendererModule;
const focusRenderers = focusRendererModule as unknown as RendererModule;
const trailCueRenderers = trailCueRendererModule as unknown as RendererModule;

// Search Result Renderer
export function getSearchResultStrength(...args: unknown[]): unknown { return searchRenderers.getSearchResultStrength!(...args); }
export function getSearchResultStrengthLabel(...args: unknown[]): unknown { return searchRenderers.getSearchResultStrengthLabel!(...args); }
export function getSearchResultCardClasses(...args: unknown[]): unknown { return searchRenderers.getSearchResultCardClasses!(...args); }
export function buildSearchResultSnippet(...args: unknown[]): unknown { return searchRenderers.buildSearchResultSnippet!(...args); }
export function buildSearchRankLabel(...args: unknown[]): unknown { return searchRenderers.buildSearchRankLabel!(...args); }
export function buildSearchStageLabel(...args: unknown[]): unknown { return searchRenderers.buildSearchStageLabel!(...args); }
export function renderResultCountLine(...args: unknown[]): unknown { return searchRenderers.renderResultCountLine!(...args); }
export function revealActiveSearchResultOnCompact(...args: unknown[]): unknown { return searchRenderers.revealActiveSearchResultOnCompact!(...args); }
export function clearCompactSearchResultRevealTimers(...args: unknown[]): unknown { return searchRenderers.clearCompactSearchResultRevealTimers!(...args); }
export function scheduleCompactSearchResultReveal(...args: unknown[]): unknown { return searchRenderers.scheduleCompactSearchResultReveal!(...args); }
export function setActiveSearchResultRow(...args: unknown[]): unknown { return searchRenderers.setActiveSearchResultRow!(...args); }
export function refreshSearchResultHierarchy(...args: unknown[]): unknown { return searchRenderers.refreshSearchResultHierarchy!(...args); }

// Legend Renderer
export function buildLegend(...args: unknown[]): unknown { return legendRenderers.buildLegend!(...args); }

// Focus Stage Renderer
export function renderSignalBadges(...args: unknown[]): unknown { return focusRenderers.renderSignalBadges!(...args); }
export function updateSelectedCardHeading(...args: unknown[]): unknown {
    return focusRenderers.updateSelectedCardHeading!(...args);
}
export function renderSelectedMetaStrip(...args: unknown[]): unknown {
    return focusRenderers.renderSelectedMetaStrip!(...args);
}
export function renderSelectedMatchPanel(...args: unknown[]): unknown {
    return focusRenderers.renderSelectedMatchPanel!(...args);
}
export function renderSelectedActionRow(...args: unknown[]): unknown {
    return focusRenderers.renderSelectedActionRow!(...args);
}
export function syncSelectedCardContentVariant(...args: unknown[]): unknown {
    return focusRenderers.syncSelectedCardContentVariant!(...args);
}
export function triggerSelectedCardFade(...args: unknown[]): unknown {
    return focusRenderers.triggerSelectedCardFade!(...args);
}
export function getInterestingBusinessNote(...args: unknown[]): unknown { return focusRenderers.getInterestingBusinessNote!(...args); }
export function buildSelectedMatchNarrative(...args: unknown[]): unknown { return focusRenderers.buildSelectedMatchNarrative!(...args); }

// Search Trail Cue Renderer
export function updateSearchTrailCue(...args: unknown[]): unknown { return trailCueRenderers.updateSearchTrailCue!(...args); }
