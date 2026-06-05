/**
 * Semantic Explorer — UI Renderers
 * Orchestration shim for building and updating HTML strings and DOM components.
 * Logic is now distributed across specialized renderer modules.
 */

import * as searchRendererModule from './search-result-renderer.js';
import * as legendRendererModule from './legend-ui.js';
import * as focusRendererModule from './focus-stage-renderer.js';
import * as trailCueRendererModule from './search-trail-cue-renderer.js';

// ─── RE-EXPORTS ─────────────────────────────────────────────────────────────

import './weather-ui.js';
import './semantic-guide-ui.js';

// Search Result Renderer
export function getSearchResultStrength(...args) { return searchRendererModule.getSearchResultStrength(...args); }
export function getSearchResultStrengthLabel(...args) { return searchRendererModule.getSearchResultStrengthLabel(...args); }
export function getSearchResultCardClasses(...args) { return searchRendererModule.getSearchResultCardClasses(...args); }
export function buildSearchResultSnippet(...args) { return searchRendererModule.buildSearchResultSnippet(...args); }
export function buildSearchRankLabel(...args) { return searchRendererModule.buildSearchRankLabel(...args); }
export function buildSearchStageLabel(...args) { return searchRendererModule.buildSearchStageLabel(...args); }
export function buildSearchResultItemHtml(...args) { return searchRendererModule.buildSearchResultItemHtml(...args); }
export function buildSearchLoadingMarkup(...args) { return searchRendererModule.buildSearchLoadingMarkup(...args); }
export function buildSearchErrorInlineMarkup(...args) { return searchRendererModule.buildSearchErrorInlineMarkup(...args); }
export function buildSearchErrorFullMarkup(...args) { return searchRendererModule.buildSearchErrorFullMarkup(...args); }
export function buildSearchSuggestionChips(...args) { return searchRendererModule.buildSearchSuggestionChips(...args); }
export function buildSearchEmptyStateMarkup(...args) { return searchRendererModule.buildSearchEmptyStateMarkup(...args); }
export function renderResultCountLine(...args) { return searchRendererModule.renderResultCountLine(...args); }
export function renderResultCountLineMarkup(...args) { return searchRendererModule.renderResultCountLineMarkup(...args); }
export function revealActiveSearchResultOnCompact(...args) { return searchRendererModule.revealActiveSearchResultOnCompact(...args); }
export function clearCompactSearchResultRevealTimers(...args) { return searchRendererModule.clearCompactSearchResultRevealTimers(...args); }
export function scheduleCompactSearchResultReveal(...args) { return searchRendererModule.scheduleCompactSearchResultReveal(...args); }
export function setActiveSearchResultRow(...args) { return searchRendererModule.setActiveSearchResultRow(...args); }
export function refreshSearchResultHierarchy(...args) { return searchRendererModule.refreshSearchResultHierarchy(...args); }

// Legend Renderer
export function buildLegend(...args) { return legendRendererModule.buildLegend(...args); }

// Focus Stage Renderer
export function renderSignalBadges(...args) { return focusRendererModule.renderSignalBadges(...args); }
export function updateSelectedCardHeading(...args) {
    return focusRendererModule.updateSelectedCardHeading(...args);
}
export function renderSelectedMetaStrip(...args) {
    return focusRendererModule.renderSelectedMetaStrip(...args);
}
export function renderSelectedMatchPanel(...args) {
    return focusRendererModule.renderSelectedMatchPanel(...args);
}
export function renderSelectedActionRow(...args) {
    return focusRendererModule.renderSelectedActionRow(...args);
}
export function syncSelectedCardContentVariant(...args) {
    return focusRendererModule.syncSelectedCardContentVariant(...args);
}
export function triggerSelectedCardFade(...args) {
    return focusRendererModule.triggerSelectedCardFade(...args);
}
export function getInterestingBusinessNote(...args) { return focusRendererModule.getInterestingBusinessNote(...args); }
export function buildSelectedMatchNarrative(...args) { return focusRendererModule.buildSelectedMatchNarrative(...args); }

// Search Trail Cue Renderer
export function updateSearchTrailCue(...args) { return trailCueRendererModule.updateSearchTrailCue(...args); }
