/**
 * data-worker.js
 *
 * Background worker for fetching and parsing large datasets.
 * Prevents main-thread blocking during application loading.
 */

self.onmessage = async (event) => {
    const { type, payload } = event.data;

    try {
        if (type === 'LOAD_RECORDS') {
            const result = await handleLoadRecords(payload);
            self.postMessage({ type: 'LOAD_RECORDS_SUCCESS', payload: result });
        } else if (type === 'LOAD_THREADS') {
            const result = await handleLoadThreads(payload);
            self.postMessage({ type: 'LOAD_THREADS_SUCCESS', payload: result });
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            payload: { message: error.message, stack: error.stack }
        });
    }
};

async function handleLoadRecords({ url }) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch records: ${response.status}`);

    let raw;
    try {
        raw = await response.json();
    } catch (jsonErr) {
        throw new Error(`Invalid JSON in data.dat: ${jsonErr.message}`, { cause: jsonErr });
    }
    if (!raw || !Array.isArray(raw)) throw new Error('Invalid records payload');

    const points = raw.map((p) => ({
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
    }));

    const pointIndexByLeadId = {};
    points.forEach((point, index) => {
        if (point.lead_id !== null && point.lead_id !== undefined && point.lead_id !== '') {
            pointIndexByLeadId[String(point.lead_id)] = index;
        }
    });

    return { points, pointIndexByLeadId };
}

async function handleLoadThreads({ urls, attemptConfigs }) {
    let bundle = null;
    let loadedArtifactName = null;
    let lastError = null;

    outer: for (const url of urls) {
        const artifactName = artifactNameFromUrl(url);
        for (const config of attemptConfigs) {
            try {
                const response = await fetch(url, config);
                if (!response.ok) throw new Error(`Thread artifact unavailable (${response.status})`);
                bundle = await response.json();
                loadedArtifactName = artifactName;
                break outer;
            } catch (error) {
                lastError = error;
                // No delay in worker; we want to proceed as fast as possible or let the next loop handle it
            }
        }
    }

    if (!bundle) throw lastError || new Error('No thread artifacts could be loaded');

    // Transform node map to entries for Map reconstruction on main thread
    const neighborEntries = [];
    if (bundle.nodes && typeof bundle.nodes === 'object') {
        Object.entries(bundle.nodes).forEach(([fallbackLeadId, node]) => {
            const leadId = normalizeLeadId(node?.lead_id ?? fallbackLeadId);
            if (!leadId) return;

            const neighbors = Array.isArray(node?.neighbors)
                ? node.neighbors.map((neighbor) => ({
                    leadId: normalizeLeadId(neighbor?.lead_id),
                    score: Number(neighbor?.score ?? 0),
                    semanticScore: Number(neighbor?.semantic_score ?? 0),
                    sameCity: Boolean(neighbor?.same_city),
                    sameStatus: Boolean(neighbor?.same_status),
                    bridgeScore: Number(neighbor?.bridge_score ?? 0),
                    signalScore: Number(neighbor?.signal_score ?? 0),
                    threadType: String(neighbor?.thread_type || '') || 'local_semantic_neighbor',
                    reason: String(neighbor?.reason || '') || 'semantic neighbor'
                })).filter((neighbor) => neighbor.leadId)
                : [];

            neighborEntries.push([leadId, {
                leadId,
                name: node?.name || null,
                city: node?.city || null,
                status: node?.status || null,
                signalScore: Number(node?.signal_score ?? 0),
                neighbors
            }]);
        });
    }

    return { neighborEntries, artifactName: loadedArtifactName, bundle };
}

// ── UTILS ───────────────────────────────────────────────────────────────────

function cleanOptionalValue(value) {
    if (value === undefined || value === null || value === '' || value === 'NULL') return null;
    return value;
}

function parseFiniteNumber(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeLeadId(id) {
    if (id === null || id === undefined) return null;
    const s = String(id).trim();
    return s.length > 0 ? s : null;
}

function artifactNameFromUrl(url) {
    try {
        return new URL(url).pathname.split('/').pop() || url.split('?')[0];
    } catch {
        return url.split('?')[0];
    }
}
