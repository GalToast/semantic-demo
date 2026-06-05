import { setMyceliumMode as setMyceliumModeImpl, setTrailDepth as setTrailDepthImpl } from './lifecycle.js';
import { applyStoryPrompt as applyStoryPromptImpl } from './cluster-filter.js';

export const MODE_DESCRIPTIONS = {
    default: 'County-wide overview across all visible records.',
    bloom: 'Living records with high relationship potential.',
    bridge: 'Connective nodes linking disparate county themes.',
    trail: 'Focused path of related business entities.',
    inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS = {
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
