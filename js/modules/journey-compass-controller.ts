/**
 * js/modules/journey-compass-controller.ts
 *
 * TypeScript shadow of journey-compass-controller.js.
 * Journey compass state, actions, and map trail strip management.
 */
import {
    getStrandContinuityState, getCurrentView, getCurrentSearchSummary,
    getNavState, getFocusedNode, getTerrainHandoffState,
    getJourneyCompassPhaseOrder, getMapHandoffPreludeMs, getMapTrailRefreshLateDelayMs
} from '../state/selectors/index.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
import { formatBusinessName, cleanPublicNoteText } from './utils/dom-formatters.js';
import { isMapSummarySurface, isSemanticDiveSurface } from './environment.js';
import { getFocusedJourneyPoint, getJourneyCompassState, JOURNEY_ACTIONS } from './journey-compass-state.js';
import {
    refreshMapRouteEmbodiment,
    centerMapOnRouteAnchor,
    getRouteEmbodimentIndices,
    syncRouteDirectorState
} from './map-state.js';
import { clearMobileRouteFieldPeek as clearMobileRouteFieldPeekState } from './search-state.js';
import { focusOnNode, getRouteLayerOrigin } from './camera-controls.js';
import { setSemanticDiveMode } from './journey.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { recenterFocusedNode } from './bindings/journey-bindings.js';
import { exploreInsideToNextStop, resetExplorationFocus, setTrailDepth } from './lifecycle.js';

let _switchView: (view: string) => void = () => {};

