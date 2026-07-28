/**
 * @lib/journey/focus-pocket.ts — Focus pocket node layout, animation, and owner API
 *
 * Port of
 * Focus pocket is the constellation of nearby businesses that appears when
 * a single point is focused. This module owns its indices, motion state,
 * role map, and breathing animation.
 *
 * Wave 11 W11-T7: migrated from the legacy `state` singleton + `withStateMutation`
 * to the Svelte 5 `appState` class with direct property writes. The prior bridge indirection is now retired per the
 * Wave 11 3-step retirement path; the corresponding bridge file in
 * `src/lib/engine/` is dead and a deletion candidate for a follow-up ticket.
 */
import { Vector3 } from 'three'
import type { PocketMotion, PocketMotionWithFrame, FocusPocketMeta } from '@lib/types/state'
import { appState } from '@lib/state/app.svelte'
import { writeNavStateMirror } from '@lib/stores/navigation.svelte'
import { focusStore, writeFocusPocketMirror } from '@lib/stores/focus.svelte'
import { normalizeCityForFilter } from '@lib/utils/geo-data'
import {
    buildFocusedPocketStagedPositions,
    buildFocusedSemanticPocket,
    clampNumber,
    easeOutQuint,
    safeUnitScore,
    getFocusViewBasis,
    getFocusConstellationMotif,
    getFocusConstellationMotifForPersonality,
    getFocusConstellationViewportProfile,
    getFocusBeaconDeclutterProfile,
    getDeclutteredFocusBeaconIndices,
    getFocusConstellationPlacement,
    applyRelationshipRolePlacementBias,
    getFocusThreadCurvePoint,
    type PocketEntry
} from '@lib/journey/focus-pocket-geometry'
import { seededUnit } from '@lib/utils/seeded-random'
import { getNeighborhoodPersonality, getSemanticCandidateSlice } from '@lib/focus/pocket-personality'
import { prefersReducedMotion } from '@lib/utils/environment'
import { setPocketNodes } from '@lib/stores/focus.svelte'
import { getBusinessRecords } from '@lib/data-store'
import type { FocusPocketNode } from '@lib/types/state'

export {
    clampNumber,
    easeOutQuint,
    seededUnit,
    safeUnitScore,
    getFocusViewBasis,
    getFocusConstellationMotif,
    getFocusConstellationMotifForPersonality,
    getFocusConstellationViewportProfile,
    getFocusBeaconDeclutterProfile,
    getDeclutteredFocusBeaconIndices,
    getFocusConstellationPlacement,
    applyRelationshipRolePlacementBias,
    getFocusThreadCurvePoint,
    getNeighborhoodPersonality,
    getSemanticCandidateSlice
}

/** Read-only focus-pocket meta shape used for the setFocusPocketMeta API. */
type FocusPocketMetaShape = Record<string, unknown> | null

export function getFocusPocketIndices(): number[] {
    const indices = appState.navState.focusPocketIndices
    return Array.isArray(indices) ? indices : []
}

export function setFocusPocketIndices(indices: number[]): void {
    writeNavStateMirror({ focusPocketIndices: indices })
    // Derive proper FocusPocketNode[] so a11y consumers get node.label/node.role,
    // not raw numbers hidden by an as-any[] cast.
    syncPocketNodesToStore()
}

export function getFocusPocketRoleByIndex(): Map<number, string> {
    return appState.navState.focusPocketRoleByIndex ?? new Map()
}

export function setFocusPocketRoleByIndex(map: Map<number, string>): void {
    writeFocusPocketMirror({ pocketRoleByIndex: new Map(map) })
}

export function setFocusPocketRoleForIndex(index: number, role: string): void {
    const navState = appState.navState
    if (!(navState.focusPocketRoleByIndex instanceof Map)) {
        navState.focusPocketRoleByIndex = new Map()
    }
    navState.focusPocketRoleByIndex.set(index, role)
    writeFocusPocketMirror({ pocketRoleByIndex: new Map(navState.focusPocketRoleByIndex) })
}

export function clearFocusPocketRoleByIndex(): void {
    writeFocusPocketMirror({ pocketRoleByIndex: new Map() })
}

export function getFocusPocketMotionByIndex(): Map<number, PocketMotion> {
    return appState.focusState.pocketMotionByIndex ?? new Map()
}

