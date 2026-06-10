/**
 * map-state.ts
 *
 * Typed sibling of map-state.js.
 * Manages Leaflet map initialization, marker refresh, route embodiment,
 * terrain handoff, and route director state synchronization.
 */
import { state, withStateMutation } from '../state.ts';
import { subscribeKeyed, EVENTS } from './event-bus.ts';
import { pointHasGeocode, isPointVisible } from './utils/geo-data.ts';
import { formatBusinessName } from './utils/dom-formatters.ts';
import { showExperienceToast, focusOnPoint } from './lifecycle.ts';
import { hideTooltip } from './tooltip.ts';
import { hideViewHandoff } from './view-controller.ts';
import { isMobileViewport } from './environment.ts';
import { debugWarn } from './diagnostic-adapter.ts';

// js/modules/map-state.ts

export const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface Point {
    lat?: number;
    lng?: number;
    name?: string;
    cluster?: number | null;
    lead_id?: string | number;
    [key: string]: unknown;
}

interface LeafletMarker {
    setStyle(style: Record<string, unknown>): void;
    addTo(layer: unknown): LeafletMarker;
    on(event: string, handler: () => void): void;
    bindTooltip(name: string, options: Record<string, unknown>): LeafletMarker;
    openTooltip(): void;
    bringToFront?(): void;
    bringToBack?(): void;
}

interface TerrainHandoffOptions {
    routeCount?: number;
    from?: string;
    to?: string;
    settleAfterMs?: number;
    settlePhase?: string;
}

interface RouteAnchorIndexOptions {
    routeIndices?: number[];
}

// ── Module State ───────────────────────────────────────────────────────────

let leafletAssetsPromise: Promise<unknown> | null = null;

// ── Asset Loading ──────────────────────────────────────────────────────────

