import { state } from './js/state.js';
    const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    const COLORS = [
        '#4ecdc4',
        '#ff6b6b',
        '#ffd93d',
        '#6bcb77',
        '#4d96ff',
        '#ff8c42',
        '#a66cff',
        '#ff6b9d',
        '#45b7d1',
        '#96ceb4',
        '#ffeaa7',
        '#74b9ff'
    ];

    let leafletAssetsPromise = null;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatBusinessName(name) {
        return String(name || 'Unknown business')
            .replace(/^Lead\s+Profile:\s*/i, '')
            .replace(/^\d{3,6}[-_]+/, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function hasGeocode(point) {
        return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
    }

    function loadLeafletAssets() {
        if (window.L) return Promise.resolve(window.L);
        if (leafletAssetsPromise) return leafletAssetsPromise;

        leafletAssetsPromise = new Promise((resolve, reject) => {
            if (!document.getElementById('leaflet-runtime-css')) {
                const link = document.createElement('link');
                link.id = 'leaflet-runtime-css';
                link.rel = 'stylesheet';
                link.href = LEAFLET_CSS_URL;
                if (document.head) document.head.appendChild(link);
            }

            const existingScript = document.getElementById('leaflet-runtime-js');
            if (existingScript) {
                existingScript.addEventListener('load', () => resolve(window.L), { once: true });
                existingScript.addEventListener('error', () => reject(new Error('Leaflet script failed to load')), {
                    once: true
                });
                return;
            }

            const script = document.createElement('script');
            script.id = 'leaflet-runtime-js';
            script.src = LEAFLET_JS_URL;
            script.async = true;
            script.onload = () => resolve(window.L);
            script.onerror = () => reject(new Error('Leaflet script failed to load'));
            if (document.head) document.head.appendChild(script);
        });

        return leafletAssetsPromise;
    }

    function visiblePoints() {
        const points = Array.isArray(state.points) ? state.points : [];
        const activeFilters = state.activeFilters || {};
        return points.filter((point) => {
            if (!hasGeocode(point)) return false;
            if (activeFilters.status && activeFilters.status !== 'all' && point.status !== activeFilters.status) return false;
            if (activeFilters.website && !point.website) return false;
            if (activeFilters.email && !point.email) return false;
            if (activeFilters.geocoded && !hasGeocode(point)) return false;
            if (
                state.activeClusterFilter !== null &&
                state.activeClusterFilter !== undefined &&
                point.cluster !== state.activeClusterFilter
            ) {
                return false;
            }
            return true;
        });
    }

    function popupHtml(point) {
        const name = escapeHtml(formatBusinessName(point.name));
        const city = escapeHtml(point.city || 'Montgomery County');
        const category = escapeHtml(point.what || point.status || 'Local business record');
        return `<strong>${name}</strong><br><span>${city}</span><br><small>${category}</small>`;
    }

    async function initMap() {
        const container = document.getElementById('map-container');
        if (!container) throw new Error('Map container is missing');

        await loadLeafletAssets();
        if (!window.L) throw new Error('Leaflet did not initialize');

        if (state.map && typeof state.map.remove === 'function') {
            state.map.remove();
        }

        container.innerHTML = '';
        const map = window.L.map(container, {
            center: [30.3119, -95.4561],
            zoom: 10,
            zoomControl: false
        });

        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: 'OpenStreetMap | CARTO',
            maxZoom: 19
        }).addTo(map);
        window.L.control.zoom({ position: 'bottomright' }).addTo(map);

        const markersLayer = window.L.layerGroup().addTo(map);
        const markers = [];
        for (const point of visiblePoints()) {
            const color = COLORS[Math.abs(Number(point.cluster) || 0) % COLORS.length];
            const marker = window.L.circleMarker([Number(point.lat), Number(point.lng)], {
                radius: 4,
                fillColor: color,
                color,
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.58
            });
            marker.bindPopup(popupHtml(point));
            marker.addTo(markersLayer);
            markers.push(marker);
        }

        state.map = map;
        state.markersLayer = markersLayer;
        state.mapInitialized = true;
        window.map = map;
        window.__semanticMapRuntime = {
            active: true,
            markerCount: markers.length,
            initializedAt: new Date().toISOString()
        };

        window.setTimeout(() => {
            map.invalidateSize();
            if (markers.length) {
                const group = window.L.featureGroup(markers.slice(0, 600));
                map.fitBounds(group.getBounds().pad(0.08), { maxZoom: 11 });
            }
        }, 80);
    }

    window.initMap = initMap;
    window.refreshMapMarkers = window.refreshMapMarkers || function () {};
    window.refreshMapRouteEmbodiment = window.refreshMapRouteEmbodiment || function () {};
    window.centerMapOnRouteAnchor = window.centerMapOnRouteAnchor || function () {};
    window.executeJourneyCompassAction =
        window.executeJourneyCompassAction ||
        function (action) {
            const focused = document.activeElement;
            const fallbackText = focused?.textContent?.toLowerCase() || '';
            const inferredAction = action || focused?.dataset?.journeyAction || fallbackText;

            if (String(inferredAction).includes('map')) {
                if (typeof window.switchView === 'function') window.switchView('map');
                return;
            }

            if (String(inferredAction).includes('search')) {
                document.getElementById('search-input')?.focus();
                return;
            }

            if (String(inferredAction).includes('county') || String(inferredAction).includes('overview')) {
                if (typeof window.switchView === 'function') window.switchView('galaxy');
                if (typeof window.resetExperienceState === 'function') window.resetExperienceState();
            }
        };
