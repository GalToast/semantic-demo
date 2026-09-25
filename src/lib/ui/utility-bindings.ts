import { bindClick } from '@lib/ui/view-bindings'
import { hideSummaryCard, resetExplorationFocus } from '@lib/engine/lifecycle-bridge'
import { hideExploreTrailReview } from '@lib/stores/lifecycle'
import { closeLegendGuide } from '@lib/stores/legend-panel'
import { requestSemanticGuide } from '@lib/journey/semantic-guide'
import { traverseNeighbor } from '@lib/journey/thread-settler-adapter'

export function bindUtilityButtons(): void {
    bindClick('btn-close-summary', () => {
        if (typeof hideSummaryCard === 'function') hideSummaryCard()
        if (typeof closeLegendGuide === 'function') closeLegendGuide()
    })
    bindClick(
        'btn-close-trail-review',
        () => {
            if (typeof hideExploreTrailReview === 'function') hideExploreTrailReview()
        },
        { optional: true }
    )
    const handleSynthesize = (): void => {
        if (typeof requestSemanticGuide === 'function') requestSemanticGuide()
    }
    const synthesizeButton = document.getElementById('btn-synthesize')
    if (synthesizeButton) synthesizeButton.onclick = handleSynthesize
    bindClick('btn-synthesize', handleSynthesize)
    bindClick('btn-prev-node', () => {
        traverseNeighbor(-1)
    })
    bindClick('btn-next-node', () => {
        traverseNeighbor(1)
    })
    bindClick(
        'btn-overview',
        () => {
            resetExplorationFocus()
        },
        { optional: true }
    )
}
