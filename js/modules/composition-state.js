// js/modules/composition-state.js — Split of lifecycle.refreshCompositionState()
//
// Single-responsibility composers that derive document.body dataset fields
// from the global navigation/search state. Each composer writes one logical
// group of data-* attributes. `applyCompositionState` orchestrates the
// composers in branch order to preserve the original refreshCompositionState
// sequence exactly.
import { state as _defaultState } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { getPanelSurfaceDetailFromMobileSheet } from './search-panel-adapter.js';
import { clearMobileRouteFieldPeek } from './search-state.js';
import { compositionStore } from './stores.js';

// ── Pure helpers (also imported by lifecycle.js for derivePanelSurface) ──────

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

function hasFocusedTrailRecord(ctx) {
    return Boolean(ctx.selectedPoint)
        || (ctx.focusedNode !== null && ctx.focusedNode !== undefined)
        || (ctx.navState?.focusedIndex !== null && ctx.navState?.focusedIndex !== undefined);
}

function hasSearchIntent() {
    const hasSearch = !!_defaultState.currentSearchSummary;
    const searchInputValue = String(document.getElementById('search-input')?.value || '').trim();
    return hasSearch || searchInputValue.length >= 2;
}

function syncSharedCompositionUi() {
    publish(EVENTS.COMPOSITION_UPDATED);
}

// ── Composers ────────────────────────────────────────────────────────────────

// Composer 1: view/trail flags (always written, independent of branch)
function composeViewFlags(ctx, root) {
    const activeView = ctx.currentView || 'galaxy';
    const hasFocusRecord = hasFocusedTrailRecord(ctx);
    const searchIntent = hasSearchIntent();
    const hasActiveTrailState = activeView === 'map'
        ? searchIntent || hasFocusRecord
        : hasFocusRecord && (ctx.navState?.mode === 'trail' || searchIntent);

    root.dataset.activeView = activeView;
    root.dataset.searchGlow = ctx.searchGlowActive ? 'active' : 'inactive';
    root.dataset.trailState = hasActiveTrailState ? 'active' : 'inactive';
    root.dataset.trailDepth = String(ctx.trailDepth || 0);

    return { activeView, hasFocusRecord, searchIntent, hasActiveTrailState };
}

// Composer 2: focus/graph context. Writes data-graph-context AND data-map-context.
// Returns the derived values for downstream panel-surface derivation.
function composeFocusContext({ ctx, hasFocusRecord, searchIntent, mapContextOverride }) {
    let mapContext = 'idle';
    if (mapContextOverride !== undefined) {
        mapContext = mapContextOverride;
    } else {
        const hasMapFocus = Boolean(ctx.selectedPoint)
            || (ctx.focusedNode !== null && ctx.focusedNode !== undefined);
        if (hasMapFocus && searchIntent) mapContext = 'focus-search';
        else if (hasMapFocus) mapContext = 'focus';
        else if (searchIntent) mapContext = 'search';
    }

    let graphContext = 'idle';
    if (hasFocusRecord && searchIntent) graphContext = 'focus-search';
    else if (hasFocusRecord) graphContext = 'focus';
    else if (searchIntent) graphContext = 'search';

    return { graphContext, mapContext };
}

// Composer 3: panel surface (panelSurface, panelSurfaceDetail, is-active class)
function composePanelSurface({ root, surface, contextForDetail }) {
    root.dataset.panelSurface = surface;
    root.classList.toggle('is-active', Boolean(surface));
    root.dataset.panelSurfaceDetail = getPanelSurfaceDetailFromMobileSheet(
        contextForDetail !== undefined ? contextForDetail : surface
    );
}

// Composer 4: semantic dive — preserves 'transitioning' if it was set by
// setSemanticDiveMode (which writes 'transitioning' then schedules an update).
function composeSemanticDive({ ctx, hasFocusRecord, root }) {
    const next = ctx.semanticDiveMode && hasFocusRecord
        ? (root.dataset.semanticDive === 'transitioning' ? 'transitioning' : 'active')
        : 'inactive';
    root.dataset.semanticDive = next;
    return next;
}

// Composer 5: mobile peek — clears the mobile route field peek once a real
// focus/search surface is active. The original code only triggers this from
// the galaxy branch (where the graph context drives the peek).
function composeMobilePeek({ context }) {
    if (context !== 'idle') {
        clearMobileRouteFieldPeek();
    }
}

