/**
 * @lib/journey/focus-pocket.ts — Focus pocket node layout, animation, and owner API
 *
 * Port of js/modules/focus-pocket.ts.
 * Focus pocket is the constellation of nearby businesses that appears when
 * a single point is focused. This module owns its indices, motion state,
 * role map, and breathing animation.
 *
 * Wave 11 W11-T7: migrated from the legacy `state` singleton + `withStateMutation`
 * to the Svelte 5 `appState` class with `appState.withMutation()` for tracked
 * sub-object writes. The prior bridge indirection is now retired per the
 * Wave 11 3-step retirement path; the corresponding bridge file in
 * `src/lib/engine/` is dead and a deletion candidate for a follow-up ticket.
 */
import { Vector3, PerspectiveCamera } from 'three'
import type { PocketMotion, PocketMotionWithFrame } from '@lib/types/state'
import { appState } from '@lib/state/app.svelte'
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
type FocusPocketMeta = Record<string, unknown> | null

export function getFocusPocketIndices(): number[] {
    const indices = appState.navState.focusPocketIndices
    return Array.isArray(indices) ? indices : []
}

export function setFocusPocketIndices(indices: number[]): void {
    appState.withMutation(() => {
        appState.navState.focusPocketIndices = indices
    })
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
    appState.withMutation(() => {
        const navState = appState.navState
        if (!(navState.focusPocketRoleByIndex instanceof Map)) {
            navState.focusPocketRoleByIndex = new Map()
        }
        navState.focusPocketRoleByIndex.set(index, role)
    })
}

export function clearFocusPocketRoleByIndex(): void {
    writeFocusPocketMirror({ pocketRoleByIndex: new Map() })
}

export function getFocusPocketMotionByIndex(): Map<number, PocketMotion> {
    return appState.pocketMotionByIndex ?? new Map()
}

export function setFocusPocketMotionByIndex(map: Map<number, PocketMotionWithFrame>): void {
    appState.withMutation(() => {
        appState.pocketMotionByIndex = map
    })
    focusStore.update((s) => ({ ...s, pocketMotionByIndex: new Map(map) }))
}

export function setFocusPocketMotionForIndex(index: number, motion: unknown): void {
    appState.withMutation(() => {
        if (!(appState.pocketMotionByIndex instanceof Map)) {
            appState.pocketMotionByIndex = new Map()
        }
        appState.pocketMotionByIndex.set(index, motion as PocketMotionWithFrame)
    })
}

export function clearFocusPocketMotionByIndex(): void {
    appState.withMutation(() => {
        appState.pocketMotionByIndex = new Map()
    })
}

export function clearFocusPocketIndices(): void {
    appState.withMutation(() => {
        appState.navState.focusPocketIndices = []
    })
    syncPocketNodesToStore()
}

export function getFocusPocketMeta(): unknown {
    return appState.navState.focusPocketMeta ?? null
}

export function setFocusPocketMeta(meta: FocusPocketMeta): void {
    writeFocusPocketMirror({ pocketMeta: meta as any })
}

export function clearFocusPocketMeta(): void {
    writeFocusPocketMirror({ pocketMeta: null })
}

