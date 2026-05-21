// state
import { state } from '../state.js';

// utils
import { formatBusinessName, cleanPublicNoteText } from '../utils.js';

// journey-compass-state
import { getFocusedJourneyPoint, getJourneyCompassState } from './journey-compass-state.js';

// map-state
import {
    refreshMapMarkers,
    refreshMapRouteEmbodiment,
    centerMapOnRouteAnchor,
    getRouteEmbodimentIndices,
    syncRouteDirectorState
} from './map-state.js';

// search-state
import { clearShortSemanticSearchState, clearMobileRouteFieldPeek } from './search-state.js';

// camera-controls
import { focusOnNode } from './camera-controls.js';

// lifecycle.js - for switchView (needed in executeJourneyCompassAction)
import { switchView } from './lifecycle.js';

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
        button.textContent = action?.label || (role === 'primary' ? 'Search' : 'Map');
        button.dataset.journeyAction = action?.action || '';
        const disabled = !action?.action || (action.action === 'next-stop' && state.strandContinuityState?.phase === 'exploring');
        button.disabled = disabled || suppressInsideDiveActions;
        button.setAttribute('aria-disabled', String(disabled || suppressInsideDiveActions));
        button.hidden = suppressInsideDiveActions || !action?.action;
        if (action?.hint) {
            button.setAttribute('aria-label', `${button.textContent} — ${action.hint}`);
            button.setAttribute('title', action.hint);
        } else {
            button.setAttribute('aria-label', button.textContent);
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

    strip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'map-strip-title';
    title.textContent = compassState.title || 'Map trail';
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
        case 'focus-search':
            document.getElementById('search-input')?.focus();
            return;
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
                if (typeof window.setTrailDepth === 'function') window.setTrailDepth(1, { skipUrlSync: true });
                focusOnNode(anchorIndex, { fromSearchResult: !!state.currentSearchSummary });
                if (typeof window.recenterFocusedNode === 'function') {
                    window.recenterFocusedNode();
                }
            }
            return;
        }
        case 'enter-inside':
            if (typeof window.setSemanticDiveMode === 'function') window.setSemanticDiveMode(true);
            return;
        case 'show-trail-panel':
            if (typeof window.setSemanticDiveMode === 'function') window.setSemanticDiveMode(false);
            return;
        case 'next-stop':
            if (state.strandContinuityState?.phase === 'exploring') return;
            if (typeof window.exploreInsideToNextStop === 'function') window.exploreInsideToNextStop();
            return;

        case 'open-map':
            switchView('map');
            return;
        case 'open-mycelium':
            switchView('galaxy');
            return;
        case 'county-overview':
            // resetExplorationFocus() now handles trailDepth, searchGlow, and node positions
            // in one unified call — no separate clearSearch() needed here
            if (typeof window.resetExplorationFocus === 'function') {
                window.resetExplorationFocus();
            } else if (typeof window.resetNodePositions === 'function') {
                window.resetNodePositions();
            }
            // Also clear the search input so the text is gone on return to overview
            {
                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.value = '';
                clearShortSemanticSearchState();
            }
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
    if (title) title.textContent = compassState.title || 'County overview';
    if (note) {
        note.textContent = compassState.note || 'Search to open one semantic trail.';
        note.classList.toggle('discovery-active', !!compassState.discovery);
    }
    syncJourneyCompassActions(compassState);
    syncMapTrailStrip(compassState, presentationState);

    const order = state.JOURNEY_COMPASS_PHASE_ORDER || ['overview', 'search', 'focus', 'inside', 'map'];
    const activeOrderIndex = order.indexOf(phase);
    compass.querySelectorAll('[data-journey-step]').forEach((step) => {
        const stepIndex = order.indexOf(step.dataset.journeyStep);
        const isCurrent = step.dataset.journeyStep === phase;
        step.classList.toggle('current', isCurrent);
        step.classList.toggle('done', activeOrderIndex >= 0 && stepIndex >= 0 && stepIndex < activeOrderIndex);
        const stepLabel = { overview: 'County overview — see the whole county', search: 'Search — find and center on a business', focus: 'Focus — inspect a centered anchor', inside: 'Inside — explore the neighborhood', map: 'Map — view geographic layer' }[step.dataset.journeyStep] || step.dataset.journeyStep;
        step.setAttribute('aria-label', `${stepIndex + 1}. ${capitalize(step.dataset.journeyStep)}: ${stepLabel}`);
    });
}

