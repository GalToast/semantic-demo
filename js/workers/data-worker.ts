/**
 * data-worker.ts
 *
 * Background worker for fetching and parsing large datasets.
 * Prevents main-thread blocking during application loading.
 */

// ── Types ───────────────────────────────────────────────────────────────────

interface PointRecord {
    cluster: number;
    name: string | null;
    what: string;
    city: string;
    lead_id: string | null;
    lat: number | null;
    lng: number | null;
    website: string | null;
    email: string | null;
    phone: string | null;
    trivia: string | null;
    status: string;
    naics: string | null;
}

interface LoadRecordsResult {
    points: PointRecord[];
    pointIndexByLeadId: Record<string, number>;
    positionsBuffer: Float32Array;
    clustersBuffer: Uint16Array;
}

interface NeighborEntry {
    leadId: string;
    name: string | null;
    city: string | null;
    status: string | null;
    signalScore: number;
    neighbors: Array<{
        leadId: string;
        score: number;
        semanticScore: number;
        sameCity: boolean;
        sameStatus: boolean;
        bridgeScore: number;
        signalScore: number;
        threadType: string;
        relationshipRole: string;
        relationshipAxis: string;
        roleReason: string;
        reason: string;
    }>;
}

interface LoadThreadsResult {
    neighborEntries: Array<[string, NeighborEntry]>;
    artifactName: string | null;
    bundle: unknown;
}

interface AttemptConfig {
    cache?: string;
}

// ── Worker body ─────────────────────────────────────────────────────────────

let _activeRequestId = 0;

self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;
    const requestId = ++_activeRequestId;

    try {
        if (type === 'LOAD_RECORDS') {
            const result = await handleLoadRecords(payload);
            if (requestId !== _activeRequestId) return;
            // Transfer buffers to main thread to eliminate cloning overhead
            self.postMessage(
                { type: 'LOAD_RECORDS_SUCCESS', payload: result },
                [result.positionsBuffer.buffer, result.clustersBuffer.buffer]
            );
        } else if (type === 'LOAD_THREADS') {
            const result = await handleLoadThreads(payload, requestId);
            if (requestId !== _activeRequestId) return;
            self.postMessage({ type: 'LOAD_THREADS_SUCCESS', payload: result });
        }
    } catch (error: unknown) {
        if (requestId !== _activeRequestId) return;
        const err = error instanceof Error ? error : new Error(String(error));
        self.postMessage({
            type: 'ERROR',
            payload: { message: err.message, stack: err.stack }
        });
    }
};