export function initJourneyCompassAdapter({ switchView }: { switchView?: (view: string) => void } = {}): void {
    if (typeof switchView === 'function') _switchView = switchView;

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

export function getJourneyCompassPresentationState(compassState: any = {}): any {
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

const MOBILE_JOURNEY_ACTION_LABELS: Record<string, string> = {
    [JOURNEY_ACTIONS.FOCUS_SEARCH]: 'Search',
    [JOURNEY_ACTIONS.CENTER_ANCHOR]: 'Center',
    [JOURNEY_ACTIONS.ENTER_INSIDE]: 'Inside',
    [JOURNEY_ACTIONS.SHOW_TRAIL_PANEL]: 'Trail',
    [JOURNEY_ACTIONS.NEXT_STOP]: 'Follow',
    [JOURNEY_ACTIONS.OPEN_MAP]: 'Map',
    [JOURNEY_ACTIONS.OPEN_MYCELIUM]: 'Field',
    [JOURNEY_ACTIONS.COUNTY_OVERVIEW]: 'County'
};

function getMobileJourneyActionLabel(action: any = {}, fallback = ''): string {
    return MOBILE_JOURNEY_ACTION_LABELS[action.action] || fallback || action.label || 'Go';
}

export function syncJourneyCompassActions(compassState: any = {}): void {
    const suppressInsideDiveActions =
        compassState.phase === 'inside' && isSemanticDiveSurface();
    const buttons: [HTMLElement | null, any, string][] = [
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
        const disabled = !action?.action || (action.action === JOURNEY_ACTIONS.NEXT_STOP && getStrandContinuityState()?.phase === 'exploring');
        button.disabled = false;
        button.setAttribute('aria-disabled', String(disabled || suppressInsideDiveActions));
        button.hidden = suppressInsideDiveActions || !action?.action;
        if (button.hidden) {
            button.setAttribute('tabindex', '-1');
            button.setAttribute('aria-hidden', 'true');
        } else {
            button.removeAttribute('tabindex');
            button.removeAttribute('aria-hidden');
        }
        if (action?.hint) {
            button.setAttribute('aria-label', `${fullLabel} - ${action.hint}`);
            button.setAttribute('title', action.hint);
        } else {
            button.setAttribute('aria-label', fullLabel);
            button.removeAttribute('title');
        }
        if (role === 'tertiary') {
            button.setAttribute('aria-expanded', button.hidden ? 'false' : 'true');
        }
    });
}

export function syncMapTrailStrip(compassState: any = {}, presentationState: any = {}): void {
    const strip = document.getElementById('map-trail-strip');
    if (!strip) return;
    const shouldShow =
        getCurrentView() === 'map' &&
        presentationState.navigationOwner === 'map-trail-strip';

    strip.hidden = !shouldShow;
    strip.setAttribute('aria-hidden', String(!shouldShow));
    if (!shouldShow) return;

    const stripTitle = compassState.title || 'Map trail';
    const compactStripTitle = stripTitle.replace(/\s+pinned to map$/i, '');

    strip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'map-strip-title';
    title.textContent = compactStripTitle || stripTitle;
    title.setAttribute('title', stripTitle);
    title.setAttribute('aria-label', stripTitle);
    strip.appendChild(title);
}

export function executeJourneyCompassAction(action: string): void {
    switch (action) {
        case JOURNEY_ACTIONS.FOCUS_SEARCH: {
            const focusSearchInput = () => window.requestAnimationFrame(() => {
                document.getElementById('search-input')?.focus();
            });
            const isMapFocusSearch = getCurrentView() === 'map' && isMapSummarySurface();

            if (isMapFocusSearch) {
                resetExplorationFocus({ preserveSearch: true, skipUrlSync: true });
                focusSearchInput();
                return;
            }

            focusSearchInput();
            return;
        }
        case JOURNEY_ACTIONS.CENTER_ANCHOR: {
            const anchorIndex = Number.isFinite(getCurrentSearchSummary()?.anchorIndex)
                ? (getCurrentSearchSummary() as any).anchorIndex
                : Number.isFinite(getNavState()?.focusedIndex)
                    ? getNavState()!.focusedIndex
                    : Number.isFinite(getFocusedNode())
                        ? getFocusedNode()
                        : null;
            if (Number.isFinite(anchorIndex)) {
                if (typeof setTrailDepth === 'function') setTrailDepth(1, { fromUserGesture: true, skipUrlSync: true });
                focusOnNode(anchorIndex!, { fromSearchResult: !!getCurrentSearchSummary() });
                if (typeof recenterFocusedNode === 'function') {
                    recenterFocusedNode();
                }
            }
            return;
        }
        case JOURNEY_ACTIONS.ENTER_INSIDE:
            if (typeof setSemanticDiveMode === 'function') setSemanticDiveMode(true);
            syncSemanticDiveUi();
            return;
        case JOURNEY_ACTIONS.SHOW_TRAIL_PANEL:
            if (typeof setSemanticDiveMode === 'function') setSemanticDiveMode(false);
            syncSemanticDiveUi();
            return;
        case JOURNEY_ACTIONS.NEXT_STOP:
            if (getStrandContinuityState()?.phase === 'exploring') return;
            if (typeof exploreInsideToNextStop === 'function') exploreInsideToNextStop();
            return;

        case JOURNEY_ACTIONS.OPEN_MAP:
            _switchView('map');
            return;
        case JOURNEY_ACTIONS.OPEN_MYCELIUM:
            _switchView('galaxy');
            return;
        case JOURNEY_ACTIONS.COUNTY_OVERVIEW:
            resetExplorationFocus({ preserveSearch: false });
            return;
        default:
            return;
    }
}

export function updateJourneyCompass(): void {
    const capitalize = (s: string) => s && s.charAt(0).toUpperCase() + s.slice(1);
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
    if (title) {
        const visibleTitle = compassState.title || (phase === 'focus' || phase === 'inside' ? '' : 'County overview');
        if (visibleTitle) {
            title.textContent = visibleTitle;
            title.classList.remove('sr-only');
        } else {
            const focusedPoint = getFocusedJourneyPoint();
            const focusedName = focusedPoint ? formatBusinessName(focusedPoint.name || 'this business') : 'Focused business';
            title.textContent = `Focused on ${focusedName}`;
            title.classList.add('sr-only');
        }
    }
    if (note) {
        note.textContent = compassState.note || 'Search to open one semantic trail.';
        note.classList.toggle('discovery-active', !!compassState.discovery);
    }
    syncJourneyCompassActions(compassState);
    syncMapTrailStrip(compassState, presentationState);

    const order = getJourneyCompassPhaseOrder() || ['overview', 'search', 'focus', 'inside', 'map'];
    const activeOrderIndex = order.indexOf(phase);
    const stepDescriptions: Record<string, string> = {
        overview: 'See the whole county.',
        search: 'Find and center on a business.',
        focus: 'Inspect a centered anchor.',
        inside: 'Explore the neighborhood.',
        map: 'View the geographic layer.'
    };
    compass.querySelectorAll('[data-journey-step]').forEach((step: Element) => {
        const stepEl = step as HTMLElement;
        const stepIndex = order.indexOf(stepEl.dataset.journeyStep!);
        const isCurrent = stepEl.dataset.journeyStep === phase;
        stepEl.classList.toggle('current', isCurrent);
        stepEl.classList.toggle('done', activeOrderIndex >= 0 && stepIndex >= 0 && stepIndex < activeOrderIndex);
        const description = stepDescriptions[stepEl.dataset.journeyStep || ''] || stepEl.dataset.journeyStep;
        stepEl.setAttribute('aria-label', `${stepIndex + 1}. ${capitalize(stepEl.dataset.journeyStep || '')}: ${description}`);
        stepEl.setAttribute('title', description!);
    });
}

export function installSemanticJourneyProbe(): any {
    return getJourneyCompassPresentationState();
}

export function invokeClearMobileRouteFieldPeek(): void {
    if (typeof clearMobileRouteFieldPeekState === 'function') {
        clearMobileRouteFieldPeekState();
        return;
    }
}

export function scheduleMapRouteRefresh(): void {
    const refresh = () => {
        if (getCurrentView() !== 'map') return;
        refreshMapRouteEmbodiment();
        centerMapOnRouteAnchor();
    };
    refresh();
    window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
    [120, 450, getMapHandoffPreludeMs() + getMapTrailRefreshLateDelayMs()].forEach((delay) => {
        window.setTimeout(refresh, delay);
    });
}

export function getViewHandoffModel(view: string): any {
    const focusPoint = getFocusedJourneyPoint();
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : '';
    const hasSearch = !!getCurrentSearchSummary();
    const searchLabel = hasSearch
        ? cleanPublicNoteText((getCurrentSearchSummary() as any).query || (getCurrentSearchSummary() as any).label || 'current trail')
        : '';

    if (view === 'map') {
        const routeCount = getRouteEmbodimentIndices().length;
        const origin = getTerrainHandoffState()?.from || (typeof getRouteLayerOrigin === 'function' ? getRouteLayerOrigin() : 'galaxy');
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