export function installSemanticJourneyProbe() {
    window.__semanticJourneyProbe = () => {
        const compass = document.getElementById('journey-compass');
        return {
            phase: compass?.dataset?.phase || document.body.dataset.journeyPhase || null,
            title: document.getElementById('journey-compass-title')?.textContent?.trim() || '',
            note: document.getElementById('journey-compass-note')?.textContent?.trim() || '',
            currentSteps: Array.from(document.querySelectorAll('.journey-compass-step.current')).map((step) => step.dataset.journeyStep),
            doneSteps: Array.from(document.querySelectorAll('.journey-compass-step.done')).map((step) => step.dataset.journeyStep),
            routeSteps: Array.from(document.querySelectorAll('.journey-compass-step')).map((step) => step.dataset.journeyStep),
            graphContext: document.body.dataset.graphContext || null,
            panelSurface: document.body.dataset.panelSurface || null,
            panelSurfaceDetail: document.body.dataset.panelSurfaceDetail || null,
            routeDirector: document.body.dataset.routeDirector || null,
            routeDirectorReason: document.body.dataset.routeDirectorReason || '',
            routeExploration: document.body.dataset.routeExploration || 'idle',
            focusOrigin: document.body.dataset.focusOrigin || '',
            focusPanelMode: document.body.dataset.focusPanelMode || '',
            semanticDive: document.body.dataset.semanticDive || null,
            focusTransition: document.body.dataset.focusTransition || null,
            focusTransitionPhase: document.body.dataset.focusTransitionPhase || null,
            cameraAssist: document.body.dataset.cameraAssist || 'free',
            cameraAssistReason: document.body.dataset.cameraAssistReason || '',
            journeyCompassDensity: document.body.dataset.journeyCompassDensity || '',
            journeyCompassCopy: document.body.dataset.journeyCompassCopy || '',
            journeyNavigationOwner: document.body.dataset.journeyNavigationOwner || '',
            viewHandoffActive: document.body.dataset.viewHandoffActive || '',
            cameraSlackState: { ...(state.focusOrbitSlackState || {}) },
            primaryAction: {
                label: document.getElementById('btn-journey-primary')?.textContent?.trim() || '',
                action: document.getElementById('btn-journey-primary')?.dataset?.journeyAction || ''
            },
            secondaryAction: {
                label: document.getElementById('btn-journey-secondary')?.textContent?.trim() || '',
                action: document.getElementById('btn-journey-secondary')?.dataset?.journeyAction || ''
            },
            tertiaryAction: {
                label: document.getElementById('btn-journey-tertiary')?.textContent?.trim() || '',
                action: document.getElementById('btn-journey-tertiary')?.dataset?.journeyAction || '',
                hidden: !!document.getElementById('btn-journey-tertiary')?.hidden
            },
            routeEmbodiment: { ...(state.routeTraceDiagnostics || {}) }
        };
    };
}

export function getMobileSearchSheetDetail() {
    if (!document.body?.dataset?.mobileSearchSheet) return 'none';
    return document.body.dataset.mobileSearchSheet === 'expanded' ? 'expanded' : 'peek';
}

export function invokeClearMobileRouteFieldPeek() {
    if (typeof window.clearMobileRouteFieldPeek === 'function') {
        window.clearMobileRouteFieldPeek();
        return;
    }
    clearMobileRouteFieldPeek();
}

export function derivePanelSurface({ view, graphContext, mapContext, semanticDive, hasSearchIntent, hasFocus, hasActiveTrailState }) {
    if (view !== 'galaxy') {
        if (mapContext === 'focus-search') return 'map-focus-search';
        if (mapContext === 'focus') return 'map-focus';
        if (mapContext === 'search') return 'map-search';
        if (hasActiveTrailState) return 'map-trail';
        return 'map-idle';
    }
    if (semanticDive === 'active' || semanticDive === 'transitioning') return 'semantic-dive';
    if (graphContext === 'focus-search') return 'focus-search';
    if (graphContext === 'focus') return 'focus';
    if (graphContext === 'search') return 'search';
    if (hasSearchIntent) return hasFocus ? 'focus-search' : 'search';
    return 'idle';
}

