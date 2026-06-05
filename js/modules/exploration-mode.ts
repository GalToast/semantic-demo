/**
 * js/modules/exploration-mode.ts
 *
 * TypeScript shadow of exploration-mode.js.
 * Exploration mode state management (mycelium modes, trails, stories).
 */
import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { applyPointFilterColors } from './journey.js';
import {
    getActiveFilters,
    setActiveClusterFilter,
    overwriteActiveFilters
} from './filter-state.js';
import { applyFilters } from './search-state.js';
import { applyCompositionState } from './composition-state.js';
import { applyStoryPrompt as applyStoryPromptImpl } from './cluster-filter.js';
import { setMyceliumMode as setMyceliumModeImpl, setTrailDepth as setTrailDepthImpl } from './lifecycle.js';

function refreshCompositionState(): void {
    applyCompositionState({ state, root: document.body });
}

export const MODE_DESCRIPTIONS: Record<string, string> = {
    default: 'County-wide overview across all visible records.',
    bloom: 'Living records with high relationship potential.',
    bridge: 'Connective nodes linking disparate county themes.',
    trail: 'Focused path of related business entities.',
    inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS: Record<string, string> = {
    standard: 'A semantic journey through Montgomery County.',
    market: 'Market exploration through business relationships.',
    civic: 'Civic connectivity across community anchors.',
    growth: 'Economic growth and development pathways.',
    'signal-rich': 'Explore the densest local business clusters with high relationship potential.',
    'bridge-businesses': 'Explore connectors between business communities.',
    'mapped-food': 'Follow food trails across the county map.',
    'disqualified-ghosts': 'View records that are disqualified but still present in the corpus.'
};

export { setMyceliumModeImpl as setMyceliumMode };
export { setTrailDepthImpl as setTrailDepth };

export { applyStoryPromptImpl as applyStoryPrompt };

function recomputeBloomIndices(): Set<number> {
    state.bloomIndices = new Set(
        (state.points || [])
            .map((point: any, index: number) => ({ point, index }))
            .filter(({ point }: any) => point.status === 'active' && point.website)
            .map(({ index }: any) => index)
    );
    return state.bloomIndices;
}

function recomputeBridgeIndices(): Set<number> {
    state.bridgeIndices = new Set(
        (state.points || [])
            .map((point: any, index: number) => ({ point, index }))
            .filter(({ point }: any) => {
                const text = `${point?.what || ''} ${point?.public_note || ''} ${point?.public_detail || ''}`.toLowerCase();
                return text.includes('bridge') || text.includes('network') || text.includes('community');
            })
            .map(({ index }: any) => index)
    );
    return state.bridgeIndices;
}