export function setFocusPocketMotionByIndex(map: Map<number, PocketMotionWithFrame>): void {
    appState.focusState.pocketMotionByIndex = map
    focusStore.update((s) => ({ ...s, pocketMotionByIndex: new Map(map) }))
}

export function setFocusPocketMotionForIndex(index: number, motion: unknown): void {
    if (!(appState.focusState.pocketMotionByIndex instanceof Map)) {
        appState.focusState.pocketMotionByIndex = new Map()
    }
    appState.focusState.pocketMotionByIndex.set(index, motion as PocketMotionWithFrame)
    focusStore.update((s) => ({ ...s, pocketMotionByIndex: new Map(appState.focusState.pocketMotionByIndex) }))
}

export function clearFocusPocketMotionByIndex(): void {
    appState.focusState.pocketMotionByIndex = new Map()
}

export function clearFocusPocketIndices(): void {
    writeNavStateMirror({ focusPocketIndices: [] })
    syncPocketNodesToStore()
}

export function getFocusPocketMeta(): unknown {
    return appState.navState.focusPocketMeta ?? null
}

export function setFocusPocketMeta(meta: FocusPocketMetaShape): void {
    writeFocusPocketMirror({ pocketMeta: meta as unknown as FocusPocketMeta })
}

export function clearFocusPocketMeta(): void {
    writeFocusPocketMirror({ pocketMeta: null })
}

/**
 * Topological k-NN fallback for the focus pocket.
 *
 * Deep-link focus boots before the 40 MB semantic-thread artifact
 * (`semanticNeighborMap`) is loaded, so `navState.threadCandidates` is empty
 * and `applyLocalNeighborhoodFocus` would otherwise build an EMPTY pocket and
 * render a blank/dark focus frame (see tmp/focus-blank-investigation.md).
 * When no semantic/thread candidates exist yet, build a neighborhood from the
 * K nearest businesses in `[0,1]³` original positions so the pocket is always
 * non-empty. The deferred semantic refire upgrades to real neighbors later.
 */
function topoKnnCandidates(
    seed: number,
    positions: Array<{ x: number; y: number; z: number } | undefined>,
    k: number,
    points: { name?: string | null }[]
): Array<{
    index: number
    source: string
    semanticScore: number
    score: number
    relationshipRole: string
    relationshipAxis: string
    roleReason: string
    reason: string
}> {
    const seedPos = positions[seed]
    if (!seedPos) return []
    const scored: Array<{ index: number; d: number }> = []
    for (let i = 0; i < positions.length; i++) {
        if (i === seed) continue
        const p = positions[i]
        if (!p) continue
        const dx = seedPos.x - p.x
        const dy = seedPos.y - p.y
        const dz = seedPos.z - p.z
        scored.push({ index: i, d: dx * dx + dy * dy + dz * dz })
    }
    if (scored.length === 0) return []
    scored.sort((a, b) => a.d - b.d)
    const top = scored.slice(0, k)
    const maxD = top[top.length - 1]?.d || 1
    return top.map(({ index, d }) => ({
        index,
        source: 'geometric-fallback',
        semanticScore: maxD > 0 ? 1 - d / maxD : 0,
        score: maxD > 0 ? 1 - d / maxD : 0,
        relationshipRole: '',
        relationshipAxis: '',
        roleReason: 'nearby business (topological neighbor)',
        reason: `nearby business (topological neighbor of ${points[seed]?.name ?? '#' + seed})`
    }))
}

function capturePreviousPocketState(index: number): Map<number, { x: number; y: number; z: number }> {
    const navState = appState.navState
    const nodePositions = appState.nodePositions
    const targetPositions = appState.targetPositions
    const prevPocketIndexArray = Array.isArray(navState.focusPocketIndices) ? [...navState.focusPocketIndices] : []
    const prevPocketMeta = navState.focusPocketMeta as { active?: boolean } | null
    const prevPocketIndices = prevPocketMeta?.active ? new Set([index, ...prevPocketIndexArray]) : new Set<number>()
    const prevTargetByIndex = new Map<number, { x: number; y: number; z: number }>()
    if (prevPocketIndices.size > 0) {
        prevPocketIndices.forEach((i) => {
            const currentPosition = nodePositions[i] || targetPositions[i]
            if (currentPosition) {
                prevTargetByIndex.set(i, { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z })
            }
        })
    }
    return prevTargetByIndex
}