// Composer 6: onboarding hints — hides the onboarding-hint overlay once the
// user is in a live route. Also clears transient .is-processing search results.
function composeOnboardingHints() {
    document.querySelectorAll('.search-result-item.is-processing').forEach((el) => {
        el.classList.remove('is-processing');
    });
    const hint = document.getElementById('onboarding-hint');
    if (hint) {
        hint.classList.remove('visible');
        hint.setAttribute('aria-hidden', 'true');
        hint._dismissedThisSession = true;
        if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer);
    }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function applyCompositionState({ state: ctxParam, root = document.body } = {}) {
    if (!root?.dataset) return;
    const ctx = ctxParam || _defaultState;

    // 1. Always write the view/trail flags and read the input flags.
    const flags = composeViewFlags(ctx, root);
    const { activeView, hasFocusRecord, searchIntent, hasActiveTrailState } = flags;

    let derivedResult = {
        activeView,
        trailState: root.dataset.trailState,
        trailDepth: root.dataset.trailDepth,
        searchGlow: root.dataset.searchGlow,
        graphContext: 'idle',
        mapContext: 'idle',
        semanticDive: 'inactive',
        panelSurface: 'idle',
        panelSurfaceDetail: 'peek',
        isActive: false
    };

    // 2. Live-route branch: user has a search summary or a focus record.
    const isLiveRoute = ctx.currentSearchSummary || hasFocusRecord;
    if (isLiveRoute) {
        // 2a. Onboarding cleanup runs the moment we have a live route.
        composeOnboardingHints();

        // 2b. Map branch: derive map+graph contexts and short-circuit.
        if (activeView !== 'galaxy') {
            const { graphContext, mapContext } = composeFocusContext({
                ctx, hasFocusRecord, searchIntent
            });
            root.dataset.graphContext = graphContext;
            root.dataset.mapContext = mapContext;
            root.dataset.semanticDive = 'inactive';
            const surface = derivePanelSurface({
                view: activeView,
                graphContext,
                mapContext,
                semanticDive: 'inactive',
                hasSearchIntent: searchIntent,
                hasFocus: Boolean(ctx.selectedPoint)
                    || (ctx.focusedNode !== null && ctx.focusedNode !== undefined),
                hasActiveTrailState
            });
            composePanelSurface({ root, surface, contextForDetail: root.dataset.panelSurface });

            derivedResult.graphContext = graphContext;
            derivedResult.mapContext = mapContext;
            derivedResult.semanticDive = 'inactive';
            derivedResult.panelSurface = surface;
            derivedResult.panelSurfaceDetail = root.dataset.panelSurfaceDetail;
            derivedResult.isActive = root.classList.contains('is-active');
            compositionStore.set(derivedResult);

            syncSharedCompositionUi();
            return;
        }
    }

    // 3. Default (galaxy) branch.
    root.dataset.mapContext = 'idle';
    const semanticDive = composeSemanticDive({ ctx, hasFocusRecord, root });
    let { graphContext } = composeFocusContext({
        ctx, hasFocusRecord, searchIntent, mapContextOverride: 'idle'
    });
    if (semanticDive === 'active' || semanticDive === 'transitioning') {
        graphContext = hasFocusRecord ? 'focus' : 'idle';
    }
    root.dataset.graphContext = graphContext;
    composeMobilePeek({ context: graphContext });
    const surface = derivePanelSurface({
        view: activeView,
        graphContext,
        mapContext: 'idle',
        semanticDive,
        hasSearchIntent: searchIntent,
        hasFocus: hasFocusRecord,
        hasActiveTrailState
    });
    composePanelSurface({ root, surface, contextForDetail: graphContext });
    composeMobilePeek({ context: graphContext });

    derivedResult.graphContext = graphContext;
    derivedResult.mapContext = 'idle';
    derivedResult.semanticDive = semanticDive;
    derivedResult.panelSurface = surface;
    derivedResult.panelSurfaceDetail = root.dataset.panelSurfaceDetail;
    derivedResult.isActive = root.classList.contains('is-active');
    compositionStore.set(derivedResult);

    syncSharedCompositionUi();
}
