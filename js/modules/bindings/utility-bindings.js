import { bindClick } from './view-bindings.js';
import { hideSummaryCard, resetExplorationFocus, hideExploreTrailReview } from '../lifecycle.js';
import { closeLegendGuide } from '../legend-ui.js';
import { requestSemanticGuide } from '../semantic-guide.js';
import { traverseNeighbor } from '../journey.js';

export function bindUtilityButtons() {
    bindClick('btn-close-summary', () => {
        if (typeof hideSummaryCard === 'function') hideSummaryCard();
        if (typeof closeLegendGuide === 'function') closeLegendGuide();
    });
    bindClick('btn-close-trail-review', () => {
        if (typeof hideExploreTrailReview === 'function') hideExploreTrailReview();
    }, { optional: true });
    bindClick('btn-synthesize', () => { if (typeof requestSemanticGuide === 'function') requestSemanticGuide(); });
    bindClick('btn-prev-node', () => { traverseNeighbor(-1); });
    bindClick('btn-next-node', () => { traverseNeighbor(1); });
    bindClick('btn-overview', () => { resetExplorationFocus(); }, { optional: true });
}
