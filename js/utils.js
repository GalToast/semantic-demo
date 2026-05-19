// js/utils.js - pure utility functions, no global state dependencies
// All needed values come from function parameters.

import * as THREE from 'three';

export function updateDocumentMeta(title, description) {
    if (typeof document === 'undefined') return;
    if (title) document.title = title;
    if (description) {
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', description);
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute('content', description);
    }
}

export function describeCluster(cluster) {
    const CLUSTER_NAMES = [
        'General Business',
        'Professional Services',
        'Food & Hospitality',
        'Construction & Trades',
        'Retail & Shops',
        'Beauty & Wellness',
        'Real Estate & Property',
        'Industrial & Logistics',
        'Agriculture & Ranching',
        'Automotive',
        'Healthcare & Medical',
        'Therapy & Counseling',
        'Education & Childcare',
        'Churches',
        'Faith Ministries',
        'Community Nonprofits',
        'Foundations',
        'Arts & Culture',
        'Economic Development',
        'Public Agencies',
        'Enterprise Brands'
    ];
    return CLUSTER_NAMES[cluster] || 'Other';
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function cleanPublicNoteText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
    return String(value)
        .replace(/^legal name:\s*/i, '')
        .replace(/;.*$/, '')
        .replace(/\n.*$/, '')
        .replace(/\*\*/g, '')
        .replace(/\|/g, ' ')
        .replace(/^#{1,4}\s+/gm, '')
        .replace(/-{3,}/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[-*]+\s*/, '')
        .replace(/`+/g, '')
        .trim()
        .replace(/\s+([,.;:!?])/g, '$1');
}

export function isPrivateResearchNote(value) {
    const text = String(value || '').toLowerCase();
    if (!text) return false;
    return [
        'disqualified:',
        'duplicate of lead',
        'double outreach',
        'qualified candidate',
        'during research',
        'public direct email',
        'public contact email',
        'same public contact info',
        'canonical record',
        'no active business presence',
        'contact info found',
        'residential address',
        'keeping a single canonical record'
    ].some((marker) => text.includes(marker));
}

export function sanitizePublicFacingNote(value) {
    const text = cleanPublicNoteText(value);
    if (!text || isPrivateResearchNote(text)) return '';
    return text;
}

export function getBusinessNamePresentation(name) {
    if (name === null || name === undefined) {
        return { display: 'Unknown business', raw: null, showRaw: false };
    }

    let raw = String(name)
        .trim()
        .replace(/^Lead\s+Profile:\s*/i, '');
    raw = raw.replace(/^\d{3,6}[-_]+/, '');
    if (!raw) {
        return { display: 'Unknown business', raw: null, showRaw: false };
    }

    const slugLike = !/\s/.test(raw) && /[-_]/.test(raw);
    let text = raw;

    if (slugLike) {
        text = text.replace(/[-_]+/g, ' ');
    } else {
        text = text.replace(/_+/g, ' ');
    }

    text = text.replace(/([a-z])([A-Z])/g, '$1 $2');

    const attachedSuffixes = ['PLLC', 'LLLP', 'LLC', 'LLP', 'CORP', 'INC', 'LTD', 'PLC', 'LP', 'PC', 'PA', 'CO'];
    attachedSuffixes.forEach((suffix) => {
        text = text.replace(new RegExp(`([A-Za-z])(${suffix})(?=$|\b|[.,])`, 'g'), `$1 $2`);
    });

    const preserveUpper = new Set([
        'LLC',
        'LLP',
        'LP',
        'INC',
        'LTD',
        'CORP',
        'CO',
        'PLC',
        'PLLC',
        'PC',
        'PA',
        'TX',
        'USA',
        'DBA',
        'CPA',
        'DDS',
        'MD',
        'DO',
        'POA',
        'HOA',
        'HVAC',
        'AC'
    ]);

    const display =
        text
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean)
            .map((token) => {
                const parts = token.match(/^([^A-Za-z0-9&]*)([A-Za-z0-9&'.]+)([^A-Za-z0-9&]*)$/);
                if (!parts) return token;
                const [, prefix, core, suffix] = parts;
                const upper = core.toUpperCase();

                let normalizedCore = core;
                if (preserveUpper.has(upper) || /^[A-Z]{2,4}$/.test(core)) {
                    normalizedCore = upper;
                } else if (/^\d+[A-Za-z]+$/.test(core)) {
                    normalizedCore = core.toLowerCase();
                } else if (/^[a-z][a-z0-9&'.]*$/.test(core) || /^[A-Z][A-Z0-9&'.]{3,}$/.test(core)) {
                    normalizedCore = core
                        .toLowerCase()
                        .replace(/(^|['(])([a-z])/g, (_, separator, char) => `${separator}${char.toUpperCase()}`);
                }

                return `${prefix}${normalizedCore}${suffix}`;
            })
            .join(' ') || 'Unknown business';

    const cleanedDisplay = display.replace(/^Lead\s+Profile:\s*/i, '').trim();
    const rawComparable = raw.replace(/\s+/g, ' ').trim().toLowerCase();
    const displayComparable = cleanedDisplay.replace(/\s+/g, ' ').trim().toLowerCase();
    const showRaw = rawComparable !== displayComparable && (slugLike || /[_-]/.test(raw) || /[A-Z]{5,}/.test(raw));

    return { display: cleanedDisplay, raw, showRaw };
}

export function formatBusinessName(name) {
    return getBusinessNamePresentation(name).display;
}

export function cleanOptionalValue(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (['unknown', 'not found', 'none', 'none detected', 'n/a', 'null'].includes(text.toLowerCase())) {
        return null;
    }
    return text;
}

export function parseFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function isCompactFocusStageViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

export function isCompactMapViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

export function isCompactSearchViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

export function stripTerminalPunctuation(text = '') {
    const clean = cleanOptionalValue(text);
    if (clean === null) return '';
    return clean.replace(/[.\s]+$/g, '');
}

export function pointHasGeocode(point) {
    if (!point) return false;
    const lat = point.lat;
    const lng = point.lng;

    // Strict bounding box to prevent bogus trans-continental polylines.
    // Montgomery County, TX: ~30.3N, -95.4W. Guard against Maryland (39,-77)
    // or Norway (69,18) coordinates that would produce nonsense map routes.
    const isValidLat = Number.isFinite(lat) && lat >= 25.0 && lat <= 37.0;
    const isValidLng = Number.isFinite(lng) && lng >= -107.0 && lng <= -93.0;

    return isValidLat && isValidLng;
}

export function isPointVisible(index, points, activeClusterFilter, activeFilters) {
    if (index < 0 || index >= points.length) return false;
    const point = points[index];
    const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0;
    if (activeClusterFilter !== null && pointCluster !== activeClusterFilter) return false;
    if (activeFilters.status !== 'all' && point.status !== activeFilters.status) return false;
    if (activeFilters.city !== 'all' && normalizeCityForFilter(point.city) !== activeFilters.city) return false;
    if (activeFilters.website && !point.website) return false;      
    if (activeFilters.email && !point.email) return false;
    if (activeFilters.geocoded && !pointHasGeocode(point)) return false;
    return true;
}

export function normalizeCityForFilter(city) {
    const clean = cleanOptionalValue(city);  
    if (!clean || /[0-9]/.test(clean) || clean.includes('(') || clean.length > 28 || clean.toLowerCase() === 'montgomery county') {
        return 'Other / Unparsed';
    }
    const lower = clean.toLowerCase();
    if (lower === 'cleveland' || lower === 'clevland') return 'Cleveland';
    if (lower === 'cut and shoot') return 'Cut and Shoot';
    if (lower === 'coldspring' || lower === 'cold spring') return 'Cold Spring';
    
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function calculateSignalScore(point) {
    if (!point) return 0;
    let score = 0;
    if (point.website) score += 1.35;
    if (point.email) score += 1.0;
    if (point.phone) score += 0.45;
    if (pointHasGeocode(point)) score += 1.25;
    if (point.status === 'active') score += 0.55;
    if (point.trivia) score += 0.35;
    return score;
}

export function highlightMatch(text, query) {
    if (!text) return '';
    if (query === null || query === undefined) return { matched: false, fragments: [] };
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    const escapedQuery = escapeHtml(query);
    const escapedPrefix = escapeHtml(text.substring(0, idx));
    const escapedSuffix = escapeHtml(text.substring(idx + query.length));
    return (
        escapedPrefix +
        '<mark style="background:rgba(226,244,241,0.12);color:inherit;padding:0 2px;border-radius:2px;box-shadow:inset 0 -1px 0 rgba(121,235,222,0.38)">' +
        escapedQuery +
        '</mark>' +
        escapedSuffix
    );
}

export function tokenizeSearchText(text, stopWords) {
    if (!stopWords) stopWords = new Set();
    return [
        ...new Set(
            (
                String(text || '')
                    .toLowerCase()
                    .match(/[a-z0-9]+/g) || []
            )
                .filter(Boolean)
                .filter((token) => token.length > 1 && !stopWords.has(token))
        )
    ];
}

export function countTokenMatches(fieldTokens, queryTokens) {
    if (!fieldTokens || !queryTokens) return 0;
    let exact = 0;
    let prefix = 0;
    if (!queryTokens || !Array.isArray(queryTokens)) return 0;
    queryTokens.forEach((token) => {
        if (fieldTokens.includes(token)) exact += 1;
        else if (fieldTokens.some((entry) => entry.startsWith(token) || token.startsWith(entry))) prefix += 1;
    });
    return { exact, prefix };
}

export function getPublicRecordStatusLabel(status) {
    const normalized = String(status || 'active')
        .trim()
        .toLowerCase();
    if (normalized === 'disqualified') return 'Archive layer';      
    return 'County record';
}

export function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function quadraticBezierComponent(a, b, c, t) {
    const inverse = 1 - t;
    return inverse * inverse * a + 2 * inverse * t * b + t * t * c; 
}

export function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);   
}

export function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
}

export function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function getThreadPulseOpacity(baseOpacity, pulse, requestedAmplitude, revealProgress = 1) {
    const safeBase = Math.max(0, Number.isFinite(baseOpacity) ? baseOpacity : 0);
    const safeReveal = Math.max(0, Number.isFinite(revealProgress) ? revealProgress : 1);
    const amplitude = Math.min(
        Math.max(0, Number.isFinite(requestedAmplitude) ? requestedAmplitude : 0),
        Math.max(0.0006, safeBase * 0.42)
    );
    return Math.max(0, safeBase + pulse * amplitude) * safeReveal;
}

export function getFieldStepSyncLift() {
    // This is a stub if we don't have the full weather/sync logic yet
    return 0;
}

export function getZoomBlend(camera, controls) {
    if (!camera || !controls) return 0.42;
    const minDistance = Number.isFinite(controls.minDistance) ? controls.minDistance : 0.5;
    const maxDistance = Number.isFinite(controls.maxDistance) ? controls.maxDistance : 8;
    const range = Math.max(0.001, maxDistance - minDistance);
    const distance = camera.position.distanceTo(controls.target);
    return THREE.MathUtils.clamp((distance - minDistance) / range, 0, 1);
}

export function getGraphPresentationState(focusedNode, semanticDiveMode, mode, searchGlowActive) {
    if (focusedNode !== null) {
        if (semanticDiveMode) return 'inside';
        if (document.body.dataset.focusPanelMode === 'field-node') return 'field-node';
        return mode === 'trail' ? 'trail' : 'focus';
    }
    if (searchGlowActive) return 'search';
    return 'overview';
}

export function getGraphPresentationProfile(zoomBlend, state, compactViewport) {
    const zoomReveal = 1 - zoomBlend;
    const profiles = {
        overview: {
            coreOpacity: 0.078 + zoomReveal * 0.086,
            wispyOpacity: 0.008 + zoomReveal * 0.03,
            bridgeOpacity: 0.006 + zoomReveal * 0.018,
            hoverOverlayOpacity: 0.24 + zoomReveal * 0.08,
            searchDimFactor: 0.14 + zoomReveal * 0.03,
            searchContextFactor: 0.44 + zoomReveal * 0.12,
            searchBoostBase: 0.52 + zoomReveal * 0.14,
            searchBoostRange: 0.62 + zoomReveal * 0.18,
            searchAnchorBoostBase: 0.92 + zoomReveal * 0.16,
            searchAnchorBoostRange: 0.92 + zoomReveal * 0.18,
            searchBeadFloor: 0.045,
            traversalCoreFloor: 0.02 + zoomReveal * 0.012,
            traversalCoreLift: 0.014 + zoomReveal * 0.008,
            traversalWispyFloor: 0.0032 + zoomReveal * 0.0018,
            traversalWispyLift: 0.0018 + zoomReveal * 0.0014,
            traversalBridgeFloor: 0.0014 + zoomReveal * 0.0008,
            traversalBridgeLift: 0.0009 + zoomReveal * 0.0006,
            focusSemanticOpacity: 0.94 + zoomReveal * 0.04,
            pointOpacityScale: 1,
            pointSizeScale: 1
        },
        search: {
            coreOpacity: 0.034 + zoomReveal * 0.042,
            wispyOpacity: 0.0028 + zoomReveal * 0.011,
            bridgeOpacity: 0.0022 + zoomReveal * 0.008,
            hoverOverlayOpacity: 0.42 + zoomReveal * 0.14,
            searchDimFactor: 0.42 + zoomReveal * 0.04,
            searchContextFactor: 0.6 + zoomReveal * 0.14,
            searchBoostBase: 0.44 + zoomReveal * 0.16,
            searchBoostRange: 0.5 + zoomReveal * 0.2,
            searchAnchorBoostBase: 0.84 + zoomReveal * 0.18,
            searchAnchorBoostRange: 0.86 + zoomReveal * 0.22,
            searchBeadFloor: 0.038,
            traversalCoreFloor: 0.016 + zoomReveal * 0.01,
            traversalCoreLift: 0.01 + zoomReveal * 0.008,
            traversalWispyFloor: 0.0024 + zoomReveal * 0.0016,
            traversalWispyLift: 0.0014 + zoomReveal * 0.0012,
            traversalBridgeFloor: 0.0011 + zoomReveal * 0.0007,
            traversalBridgeLift: 0.0007 + zoomReveal * 0.0005,
            focusSemanticOpacity: 0.9 + zoomReveal * 0.05,
            pointOpacityScale: compactViewport ? 0.68 : 0.82,
            pointSizeScale: compactViewport ? 0.82 : 0.92
        },
        focus: {
            coreOpacity: 0.026 + zoomReveal * 0.016,
            wispyOpacity: 0.0022 + zoomReveal * 0.0042,
            bridgeOpacity: 0.0011 + zoomReveal * 0.002,
            hoverOverlayOpacity: 0.42 + zoomReveal * 0.12,
            searchDimFactor: 0.3,
            searchContextFactor: 0.66,
            searchBoostBase: 0.58,
            searchBoostRange: 0.72,
            searchAnchorBoostBase: 1.04,
            searchAnchorBoostRange: 1.18,
            searchBeadFloor: 0.026,
            traversalCoreFloor: 0.018 + zoomReveal * 0.008,
            traversalCoreLift: 0.012 + zoomReveal * 0.007,
            traversalWispyFloor: 0.0024 + zoomReveal * 0.0012,
            traversalWispyLift: 0.0014 + zoomReveal * 0.001,
            traversalBridgeFloor: 0.0011 + zoomReveal * 0.0005,
            traversalBridgeLift: 0.0007 + zoomReveal * 0.0004,
            focusSemanticOpacity: 0.52 + zoomReveal * 0.06,
            pointOpacityScale: compactViewport ? 0.42 : 0.6,
            pointSizeScale: compactViewport ? 0.92 : 0.98
        },
        inside: {
            coreOpacity: 0.008 + zoomReveal * 0.006,
            wispyOpacity: 0.0008 + zoomReveal * 0.0014,
            bridgeOpacity: 0.0007 + zoomReveal * 0.001,
            hoverOverlayOpacity: 0.42,
            searchDimFactor: 0.2,
            searchContextFactor: 0.5,
            searchBoostBase: 0.5,
            searchBoostRange: 0.6,
            searchAnchorBoostBase: 1,
            searchAnchorBoostRange: 1,
            searchBeadFloor: 0.018,
            traversalCoreFloor: 0.01,
            traversalCoreLift: 0.005,
            traversalWispyFloor: 0.001,
            traversalWispyLift: 0.001,
            traversalBridgeFloor: 0.0005,
            traversalBridgeLift: 0.0005,
            focusSemanticOpacity: 0.28,
            pointOpacityScale: compactViewport ? 0.2 : 0.34,
            pointSizeScale: compactViewport ? 0.9 : 0.95
        }
    };

    return profiles[state] || profiles.overview;
}

export function getThreadCategoryColor(cluster, colors) {
    if (cluster === null || cluster === undefined || !Number.isFinite(cluster)) cluster = 0;
    if (!colors || colors.length === 0) return new THREE.Color('#888888');
    return new THREE.Color(colors[cluster % colors.length]);
}

export function computeOverviewScatterOffsets(sourcePoints, threshold = 0.055) {
    if (!Array.isArray(sourcePoints) || sourcePoints.length < 2) {
        return Array.from({ length: (sourcePoints && sourcePoints.length) || 0 }, () => ({ x: 0, y: 0, z: 0 }));
    }
    const offsets = Array.from({ length: sourcePoints.length }, () => ({ x: 0, y: 0, z: 0 }));
    const seededUnit = (index, salt = 0) => {
        const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
        return x - Math.floor(x);
    };

    const parent = Array.from({ length: sourcePoints.length }, (_, i) => i);
    const find = (i) => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    const unite = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[rb] = ra;
    };

    const cellSize = threshold;
    const grid = new Map();
    const cellKey = (x, y, z) =>
        `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;

    sourcePoints.forEach((point, index) => {
        const key = cellKey(point.x, point.y, point.z); 
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(index);
    });

    for (let i = 0; i < sourcePoints.length; i++) {     
        const point = sourcePoints[i];
        const cx = Math.floor(point.x / cellSize);
        const cy = Math.floor(point.y / cellSize);
        const cz = Math.floor(point.z / cellSize);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {      
                    const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
                    if (!bucket) continue;
                    for (const otherIndex of bucket) {  
                        if (otherIndex <= i) continue;  
                        const other = sourcePoints[otherIndex];
                        const ddx = point.x - other.x;
                        const ddy = point.y - other.y;
                        const ddz = point.z - other.z;
                        if (Math.hypot(ddx, ddy, ddz) <= threshold) {
                            unite(i, otherIndex);       
                        }
                    }
                }
            }
        }
    }

    const groups = new Map();
    for (let i = 0; i < sourcePoints.length; i++) {     
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);    
        groups.get(root).push(i);
    }

    const worldUp = new THREE.Vector3(0, 1, 0);
    const fallbackAxis = new THREE.Vector3(1, 0, 0);
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        group.sort((a, b) => a - b);

        const centroid = new THREE.Vector3();
        group.forEach((index) => {
            centroid.x += sourcePoints[index].x;
            centroid.y += sourcePoints[index].y;
            centroid.z += sourcePoints[index].z;
        });
        centroid.multiplyScalar(1 / group.length);      

        const normal =
            centroid.lengthSq() > 1e-8 ? centroid.clone().normalize() : new THREE.Vector3(0, 0, 1);
        let tangentA = new THREE.Vector3().crossVectors(normal, worldUp);
        if (tangentA.lengthSq() < 1e-8) {
            tangentA = new THREE.Vector3().crossVectors(normal, fallbackAxis);
        }
        tangentA.normalize();
        const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();

        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const maxRadius = Math.min(0.082, 0.016 + Math.sqrt(group.length) * 0.0072);
        const minRadius = Math.min(maxRadius * 0.58, 0.012 + group.length * 0.00045);
        const phase = seededUnit(group[0], group.length) * Math.PI * 2;
        const rawOffsets = [];
        const groupOffsetCenter = new THREE.Vector3();

        group.forEach((index, order) => {
            const rank = (order + 0.5) / group.length;
            const irregularity = (seededUnit(index, 3.7) - 0.5) * 0.28;
            const radiusEase = Math.sqrt(rank);
            const radius = THREE.MathUtils.clamp(
                minRadius + (maxRadius - minRadius) * radiusEase + irregularity * maxRadius,
                minRadius,
                maxRadius
            );
            const angle = phase + order * goldenAngle + (seededUnit(index, 5.1) - 0.5) * 0.86;
            const lift = (seededUnit(index, 8.4) - 0.5) * Math.min(0.032, maxRadius * 0.42);
            const radial = tangentA
                .clone()
                .multiplyScalar(Math.cos(angle) * radius)
                .add(tangentB.clone().multiplyScalar(Math.sin(angle) * radius))
                .add(normal.clone().multiplyScalar(lift));
            rawOffsets.push({ index, radial });
            groupOffsetCenter.add(radial);
        });

        groupOffsetCenter.multiplyScalar(1 / rawOffsets.length);
        rawOffsets.forEach(({ index, radial }) => {
            radial.sub(groupOffsetCenter);
            offsets[index] = { x: radial.x, y: radial.y, z: radial.z };
        });
    }

    return offsets;
}

