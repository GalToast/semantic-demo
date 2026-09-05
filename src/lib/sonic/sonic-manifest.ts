/**
 * @lib/sonic/sonic-manifest.ts — Typed loader for the sonic-identity manifest.
 *
 * The manifest (public/sonic/manifest.json) maps Magenta RT2 generated clips
 * to business clusters, with ear-quality metrics from the ear_v7.1 scorer.
 * Loaded once at first request; `getClipForCluster` resolves per-node clips
 * via clusterMap with a `defaultClip` fallback so every focused node has a
 * sonic identity even before per-cluster clips are generated.
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
    /** Absolute-from-root URL served by Vite from public/. */
    file: string
    prompt: string
    seed: number
    seconds: number
    ear: SonicEarMetrics | null
}

export interface SonicManifest {
    version: number
    defaultClip: string | null
    clips: SonicClip[]
    /** cluster name → clip id (partial; unresolved clusters fall back to defaultClip). */
    clusterMap: Record<string, string>
}

let cached: SonicManifest | null = null
let pending: Promise<SonicManifest> | null = null

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Runtime guard for the fetched manifest. Returns null when invalid. */
export function parseManifest(raw: unknown): SonicManifest | null {
    if (!isRecord(raw)) return null
    const version = raw.version
    const clipsRaw = raw.clips
    if (typeof version !== 'number' || !Array.isArray(clipsRaw)) return null
    const clips: SonicClip[] = []
    for (const c of clipsRaw) {
        if (!isRecord(c) || typeof c.id !== 'string' || typeof c.file !== 'string') return null
        let ear: SonicEarMetrics | null = null
        if (isRecord(c.ear) && typeof c.ear.score === 'number' && typeof c.ear.grade === 'string') {
            ear = {
                score: c.ear.score,
                grade: c.ear.grade,
                motif: typeof c.ear.motif === 'number' ? c.ear.motif : null,
                beat: typeof c.ear.beat === 'number' ? c.ear.beat : null
            }
        }
        clips.push({
            id: c.id,
            file: c.file,
            prompt: typeof c.prompt === 'string' ? c.prompt : '',
            seed: typeof c.seed === 'number' ? c.seed : 0,
            seconds: typeof c.seconds === 'number' ? c.seconds : 0,
            ear
        })
    }
    const clusterMap: Record<string, string> = {}
    if (isRecord(raw.clusterMap)) {
        for (const [k, v] of Object.entries(raw.clusterMap)) {
            if (typeof v === 'string') clusterMap[k] = v
        }
    }
    return {
        version,
        clips,
        clusterMap,
        defaultClip: typeof raw.defaultClip === 'string' ? raw.defaultClip : null
    }
}

/** Fetch + validate the manifest once; subsequent calls return the cache. */
export async function loadSonicManifest(): Promise<SonicManifest | null> {
    if (cached) return cached
    if (!pending) {
        pending = fetch(`${import.meta.env.BASE_URL}sonic/manifest.json`)
            .then((r): Promise<SonicManifest | null> => (r.ok ? r.json() : Promise.resolve(null)))
            .then((raw) => {
                cached = parseManifest(raw)
                return cached
            })
            .catch(() => null)
    }
    return pending
}

/** Resolve the clip for a cluster name; falls back to defaultClip, then null. */
export function getClipForCluster(manifest: SonicManifest, clusterName: string | null | undefined): SonicClip | null {
    const byId = (id: string | null) => (id ? (manifest.clips.find((c) => c.id === id) ?? null) : null)
    return byId(clusterName ? (manifest.clusterMap[clusterName] ?? null) : null) ?? byId(manifest.defaultClip)
}