function resetTargetPositionsFromOriginal(): boolean {
    const points = appState.points
    const originalPositions = appState.originalPositions
    const targetPositions = appState.targetPositions
    if (!points || !Array.isArray(points) || !originalPositions) return false
    for (let i = 0; i < points.length; i++) {
        const pos = originalPositions[i]
        const px = Number.isFinite(pos?.x) ? pos!.x : 0
        const py = Number.isFinite(pos?.y) ? pos!.y : 0
        const pz = Number.isFinite(pos?.z) ? pos!.z : 0
        if (targetPositions) targetPositions[i] = { x: px, y: py, z: pz }
    }
    return true
}

function _trySemanticPocket(
    index: number,
    prevTargetByIndex: Map<number, { x: number; y: number; z: number }>
): boolean {
    const navState = appState.navState
    if (navState.threadSource !== 'semantic') return false

    const targetPositions = appState.targetPositions
    const pocket = buildFocusedSemanticPocket(index)
    const _pocketIndices = pocket?.indices?.filter((candidateIndex) => candidateIndex !== index) ?? []
    // Only take the semantic pocket if it actually has neighbors. An empty
    // semantic pocket (deep-link boot before the 40 MB artifact loads)
    // must fall through to the topological k-NN fallback below so the
    // focus pocket is never blank (tmp/focus-blank-investigation.md).
    if (!pocket?.positions?.size || _pocketIndices.length === 0) return false

    pocket.positions.forEach((position, pocketIndex) => {
        if (position && targetPositions) {
            targetPositions[pocketIndex] = { x: position.x, y: position.y, z: position.z }
        }
    })
    setFocusPocketIndices(pocket.indices?.filter((candidateIndex: number) => candidateIndex !== index) ?? [])
    setFocusPocketRoleByIndex(pocket.roles || new Map())

    const newPocketSet = new Set(pocket.indices ?? [])
    const motion = pocket.motion || new Map<number, PocketMotionWithFrame>()
    prevTargetByIndex.forEach((prevPos, pocketIndex) => {
        if (newPocketSet.has(pocketIndex)) {
            const existing = motion.get(pocketIndex)
            const base: PocketMotionWithFrame = existing || { role: 'direct', delay: 0, duration: 0, speed: 0 }
            motion.set(pocketIndex, {
                ...base,
                _preservePos: { x: prevPos.x, y: prevPos.y, z: prevPos.z },
                _firstFrameApplied: false
            })
        }
    })
    setFocusPocketMotionByIndex(motion)

    const pocketMeta = pocket.meta
    const pocketMotif = pocketMeta?.motif || 'market'
    const pocketMotifLabel = pocketMeta?.motifLabel || 'semantic constellation'
    setFocusPocketMeta(
        pocketMeta || {
            active: getFocusPocketIndices().length > 0,
            nodeCount: pocket.indices?.length ?? 0,
            primaryCount: Math.min(12, getFocusPocketIndices().length),
            supportCount: Math.max(0, (pocket.indices?.length ?? 0) - 1 - Math.min(12, getFocusPocketIndices().length)),
            motif: pocketMotif,
            motifLabel: pocketMotifLabel
        }
    )
    appState.focusState.nodesAreSettling = true
    appState.autoRotate = false
    return true
}