export function applyLocalNeighborhoodFocus(index: number): boolean {
    const points = appState.points
    const originalPositions = appState.originalPositions
    const nodePositions = appState.nodePositions
    const targetPositions = appState.targetPositions
    const navState = appState.navState

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

    if (!points || !Array.isArray(points) || !originalPositions) return false
    for (let i = 0; i < points.length; i++) {
        const pos = originalPositions[i]
        const px = Number.isFinite(pos?.x) ? pos!.x : 0
        const py = Number.isFinite(pos?.y) ? pos!.y : 0
        const pz = Number.isFinite(pos?.z) ? pos!.z : 0
        if (targetPositions) targetPositions[i] = { x: px, y: py, z: pz }
    }

    const personality = getNeighborhoodPersonality(index)
    appState.withMutation(() => {
        navState.currentPersonality = personality.type
    })

    const animationFrameId = navState.focusPocketAnimationFrameId
    if (Number.isFinite(animationFrameId)) {
        cancelAnimationFrame(animationFrameId!)
        appState.withMutation(() => {
            navState.focusPocketAnimationFrameId = null
        })
    }

    clearFocusPocketIndices()
    clearFocusPocketMeta()
    clearFocusPocketRoleByIndex()
    clearFocusPocketMotionByIndex()
    appState.withMutation(() => {
        appState.pocketTransitionStartedAt = performance.now()
    })

    if (navState.threadSource === 'semantic') {
        const pocket = buildFocusedSemanticPocket(index) as {
            positions?: Map<number, { x: number; y: number; z: number }>
            indices?: number[]
            roles?: Map<number, string>
            motion?: Map<number, Record<string, unknown>>
            meta?: Record<string, unknown> & { motif?: string; motifLabel?: string }
        } | null
        if (pocket?.positions?.size) {
            pocket.positions.forEach((position, pocketIndex) => {
                if (position && targetPositions) {
                    targetPositions[pocketIndex] = { x: position.x, y: position.y, z: position.z }
                }
            })
            setFocusPocketIndices(pocket.indices?.filter((candidateIndex: number) => candidateIndex !== index) ?? [])
            setFocusPocketRoleByIndex(pocket.roles || new Map())

            const newPocketSet = new Set(pocket.indices ?? [])
            const motion =
                (pocket.motion as unknown as Map<number, PocketMotionWithFrame>) ||
                new Map<number, PocketMotionWithFrame>()
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
                    supportCount: Math.max(
                        0,
                        (pocket.indices?.length ?? 0) - 1 - Math.min(12, getFocusPocketIndices().length)
                    ),
                    motif: pocketMotif,
                    motifLabel: pocketMotifLabel
                }
            )
            appState.withMutation(() => {
                appState.nodesAreSettling = true
                appState.autoRotate = false
            })
        }
    }

    const focusPos = originalPositions?.[index]
    if (!focusPos) {
        appState.withMutation(() => {
            appState.nodesAreSettling = false
            appState.autoRotate = true
        })
        return false
    }
    const viewportProfile = getFocusConstellationViewportProfile()
    const threadCandidates = navState.threadCandidates
    const neighborhoodCandidates = threadCandidates.slice(0, viewportProfile.primaryLimit)

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
        ? (buildFocusedPocketStagedPositions(index, fallbackPocketEntries) as {
              positions?: Map<number, { x: number; y: number; z: number }>
              roles?: Map<number, string>
              motion?: Map<number, Record<string, unknown>>
              motif?: { key: string; label: string }
              viewportProfile?: unknown
          } | null)
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
            viewportProfile: (fallbackPocket.viewportProfile || viewportProfile) as Record<string, unknown>
        })
        appState.withMutation(() => {
            appState.nodesAreSettling = true
            appState.autoRotate = false
        })
        return false
    }

    setFocusPocketIndices([...localIndices].filter((candidateIndex: number) => candidateIndex !== index))
    setFocusPocketRoleByIndex(new Map([[index, 'anchor']]))
    setFocusPocketMotionByIndex(
        new Map<number, PocketMotion>([
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
    )
    setFocusPocketMeta({
        active: getFocusPocketIndices().length > 0,
        nodeCount: localIndices.size,
        primaryCount: primaryIndices.length,
        supportCount: supportIndices.length,
        haloCount: 0,
        viewportProfile,
        personality: personality.type
    })

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
        setFocusPocketRoleForIndex(i, isPrimary ? 'primary' : 'support')

        const baseDelay = isPrimary ? primaryIndices.indexOf(i) * 34 : 160

        setFocusPocketMotionForIndex(i, {
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
    appState.withMutation(() => {
        appState.nodesAreSettling = true
    })
    return true
}

export function applyFocusPocketBreathing(
    now: number,
    positions: Array<{ x: number; y: number; z: number }> | null
): boolean {
    const navState = appState.navState
    const focusPocketMeta = navState.focusPocketMeta as { active?: boolean } | null
    const pocketMotionByIndex = appState.pocketMotionByIndex
    const targetPositions = appState.targetPositions
    const nodePositions = appState.nodePositions
    const originalPositions = appState.originalPositions

    if (!focusPocketMeta?.active || !pocketMotionByIndex.size || !positions) return false
    if (prefersReducedMotion()) return false
    const age = now - appState.pocketTransitionStartedAt
    const anchorIndex = Number.isFinite(navState.focusedIndex as number) ? (navState.focusedIndex as number) : null
    const anchor = Number.isFinite(anchorIndex)
        ? targetPositions[anchorIndex!] || nodePositions[anchorIndex!] || originalPositions[anchorIndex!]
        : null
    if (anchor && !(Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z))) return false

    const viewVec = new Vector3(0, 0, 1)
    if (appState.camera && anchor) {
        viewVec.subVectors(appState.camera.position, new Vector3(anchor.x, anchor.y, anchor.z)).normalize()
    }

    let changed = false
    pocketMotionByIndex.forEach((motion, index) => {
        const basePosition = targetPositions[index] || nodePositions[index] || originalPositions[index]
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

export function syncRuntimeState(snapshot: Record<string, unknown> = {}): void {
    appState.withMutation(() => {
        Object.entries(snapshot).forEach(([key, value]) => {
            ;(appState as unknown as Record<string, unknown>)[key] = value
        })
    })
}

export function getRuntimeStateSnapshot(): Record<string, unknown> {
    return {
        navState: appState.navState,
        targetPositions: appState.targetPositions,
        pocketMotionByIndex: appState.pocketMotionByIndex,
        pocketTransitionStartedAt: appState.pocketTransitionStartedAt,
        nodesAreSettling: appState.nodesAreSettling,
        autoRotate: appState.autoRotate
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
    const roles = navState.focusPocketRoleByIndex
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