export async function loadLeafletAssets(): Promise<unknown> {
    if ((window as Record<string, unknown>).L) return (window as Record<string, unknown>).L;
    if (leafletAssetsPromise) return leafletAssetsPromise;

    leafletAssetsPromise = new Promise((resolve, reject) => {
        const finish = (): void => {
            if ((window as Record<string, unknown>).L) {
                resolve((window as Record<string, unknown>).L);
            } else {
                reject(new Error('Leaflet failed to initialize'));
            }
        };

        if (!document.getElementById('leaflet-runtime-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-runtime-css';
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS_URL;
            document.head.appendChild(link);
        }

        let existingScript = document.getElementById('leaflet-runtime-js');
        if (existingScript) {
            if ((window as Record<string, unknown>).L) {
                resolve((window as Record<string, unknown>).L);
                return;
            }
            existingScript.addEventListener('load', finish, { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Leaflet script failed to load')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = 'leaflet-runtime-js';
        script.src = LEAFLET_JS_URL;
        script.async = true;
        script.onload = finish;
        script.onerror = () => reject(new Error('Leaflet script failed to load'));
        document.head.appendChild(script);
    });

    return leafletAssetsPromise;
}

// ── Subscriptions ──────────────────────────────────────────────────────────

export function initMapStateSubscriptions(): void {
    // Phase 3: Declarative synchronization
    const sync = (payload: Record<string, unknown> = {}): void => {
        syncRouteDirectorState((payload.reason as string) || 'state');
        refreshMapMarkers();
        refreshMapRouteEmbodiment();
    };

    subscribeKeyed('map-state:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('map-state:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('map-state:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('map-state:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('map-state:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('map-state:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('map-state:composition-updated', EVENTS.COMPOSITION_UPDATED, sync);
    subscribeKeyed('map-state:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
}

// ── Map Initialization ─────────────────────────────────────────────────────

export async function initMap(): Promise<void> {
    if (state.mapInitialized && state.map) return;
    if (state.mapInitialized && !state.map) state.mapInitialized = false;
    
    if (!state.mapInitialized && state.map) {
        try {
            (state.map as { remove(): void }).remove();
        } catch (error) {
            debugWarn('Removing stale map instance failed:', error);
        }
        state.map = null;
        state.markersLayer = null;
        state.mapRouteLayer = null;
        state.pointMarkers = [];
    }

    try {
        await loadLeafletAssets();
        if (typeof (window as Record<string, unknown>).L === 'undefined' || !(window as Record<string, unknown>).L) {
            throw new Error('Leaflet not loaded');
        }
        const container = document.getElementById('map-container');
        if (!container) throw new Error('Map container is missing');
        if ((container as Record<string, unknown>)._leaflet_id) {
            delete (container as Record<string, unknown>)._leaflet_id;
            container.innerHTML = '';
        }

        const L = (window as Record<string, unknown>).L as Record<string, Function>;
        state.map = L.map(container, {
            center: [30.3119, -95.4561],
            zoom: 10,
            zoomControl: false
        });

        try {
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: 'OpenStreetMap | CARTO',
                maxZoom: 19
            }).addTo(state.map);
        } catch (err) {
            debugWarn('tileLayer addTo failed:', err);
        }

        state.markersLayer = L.layerGroup().addTo(state.map);
        state.mapRouteLayer = L.layerGroup().addTo(state.map);
        state.pointMarkers = [];

        if (!state || !state.points) return;
        state.points.forEach((point: Point, index: number) => {
            if (pointHasGeocode(point)) {
                const color = (state.COLORS as readonly string[])[(point.cluster ?? 0) % (state.COLORS as readonly string[]).length];
                const marker: LeafletMarker = L.circleMarker([point.lat!, point.lng!], {
                    radius: 4,
                    fillColor: color,
                    color: color,
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.6
                });

                marker.on('mouseover', () => showMapTooltip(point, marker as unknown as { bindTooltip: Function; openTooltip: Function }));
                marker.on('mouseout', () => { if (typeof hideTooltip === 'function') hideTooltip(); });
                marker.on('click', () => {
                    const routeSet = new Set(getRouteEmbodimentIndices());
                    const searchSet = new Set((state.currentSearchSummary as Record<string, unknown> | null)?.resultIndices as number[] || []);
                    const selectableInTrail =
                        !state.currentSearchSummary ||
                        searchSet.has(index) ||
                        routeSet.has(index) ||
                        (state.currentSearchSummary as Record<string, unknown>)?.anchorIndex === index ||
                        (state.currentSearchSummary as Record<string, unknown>)?.topIndex === index ||
                        state.focusedNode === index;
                        
                    if (!selectableInTrail) {
                        showExperienceToast(
                            'Outside this path',
                            'Use County View to leave the current path, or choose one of the lit markers.'
                        );
                        return;
                    }
                    focusOnPoint(point, { revealCard: true, fromSearchResult: true });
                });

                state.pointMarkers.push({ marker, index });
                (marker as unknown as { addTo(layer: unknown): unknown }).addTo(state.markersLayer);
            }
        });

        state.mapInitialized = true;
        refreshMapMarkers();
        refreshMapRouteEmbodiment();

        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.style.opacity = '';
            mapContainer.style.pointerEvents = '';
        }
    } catch (error) {
        console.warn('initMap failed:', error);
        state.mapInitialized = false;
        state.map = null;
        state.markersLayer = null;
        state.mapRouteLayer = null;
        state.pointMarkers = [];
        throw error;
    }
}

// ── Tooltip ────────────────────────────────────────────────────────────────

export function showMapTooltip(point: Point, marker: { bindTooltip: Function; openTooltip: Function }): void {
    if (typeof hideTooltip === 'function') hideTooltip();
    // Simplified for now, original uses updateTooltipContent and positionTooltip
    const name = formatBusinessName(point.name);
    marker.bindTooltip(name, { direction: 'top', offset: [0, -5], className: 'glass-medium' }).openTooltip();
}

// ── Route Points ───────────────────────────────────────────────────────────

export function getMapRoutePoints(): Array<{ index: number; point: Point }> {
    return getRouteEmbodimentIndices()
        .map((index: number) => ({ index, point: (state.points as Point[])[index] }))
        .filter(({ point }: { point: Point }) => pointHasGeocode(point))
        .slice(0, isMobileViewport() ? 7 : 10);
}

// ── Route Embodiment ───────────────────────────────────────────────────────

export function refreshMapRouteEmbodiment(): void {
    if (!state.map || !state.mapRouteLayer) {
        withStateMutation(() => {
            state.routeTraceDiagnostics.mapPointCount = 0;
            state.routeTraceDiagnostics.mapPathActive = false;
        });
        return;
    }
    (state.mapRouteLayer as { clearLayers(): void }).clearLayers();
    if (state.currentView !== 'map') {
        withStateMutation(() => {
            state.routeTraceDiagnostics.mapPointCount = 0;
            state.routeTraceDiagnostics.mapPathActive = false;
        });
        return;
    }

    const routePoints = getMapRoutePoints();
    withStateMutation(() => {
        state.routeTraceDiagnostics.mapPointCount = routePoints.length;
        state.routeTraceDiagnostics.mapPathActive = routePoints.length >= 2;
    });
    if (!routePoints.length) {
        // SD-001 fix: Do NOT show empty-map message if trail state is active.
        const trailStateActive = document.body?.dataset?.trailState === 'active';
        if (state.currentView === 'map' && !trailStateActive) {
            const container = document.getElementById('map-container');
            if (container && !container.querySelector('.map-empty-state')) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'map-empty-state';
                emptyEl.setAttribute('role', 'status');
                emptyEl.setAttribute('aria-live', 'polite');
                emptyEl.innerHTML =
                    '<div class="map-empty-state-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>' +
                    '<div class="map-empty-state-title">Choose a business to map its neighborhood</div>' +
                    '<div class="map-empty-state-note">Search or select a business in the mycelium view, then open Map to see its nearby records here.</div>';
                container.appendChild(emptyEl);
            }
        }
        return;
    }

    // Remove empty-map message when route points are available
    const container = document.getElementById('map-container');
    if (container) {
        const emptyEl = container.querySelector('.map-empty-state');
        if (emptyEl) emptyEl.remove();
    }

    const latLngs = routePoints.map(({ point }: { point: Point }) => [point.lat, point.lng]);
    const L = (window as Record<string, unknown>).L as Record<string, Function>;
    if (latLngs.length >= 2) {
        L.polyline(latLngs, {
            className: 'semantic-map-route-line semantic-map-route-line-aura',
            color: '#79ebde',
            weight: 12,
            opacity: 0.1,
            interactive: false
        }).addTo(state.mapRouteLayer);
        L.polyline(latLngs, {
            className: 'semantic-map-route-line',
            color: '#ffe58f',
            weight: 2.4,
            opacity: 0.68,
            dashArray: '1 14',
            lineCap: 'round',
            interactive: false
        }).addTo(state.mapRouteLayer);
    }

    const anchorIndex = getRouteAnchorIndex(routePoints.map(({ index }: { index: number }) => index));
    routePoints.slice(0, 7).forEach(({ index, point }: { index: number; point: Point }, order: number) => {
        const isAnchor = index === anchorIndex;
        L.circleMarker([point.lat!, point.lng!], {
            className: isAnchor ? 'semantic-map-route-pulse is-anchor' : 'semantic-map-route-pulse',
            radius: isAnchor ? 22 : Math.max(10, 17 - order),
            color: isAnchor ? '#ffe58f' : '#79ebde',
            weight: isAnchor ? 1.4 : 1,
            opacity: isAnchor ? 0.54 : 0.24,
            fillColor: isAnchor ? '#ffe58f' : '#79ebde',
            fillOpacity: isAnchor ? 0.08 : 0.035,
            interactive: false
        }).addTo(state.mapRouteLayer);
    });
}

// ── Center Map ─────────────────────────────────────────────────────────────

export function centerMapOnRouteAnchor(): boolean {
    if (!state.points) return false;
    if (!state.map) return false;
    const focusIndex = state.navState.focusedIndex;
    const focusIdxValid = Number.isFinite(focusIndex) && focusIndex! >= 0 && focusIndex! < state.points.length;
    const anchorIdx = (state.currentSearchSummary as Record<string, unknown> | null)?.anchorIndex as number | undefined;
    const anchorIdxValid = Number.isFinite(anchorIdx) && anchorIdx! >= 0 && anchorIdx! < state.points.length;
    const focusPoint =
        state.selectedPoint ||
        (focusIdxValid ? (state.points as Point[])[focusIndex!] : null) ||
        (anchorIdxValid ? (state.points as Point[])[anchorIdx!] : null) ||
        getMapRoutePoints()[0]?.point ||
        null;
        
    if (!pointHasGeocode(focusPoint)) return false;
    const routePoints = getMapRoutePoints();
    const routeLatLngs = routePoints.map(({ point }: { point: Point }) => [point.lat, point.lng]);
    const L = (window as Record<string, unknown>).L as Record<string, Function>;
    if (routeLatLngs.length >= 2) {
        const bounds = L.latLngBounds(routeLatLngs);
        (state.map as Record<string, Function>).fitBounds(bounds.pad(0.42), {
            animate: true,
            maxZoom: 15,
            paddingTopLeft: [22, isMobileViewport() ? 250 : 96],
            paddingBottomRight: [22, 120]
        });
    } else {
        (state.map as Record<string, Function>).setView([focusPoint!.lat, focusPoint!.lng], 15, { animate: true });
    }
    return true;
}

// ── Refresh Markers ────────────────────────────────────────────────────────

export function refreshMapMarkers(): void {
    if (!state.points) return;
    if (!state.markersLayer) return;
    (state.markersLayer as { clearLayers(): void }).clearLayers();
    const searchResultSet = new Set((state.currentSearchSummary as Record<string, unknown> | null)?.resultIndices as number[] || []);
    const selectedLeadId =
        state.selectedPoint?.lead_id !== undefined && state.selectedPoint?.lead_id !== null
            ? String(state.selectedPoint.lead_id)
            : null;
            
    if (state.pointMarkers && Array.isArray(state.pointMarkers)) {
        const dimmedMarkers: LeafletMarker[] = [];
        const trailMarkers: LeafletMarker[] = [];
        const priorityMarkers: LeafletMarker[] = [];

        state.pointMarkers.forEach(({ marker, index }: { marker: LeafletMarker; index: number }) => {
            if (!isPointVisible(index, state.points as Point[], state.activeClusterFilter, state.activeFilters)) return;
            const point = (state.points as Point[])[index];
            if (point.cluster === null || point.cluster === undefined || !Number.isFinite(point.cluster)) point.cluster = 0;
            const baseColor = (state.COLORS as readonly string[])[point.cluster! % (state.COLORS as readonly string[]).length];
            const isFocused = state.focusedNode === index;
            const isSelected = selectedLeadId !== null && String(point.lead_id) === selectedLeadId;
            const isAnchor = (state.currentSearchSummary as Record<string, unknown>)?.anchorIndex === index;
            const isSearchMatch = searchResultSet.has(index);
            const isTrail = state.trailIndices.has(index) || isSearchMatch;

            let radius = 4;
            let weight = 1;
            let color = baseColor;
            let fillColor = baseColor;
            let opacity = 0.8;
            let fillOpacity = 0.6;
            const classNames: string[] = [];

            if (state.currentSearchSummary) {
                if (isAnchor) {
                    radius = isFocused || isSelected ? 10 : 8.6;
                    weight = 2.4;
                    color = '#ffe58f';
                    fillColor = '#fff4bd';
                    opacity = 0.98;
                    fillOpacity = 0.94;
                    classNames.push('map-marker-anchor');
                    priorityMarkers.push(marker);
                } else if (isFocused || isSelected) {
                    radius = 8.2;
                    weight = 2.1;
                    color = '#92f3e4';
                    fillColor = '#d9fff8';
                    opacity = 0.96;
                    fillOpacity = 0.9;
                    classNames.push('map-marker-focus');
                    priorityMarkers.push(marker);
                } else if (isTrail) {
                    radius = 5.6;
                    weight = 1.6;
                    opacity = 0.88;
                    fillOpacity = 0.74;
                    classNames.push('map-marker-trail');
                    trailMarkers.push(marker);
                } else {
                    radius = 3.2;
                    opacity = 0.45;
                    fillOpacity = 0.28;
                    classNames.push('map-marker-dimmed');
                    dimmedMarkers.push(marker);
                }
            } else if (isFocused || isSelected) {
                radius = 9;
                weight = 2;
                color = '#92f3e4';
                fillColor = '#d9fff8';
                opacity = 0.96;
                fillOpacity = 0.9;
                priorityMarkers.push(marker);
            }

            marker.setStyle({ radius, weight, color, fillColor, opacity, fillOpacity });
            // Leaflet doesn't have a simple way to set className on circleMarkers post-init,
            // but we can set the path element's class if needed.
            marker.addTo(state.markersLayer);
        });

        dimmedMarkers.forEach((marker: LeafletMarker) => marker.bringToBack?.());
        trailMarkers.forEach((marker: LeafletMarker) => marker.bringToFront?.());
        priorityMarkers.forEach((marker: LeafletMarker) => marker.bringToFront?.());
    }
}

// ── Route Director State ───────────────────────────────────────────────────

export function getRouteDirectorState(): string {
    if (state.currentView === 'map') {
        return state.selectedPoint || (state.focusedNode !== null && state.focusedNode !== undefined)
            ? 'map-trail'
            : 'map-overview';
    }
    if (state.semanticDiveMode && state.focusedNode !== null && state.focusedNode !== undefined) return 'inside-pocket';
    if (state.focusedNode !== null && state.focusedNode !== undefined) {
        if ((state.navState.walkHistoryIndices || []).length > 1 || state.navState.mode === 'trail')
            return 'thread-walk';
        return state.currentSearchSummary ? 'search-focus' : 'node-focus';
    }
    if (state.currentSearchSummary) return 'search-corridor';
    return 'overview';
}

export function syncRouteDirectorState(reason = 'state'): string {
    const directorState = getRouteDirectorState();
    if (document.body) {
        document.body.dataset.routeDirector = directorState;
        document.body.dataset.routeDirectorReason =
            String(reason || 'state').replace(/[^a-z0-9-]/gi, '') || 'state';
    }
    return directorState;
}

// ── Terrain Handoff ────────────────────────────────────────────────────────

export function setTerrainHandoffState(phase = 'idle', options: TerrainHandoffOptions = {}): void {
    const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
    const routeCount = Number.isFinite(options.routeCount)
        ? options.routeCount
        : getRouteEmbodimentIndices().length;
        
    state.terrainHandoffState = {
        phase: normalizedPhase,
        from: options.from || state.terrainHandoffState?.from || 'overview',
        to: options.to || state.terrainHandoffState?.to || state.currentView || 'galaxy',
        routeCount: routeCount!,
        startedAt: performance.now()
    };

    document.body.dataset.terrainHandoff = state.terrainHandoffState.phase;
    document.body.dataset.terrainHandoffFrom = state.terrainHandoffState.from;
    document.body.dataset.terrainHandoffTo = state.terrainHandoffState.to;
    document.body.dataset.terrainRouteCount = String(routeCount);

    if (['idle', 'settled'].includes(normalizedPhase) && typeof hideViewHandoff === 'function') {
        hideViewHandoff();
    }

    if (state.terrainHandoffTimer) {
        window.clearTimeout(state.terrainHandoffTimer);
        state.terrainHandoffTimer = null;
    }

    if (Number.isFinite(options.settleAfterMs) && options.settleAfterMs! > 0) {
        state.terrainHandoffTimer = window.setTimeout(() => {
            const settlePhase = options.settlePhase || (state.currentView === 'map' ? 'settled' : 'idle');
            setTerrainHandoffState(settlePhase, {
                routeCount,
                from: state.terrainHandoffState.from,
                to: state.terrainHandoffState.to
            });
        }, options.settleAfterMs);
    }
}

// ── Route Embodiment Indices ───────────────────────────────────────────────

export function getRouteEmbodimentIndices(): number[] {
    if (!state.points || !Array.isArray(state.points)) return [];
    const ordered: number[] = [];
    const pushIndex = (index: number): void => {
        // 10/10 Polish: Pass null for cluster filter in Map view so focused routes are always visible
        if (!Number.isFinite(index) || index < 0 || index >= state.points.length || !isPointVisible(index, state.points as Point[], null, state.activeFilters))
            return;
        if (!(state.nodePositions as unknown[])[index] && !(state.originalPositions as unknown[])[index]) return;
        if (!ordered.includes(index)) ordered.push(index);
    };

    const routeOwner = getRouteDirectorState();
    const focusOwnsRoute = ['search-focus', 'thread-walk', 'node-focus', 'inside-pocket', 'map-trail'].includes(routeOwner);

    if (focusOwnsRoute) {
        pushIndex(state.navState.focusedIndex!);
        pushIndex(state.focusedNode!);
        (state.navState.walkHistoryIndices || []).forEach(pushIndex);
        (state.navState.trailNeighborIndices || []).slice(0, 6).forEach(pushIndex);
        pushIndex((state.currentSearchSummary as Record<string, unknown>)?.anchorIndex as number);
        pushIndex((state.currentSearchSummary as Record<string, unknown>)?.topIndex as number);
        ((state.currentSearchSummary as Record<string, unknown>)?.resultIndices as number[] || []).slice(0, 6).forEach(pushIndex);
    } else {
        pushIndex((state.currentSearchSummary as Record<string, unknown>)?.anchorIndex as number);
        pushIndex((state.currentSearchSummary as Record<string, unknown>)?.topIndex as number);
        ((state.currentSearchSummary as Record<string, unknown>)?.resultIndices as number[] || []).slice(0, 10).forEach(pushIndex);
        (state.navState.walkHistoryIndices || []).forEach(pushIndex);
        pushIndex(state.navState.focusedIndex!);
        pushIndex(state.focusedNode!);
        (state.navState.trailNeighborIndices || []).slice(0, 4).forEach(pushIndex);
    }
    return ordered.slice(0, isMobileViewport() ? 8 : 12);
}

export function getRouteAnchorIndex(routeIndices: number[]): number | null {
    const routeOwner = getRouteDirectorState();
    const focusOwnsRoute = ['search-focus', 'thread-walk', 'node-focus', 'inside-pocket'].includes(routeOwner);
    const focusCandidates = [state.navState.focusedIndex, state.focusedNode];
    const searchCandidates = [
        (state.currentSearchSummary as Record<string, unknown>)?.anchorIndex as number | undefined,
        (state.currentSearchSummary as Record<string, unknown>)?.topIndex as number | undefined,
        routeIndices?.[0]
    ];
    const candidates = focusOwnsRoute
        ? [...focusCandidates, ...searchCandidates]
        : [...searchCandidates, ...focusCandidates];
    return candidates.find((index): index is number => Number.isFinite(index) && routeIndices.includes(index!)) ?? null;
}

// ── Zoom ───────────────────────────────────────────────────────────────────

export function zoomMap(multiplier: number): void {
    if (!state.map) return;
    if (multiplier < 1) {
        (state.map as Record<string, Function>).zoomIn();
    } else {
        (state.map as Record<string, Function>).zoomOut();
    }
}