export function applyLocalNeighborhoodFocus(index: number): boolean {
    const points = appState.points
    const originalPositions = appState.originalPositions
    const targetPositions = appState.targetPositions
    const navState = appState.navState

    const prevTargetByIndex = capturePreviousPocketState(index)
    if (!resetTargetPositionsFromOriginal()) return false

    const personality = getNeighborhoodPersonality(index)
    navState.currentPersonality = personality.type

    if (Array.isArray(appState.recentArrangements)) {
        ;(appState.recentArrangements as string[]).push(personality.type)
        if ((appState.recentArrangements as string[]).length > 5) (appState.recentArrangements as string[]).shift()
    }

    clearFocusPocketIndices()
    clearFocusPocketMeta()
    clearFocusPocketRoleByIndex()
    clearFocusPocketMotionByIndex()
    appState.focusState.pocketTransitionStartedAt = performance.now()

    if (_trySemanticPocket(index, prevTargetByIndex)) return true

    const focusPos = originalPositions?.[index]
    if (!focusPos) {
        appState.focusState.nodesAreSettling = false
        appState.autoRotate = true
        return false
    }
    const viewportProfile = getFocusConstellationViewportProfile()
    const threadCandidates = navState.threadCandidates
    let neighborhoodCandidates = threadCandidates.slice(0, viewportProfile.primaryLimit)
    // Fix A (tmp/focus-blank-investigation.md): deep-link focus boots before the
    // 40 MB semantic-thread artifact loads, so threadCandidates is empty and the
    // pocket would render blank. Fall back to a topological k-NN neighborhood so
    // the focus pocket is never empty; the deferred semantic refire upgrades it.
    if (neighborhoodCandidates.length === 0 && originalPositions && points) {
        neighborhoodCandidates = topoKnnCandidates(
            index,
            originalPositions as Array<{ x: number; y: number; z: number } | undefined>,
            viewportProfile.primaryLimit,
            points
        )
    }
    const primaryIndices = neighborhoodCandidates.map((candidate) => candidate.index)
    const supportIndices: number[] = []

    const localIndices = new Set([index, ...primaryIndices, ...supportIndices])
    const fallbackPocketEntries = new Map<number, PocketEntry>()
    neighborhoodCandidates.forEach((candidate) => {
        if (!candidate || !Number.isFinite(candidate.index as number) || (candidate.index as number) === index) return
        const point =
            Number.isFinite(candidate.index as number) &&
            (candidate.index as number) >= 0 &&
            (candidate.index as number) < (points?.length ?? 0)
                ? points?.[candidate.index as number] || {}
                : {}
        fallbackPocketEntries.set(candidate.index as number, {
            index: candidate.index as number,
            kind: 'primary',
            score: Number(
                (candidate as { semanticScore?: number }).semanticScore ??
                    (candidate as { score?: number }).score ??
                    0.62
            ),
            relationshipRole: String((candidate as { relationshipRole?: string }).relationshipRole || ''),
            relationshipAxis: String((candidate as { relationshipAxis?: string }).relationshipAxis || ''),
            roleReason: String((candidate as { roleReason?: string }).roleReason || ''),
            sameCity:
                normalizeCityForFilter((point as { city?: string }).city) ===
                normalizeCityForFilter(
                    Number.isFinite(index) && index >= 0 && index < (points?.length ?? 0)
                        ? (points?.[index] as { city?: string })?.city
                        : undefined
                ),
            reason: String((candidate as { reason?: string }).reason || 'nearby business relationship')
        })
    })

    const fallbackPocket = fallbackPocketEntries.size
        ? buildFocusedPocketStagedPositions(index, fallbackPocketEntries)
        : null
    if (fallbackPocket?.positions?.size) {
        fallbackPocket.positions.forEach((position, pocketIndex) => {
            if (position) {
                const px = Number.isFinite(position.x) ? position.x : 0
                const py = Number.isFinite(position.y) ? position.y : 0
                const pz = Number.isFinite(position.z) ? position.z : 0
                if (targetPositions) targetPositions[pocketIndex] = { x: px, y: py, z: pz }
            }
        })
        setFocusPocketIndices([...fallbackPocketEntries.keys()])
        setFocusPocketRoleByIndex(fallbackPocket.roles || new Map([[index, 'anchor']]))
        setFocusPocketMotionByIndex(fallbackPocket.motion || new Map())
        setFocusPocketMeta({
            active: true,
            nodeCount: fallbackPocket.positions.size,
            primaryCount: fallbackPocketEntries.size,
            supportCount: 0,
            haloCount: 0,
            motif: fallbackPocket.motif?.key || 'market',
            motifLabel: fallbackPocket.motif?.label || 'threaded neighborhood',
            viewportProfile: fallbackPocket.viewportProfile || viewportProfile
        })
        appState.focusState.nodesAreSettling = true
        appState.autoRotate = false
        return true
    }

    const roleMap = new Map<number, string>([[index, 'anchor']])
    const motionMap = new Map<number, PocketMotion>([
        [
            index,
            {
                role: 'anchor',
                delay: 0,
                duration: personality.cameraDuration * 0.7,
                speed: 0.38,
                personality: personality.type
            }
        ]
    ])

    const focusPosX = Number.isFinite(focusPos.x) ? focusPos.x : 0
    const focusPosY = Number.isFinite(focusPos.y) ? focusPos.y : 0
    const focusPosZ = Number.isFinite(focusPos.z) ? focusPos.z : 0
    if (!points || !Array.isArray(points)) return false
    for (let i = 0; i < points.length; i++) {
        if (i === index) continue
        if (!localIndices.has(i)) continue
        const origPos = originalPositions?.[i]
        if (!origPos) continue
        const origX = Number.isFinite(origPos.x) ? origPos.x : 0
        const origY = Number.isFinite(origPos.y) ? origPos.y : 0
        const origZ = Number.isFinite(origPos.z) ? origPos.z : 0
        const dx = focusPosX - origX
        const dy = focusPosY - origY
        const dz = focusPosZ - origZ
        const isPrimary = primaryIndices.includes(i)
        roleMap.set(i, isPrimary ? 'primary' : 'support')

        const baseDelay = isPrimary ? primaryIndices.indexOf(i) * 34 : 160

        motionMap.set(i, {
            role: isPrimary ? 'primary' : 'support',
            delay: baseDelay * personality.staggerMult,
            duration: (isPrimary ? 980 : 1120) * (personality.cameraDuration / 980),
            speed: isPrimary ? 0.22 : 0.16,
            personality: personality.type
        })

        let compression = isPrimary
            ? navState.threadSource === 'semantic'
                ? 0.62
                : 0.28
            : navState.threadSource === 'semantic'
              ? 0.34
              : 0.18

        if (appState.trailDepth === 2) {
            compression *= isPrimary ? 0.4 : 0.52
        }

        compression *= personality.compressionMult

        if (targetPositions) {
            targetPositions[i] = {
                x: origX + dx * compression,
                y: origY + dy * compression,
                z: origZ + dz * compression
            }
        }
    }

    // Write all state in one go so syncPocketNodesToStore picks up
    // correct roles on the PocketNodes sent to the focus store.
    setFocusPocketRoleByIndex(roleMap)
    setFocusPocketMotionByIndex(motionMap)
    setFocusPocketMeta({
        active: localIndices.size > 1,
        nodeCount: localIndices.size,
        primaryCount: primaryIndices.length,
        supportCount: supportIndices.length,
        haloCount: 0,
        viewportProfile,
        personality: personality.type
    })
    setFocusPocketIndices([...localIndices].filter((candidateIndex: number) => candidateIndex !== index))

    appState.focusState.nodesAreSettling = true
    appState.autoRotate = false
    return true
}

