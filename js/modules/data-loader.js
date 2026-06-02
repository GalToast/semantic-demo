import { state, withStateMutation } from '../state.js';
import { updateClusterList, populateCityFilter } from './cluster-filter.js';
import { buildLegend } from './ui-renderers.js';
import { applyFilters } from './search-state.js';

let _dataWorker = null;

function buildAssetUrl(path) {
    if (typeof window === 'undefined') return path;
    return new URL(path, window.location.href).href;
}

function getWorker() {
    if (typeof Worker === 'undefined') {
        _dataWorker = null;
        return null;
    }
    if (_dataWorker) return _dataWorker;

    try {
        _dataWorker = new Worker('js/workers/data-worker.js');
        return _dataWorker;
    } catch (err) {
        console.warn('Web Worker instantiation failed, using main-thread fallback.', err);
        return null;
    }
}

/**
 * Promise-based wrapper for worker communication.
 */
function callWorker(type, payload) {
    return new Promise((resolve, reject) => {
        const worker = getWorker();
        if (!worker) {
            reject(new Error('Worker unavailable'));
            return;
        }

        const handler = (event) => {
            const { type: resType, payload: resPayload } = event.data;
            if (resType === `${type}_SUCCESS`) {
                worker.removeEventListener('message', handler);
                resolve(resPayload);
            } else if (resType === 'ERROR') {
                worker.removeEventListener('message', handler);
                _dataWorker = null;
                reject(new Error(resPayload?.message || 'Worker failed'));
            }
        };

        worker.addEventListener('message', handler);
        worker.postMessage({ type, payload });
    });
}

export async function loadData() {
    let lastError;
    state.dataLoadAttempt = (state.dataLoadAttempt || 0) + 1;
    const attemptNumber = state.dataLoadAttempt;
    const maxAttempts = 3;
    const dataUrl = buildAssetUrl(`data.dat?v=6&t=${Date.now()}`);

    // 1. Attempt Worker-Based Loading
    const worker = getWorker();
    if (worker) {
        try {
            const { points, pointIndexByLeadId, positionsBuffer, clustersBuffer } = await callWorker('LOAD_RECORDS', { url: dataUrl });
            withStateMutation(() => {
                if (state.dataLoadAttempt !== attemptNumber) return;
                state.points = points;
                state.pointIndexByLeadId = new Map(Object.entries(pointIndexByLeadId));
                state.rawPositionsBuffer = positionsBuffer;
                state.rawClustersBuffer = clustersBuffer;
            });
            finalizeLoading();
            return;
        } catch (err) {
            console.warn('Worker-based data loading failed, falling back to main thread.', err);
            _dataWorker = null;
            lastError = err;
        }
    }

    // 2. Main-Thread Fallback
    let raw;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(dataUrl);
            if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`);
            try {
                raw = await response.json();
            } catch (jsonErr) {
                throw new Error(`Invalid JSON in data.dat: ${jsonErr.message}`, { cause: jsonErr });
            }
            break;
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 500 * attempt));
            }
        }
    }

    if (!raw || !Array.isArray(raw)) {
        withStateMutation(() => {
            state.points = [];
            state.pointIndexByLeadId = new Map();
            state.projectedNeighborGrid = null;
            state.projectedNeighborCache = new Map();
            state.rawPositionsBuffer = null;
            state.rawClustersBuffer = null;
        });
        const detail = lastError?.message ? ` Last error: ${lastError.message}` : '';
        throw new Error(`Unable to load county records after ${maxAttempts} attempts.${detail}`);
    }

    const count = raw.length;
    const positionsBuffer = new Float32Array(count * 3);
    const clustersBuffer = new Uint16Array(count);

    const points = raw.map((p, i) => {
        const x = p.length > 0 ? parseFiniteNumber(p[0]) : 0;
        const y = p.length > 1 ? parseFiniteNumber(p[1]) : 0;
        const z = p.length > 2 ? parseFiniteNumber(p[2]) : 0;
        const cluster = p.length > 3 ? (parseInt(p[3], 10) || 0) : 0;

        positionsBuffer[i * 3] = x;
        positionsBuffer[i * 3 + 1] = y;
        positionsBuffer[i * 3 + 2] = z;
        clustersBuffer[i] = cluster;

        return {
            cluster,
            name: p.length > 4 ? cleanOptionalValue(p[4]) : null,
            what: p.length > 5 ? cleanOptionalValue(p[5]) || 'Montgomery County business' : 'Montgomery County business',
            city: p.length > 6 ? cleanOptionalValue(p[6]) || 'Montgomery County' : 'Montgomery County',
            lead_id: p.length > 7 ? p[7] : null,
            lat: p.length > 8 ? parseFiniteNumber(p[8]) : null,
            lng: p.length > 9 ? parseFiniteNumber(p[9]) : null,
            website: p.length > 10 ? cleanOptionalValue(p[10]) : null,
            email: p.length > 11 ? cleanOptionalValue(p[11]) : null,
            phone: p.length > 12 ? cleanOptionalValue(p[12]) : null,
            trivia: p.length > 13 ? cleanOptionalValue(p[13]) : null,
            status: p.length > 14 ? cleanOptionalValue(p[14]) || 'active' : 'active'
        };
    });

    withStateMutation(() => {
        if (state.dataLoadAttempt !== attemptNumber) return;
        state.points = points;
        state.rawPositionsBuffer = positionsBuffer;
        state.rawClustersBuffer = clustersBuffer;
        state.pointIndexByLeadId = new Map();
        state.points.forEach((point, index) => {
            if (point.lead_id !== null && point.lead_id !== undefined && point.lead_id !== '') {
                state.pointIndexByLeadId.set(String(point.lead_id), index);
            }
        });
    });

    finalizeLoading();
}

function finalizeLoading() {
    state.projectedNeighborGrid = null;
    state.projectedNeighborCache = new Map();

    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) totalCountEl.textContent = state.points.length.toLocaleString();

    try {
        if (typeof updateClusterList === 'function') updateClusterList();
        if (typeof buildLegend === 'function') buildLegend();
        if (typeof populateCityFilter === 'function') populateCityFilter();
        if (typeof applyFilters === 'function') applyFilters();
    } catch (err) {
        console.warn('Post-load UI refresh failed:', err);
    }
}

function cleanOptionalValue(value) {
    if (value === undefined || value === null || value === '' || value === 'NULL') return null;
    return value;
}

function parseFiniteNumber(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
}
