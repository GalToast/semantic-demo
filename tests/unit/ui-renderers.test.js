import { describe, it, expect, vi } from 'vitest';
import * as uiRenderers from '../../js/modules/ui-renderers.js';
import * as searchRendererModule from '../../js/modules/search-result-renderer.js';
import * as legendRendererModule from '../../js/modules/legend-ui.js';
import * as focusRendererModule from '../../js/modules/focus-stage-renderer.js';
import * as trailCueRendererModule from '../../js/modules/search-trail-cue-renderer.js';

vi.mock('../../js/modules/search-result-renderer.js', () => ({
    getSearchResultStrength: vi.fn(),
    getSearchResultStrengthLabel: vi.fn(),
    getSearchResultCardClasses: vi.fn(),
    buildSearchResultSnippet: vi.fn(),
    buildSearchRankLabel: vi.fn(),
    buildSearchStageLabel: vi.fn(),
    buildSearchResultItemHtml: vi.fn(),
    revealActiveSearchResultOnCompact: vi.fn(),
    clearCompactSearchResultRevealTimers: vi.fn(),
    scheduleCompactSearchResultReveal: vi.fn(),
    setActiveSearchResultRow: vi.fn(),
    refreshSearchResultHierarchy: vi.fn()
}));

vi.mock('../../js/modules/legend-ui.js', () => ({
    buildLegend: vi.fn()
}));

vi.mock('../../js/modules/focus-stage-renderer.js', () => ({
    renderSignalBadges: vi.fn(),
    updateSelectedCardHeading: vi.fn(),
    renderSelectedMetaStrip: vi.fn(),
    renderSelectedMatchPanel: vi.fn(),
    renderSelectedActionRow: vi.fn(),
    syncSelectedCardContentVariant: vi.fn(),
    getInterestingBusinessNote: vi.fn(),
    buildSelectedMatchNarrative: vi.fn(),
    initFocusStageRendererAdapter: vi.fn()
}));

vi.mock('../../js/modules/search-trail-cue-renderer.js', () => ({
    updateSearchTrailCue: vi.fn()
}));

describe('ui-renderers shim', () => {
    it('should delegate search result rendering methods', () => {
        uiRenderers.getSearchResultStrength('test');
        expect(searchRendererModule.getSearchResultStrength).toHaveBeenCalledWith('test');
        
        uiRenderers.getSearchResultStrengthLabel('test');
        expect(searchRendererModule.getSearchResultStrengthLabel).toHaveBeenCalledWith('test');
        
        uiRenderers.buildSearchResultItemHtml('test');
        expect(searchRendererModule.buildSearchResultItemHtml).toHaveBeenCalledWith('test');
    });

    it('should delegate legend rendering', () => {
        uiRenderers.buildLegend('test');
        expect(legendRendererModule.buildLegend).toHaveBeenCalledWith('test');
    });

    it('should delegate focus stage rendering methods', () => {
        uiRenderers.updateSelectedCardHeading('test');
        expect(focusRendererModule.updateSelectedCardHeading).toHaveBeenCalledWith('test');
        
        uiRenderers.renderSelectedActionRow('test');
        expect(focusRendererModule.renderSelectedActionRow).toHaveBeenCalledWith('test');

        uiRenderers.syncSelectedCardContentVariant('test');
        expect(focusRendererModule.syncSelectedCardContentVariant).toHaveBeenCalledWith('test');
    });

    it('should delegate trail cue rendering', () => {
        uiRenderers.updateSearchTrailCue('test');
        expect(trailCueRendererModule.updateSearchTrailCue).toHaveBeenCalledWith('test');
    });

    it('should not expose the retired ui renderers adapter initializer', () => {
        expect(uiRenderers.initUiRenderersAdapter).toBeUndefined();
    });
});