export function applyFocusPocketBreathing(
    now: number,
    positions: Array<{ x: number; y: number; z: number }> | null
): boolean {
    const navState = appState.navState
    const focusPocketMeta = navState.focusPocketMeta as { active?: boolean } | null
    const pocketMotionByIndex = appState.focusState.pocketMotionByIndex
    const targetPositions = appState.targetPositions
    const nodePositions = appState.nodePositions
    const originalPositions = appState.originalPositions

    if (!focusPocketMeta?.active || !pocketMotionByIndex.size || !positions) return false
    if (prefersReducedMotion()) return false
    const age = now - appState.focusState.pocketTransitionStartedAt
    const anchorIndex = Number.isFinite(navState.focusedIndex as number) ? (navState.focusedIndex as number) : null
    const anchor = Number.isFinite(anchorIndex)
        ? targetPositions[anchorIndex!] || nodePositions[anchorIndex!] || originalPositions[anchorIndex!]
        : null
    if (anchor && !(Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z))) return false

    if (!appState.camera) return false
    const viewVec = new Vector3(0, 0, 1)
    if (anchor) {
        viewVec.subVectors(appState.camera.position, new Vector3(anchor.x, anchor.y, anchor.z)).normalize()
    }

    let changed = false
    pocketMotionByIndex.forEach((motion, index) => {
        const basePosition = positions[index] || targetPositions[index] || originalPositions[index]
        if (!basePosition) return
        if (index === anchorIndex || !anchor) return
        const delay = motion.delay || 0
        const duration = motion.duration || 800
        const elapsed = Math.max(0, age - delay)
        const t = Math.min(1, elapsed / duration)
        const breatheAmp = motion.breatheAmp || 0.02
        const phase = motion.phase || 0
        const settle = easeOutQuint(t)
        const breatheOffset = Math.sin(age * 0.0015 + phase) * breatheAmp * settle
        if (!Number.isFinite(breatheOffset)) return

        const offset = new Vector3(basePosition.x - anchor.x, basePosition.y - anchor.y, basePosition.z - anchor.z)

        const speedFactor = motion.role === 'primary' ? 1.0 : 0.45
        const direction = index % 2 === 0 ? 1 : -1
        const orbitAngle = elapsed * 0.00035 * speedFactor * direction * settle
        offset.applyAxisAngle(viewVec, orbitAngle)

        const x = anchor.x + offset.x * (1 + breatheOffset)
        const y = anchor.y + offset.y * (1 + breatheOffset)
        const z = anchor.z + offset.z * (1 + breatheOffset)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return

        const posObj = positions[index]
        if (!posObj) return

        if (
            Math.abs((posObj.x || 0) - x) > 0.00001 ||
            Math.abs((posObj.y || 0) - y) > 0.00001 ||
            Math.abs((posObj.z || 0) - z) > 0.00001
        ) {
            posObj.x = x
            posObj.y = y
            posObj.z = z
            changed = true
        }
    })
    return changed
}

