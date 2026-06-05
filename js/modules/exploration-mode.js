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

function refreshCompositionState() {
    applyCompositionState({ state, root: document.body });
}

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

export function setMyceliumMode(mode, options = {}) {
    if (state.myceliumMode === mode) return;
    state.myceliumMode = mode;
    if (mode === 'bloom') {
        recomputeBloomIndices();
    }
    if (mode === 'bridge') {
        recomputeBridgeIndices();
    }
    if (mode === 'trail') {
        setTrailDepth(1, { ...options, skipUrlSync: true });
    }
    if (mode === 'inside') {
        setTrailDepth(2, { ...options, fromUserGesture: true, skipUrlSync: true });
    }
    applyPointFilterColors();
    if (!options.skipUrlSync) {
        publish(EVENTS.VIEW_CHANGED, { myceliumMode: mode });
    }
    refreshCompositionState();
}

export function setTrailDepth(depth, options = {}) {
    const prevDepth = Number(state.trailDepth || 0);
    const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
    const enteringSemanticDive = nextDepth === 2 && prevDepth < 2;
    const leavingSemanticDive = prevDepth >= 2 && nextDepth < 2;

    if (enteringSemanticDive && !options.fromUserGesture) {
        return;
    }
    if (leavingSemanticDive && !options.fromUserGesture && !options.allowDiveExit) {
        return;
    }

    state.trailDepth = nextDepth;
    state.navState.trailDepth = nextDepth;
    if (nextDepth >= 2) state.navState.mode = 'inside';
    else if (nextDepth > 0 && state.navState.mode !== 'focus') state.navState.mode = 'trail';

    if (!options.skipUrlSync) {
        publish(EVENTS.EXPLORATION_DEPTH_CHANGED, { depth: nextDepth });
    }
    refreshCompositionState();
}

export function applyStoryPrompt(story, options = {}) {
    state.activeStoryPrompt = story || null;
    overwriteActiveFilters({ status: 'all', city: 'all', website: false, email: false, geocoded: false });
    setActiveClusterFilter(null);

    if (story === 'signal-rich') {
        setMyceliumMode('bloom', options);
        overwriteActiveFilters({ ...getActiveFilters(), website: true  });
    } else if (story === 'bridge-businesses') {
        setMyceliumMode('bridge', options);
    } else if (story === 'mapped-food') {
        setMyceliumMode('default', options);
        overwriteActiveFilters({ ...getActiveFilters(), geocoded: true  });
    } else if (story === 'disqualified-ghosts') {
        setMyceliumMode('default', options);
        overwriteActiveFilters({ ...getActiveFilters(), status: 'disqualified'  });
    }

    applyFilters();
}

function recomputeBloomIndices() {
    state.bloomIndices = new Set(
        (state.points || [])
            .map((point, index) => ({ point, index }))
            .filter(({ point }) => point.status === 'active' && point.website)
            .map(({ index }) => index)
    );
    return state.bloomIndices;
}

function recomputeBridgeIndices() {
    state.bridgeIndices = new Set(
        (state.points || [])
            .map((point, index) => ({ point, index }))
            .filter(({ point }) => {
                const text = `${point?.what || ''} ${point?.public_note || ''} ${point?.public_detail || ''}`.toLowerCase();
                return text.includes('bridge') || text.includes('network') || text.includes('community');
            })
            .map(({ index }) => index)
    );
    return state.bridgeIndices;
}
