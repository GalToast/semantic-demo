/**
 * ui-renderers.ts
 *
 * TypeScript shadow for ui-renderers.js
 * Orchestration shim for building and updating HTML strings and DOM components.
 */

import * as searchRendererModule from './search-result-renderer.js';
import * as legendRendererModule from './legend-ui.js';
import * as focusRendererModule from './focus-stage-renderer.js';
import * as trailCueRendererModule from './search-trail-cue-renderer.js';

import './weather-ui.js';
import './semantic-guide-ui.js';

// Search Result Renderer
export function getSearchResultStrength(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).getSearchResultStrength(...args); }
export function getSearchResultStrengthLabel(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).getSearchResultStrengthLabel(...args); }
export function getSearchResultCardClasses(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).getSearchResultCardClasses(...args); }
export function buildSearchResultSnippet(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).buildSearchResultSnippet(...args); }
export function buildSearchRankLabel(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).buildSearchRankLabel(...args); }
export function buildSearchStageLabel(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).buildSearchStageLabel(...args); }
export function renderResultCountLine(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).renderResultCountLine(...args); }
export function revealActiveSearchResultOnCompact(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).revealActiveSearchResultOnCompact(...args); }
export function clearCompactSearchResultRevealTimers(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).clearCompactSearchResultRevealTimers(...args); }
export function scheduleCompactSearchResultReveal(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).scheduleCompactSearchResultReveal(...args); }
export function setActiveSearchResultRow(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).setActiveSearchResultRow(...args); }
export function refreshSearchResultHierarchy(...args: unknown[]): unknown { return (searchRendererModule as Record<string, Function>).refreshSearchResultHierarchy(...args); }

// Legend Renderer
export function buildLegend(...args: unknown[]): unknown { return (legendRendererModule as Record<string, Function>).buildLegend(...args); }

// Focus Stage Renderer
export function renderSignalBadges(...args: unknown[]): unknown { return (focusRendererModule as Record<string, Function>).renderSignalBadges(...args); }
export function updateSelectedCardHeading(...args: unknown[]): unknown {
    return (focusRendererModule as Record<string, Function>).updateSelectedCardHeading(...args);
}
export function renderSelectedMetaStrip(...args: unknown[]): unknown {
    return (focusRendererModule as Record<string, Function>).renderSelectedMetaStrip(...args);
}
export function renderSelectedMatchPanel(...args: unknown[]): unknown {
    return (focusRendererModule as Record<string, Function>).renderSelectedMatchPanel(...args);
}
export function renderSelectedActionRow(...args: unknown[]): unknown {
    return (focusRendererModule as Record<string, Function>).renderSelectedActionRow(...args);
}
export function syncSelectedCardContentVariant(...args: unknown[]): unknown {
    return (focusRendererModule as Record<string, Function>).syncSelectedCardContentVariant(...args);
}
export function triggerSelectedCardFade(...args: unknown[]): unknown {
    return (focusRendererModule as Record<string, Function>).triggerSelectedCardFade(...args);
}
export function getInterestingBusinessNote(...args: unknown[]): unknown { return (focusRendererModule as Record<string, Function>).getInterestingBusinessNote(...args); }
export function buildSelectedMatchNarrative(...args: unknown[]): unknown { return (focusRendererModule as Record<string, Function>).buildSelectedMatchNarrative(...args); }

// Search Trail Cue Renderer
export function updateSearchTrailCue(...args: unknown[]): unknown { return (trailCueRendererModule as Record<string, Function>).updateSearchTrailCue(...args); }