export function getRuntimeStateSnapshot(): Record<string, unknown> {
    return {
        navState: appState.navState,
        targetPositions: appState.targetPositions,
        pocketMotionByIndex: appState.focusState.pocketMotionByIndex,
        pocketTransitionStartedAt: appState.focusState.pocketTransitionStartedAt,
        nodesAreSettling: appState.focusState.nodesAreSettling,
        autoRotate: appState.autoRotate
    }
}

/**
 * Restore runtime state from a snapshot produced by getRuntimeStateSnapshot().
 * Only fields present in the snapshot are restored — callers control partial
 * restoration. Writes go through withStateMutation so dependents update.
 */
export function syncRuntimeState(snapshot: Record<string, unknown>): void {
    const s = snapshot as Partial<{
        navState: typeof appState.navState
        targetPositions: typeof appState.targetPositions
        pocketMotionByIndex: typeof appState.focusState.pocketMotionByIndex
        pocketTransitionStartedAt: number
        nodesAreSettling: boolean
        autoRotate: boolean
    }>
    {
        if (s.navState !== undefined) appState.navState = s.navState
        if (s.targetPositions !== undefined) appState.targetPositions = s.targetPositions
        if (s.pocketMotionByIndex !== undefined) appState.focusState.pocketMotionByIndex = s.pocketMotionByIndex
        if (s.pocketTransitionStartedAt !== undefined)
            appState.focusState.pocketTransitionStartedAt = s.pocketTransitionStartedAt
        if (s.nodesAreSettling !== undefined) appState.focusState.nodesAreSettling = s.nodesAreSettling
        if (s.autoRotate !== undefined) appState.autoRotate = s.autoRotate
    }
}

// ── Pocket Node Sync ─────────────────────────────────────────────────────────
// Migrated from focus/pocket.ts (W7-B Pair 3 collapse).
// Derives FocusPocketNode[] from current navState indices/roles/positions
// and pushes the result into the Svelte focus store.

export function syncPocketNodesToStore(): void {
    const lState = appState
    const navState = lState.navState
    if (!navState) return
    const indices = navState.focusPocketIndices ?? []
    const roles = navState.focusPocketRoleByIndex ?? new Map()
    const targetPositions = lState.targetPositions
    const nodePositions = lState.nodePositions
    const originalPositions = lState.originalPositions
    const records = getBusinessRecords()
    const anchorIndex = navState.focusedIndex
    if (indices.length === 0) {
        setPocketNodes([])
        return
    }
    const nodes: FocusPocketNode[] = []
    for (const idx of indices) {
        if (!Number.isFinite(idx) || idx < 0) continue
        if (anchorIndex != null && idx === anchorIndex) continue // anchor is rendered separately
        const position = targetPositions?.[idx] ?? nodePositions?.[idx] ?? originalPositions?.[idx] ?? null
        if (!position) continue
        const legacyRole = (roles.get(idx) || 'support').toLowerCase()
        const role: FocusPocketNode['role'] =
            legacyRole === 'primary' || legacyRole === 'direct'
                ? 'direct'
                : legacyRole === 'civic'
                  ? 'civic'
                  : 'support'
        const record = records[idx]
        const label = record?.name ?? `Node ${idx}`
        nodes.push({
            index: idx,
            position: [position.x ?? 0, position.y ?? 0, position.z ?? 0],
            role,
            score: 0.62,
            label,
            rotationSeed: (idx * 7919) % 360,
            scaleSeed: ((idx * 104729) % 1000) / 1000
        })
    }
    setPocketNodes(nodes)
}
