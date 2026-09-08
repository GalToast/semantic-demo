/**
 * @lib/sonic/sonic-manifest.ts — Typed loader for the sonic-identity manifest (v2).
 *
 * The manifest (public/sonic/manifest.json) maps Magenta RT2 generated clips
 * to business clusters. v2 schema: each cluster carries multiple seed
 * `variants`; `pickVariantForNode` deterministically assigns one per node from
 * its leadId hash, so different businesses of the same cluster play different
 * takes while any given node is stable across sessions.
 *
 * Back-compat: v1 `clips`/`clusterMap`/`defaultClip` manifests are still
 * parsed and exposed through the same accessors.
 *
 * Boundary discipline: the manifest is fetched JSON (external trust boundary)
 * — validated at runtime before use, never trusted by shape.
 */

export interface SonicEarMetrics {
    /** 0-100 ear_v7.1 composite score. */
    score: number
    /** Letter grade 'S' | 'A' | 'B' | 'C' | 'D' | 'F'. */
    grade: string
    /** Motif-repetition correlation (GTZAN real-music band ~0.233 ± 0.140). */
    motif: number | null
    /** Beat-clarity metric. */
    beat: number | null
}

export interface SonicClip {
    id: string
    /** Path relative to the app base (BASE_URL-resolved at fetch time). */
    file: string
    prompt: string
    seed: number
    seconds: number
    ear: SonicEarMetrics | null
}

interface ClusterEntry {
    prompt?: string
    variants: SonicClip[]
}

export interface SonicManifest {
    version: number
    clusters: Record<string, ClusterEntry>
    /** v1 back-compat view: cluster → single best clip. */
    clusterMap: Record<string, SonicClip>
    /** v1 default clip for clusters with no entry. */
    defaultClip: SonicClip | null
}

let cached: SonicManifest | null = null
let pending: Promise<SonicManifest | null> | null = null

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseEar(raw: unknown): SonicEarMetrics | null {
    if (!isRecord(raw) || typeof raw.score !== 'number' || typeof raw.grade !== 'string') return null
    return {
        score: raw.score,
        grade: raw.grade,
        motif: typeof raw.motif === 'number' ? raw.motif : null,
        beat: typeof raw.beat === 'number' ? raw.beat : null
    }
}

function parseClip(raw: unknown, fallbackPrompt = ''): SonicClip | null {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.file !== 'string') return null
    return {
        id: raw.id,
        file: raw.file,
        prompt: typeof raw.prompt === 'string' ? raw.prompt : fallbackPrompt,
        seed: typeof raw.seed === 'number' ? raw.seed : 0,
        seconds: typeof raw.seconds === 'number' ? raw.seconds : 0,
        ear: parseEar(raw.ear)
    }
}

/** Runtime guard for the fetched manifest (v2 clusters or v1 clips). Returns null when invalid. */
export function parseManifest(raw: unknown): SonicManifest | null {
    if (!isRecord(raw)) return null
    const clusters: Record<string, ClusterEntry> = {}
    const clusterMap: Record<string, SonicClip> = {}

    if (isRecord(raw.clusters)) {
        // v2: clusters → { variants: [...] }
        for (const [name, entry] of Object.entries(raw.clusters)) {
            if (!isRecord(entry) || !Array.isArray(entry.variants)) continue
            const prompt = typeof entry.prompt === 'string' ? entry.prompt : ''
            const variants: SonicClip[] = []
            for (const v of entry.variants) {
                const clip = parseClip(v, prompt)
                if (clip) variants.push(clip)
            }
            if (variants.length > 0) clusters[name] = { prompt, variants }
        }
    } else if (Array.isArray(raw.clips)) {
        // v1: flat clips + clusterMap (cluster → clipId string)
        const byId = new Map<string, SonicClip>()
        for (const c of raw.clips) {
            const clip = parseClip(c)
            if (clip) byId.set(clip.id, clip)
        }
        if (isRecord(raw.clusterMap)) {
            for (const [name, id] of Object.entries(raw.clusterMap)) {
                const clip = typeof id === 'string' ? byId.get(id) : undefined
                if (clip) {
                    clusters[name] = { variants: [clip] }
                    clusterMap[name] = clip
                }
            }
        }
        if (typeof raw.defaultClip === 'string') {
            const def = byId.get(raw.defaultClip)
            if (def) clusters.__default = { variants: [def] }
        }
    }

    if (Object.keys(clusters).length === 0) return null

    // Build the single-clip view (best variant per cluster = first; the
    // generator ranks variants best-first).
    for (const [name, entry] of Object.entries(clusters)) {
        if (name === '__default') continue
        const best = entry.variants[0]
        if (best) clusterMap[name] = best
    }
    const defaultClip = clusters.__default?.variants[0] ?? Object.values(clusterMap)[0] ?? null
    return { version: typeof raw.version === 'number' ? raw.version : 2, clusters, clusterMap, defaultClip }
}

/** Fetch + validate the manifest once; subsequent calls return the cache. */
export async function loadSonicManifest(): Promise<SonicManifest | null> {
    if (cached) return cached
    if (!pending) {
        pending = fetch(`${import.meta.env.BASE_URL}sonic/manifest.json`)
            .then((r): Promise<unknown> => (r.ok ? r.json() : Promise.resolve(null)))
            .then((raw) => {
                cached = parseManifest(raw)
                return cached
            })
            .catch(() => null)
    }
    return pending
}

/** Deterministic 32-bit FNV-1a hash — stable across sessions, no deps. */
export function hashString(s: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
}

/** Sonic style dial: 'best' = ear-ranked default; 'purePrior' = Z12 zero-style variant (max rhythmic vitality). */
export type SonicStyle = 'best' | 'purePrior'

/**
 * Deterministic per-node variant: same leadId always picks the same variant
 * of the cluster's ranked list; different nodes spread across variants.
 *
 * `style='purePrior'` prefers the cluster's `-z12` variant (zero-style
 * conditioning — the model's unconditional prior, measured strongest rhythm:
 * beat 0.476-0.641 vs 0.248-0.448 styled, zero dropouts across seeds); falls
 * back to the deterministic default when the cluster has no z12 variant.
 */
export function pickVariantForNode(
    manifest: SonicManifest,
    clusterName: string | null | undefined,
    leadId: string | null | undefined,
    style: SonicStyle = 'best'
): SonicClip | null {
    const entry = clusterName ? manifest.clusters[clusterName] : undefined
    const variants = entry?.variants ?? manifest.clusters.__default?.variants ?? null
    if (!variants || variants.length === 0) return manifest.defaultClip
    if (style === 'purePrior') {
        const z12 = variants.find((v) => v.id.endsWith('-z12'))
        if (z12) return z12
    }
    if (!leadId) return variants[0] ?? manifest.defaultClip
    return variants[hashString(leadId) % variants.length] ?? manifest.defaultClip
}

/** v1-compatible accessor: single best clip for a cluster (or default). */
export function getClipForCluster(manifest: SonicManifest, clusterName: string | null | undefined): SonicClip | null {
    return pickVariantForNode(manifest, clusterName, null)
}
