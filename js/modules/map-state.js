import { state } from '../state.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
import { pointHasGeocode, isPointVisible } from './utils/geo-data.js';
import { formatBusinessName } from './utils/dom-formatters.js';
import { showExperienceToast, focusOnPoint } from './lifecycle.js';
import { hideTooltip } from './tooltip.js';
import { hideViewHandoff } from './view-controller.js';
import { isMobileViewport } from './environment.js';

// js/modules/map-state.js

export const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletAssetsPromise = null;

export async function loadLeafletAssets() {
    if (window.L) return window.L;
    if (leafletAssetsPromise) return leafletAssetsPromise;

    leafletAssetsPromise = new Promise((resolve, reject) => {
        const finish = () => {
            if (window.L) {
                resolve(window.L);
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
            if (window.L) {
                resolve(window.L);
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

export function initMapStateSubscriptions() {
    // Phase 3: Declarative synchronization
    const sync = (payload = {}) => {
        syncRouteDirectorState(payload.reason || 'state');
        refreshMapMarkers();
        refreshMapRouteEmbodiment();
    };

    subscribeKeyed('map-state:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('map-state:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('map-state:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('map-state:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('map-state:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('map-state:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('map-state:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
}

export async function initMap() {
    if (state.mapInitialized && state.map) return;
    if (state.mapInitialized && !state.map) state.mapInitialized = false;
    
    if (!state.mapInitialized && state.map) {
        try {
            state.map.remove();
        } catch (error) {
            console.warn('Removing stale map instance failed:', error);
        }
        state.map = null;
        state.markersLayer = null;
        state.mapRouteLayer = null;
        state.pointMarkers = [];
    }

    try {
        await loadLeafletAssets();
        if (typeof window.L === 'undefined' || !window.L) {
            throw new Error('Leaflet not loaded');
        }
        const container = document.getElementById('map-container');
        if (!container) throw new Error('Map container is missing');
        if (container._leaflet_id) {
            delete container._leaflet_id;
            container.innerHTML = '';
        }

        state.map = window.L.map(container, {
            center: [30.3119, -95.4561],
            zoom: 10,
            zoomControl: false
        });

        try {
            window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: 'OpenStreetMap | CARTO',
                maxZoom: 19
            }).addTo(state.map);
        } catch (err) {
            console.warn('tileLayer addTo failed:', err);
        }

        state.markersLayer = window.L.layerGroup().addTo(state.map);
        state.mapRouteLayer = window.L.layerGroup().addTo(state.map);
        state.pointMarkers = [];

        if (!state || !state.points) return;
        state.points.forEach((point, index) => {
            if (pointHasGeocode(point)) {
                const color = state.COLORS[point.cluster % state.COLORS.length];
                const marker = window.L.circleMarker([point.lat, point.lng], {
                    radius: 4,
                    fillColor: color,
                    color: color,
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.6
                });

                marker.on('mouseover', () => showMapTooltip(point, marker));
                marker.on('mouseout', () => { if (typeof hideTooltip === 'function') hideTooltip(); });
                marker.on('click', () => {
                    const routeSet = new Set(getRouteEmbodimentIndices());
                    const searchSet = new Set(state.currentSearchSummary?.resultIndices || []);
                    const selectableInTrail =
                        !state.currentSearchSummary ||
                        searchSet.has(index) ||
                        routeSet.has(index) ||
                        state.currentSearchSummary.anchorIndex === index ||
                        state.currentSearchSummary.topIndex === index ||
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
                marker.addTo(state.markersLayer);
            }
        });

        state.mapInitialized = true;
        refreshMapMarkers();
        refreshMapRouteEmbodiment();

        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.style.opacity = '1';
            mapContainer.style.pointerEvents = 'auto';
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

export function showMapTooltip(point, marker) {
    if (typeof hideTooltip === 'function') hideTooltip();
    // Simplified for now, original uses updateTooltipContent and positionTooltip
    const name = formatBusinessName(point.name);
    marker.bindTooltip(name, { direction: 'top', offset: [0, -5], className: 'glass-medium' }).openTooltip();
}

export function getMapRoutePoints() {
    return getRouteEmbodimentIndices()
        .map((index) => ({ index, point: state.points[index] }))
        .filter(({ point }) => pointHasGeocode(point))
        .slice(0, isMobileViewport() ? 7 : 10);
}

export function refreshMapRouteEmbodiment() {
    if (!state.map || !state.mapRouteLayer) {
        state.routeTraceDiagnostics.mapPointCount = 0;
        state.routeTraceDiagnostics.mapPathActive = false;
        return;
    }
    state.mapRouteLayer.clearLayers();
    if (state.currentView !== 'map') {
        state.routeTraceDiagnostics.mapPointCount = 0;
        state.routeTraceDiagnostics.mapPathActive = false;
        return;
    }

    const routePoints = getMapRoutePoints();
    state.routeTraceDiagnostics.mapPointCount = routePoints.length;
    state.routeTraceDiagnostics.mapPathActive = routePoints.length >= 2;
    if (!routePoints.length) {
        // SD-001 fix: Do NOT show empty-map message if trail state is active.
        // During terrain prelude (~1200ms) or deferred hydration, getRouteEmbodimentIndices()
        // may temporarily return empty even though valid route data exists. Showing the
        // empty state in this case is a race condition. Trail state signals the data is
        // still being assembled — suppress the empty state until the next refresh cycle
        // or until we're confident the route genuinely has no geocoded points.
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

    const latLngs = routePoints.map(({ point }) => [point.lat, point.lng]);
    if (latLngs.length >= 2) {
        window.L.polyline(latLngs, {
            className: 'semantic-map-route-line semantic-map-route-line-aura',
            color: '#79ebde',
            weight: 12,
            opacity: 0.1,
            interactive: false
        }).addTo(state.mapRouteLayer);
        window.L.polyline(latLngs, {
            className: 'semantic-map-route-line',
            color: '#ffe58f',
            weight: 2.4,
            opacity: 0.68,
            dashArray: '1 14',
            lineCap: 'round',
            interactive: false
        }).addTo(state.mapRouteLayer);
    }

    const anchorIndex = getRouteAnchorIndex(routePoints.map(({ index }) => index));
    routePoints.slice(0, 7).forEach(({ index, point }, order) => {
        const isAnchor = index === anchorIndex;
        window.L.circleMarker([point.lat, point.lng], {
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

export function centerMapOnRouteAnchor() {
    if (!state.points) return false;
    if (!state.map) return false;
    const focusIndex = state.navState.focusedIndex;
    const focusIdxValid = Number.isFinite(focusIndex) && focusIndex >= 0 && focusIndex < state.points.length;
    const anchorIdx = state.currentSearchSummary?.anchorIndex;
    const anchorIdxValid = Number.isFinite(anchorIdx) && anchorIdx >= 0 && anchorIdx < state.points.length;
    const focusPoint =
        state.selectedPoint ||
        (focusIdxValid ? state.points[focusIndex] : null) ||
        (anchorIdxValid ? state.points[anchorIdx] : null) ||
        getMapRoutePoints()[0]?.point ||
        null;
        
    if (!pointHasGeocode(focusPoint)) return false;
    const routePoints = getMapRoutePoints();
    const routeLatLngs = routePoints.map(({ point }) => [point.lat, point.lng]);
    if (routeLatLngs.length >= 2) {
        const bounds = window.L.latLngBounds(routeLatLngs);
        state.map.fitBounds(bounds.pad(0.42), {
            animate: true,
            maxZoom: 13,
            paddingTopLeft: [22, isMobileViewport() ? 250 : 96],
            paddingBottomRight: [22, 120]
        });
    } else {
        state.map.setView([focusPoint.lat, focusPoint.lng], 14, { animate: true });
    }
    return true;
}

export function refreshMapMarkers() {
    if (!state.points) return;
    if (!state.markersLayer) return;
    state.markersLayer.clearLayers();
    const searchResultSet = new Set(state.currentSearchSummary?.resultIndices || []);
    const selectedLeadId =
        state.selectedPoint?.lead_id !== undefined && state.selectedPoint?.lead_id !== null
            ? String(state.selectedPoint.lead_id)
            : null;
            
    if (state.pointMarkers && Array.isArray(state.pointMarkers)) {
        const dimmedMarkers = [];
        const trailMarkers = [];
        const priorityMarkers = [];

        state.pointMarkers.forEach(({ marker, index }) => {
            if (!isPointVisible(index, state.points, state.activeClusterFilter, state.activeFilters)) return;
            const point = state.points[index];
            if (point.cluster === null || point.cluster === undefined || !Number.isFinite(point.cluster)) point.cluster = 0;
            const baseColor = state.COLORS[point.cluster % state.COLORS.length];
            const isFocused = state.focusedNode === index;
            const isSelected = selectedLeadId !== null && String(point.lead_id) === selectedLeadId;
            const isAnchor = state.currentSearchSummary?.anchorIndex === index;
            const isSearchMatch = searchResultSet.has(index);
            const isTrail = state.trailIndices.has(index) || isSearchMatch;

            let radius = 4;
            let weight = 1;
            let color = baseColor;
            let fillColor = baseColor;
            let opacity = 0.8;
            let fillOpacity = 0.6;
            const classNames = [];

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

        dimmedMarkers.forEach(marker => marker.bringToBack?.());
        trailMarkers.forEach(marker => marker.bringToFront?.());
        priorityMarkers.forEach(marker => marker.bringToFront?.());
    }
}

export function getRouteDirectorState() {
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

export function syncRouteDirectorState(reason = 'state') {
    const directorState = getRouteDirectorState();
    if (document.body) {
        document.body.dataset.routeDirector = directorState;
        document.body.dataset.routeDirectorReason =
            String(reason || 'state').replace(/[^a-z0-9-]/gi, '') || 'state';
    }
    return directorState;
}

export function setTerrainHandoffState(phase = 'idle', options = {}) {
    const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
    const routeCount = Number.isFinite(options.routeCount)
        ? options.routeCount
        : getRouteEmbodimentIndices().length;
        
    state.terrainHandoffState = {
        phase: normalizedPhase,
        from: options.from || state.terrainHandoffState?.from || 'overview',
        to: options.to || state.terrainHandoffState?.to || state.currentView || 'galaxy',
        routeCount,
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

    if (Number.isFinite(options.settleAfterMs) && options.settleAfterMs > 0) {
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

export function getRouteEmbodimentIndices() {
    if (!state.points || !Array.isArray(state.points)) return [];
    const ordered = [];
    const pushIndex = (index) => {
        // 10/10 Polish: Pass null for cluster filter in Map view so focused routes are always visible
        if (!Number.isFinite(index) || index < 0 || index >= state.points.length || !isPointVisible(index, state.points, null, state.activeFilters))
            return;
        if (!state.nodePositions[index] && !state.originalPositions[index]) return;
        if (!ordered.includes(index)) ordered.push(index);
    };

    const routeOwner = getRouteDirectorState();
    const focusOwnsRoute = ['search-focus', 'thread-walk', 'node-focus', 'inside-pocket', 'map-trail'].includes(routeOwner);

    if (focusOwnsRoute) {
        pushIndex(state.navState.focusedIndex);
        pushIndex(state.focusedNode);
        (state.navState.walkHistoryIndices || []).forEach(pushIndex);
        (state.navState.trailNeighborIndices || []).slice(0, 6).forEach(pushIndex);
        pushIndex(state.currentSearchSummary?.anchorIndex);
        pushIndex(state.currentSearchSummary?.topIndex);
        (state.currentSearchSummary?.resultIndices || []).slice(0, 6).forEach(pushIndex);
    } else {
        pushIndex(state.currentSearchSummary?.anchorIndex);
        pushIndex(state.currentSearchSummary?.topIndex);
        (state.currentSearchSummary?.resultIndices || []).slice(0, 10).forEach(pushIndex);
        (state.navState.walkHistoryIndices || []).forEach(pushIndex);
        pushIndex(state.navState.focusedIndex);
        pushIndex(state.focusedNode);
        (state.navState.trailNeighborIndices || []).slice(0, 4).forEach(pushIndex);
    }
    return ordered.slice(0, isMobileViewport() ? 8 : 12);
}

export function getRouteAnchorIndex(routeIndices) {
    const routeOwner = getRouteDirectorState();
    const focusOwnsRoute = ['search-focus', 'thread-walk', 'node-focus', 'inside-pocket'].includes(routeOwner);
    const focusCandidates = [state.navState.focusedIndex, state.focusedNode];
    const searchCandidates = [
        state.currentSearchSummary?.anchorIndex,
        state.currentSearchSummary?.topIndex,
        routeIndices?.[0]
    ];
    const candidates = focusOwnsRoute
        ? [...focusCandidates, ...searchCandidates]
        : [...searchCandidates, ...focusCandidates];
    return candidates.find((index) => Number.isFinite(index) && routeIndices.includes(index)) ?? null;
}

export function zoomMap(multiplier) {
    if (!state.map) return;
    if (multiplier < 1) {
        state.map.zoomIn();
    } else {
        state.map.zoomOut();
    }
}
