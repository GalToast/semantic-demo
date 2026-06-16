// composition-state.ts
// TypeScript shadow of composition-state.js
// Single-responsibility composers that derive document.body dataset fields.

import { state as _defaultState } from '@lib/engine/state-bridge';
import type { SemanticState } from '@lib/state/state-types';
import { publish, EVENTS } from '@lib/orchestration/event-bus';
import { getPanelSurfaceDetailFromMobileSheet } from './search-panel-adapter.ts';
import { clearMobileRouteFieldPeek } from '@lib/engine/search-state-bridge';
import { compositionStore } from './stores.ts';

export interface PanelSurfaceParams {
    view: string;
    graphContext: string;
    mapContext: string;
    semanticDive: string;
    hasSearchIntent: boolean;
    hasFocus: boolean;
    hasActiveTrailState: boolean;
}

export function derivePanelSurface(params: PanelSurfaceParams): string {
    const { view, graphContext, mapContext, semanticDive, hasSearchIntent, hasFocus, hasActiveTrailState } = params;
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

function hasFocusedTrailRecord(ctx: any): boolean {
    return Boolean(ctx.selectedPoint)
        || (ctx.focusedNode !== null && ctx.focusedNode !== undefined)
        || (ctx.navState?.focusedIndex !== null && ctx.navState?.focusedIndex !== undefined);
}

function hasSearchIntent(): boolean {
    const hasSearch = !!_defaultState.currentSearchSummary;
    const searchInputValue = String((document.getElementById('search-input') as HTMLInputElement)?.value || '').trim();
    return hasSearch || searchInputValue.length >= 2;
}

function syncSharedCompositionUi(): void {
    publish(EVENTS.COMPOSITION_UPDATED);
}

interface ViewFlags {
    activeView: string;
    hasFocusRecord: boolean;
    searchIntent: boolean;
    hasActiveTrailState: boolean;
}

function composeViewFlags(ctx: any, root: HTMLElement): ViewFlags {
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

function composeFocusContext(params: {
    ctx: any;
    hasFocusRecord: boolean;
    searchIntent: boolean;
    mapContextOverride?: string;
}): { graphContext: string; mapContext: string } {
    const { ctx, hasFocusRecord, searchIntent, mapContextOverride } = params;
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

function composePanelSurface(params: { root: HTMLElement; surface: string; contextForDetail?: string }): void {
    const { root, surface, contextForDetail } = params;
    root.dataset.panelSurface = surface;
    root.classList.toggle('is-active', Boolean(surface));
    root.dataset.panelSurfaceDetail = getPanelSurfaceDetailFromMobileSheet(
        contextForDetail !== undefined ? contextForDetail : surface
    );
}

function composeSemanticDive(params: { ctx: any; hasFocusRecord: boolean; root: HTMLElement }): string {
    const { ctx, hasFocusRecord, root } = params;
    const next = ctx.semanticDiveMode && hasFocusRecord
        ? (root.dataset.semanticDive === 'transitioning' ? 'transitioning' : 'active')
        : 'inactive';
    root.dataset.semanticDive = next;
    return next;
}

function composeMobilePeek(params: { context: string }): void {
    if (params.context !== 'idle') {
        clearMobileRouteFieldPeek();
    }
}

function composeOnboardingHints(): void {
    document.querySelectorAll('.search-result-item.is-processing').forEach((el) => {
        el.classList.remove('is-processing');
    });
    const hint = document.getElementById('onboarding-hint') as any;
    if (hint) {
        hint.classList.remove('visible');
        hint.setAttribute('aria-hidden', 'true');
        hint._dismissedThisSession = true;
        if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer);
    }
}

interface CompositionResult {
    activeView: string;
    trailState: string;
    trailDepth: string;
    searchGlow: string;
    graphContext: string;
    mapContext: string;
    semanticDive: string;
    panelSurface: string;
    panelSurfaceDetail: string;
    isActive: boolean;
}

export function applyCompositionState(params: { state?: any; root?: HTMLElement } = {}): void {
    const { state: ctxParam, root = document.body } = params;
    if (!root?.dataset) return;
    const ctx = ctxParam || _defaultState;
    const hasForcedFocusSearchSurface = root.dataset.focusSearchForced === 'true'
        || (root.dataset.panelSurface === 'focus-search'
            && (root.dataset.graphContext === 'focus-search'
                || root.dataset.journeyPhase === 'search'));

    const flags = composeViewFlags(ctx, root);
    const { activeView, hasFocusRecord, searchIntent, hasActiveTrailState } = flags;

    let derivedResult: CompositionResult = {
        activeView,
        trailState: root.dataset.trailState || '',
        trailDepth: root.dataset.trailDepth || '',
        searchGlow: root.dataset.searchGlow || '',
        graphContext: 'idle',
        mapContext: 'idle',
        semanticDive: 'inactive',
        panelSurface: 'idle',
        panelSurfaceDetail: 'peek',
        isActive: false
    };

    const isLiveRoute = ctx.currentSearchSummary || hasFocusRecord;
    const forcedFocusSearchSurface = hasForcedFocusSearchSurface
        && activeView === 'galaxy'
        && isLiveRoute
        && !ctx.semanticDiveMode;
    if (forcedFocusSearchSurface) {
        root.classList.add('is-active');
        if (!root.dataset.panelSurfaceDetail) {
            root.dataset.panelSurfaceDetail = 'peek';
        }
        derivedResult = {
            ...derivedResult,
            activeView: root.dataset.activeView || 'galaxy',
            graphContext: 'focus-search',
            mapContext: root.dataset.mapContext || 'idle',
            panelSurface: 'focus-search',
            panelSurfaceDetail: root.dataset.panelSurfaceDetail || 'peek',
            isActive: true
        };
        compositionStore.set(derivedResult);
        syncSharedCompositionUi();
        return;
    }
    if (isLiveRoute) {
        composeOnboardingHints();

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
            derivedResult.panelSurfaceDetail = root.dataset.panelSurfaceDetail || '';
            derivedResult.isActive = root.classList.contains('is-active');
            compositionStore.set(derivedResult);

            syncSharedCompositionUi();
            return;
        }
    }

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
    derivedResult.panelSurfaceDetail = root.dataset.panelSurfaceDetail || '';
    derivedResult.isActive = root.classList.contains('is-active');
    compositionStore.set(derivedResult);

    syncSharedCompositionUi();
}
