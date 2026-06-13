/**
 * utility-bindings.ts
 * Typechecked sibling for utility-bindings.js
 * Utility button bindings: close summary, synthesize, prev/next, overview.
 */

import { bindClick } from './view-bindings.ts';
import { hideSummaryCard, resetExplorationFocus, hideExploreTrailReview } from '../lifecycle.ts';
import { closeLegendGuide } from '../legend-ui.ts';
import { requestSemanticGuide } from '../../../src/lib/journey/semantic-guide.ts';
import { traverseNeighbor } from '../journey.ts';

export function bindUtilityButtons(): void {
    bindClick('btn-close-summary', () => {
        if (typeof hideSummaryCard === 'function') hideSummaryCard();
        if (typeof closeLegendGuide === 'function') closeLegendGuide();
    });
    bindClick('btn-close-trail-review', () => {
        if (typeof hideExploreTrailReview === 'function') hideExploreTrailReview();
    }, { optional: true });
    const handleSynthesize = (): void => { if (typeof requestSemanticGuide === 'function') requestSemanticGuide(); };
    const synthesizeButton = document.getElementById('btn-synthesize');
    if (synthesizeButton) synthesizeButton.onclick = handleSynthesize;
    bindClick('btn-synthesize', handleSynthesize);
    bindClick('btn-prev-node', () => { traverseNeighbor(-1); });
    bindClick('btn-next-node', () => { traverseNeighbor(1); });
    bindClick('btn-overview', () => { resetExplorationFocus(); }, { optional: true });
}