export function refreshCompositionState() {
    document.body.dataset.activeView = state.currentView || 'galaxy';
    const hasFocusedTrailRecord = Boolean(state.selectedPoint)
        || state.focusedNode !== null && state.focusedNode !== undefined
        || state.navState?.focusedIndex !== null && state.navState?.focusedIndex !== undefined;
    const hasSearch = !!state.currentSearchSummary;
    const searchInputValue = String(document.getElementById('search-input')?.value || '').trim();
    const hasSearchIntent = hasSearch
        || searchInputValue.length >= 2
        || document.querySelector('.search-container.has-query .search-results.active');
    const hasActiveTrailState = state.currentView === 'map'
        ? hasSearchIntent || hasFocusedTrailRecord
        : hasFocusedTrailRecord && (state.navState.mode === 'trail' || hasSearchIntent);
    document.body.dataset.trailState = hasActiveTrailState ? 'active' : 'inactive';
    if (hasSearch || hasFocusedTrailRecord) {
        // Clear transient processing and onboarding feedback once the user is in a live route.
        document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'));

        const hint = document.getElementById('onboarding-hint');
        if (hint) {
            hint.classList.remove('visible');
            hint.setAttribute('aria-hidden', 'true');
            hint._dismissedThisSession = true;
            if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer);
        }

        // Non-galaxy path: exit after cleanup, before galaxy-specific dataset writes.
        // Galaxy view must continue to the dataset-sync block below (Step Inside needs
        // graphContext, semanticDive, mapContext, panelSurface updated on body.dataset).
        if (state.currentView !== 'galaxy') {
            let mapContext = 'idle';
            const hasMapFocus = !!state.selectedPoint || state.focusedNode !== null && state.focusedNode !== undefined;
            if (hasMapFocus && hasSearchIntent) {
                mapContext = 'focus-search';
            } else if (hasMapFocus) {
                mapContext = 'focus';
            } else if (hasSearchIntent) {
                mapContext = 'search';
            }
            document.body.dataset.mapContext = mapContext;
            document.body.dataset.graphContext = 'idle';
            document.body.dataset.semanticDive = 'inactive';
            document.body.dataset.panelSurface = derivePanelSurface({
                view: state.currentView,
                graphContext: 'idle',
                mapContext,
                semanticDive: 'inactive',
                hasSearchIntent,
                hasFocus: hasMapFocus,
                hasActiveTrailState
            });
            document.body.dataset.panelSurfaceDetail = 'none';
            syncRouteDirectorState('composition-map');
            if (typeof updateSelectedCardHeading === 'function') updateSelectedCardHeading();
            if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
            if (typeof window.updateJourneyCompass === 'function') window.updateJourneyCompass();
            if (typeof window.updateFocusNeighborRail === 'function') window.updateFocusNeighborRail();
            refreshMapMarkers();
            refreshMapRouteEmbodiment();
            if (typeof window.refreshRouteTraceOverlay === 'function') {
                window.refreshRouteTraceOverlay({ reason: 'composition-map' });
            }
            return;
        }
    }

    document.body.dataset.mapContext = 'idle';
    const hasFocus = Boolean(state.selectedPoint)
        || state.focusedNode !== null && state.focusedNode !== undefined
        || state.navState?.focusedIndex !== null && state.navState?.focusedIndex !== undefined;
    const semanticDive = state.semanticDiveMode && hasFocus
        ? (document.body.dataset.semanticDive === 'transitioning' ? 'transitioning' : 'active')
        : 'inactive';
    document.body.dataset.semanticDive = semanticDive;
    let context = 'idle';
    if (hasFocus && hasSearchIntent) {
        context = 'focus-search';
    } else if (hasFocus) {
        context = 'focus';
    } else if (hasSearchIntent) {
        context = 'search';
    }
    // When semantic dive is active, suppress focus-search to let panelSurface
    // derive as 'semantic-dive' (semantic-dive takes priority over search context).
    if (semanticDive === 'active' || semanticDive === 'transitioning') {
        context = hasFocus ? 'focus' : 'idle';
    }
    document.body.dataset.graphContext = context;
    document.body.dataset.panelSurface = derivePanelSurface({
        view: state.currentView,
        graphContext: context,
        mapContext: 'idle',
        semanticDive,
        hasSearchIntent,
        hasFocus,
        hasActiveTrailState
    });
    document.body.dataset.panelSurfaceDetail = context === 'search' || context === 'focus-search'
        ? getMobileSearchSheetDetail()
        : 'none';
    if (context !== 'idle') {
        invokeClearMobileRouteFieldPeek();
    }
    syncRouteDirectorState('composition-galaxy');
    if (typeof updateSelectedCardHeading === 'function') updateSelectedCardHeading();
    if (typeof window.updateLegendGuideState === 'function') window.updateLegendGuideState();
    if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
    if (typeof window.updateJourneyCompass === 'function') window.updateJourneyCompass();
    if (typeof window.updateFocusNeighborRail === 'function') window.updateFocusNeighborRail();
    refreshMapMarkers();
    refreshMapRouteEmbodiment();
    if (typeof window.refreshRouteTraceOverlay === 'function') {
        window.refreshRouteTraceOverlay({ reason: 'composition-galaxy' });
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
        const origin = state.terrainHandoffState?.from || (typeof window.getRouteLayerOrigin === 'function' ? window.getRouteLayerOrigin() : 'galaxy');
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