async function handleLoadRecords({ url }: { url: string }): Promise<LoadRecordsResult> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch records: ${response.status}`);

    let raw: unknown;
    try {
        raw = await response.json();
    } catch (jsonErr: unknown) {
        const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
        throw new Error(`Invalid JSON in data.dat: ${msg}`, { cause: jsonErr });
    }
    if (!raw || !Array.isArray(raw)) throw new Error('Invalid records payload');

    const count = raw.length;
    const positionsBuffer = new Float32Array(count * 3);
    const clustersBuffer = new Uint16Array(count);

    const points: PointRecord[] = raw.map((p: unknown[], i: number) => {
        const x = p.length > 0 ? parseFiniteNumber(p[0]) : 0;
        const y = p.length > 1 ? parseFiniteNumber(p[1]) : 0;
        const z = p.length > 2 ? parseFiniteNumber(p[2]) : 0;
        const cluster = p.length > 3 ? (parseInt(p[3] as string, 10) || 0) : 0;

        positionsBuffer[i * 3] = x;
        positionsBuffer[i * 3 + 1] = y;
        positionsBuffer[i * 3 + 2] = z;
        clustersBuffer[i] = cluster;

        return {
            cluster,
            name: p.length > 4 ? cleanOptionalValue(p[4]) : null,
            what: p.length > 5 ? cleanOptionalValue(p[5]) || 'Montgomery County business' : 'Montgomery County business',
            city: p.length > 6 ? cleanOptionalValue(p[6]) || 'Montgomery County' : 'Montgomery County',
            lead_id: p.length > 7 ? p[7] as string : null,
            lat: p.length > 8 ? parseFiniteNumber(p[8]) : null,
            lng: p.length > 9 ? parseFiniteNumber(p[9]) : null,
            website: p.length > 10 ? cleanOptionalValue(p[10]) : null,
            email: p.length > 11 ? cleanOptionalValue(p[11]) : null,
            phone: p.length > 12 ? cleanOptionalValue(p[12]) : null,
            trivia: p.length > 13 ? cleanOptionalValue(p[13]) : null,
            status: p.length > 14 ? cleanOptionalValue(p[14]) || 'active' : 'active',
            // NAICS code (e.g. "624410" or "611512"). Optional column added in
            // 2026-06-04 by scripts/augment_data.py. Records without a NAICS
            // fall through to text matching in the search code.
            naics: p.length > 15 ? cleanOptionalValue(p[15]) : null
        };
    });

    const pointIndexByLeadId: Record<string, number> = {};
    points.forEach((point, index) => {
        if (point.lead_id !== null && point.lead_id !== undefined && point.lead_id !== '') {
            pointIndexByLeadId[String(point.lead_id)] = index;
        }
    });

    return { points, pointIndexByLeadId, positionsBuffer, clustersBuffer };
}

async function handleLoadThreads(
    { urls, attemptConfigs }: { urls: string[]; attemptConfigs: (string | AttemptConfig)[] },
    requestId: number
): Promise<LoadThreadsResult | null> {
    let bundle: unknown = null;
    let loadedArtifactName: string | null = null;
    let lastError: unknown = null;

    outer: for (const url of urls) {
        if (requestId !== _activeRequestId) return null;
        const artifactName = artifactNameFromUrl(url);
        for (const config of attemptConfigs) {
            try {
                const cacheMode = typeof config === 'string' ? config : (config as AttemptConfig)?.cache;
                const response = await fetch(url, cacheMode ? { cache: cacheMode as RequestCache } : undefined);
                if (!response.ok) throw new Error(`Thread artifact unavailable (${response.status})`);
                if (requestId !== _activeRequestId) return null;
                bundle = await response.json();
                loadedArtifactName = artifactName;
                break outer;
            } catch (error) {
                lastError = error;
                // No delay in worker; we want to proceed as fast as possible or let the next loop handle it
            }
        }
    }

    if (requestId !== _activeRequestId) return null;
    if (!bundle) throw lastError || new Error('No thread artifacts could be loaded');

    // Transform node map to entries for Map reconstruction on main thread
    const neighborEntries: Array<[string, NeighborEntry]> = [];
    const bundleObj = bundle as { nodes?: Record<string, unknown> };
    if (bundleObj.nodes && typeof bundleObj.nodes === 'object') {
        Object.entries(bundleObj.nodes).forEach(([fallbackLeadId, node]) => {
            const n = node as Record<string, unknown>;
            const leadId = normalizeLeadId((n?.lead_id as string) ?? fallbackLeadId);
            if (!leadId) return;

            const rawNeighbors = Array.isArray(n?.neighbors) ? n.neighbors as Record<string, unknown>[] : [];
            const neighbors = rawNeighbors
                .map((neighbor) => ({
                    leadId: normalizeLeadId(neighbor?.lead_id as string) as string,
                    score: Number(neighbor?.score ?? 0),
                    semanticScore: Number(neighbor?.semantic_score ?? 0),
                    sameCity: Boolean(neighbor?.same_city),
                    sameStatus: Boolean(neighbor?.same_status),
                    bridgeScore: Number(neighbor?.bridge_score ?? 0),
                    signalScore: Number(neighbor?.signal_score ?? 0),
                    threadType: String(neighbor?.thread_type || '') || 'local_semantic_neighbor',
                    relationshipRole: String(neighbor?.relationship_role || ''),
                    relationshipAxis: String(neighbor?.relationship_axis || '') || '',
                    roleReason: String(neighbor?.role_reason || '') || '',
                    reason: String(neighbor?.reason || '') || 'semantic neighbor'
                }))
                .filter((neighbor) => neighbor.leadId);

            neighborEntries.push([leadId, {
                leadId,
                name: (n?.name as string) || null,
                city: (n?.city as string) || null,
                status: (n?.status as string) || null,
                signalScore: Number(n?.signal_score ?? 0),
                neighbors
            }]);
        });
    }

    return { neighborEntries, artifactName: loadedArtifactName, bundle };
}

// ── UTILS ───────────────────────────────────────────────────────────────────

const NULLISH_SENTINELS: ReadonlySet<string> = new Set([
    'unknown', 'not found', 'none', 'none detected', 'n/a', 'null'
]);

function cleanOptionalValue(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    if (!text || text === 'NULL' || NULLISH_SENTINELS.has(text.toLowerCase())) {
        return null;
    }
    return text;
}

function parseFiniteNumber(value: unknown): number | null {
    const num = parseFloat(value as string);
    return Number.isFinite(num) ? num : null;
}

function normalizeLeadId(id: unknown): string | null {
    if (id === null || id === undefined) return null;
    const s = String(id).trim();
    return s.length > 0 ? s : null;
}

function artifactNameFromUrl(url: string): string {
    try {
        return new URL(url).pathname.split('/').pop() || url.split('?')[0];
    } catch {
        return url.split('?')[0];
    }
}