export function createSporeTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);

    const aura = ctx.createRadialGradient(47, 48, 4, 48, 48, 47);
    aura.addColorStop(0, 'rgba(246,255,250,0.98)');
    aura.addColorStop(0.15, 'rgba(207,255,243,0.86)');
    aura.addColorStop(0.38, 'rgba(116,230,213,0.56)');
    aura.addColorStop(0.68, 'rgba(255,224,134,0.16)');
    aura.addColorStop(1, 'rgba(124,231,221,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, 96, 96);

    ctx.globalCompositeOperation = 'source-over';
    const core = ctx.createRadialGradient(38, 35, 1, 46, 46, 23);
    core.addColorStop(0, 'rgba(255,255,246,0.82)');
    core.addColorStop(0.28, 'rgba(255,247,196,0.5)');
    core.addColorStop(1, 'rgba(255,251,211,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 96, 96);

    ctx.beginPath();
    ctx.arc(48, 48, 20, -0.42, Math.PI * 1.48);
    ctx.strokeStyle = 'rgba(255,246,194,0.3)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(36, 34, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,246,0.62)';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(124,231,221,0.5)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

export function createFocusRingTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 96, 96);

    const outerGlow = ctx.createRadialGradient(48, 48, 8, 48, 48, 44);
    outerGlow.addColorStop(0, 'rgba(255,251,211,0.18)');
    outerGlow.addColorStop(0.34, 'rgba(124,231,221,0.12)');
    outerGlow.addColorStop(0.72, 'rgba(124,231,221,0.06)');
    outerGlow.addColorStop(1, 'rgba(124,231,221,0)');
    ctx.fillStyle = outerGlow;
    ctx.fillRect(0, 0, 96, 96);

    ctx.beginPath();
    ctx.arc(48, 48, 25, -0.4, Math.PI * 1.55);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,247,183,0.58)';
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(124,231,221,0.42)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(48, 48, 15, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(124,231,221,0.22)';
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

export function createFocusNextCueTexture(THREE) {
    const canvas = document.createElement('canvas');    
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);

    const glow = ctx.createRadialGradient(64, 64, 12, 64, 64, 58);
    glow.addColorStop(0, 'rgba(255,246,177,0.22)');     
    glow.addColorStop(0.48, 'rgba(124,231,221,0.16)');  
    glow.addColorStop(1, 'rgba(124,231,221,0)');        
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);

    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(-Math.PI / 7);
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-8, -18);
    ctx.quadraticCurveTo(0, 0, -8, 18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,245,177,0.9)';
    ctx.shadowBlur = 13;
    ctx.shadowColor = 'rgba(124,231,221,0.7)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(64, 64, 31, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(124,231,221,0.72)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(255,245,177,0.55)';
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);    
    texture.needsUpdate = true;
    return texture;
}
