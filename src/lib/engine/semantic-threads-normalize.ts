/**
 * @lib/engine/semantic-threads-normalize.ts — normalization/validation for
 * semantic thread artifacts.
 *
 * EXTRACTED from semantic-threads.ts (split plan tmp/semantic-threads-split-PLAN.md,
 * group 1). Pure functions + the F1 normalize cache — module-level state carried
 * WITH the normalizer (state-with-setter rule). No appState/data-store imports.
 */
import type {
    SemanticThreadBundle,
    SemanticNeighborEntry,
    SemanticNeighborDetail,
    LayoutManifest
} from '@lib/types/business'
import type { NeighborEntry } from '@lib/workers/data-worker'
import { normalizeRelationshipRole } from '@lib/utils/relationship-roles'
import { cleanOptionalValue } from '@lib/utils/dom-formatters'

function _basename(value: unknown): string {
    if (!value) return ''
    return String(value).replaceAll('\\', '/').split('/').pop() || ''
}

function _countThreadEdges(bundle: SemanticThreadBundle): number {
    const nodes = bundle?.nodes && typeof bundle.nodes === 'object' ? bundle.nodes : {}
    return Object.values(nodes).reduce(
        (sum, node) => sum + (Array.isArray(node?.neighbors) ? node.neighbors.length : 0),
        0
    )
}

interface LayoutValidationSummary {
    generatedAt: string | null
    method: string | null
    rows: number
    edges: number
    threadArtifact: string | null
}

function isLayoutManifest(value: unknown): value is LayoutManifest {
    if (!value || typeof value !== 'object') return false
    const manifest = value as { rows?: unknown; edges?: unknown }
    return Number.isFinite(Number(manifest.rows)) && Number.isFinite(Number(manifest.edges))
}


function normalizeLeadId(id: unknown): string | null {
    if (id === null || id === undefined) return null
    const s = String(id).trim()
    return s.length > 0 ? s : null
}

// F1 cache (O-2 audit, 2026-08-11): the worker re-parses the same bundle on
// every LOAD_THREADS success, so the normalized map was rebuilt (≈8,406×~14
// object allocations) per call even when nothing changed. Cache by input
// identity: when the raw entries array is the same reference as the previous
// call, return the previous normalized result. Safe because the worker
// returns the same parsed array for a cached bundle (audit-verified); a
// content-hash fallback is unnecessary while the worker owns parsing.
// NOTE (2026-08-11, verified): neighborEntries identity is NOT stable across worker
// calls — data-worker.ts postMessage structured-clones the payload, so a fresh array
// arrives every load. The effective F1 key is (artifactName, bundle) at the CALLER
// level: same artifact + same bundle → same normalized map. The cache therefore
// lives at the call site keyed on those, not on neighborEntries identity.
let _lastNormalizedKey: { artifactName: string; bundle: unknown } | null = null
let _lastNormalizedOutput: Array<[string, SemanticNeighborEntry]> | null = null

export function normalizeSemanticNeighborEntriesCached(
    neighborEntries: Array<[string, NeighborEntry]>,
    artifactName: string,
    bundle: unknown
): Array<[string, SemanticNeighborEntry]> {
    if (!Array.isArray(neighborEntries)) return []
    if (
        _lastNormalizedKey !== null &&
        _lastNormalizedKey.artifactName === artifactName &&
        _lastNormalizedKey.bundle === bundle &&
        _lastNormalizedOutput !== null
    ) {
        return _lastNormalizedOutput
    }
    const result = normalizeSemanticNeighborEntries(neighborEntries)
    _lastNormalizedKey = { artifactName, bundle }
    _lastNormalizedOutput = result
    return result
}

function normalizeSemanticNeighborEntries(
    neighborEntries: Array<[string, NeighborEntry]>
): Array<[string, SemanticNeighborEntry]> {
    if (!Array.isArray(neighborEntries)) return []
    const result: Array<[string, SemanticNeighborEntry]> = neighborEntries.map(([leadId, node]) => [
        leadId,
        {
            leadId,
            name: node?.name ?? null,
            city: node?.city ?? null,
            status: node?.status ?? null,
            signalScore: Number(node?.signalScore ?? 0),
            neighbors: Array.isArray(node?.neighbors)
                ? node.neighbors.map((neighbor) => ({
                      leadId: normalizeLeadId(neighbor?.leadId) ?? null,
                      score: Number(neighbor?.score ?? 0),
                      semanticScore: Number(neighbor?.semanticScore ?? 0),
                      sameCity: Boolean(neighbor?.sameCity),
                      sameStatus: Boolean(neighbor?.sameStatus),
                      bridgeScore: Number(neighbor?.bridgeScore ?? 0),
                      signalScore: Number(neighbor?.signalScore ?? 0),
                      threadType: cleanOptionalValue(neighbor?.threadType) || 'local_semantic_neighbor',
                      relationshipRole: normalizeRelationshipRole(
                          neighbor?.relationshipRole
                      ) as SemanticNeighborDetail['relationshipRole'],
                      relationshipAxis: cleanOptionalValue(neighbor?.relationshipAxis) || '',
                      roleReason: cleanOptionalValue(neighbor?.roleReason) || '',
                      reason: cleanOptionalValue(neighbor?.reason) || 'semantic neighbor'
                  }))
                : []
        }
    ])
    _lastNormalizedOutput = result
    return result
}

export {
    _basename as basenameUtil,
    _countThreadEdges as countThreadEdgesUtil,
    isLayoutManifest
}
