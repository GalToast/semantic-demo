import { state } from '../state.js'
import { updateClusterList, populateCityFilter } from './cluster-filter.js';
import { buildLegend } from './ui-renderers.js';
import { applyFilters } from './search-state.js';

export async function loadData() {
    let raw
    let lastError
    state.dataLoadAttempt = (state.dataLoadAttempt || 0) + 1
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`data.dat?v=6&t=${Date.now()}`)
            if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`)
            try {
                raw = await response.json()
            } catch (jsonErr) {
                Object.defineProperty(jsonErr, 'correlationId', {
                    value: crypto.randomUUID(),
                    writable: false,
                    configurable: true
                })
                throw new Error(`Invalid JSON in data.dat: ${jsonErr.message}`, { cause: jsonErr })
            }
            break
        } catch (err) {
            lastError = err
            const retryCount = attempt
            if (retryCount < maxAttempts && state.dataLoadAttempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 500 * attempt))
            }
        }
    }
    if (!raw || !Array.isArray(raw)) {
        state.points = []
        state.pointIndexByLeadId = new Map()
        state.projectedNeighborGrid = null
        state.projectedNeighborCache = new Map()
        const detail = lastError?.message ? ` Last error: ${lastError.message}` : ''
        throw new Error(`Unable to load county records after ${maxAttempts} attempts.${detail}`)
    }

    state.points = raw.map((p) => ({
        x: p.length > 0 ? parseFiniteNumber(p[0]) : null,
        y: p.length > 1 ? parseFiniteNumber(p[1]) : null,
        z: p.length > 2 ? parseFiniteNumber(p[2]) : null,
        cluster: p.length > 3 ? p[3] : null,
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
    }))

    state.pointIndexByLeadId = new Map()
    state.points.forEach((point, index) => {
        if (point.lead_id !== null && point.lead_id !== undefined && point.lead_id !== '') {
            state.pointIndexByLeadId.set(String(point.lead_id), index)
        }
    })
    state.projectedNeighborGrid = null
    state.projectedNeighborCache = new Map()

    const totalCountEl = document.getElementById('total-count')
    if (totalCountEl) totalCountEl.textContent = state.points.length.toLocaleString()

    try {
        if (typeof updateClusterList === 'function') updateClusterList()
        if (typeof buildLegend === 'function') buildLegend()
        if (typeof populateCityFilter === 'function') populateCityFilter()
        if (typeof applyFilters === 'function') applyFilters()
    } catch (err) {
        console.warn('Post-load UI refresh failed:', err)
    }
}

function cleanOptionalValue(value) {
    if (value === undefined || value === null || value === '' || value === 'NULL') return null
    return value
}

function parseFiniteNumber(value) {
    const num = parseFloat(value)
    return Number.isFinite(num) ? num : null
}
