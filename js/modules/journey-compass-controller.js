// state
import { state } from '../state.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
// utils
import { formatBusinessName, cleanPublicNoteText } from './utils/dom-formatters.js';

// journey-compass-state
import { getFocusedJourneyPoint, getJourneyCompassState } from './journey-compass-state.js';

// map-state
import {
    refreshMapRouteEmbodiment,
    centerMapOnRouteAnchor,
    getRouteEmbodimentIndices,
    syncRouteDirectorState
} from './map-state.js';

// search-state
import { clearMobileRouteFieldPeek as clearMobileRouteFieldPeekState } from './search-state.js';

// camera-controls
import { focusOnNode } from './camera-controls.js';

// ui-renderers

import { setSemanticDiveMode } from './journey-lifecycle-adapter.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { getRouteLayerOrigin } from './camera-controls.js';
import { recenterFocusedNode } from './event-bindings.js';
import { exploreInsideToNextStop, resetExplorationFocus, setTrailDepth } from './lifecycle.js';

let _switchView = () => {};

export function initJourneyCompassAdapter({ switchView } = {}) {
    if (typeof switchView === 'function') _switchView = switchView;

    // Phase 3: Declarative synchronization
    const sync = () => updateJourneyCompass();
    subscribeKeyed('journey-compass:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('journey-compass:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('journey-compass:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('journey-compass:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('journey-compass:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('journey-compass:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('journey-compass:composition-updated', EVENTS.COMPOSITION_UPDATED, sync);
    subscribeKeyed('journey-compass:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
}

export function getJourneyCompassPresentationState(compassState = {}) {
    const phase = compassState.phase || 'overview';
    const hasTrail = document.body?.dataset?.trailState === 'active';
    if (phase === 'map') {
        return {
            density: 'hidden',
            copy: 'quiet',
            actions: 'minimal',
            navigationOwner: hasTrail ? 'map-trail-strip' : 'map-controls'
        };
    }
    if (phase === 'search' || phase === 'focus') {
        return {
            density: 'compact',
            copy: 'quiet',
            actions: 'primary-secondary',
            navigationOwner: 'scene'
        };
    }
    if (phase === 'inside') {
        return {
            density: 'compact',
            copy: 'quiet',
            actions: 'route',
            navigationOwner: 'inside-walk'
        };
    }
    return {
        density: 'expanded',
        copy: 'full',
        actions: 'standard',
        navigationOwner: 'journey-compass'
    };
}

const MOBILE_JOURNEY_ACTION_LABELS = {
    'focus-search': 'Search',
    'center-anchor': 'Center',
    'enter-inside': 'Inside',
    'show-trail-panel': 'Trail',
    'next-stop': 'Follow',
    'open-map': 'Map',
    'open-mycelium': 'Field',
    'county-overview': 'County'
};

function getMobileJourneyActionLabel(action = {}, fallback = '') {
    return MOBILE_JOURNEY_ACTION_LABELS[action.action] || fallback || action.label || 'Go';
}

export function syncJourneyCompassActions(compassState = {}) {
    const suppressInsideDiveActions =
        compassState.phase === 'inside' &&
        document.body?.dataset?.panelSurface === 'semantic-dive';
    const buttons = [
        [document.getElementById('btn-journey-primary'), compassState.primaryAction, 'primary'],
        [document.getElementById('btn-journey-secondary'), compassState.secondaryAction, 'secondary'],
        [document.getElementById('btn-journey-tertiary'), compassState.tertiaryAction, 'tertiary']
    ];
    buttons.forEach(([button, action, role]) => {
        if (!button) return;
        const fullLabel = action?.label || (role === 'primary' ? 'Search' : (role === 'secondary' ? 'Map' : 'Navigate'));
        const mobileLabel = action?.action ? getMobileJourneyActionLabel(action, fullLabel) : '';
        button.textContent = fullLabel;
        if (mobileLabel) {
            button.dataset.mobileLabel = mobileLabel;
            button.dataset.fullLabel = fullLabel;
        } else {
            delete button.dataset.mobileLabel;
            delete button.dataset.fullLabel;
        }
        button.dataset.journeyAction = action?.action || '';
        const disabled = !action?.action || (action.action === 'next-stop' && state.strandContinuityState?.phase === 'exploring');
        button.disabled = disabled || suppressInsideDiveActions;
        button.setAttribute('aria-disabled', String(disabled || suppressInsideDiveActions));
        button.hidden = suppressInsideDiveActions || !action?.action;
        if (action?.hint) {
            button.setAttribute('aria-label', `${fullLabel} - ${action.hint}`);
            button.setAttribute('title', action.hint);
        } else {
            button.setAttribute('aria-label', fullLabel);
            button.removeAttribute('title');
        }
        // aria-expanded on tertiary button reflects its active state: false when hidden (not active), true when visible
        if (role === 'tertiary') {
            button.setAttribute('aria-expanded', button.hidden ? 'false' : 'true');
        }
    });
}

export function syncMapTrailStrip(compassState = {}, presentationState = {}) {
    const strip = document.getElementById('map-trail-strip');
    if (!strip) return;
    const shouldShow =
        state.currentView === 'map' &&
        presentationState.navigationOwner === 'map-trail-strip';

    strip.hidden = !shouldShow;
    strip.setAttribute('aria-hidden', String(!shouldShow));
    if (!shouldShow) return;

    const actions = [
        compassState.primaryAction,
        compassState.secondaryAction,
        compassState.tertiaryAction
    ].filter((action) => action?.action);
    const shortLabel = (action) => {
        if (action.action === 'open-mycelium') return 'Mycelium';
        if (action.action === 'county-overview') return 'Reset';
        if (action.action === 'focus-search') return 'Search';
        return action.label || 'Go';
    };
    const stripTitle = compassState.title || 'Map trail';
    const compactStripTitle = stripTitle.replace(/\s+pinned to map$/i, '');

    strip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'map-strip-title';
    title.textContent = compactStripTitle || stripTitle;
    title.setAttribute('title', stripTitle);
    title.setAttribute('aria-label', stripTitle);
    strip.appendChild(title);
    actions.forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'trail-strip-btn';
        button.dataset.journeyAction = action.action;
        button.textContent = shortLabel(action);
        button.addEventListener('click', () => executeJourneyCompassAction(action.action));
        strip.appendChild(button);
    });
}

export function executeJourneyCompassAction(action) {
    switch (action) {
        case 'focus-search': {
            const focusSearchInput = () => window.requestAnimationFrame(() => {
                document.getElementById('search-input')?.focus();
            });
            const isMapFocusSearch = state.currentView === 'map'
                && document.body?.dataset?.panelSurface === 'map-focus-search';

            if (isMapFocusSearch) {
                resetExplorationFocus({ preserveSearch: true, skipUrlSync: true });
                focusSearchInput();
                return;
            }

            focusSearchInput();
            return;
        }
        case 'center-anchor': {
            const anchorIndex = Number.isFinite(state.currentSearchSummary?.anchorIndex)
                ? state.currentSearchSummary.anchorIndex
                : Number.isFinite(state.navState?.focusedIndex)
                    ? state.navState.focusedIndex
                    : Number.isFinite(state.focusedNode)
                        ? state.focusedNode
                        : null;
            if (Number.isFinite(anchorIndex)) {
                // "Center Anchor" must set trailDepth=1 (via setTrailDepth) so the Trail chip activates
                if (typeof setTrailDepth === 'function') setTrailDepth(1, { fromUserGesture: true, skipUrlSync: true });
                focusOnNode(anchorIndex, { fromSearchResult: !!state.currentSearchSummary });
                if (typeof recenterFocusedNode === 'function') {
                    recenterFocusedNode();
                }
            }
            return;
        }
        case 'enter-inside':
            if (typeof setSemanticDiveMode === 'function') setSemanticDiveMode(true);
            syncSemanticDiveUi();
            return;
        case 'show-trail-panel':
            if (typeof setSemanticDiveMode === 'function') setSemanticDiveMode(false);
            syncSemanticDiveUi();
            return;
        case 'next-stop':
            if (state.strandContinuityState?.phase === 'exploring') return;
            if (typeof exploreInsideToNextStop === 'function') exploreInsideToNextStop();
            return;

        case 'open-map':
            _switchView('map');
            return;
        case 'open-mycelium':
            _switchView('galaxy');
            return;
        case 'county-overview':
            // County overview is a calm reset surface; do not preserve the
            // search corridor or the map keeps competing search chrome alive.
            resetExplorationFocus({ preserveSearch: false });
            return;
        default:
            return;
    }
}

export function updateJourneyCompass() {
    const capitalize = (s) => s && s.charAt(0).toUpperCase() + s.slice(1);
    const compass = document.getElementById('journey-compass');
    if (!compass) return;
    syncRouteDirectorState('journey-compass');
    const compassState = getJourneyCompassState();
    const phase = compassState.phase || 'overview';
    const presentationState = getJourneyCompassPresentationState(compassState);
    document.body.dataset.journeyPhase = phase;
    document.body.dataset.journeyCompassDensity = presentationState.density;
    document.body.dataset.journeyCompassCopy = presentationState.copy;
    document.body.dataset.journeyNavigationOwner = presentationState.navigationOwner;
    compass.dataset.phase = phase;
    compass.dataset.density = presentationState.density;
    compass.dataset.copy = presentationState.copy;
    compass.dataset.actions = presentationState.actions;
    compass.dataset.navigationOwner = presentationState.navigationOwner;
    compass.setAttribute('aria-live', presentationState.copy === 'full' ? 'polite' : 'off');
    const kicker = document.getElementById('journey-compass-kicker');
    const title = document.getElementById('journey-compass-title');
    const note = document.getElementById('journey-compass-note');
    if (kicker) kicker.textContent = compassState.kicker || 'Journey';
    // The title is intentionally empty in focus/inside phases — the right
    // focus panel shows the business name prominently. Don't fall back to
    // a default like "County overview" in those states. The CSS hides the
    // title element when it's empty.
    if (title) title.textContent = compassState.title || (phase === 'focus' || phase === 'inside' ? '' : 'County overview');
    if (note) {
        note.textContent = compassState.note || 'Search to open one semantic trail.';
        note.classList.toggle('discovery-active', !!compassState.discovery);
    }
    syncJourneyCompassActions(compassState);
    syncMapTrailStrip(compassState, presentationState);

    const order = state.JOURNEY_COMPASS_PHASE_ORDER || ['overview', 'search', 'focus', 'inside', 'map'];
    const activeOrderIndex = order.indexOf(phase);
    const stepDescriptions = {
        overview: 'See the whole county.',
        search: 'Find and center on a business.',
        focus: 'Inspect a centered anchor.',
        inside: 'Explore the neighborhood.',
        map: 'View the geographic layer.'
    };
    compass.querySelectorAll('[data-journey-step]').forEach((step) => {
        const stepIndex = order.indexOf(step.dataset.journeyStep);
        const isCurrent = step.dataset.journeyStep === phase;
        step.classList.toggle('current', isCurrent);
        step.classList.toggle('done', activeOrderIndex >= 0 && stepIndex >= 0 && stepIndex < activeOrderIndex);
        const description = stepDescriptions[step.dataset.journeyStep] || step.dataset.journeyStep;
        step.setAttribute('aria-label', `${stepIndex + 1}. ${capitalize(step.dataset.journeyStep)}: ${description}`);
        step.setAttribute('title', description);
    });
}

export function installSemanticJourneyProbe() {
    return getJourneyCompassPresentationState();
}

export function invokeClearMobileRouteFieldPeek() {
    if (typeof clearMobileRouteFieldPeekState === 'function') {
        clearMobileRouteFieldPeekState();
        return;
    }
}

export function scheduleMapRouteRefresh() {
    const refresh = () => {
        if (state.currentView !== 'map') return;
        refreshMapRouteEmbodiment();
        centerMapOnRouteAnchor();
    };
    refresh();
    window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
    [120, 450, (state.MAP_HANDOFF_PRELUDE_MS || 1200) + 100].forEach((delay) => {
        window.setTimeout(refresh, delay);
    });
}

export function getViewHandoffModel(view) {
    const focusPoint = getFocusedJourneyPoint();
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : '';
    const hasSearch = !!state.currentSearchSummary;
    const searchLabel = hasSearch
        ? cleanPublicNoteText(state.currentSearchSummary.query || state.currentSearchSummary.label || 'current trail')
        : '';

    if (view === 'map') {
        const routeCount = getRouteEmbodimentIndices().length;
        const origin = state.terrainHandoffState?.from || (typeof getRouteLayerOrigin === 'function' ? getRouteLayerOrigin() : 'galaxy');
        if (focusName && hasSearch) {
            return {
                icon: 'map',
                kicker: routeCount > 1 ? 'Same trail: terrain' : 'Route layer: map',
                title: 'The semantic trail lands on terrain',
                note: origin === 'inside' || origin === 'walk'
                    ? `${focusName} stays anchored while the inside walk becomes physical distance.`
                    : `${focusName} stays anchored while "${searchLabel}" becomes physical distance.`
            };
        }
        if (focusName) {
            return {
                icon: 'map',
                kicker: routeCount > 1 ? 'Same trail: terrain' : 'Route layer: map',
                title: 'The focused record lands on terrain',
                note: routeCount > 1
                    ? `${focusName} keeps the same neighbors; only the layer changed.`
                    : `${focusName} keeps its semantic context while county distance becomes visible.`
            };
        }
        return {
            icon: 'map',
            kicker: 'Route layer: map',
            title: 'Geography carries the last layer',
            note: 'Semantic colors remain, but physical distance is now the thing to read.'
        };
    }

    if (focusName && hasSearch) {
        return {
            icon: 'mycelium',
            kicker: 'Route layer: mycelium',
            title: 'The trail returns to the living field',
            note: `${focusName} remains the anchor for "${searchLabel}" inside the semantic cloud.`
        };
    }
    if (focusName) {
        return {
            icon: 'mycelium',
            kicker: 'Route layer: mycelium',
            title: 'The record returns to its pocket',
            note: `${focusName} is back inside its semantic neighborhood.`
        };
    }
    return {
        icon: 'mycelium',
        kicker: 'Route layer: mycelium',
        title: 'Mycelium view restored',
        note: 'Semantic neighborhoods breathe as one living field.'
    };
}
