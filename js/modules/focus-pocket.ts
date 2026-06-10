/**
 * js/modules/focus-pocket.ts
 *
 * TypeScript shadow of focus-pocket.js.
 * Focus pocket node layout, animation, and owner API.
 */
import * as THREE from 'three';
import { state, withStateMutation } from '../state.ts';
import { prefersReducedMotion } from './environment.ts';
import { normalizeCityForFilter } from './utils/geo-data.ts';
import { buildFocusedPocketStagedPositions, buildFocusedSemanticPocket } from './focus-pocket-geometry.ts';
import {
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
    getFocusThreadCurvePoint
} from './focus-pocket-geometry.ts';

import {
    getNeighborhoodPersonality,
    getSemanticCandidateSlice
} from './focus-pocket-personality.ts';

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
};

export function getFocusPocketIndices(): number[] {
    return state.navState.focusPocketIndices ?? [];
}

export function setFocusPocketIndices(indices: number[]): void {
    state.navState.focusPocketIndices = indices;
}

export function getFocusPocketRoleByIndex(): Map<number, string> {
    return state.navState.focusPocketRoleByIndex ?? new Map();
}

export function setFocusPocketRoleByIndex(map: Map<number, string>): void {
    state.navState.focusPocketRoleByIndex = map;
}

export function setFocusPocketRoleForIndex(index: number, role: string): void {
    if (!(state.navState.focusPocketRoleByIndex instanceof Map)) {
        state.navState.focusPocketRoleByIndex = new Map();
    }
    state.navState.focusPocketRoleByIndex.set(index, role);
}

export function clearFocusPocketRoleByIndex(): void {
    state.navState.focusPocketRoleByIndex = new Map();
}

export function getFocusPocketMotionByIndex(): Map<number, any> {
    return (state as any).focusPocketMotionByIndex ?? new Map();
}

export function setFocusPocketMotionByIndex(map: Map<number, any>): void {
    (state as any).focusPocketMotionByIndex = map;
}

export function setFocusPocketMotionForIndex(index: number, motion: any): void {
    if (!((state as any).focusPocketMotionByIndex instanceof Map)) {
        (state as any).focusPocketMotionByIndex = new Map();
    }
    (state as any).focusPocketMotionByIndex.set(index, motion);
}

export function clearFocusPocketMotionByIndex(): void {
    (state as any).focusPocketMotionByIndex = new Map();
}

export function clearFocusPocketIndices(): void {
    state.navState.focusPocketIndices = [];
}

export function getFocusPocketMeta(): any {
    return state.navState.focusPocketMeta ?? null;
}

export function setFocusPocketMeta(meta: any): void {
    state.navState.focusPocketMeta = meta;
}

export function clearFocusPocketMeta(): void {
    state.navState.focusPocketMeta = null;
}

export function applyLocalNeighborhoodFocus(index: number): void {
    const prevPocketIndices = state.navState.focusPocketMeta?.active
        ? new Set([index, ...state.navState.focusPocketIndices])
        : new Set<number>();
    const prevTargetByIndex = new Map<number, any>();
    if (prevPocketIndices.size > 0) {
        prevPocketIndices.forEach((i: number) => {
            const currentPosition = (state as any).nodePositions[i] || (state as any).targetPositions[i];
            if (currentPosition) {
                prevTargetByIndex.set(i, { ...currentPosition });
            }
        });
    }

    if (!state.points || !Array.isArray(state.points) || !(state as any).originalPositions) return;
    for (let i = 0; i < state.points.length; i++) {
        const pos = (state as any).originalPositions[i];
        const px = Number.isFinite(pos?.x) ? pos.x : 0;
        const py = Number.isFinite(pos?.y) ? pos.y : 0;
        const pz = Number.isFinite(pos?.z) ? pos.z : 0;
        (state as any).targetPositions[i] = { x: px, y: py, z: pz };
    }

    const personality = getNeighborhoodPersonality(index);
    state.navState.currentPersonality = personality;

    if (Number.isFinite((state as any).focusPocketAnimationFrameId)) {
        cancelAnimationFrame((state as any).focusPocketAnimationFrameId);
        (state as any).focusPocketAnimationFrameId = undefined;
    }

    clearFocusPocketIndices();
    clearFocusPocketMeta();
    clearFocusPocketRoleByIndex();
    clearFocusPocketMotionByIndex();
    (state as any).focusPocketTransitionStartedAt = performance.now();

    if (state.navState.threadSource === 'semantic') {
        const pocket = buildFocusedSemanticPocket(index);
        if (pocket?.positions?.size) {
            pocket.positions.forEach((position: any, pocketIndex: number) => {
                if (position) {
                    (state as any).targetPositions[pocketIndex] = { x: position.x, y: position.y, z: position.z };
                }
            });
            setFocusPocketIndices(pocket.indices.filter((candidateIndex: number) => candidateIndex !== index));
            setFocusPocketRoleByIndex(pocket.roles || new Map());

            const newPocketSet = new Set(pocket.indices);
            const motion = pocket.motion || new Map();
            prevTargetByIndex.forEach((prevPos: any, pocketIndex: number) => {
                if (newPocketSet.has(pocketIndex)) {
                    const existing = motion.get(pocketIndex);
                    motion.set(pocketIndex, {
                        ...(existing || {}),
                        _preservePos: { ...prevPos },
                        _firstFrameApplied: false
                    });
                }
            });
            setFocusPocketMotionByIndex(motion);

            setFocusPocketMeta(pocket.meta || {
                active: getFocusPocketIndices().length > 0,
                nodeCount: pocket.indices.length,
                primaryCount: Math.min(12, getFocusPocketIndices().length),
                supportCount: Math.max(
                    0,
                    pocket.indices.length - 1 - Math.min(12, getFocusPocketIndices().length)
                ),
                motif: pocket.meta?.motif || 'market',
                motifLabel: pocket.meta?.motifLabel || 'semantic constellation'
            });
            state.nodesAreSettling = true;
            state.autoRotate = false;
        }
    }

    const focusPos = (state as any).originalPositions[index];
    if (!focusPos) {
        state.nodesAreSettling = false;
        state.autoRotate = true;
        return;
    }
    const viewportProfile = getFocusConstellationViewportProfile();
    const neighborhoodCandidates = (
        state.navState.threadCandidates.length ? state.navState.threadCandidates : []
    ).slice(0, viewportProfile.primaryLimit);

    const primaryIndices = neighborhoodCandidates.map((candidate: any) => candidate.index);
    const supportIndices: number[] = [];

    const localIndices = new Set([index, ...primaryIndices, ...supportIndices]);
    const fallbackPocketEntries = new Map<number, any>();
    neighborhoodCandidates.forEach((candidate: any) => {
        if (!candidate || !Number.isFinite(candidate.index) || candidate.index === index) return;
        const point = (Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < state.points.length) ? state.points[candidate.index] || {} : {};
        fallbackPocketEntries.set(candidate.index, {
            index: candidate.index,
            kind: 'primary',
            score: candidate.semanticScore || candidate.score || 0.62,
            relationshipRole: candidate.relationshipRole || '',
            relationshipAxis: candidate.relationshipAxis || '',
            roleReason: candidate.roleReason || '',
            sameCity:
                normalizeCityForFilter(point.city) ===
                normalizeCityForFilter((Number.isFinite(index) && index >= 0 && index < state.points.length) ? state.points[index]?.city : undefined),
            reason: candidate.reason || 'nearby business relationship'
        });
    });

    const fallbackPocket = fallbackPocketEntries.size
        ? buildFocusedPocketStagedPositions(index, fallbackPocketEntries)
        : null;
    if (fallbackPocket?.positions?.size) {
        fallbackPocket.positions.forEach((position: any, pocketIndex: number) => {
            if (position) {
                const px = Number.isFinite(position.x) ? position.x : 0;
                const py = Number.isFinite(position.y) ? position.y : 0;
                const pz = Number.isFinite(position.z) ? position.z : 0;
                (state as any).targetPositions[pocketIndex] = { x: px, y: py, z: pz };
            }
        });
        setFocusPocketIndices([...fallbackPocketEntries.keys()]);
        setFocusPocketRoleByIndex(fallbackPocket.roles || new Map([[index, 'anchor']]));
        setFocusPocketMotionByIndex(fallbackPocket.motion || new Map());
        setFocusPocketMeta({
            active: true,
            nodeCount: fallbackPocket.positions.size,
            primaryCount: fallbackPocketEntries.size,
            supportCount: 0,
            haloCount: 0,
            motif: fallbackPocket.motif?.key || 'market',
            motifLabel: fallbackPocket.motif?.label || 'threaded neighborhood',
            viewportProfile: fallbackPocket.viewportProfile || viewportProfile
        });
        state.nodesAreSettling = true;
        state.autoRotate = false;
        return;
    }

    setFocusPocketIndices([...localIndices].filter((candidateIndex: number) => candidateIndex !== index));
    setFocusPocketRoleByIndex(new Map([[index, 'anchor']]));
    setFocusPocketMotionByIndex(new Map([
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
    ]));
    setFocusPocketMeta({
        active: getFocusPocketIndices().length > 0,
        nodeCount: localIndices.size,
        primaryCount: primaryIndices.length,
        supportCount: supportIndices.length,
        haloCount: 0,
        viewportProfile,
        personality: personality.type
    });

    const focusPosX = Number.isFinite(focusPos.x) ? focusPos.x : 0;
    const focusPosY = Number.isFinite(focusPos.y) ? focusPos.y : 0;
    const focusPosZ = Number.isFinite(focusPos.z) ? focusPos.z : 0;
    if (!state.points || !Array.isArray(state.points)) return;
    for (let i = 0; i < state.points.length; i++) {
        if (i === index) continue;
        if (!localIndices.has(i)) continue;
        const origPos = (state as any).originalPositions[i];
        if (!origPos) continue;
        const origX = Number.isFinite(origPos.x) ? origPos.x : 0;
        const origY = Number.isFinite(origPos.y) ? origPos.y : 0;
        const origZ = Number.isFinite(origPos.z) ? origPos.z : 0;
        const dx = focusPosX - origX;
        const dy = focusPosY - origY;
        const dz = focusPosZ - origZ;
        const isPrimary = primaryIndices.includes(i);
        setFocusPocketRoleForIndex(i, isPrimary ? 'primary' : 'support');

        const baseDelay = isPrimary ? primaryIndices.indexOf(i) * 34 : 160;

        setFocusPocketMotionForIndex(i, {
            role: isPrimary ? 'primary' : 'support',
            delay: baseDelay * personality.staggerMult,
            duration: (isPrimary ? 980 : 1120) * (personality.cameraDuration / 980),
            speed: isPrimary ? 0.22 : 0.16,
            personality: personality.type
        });

        let compression = isPrimary
            ? state.navState.threadSource === 'semantic'
                ? 0.62
                : 0.28
            : state.navState.threadSource === 'semantic'
              ? 0.34
              : 0.18;

        if (state.trailDepth === 2) {
            compression *= isPrimary ? 0.4 : 0.52;
        }

        compression *= personality.compressionMult;

        (state as any).targetPositions[i] = {
            x: origX + dx * compression,
            y: origY + dy * compression,
            z: origZ + dz * compression
        };
    }
    state.nodesAreSettling = true;
}

export function applyFocusPocketBreathing(now: number, positions: any): boolean {
    if (!state.navState.focusPocketMeta?.active || !(state as any).focusPocketMotionByIndex.size || !positions) return false;
    if (prefersReducedMotion()) return false;
    const age = now - (state as any).focusPocketTransitionStartedAt;
    const anchorIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    const anchor =
        Number.isFinite(anchorIndex)
            ? (state as any).targetPositions[anchorIndex!] || (state as any).nodePositions[anchorIndex!] || (state as any).originalPositions[anchorIndex!]
            : null;
    if (anchor && !(Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z))) return false;

    const viewVec = new THREE.Vector3(0, 0, 1);
    if (state.camera && anchor) {
        viewVec.subVectors((state.camera as any).position, new THREE.Vector3(anchor.x, anchor.y, anchor.z)).normalize();
    }

    let changed = false;
    (state as any).focusPocketMotionByIndex.forEach((motion: any, index: number) => {
        const basePosition = (state as any).targetPositions[index] || (state as any).nodePositions[index] || (state as any).originalPositions[index];
        if (!basePosition) return;
        if (index === anchorIndex || !anchor) return;
        const delay = motion.delay || 0;
        const duration = motion.duration || 800;
        const elapsed = Math.max(0, age - delay);
        const t = Math.min(1, elapsed / duration);
        const breatheAmp = motion.breatheAmp || 0.02;
        const phase = motion.phase || 0;
        const settle = easeOutQuint(t);
        const breatheOffset = Math.sin(age * 0.0015 + phase) * breatheAmp * settle;
        if (!Number.isFinite(breatheOffset)) return;

        const offset = new THREE.Vector3(basePosition.x - anchor.x, basePosition.y - anchor.y, basePosition.z - anchor.z);

        const speedFactor = motion.role === 'primary' ? 1.0 : 0.45;
        const direction = (index % 2 === 0) ? 1 : -1;
        const orbitAngle = elapsed * 0.00035 * speedFactor * direction * settle;
        offset.applyAxisAngle(viewVec, orbitAngle);

        const x = anchor.x + offset.x * (1 + breatheOffset);
        const y = anchor.y + offset.y * (1 + breatheOffset);
        const z = anchor.z + offset.z * (1 + breatheOffset);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

        const posObj = positions[index];
        if (!posObj) return;

        if (
            Math.abs((posObj.x || 0) - x) > 0.00001 ||
            Math.abs((posObj.y || 0) - y) > 0.00001 ||
            Math.abs((posObj.z || 0) - z) > 0.00001
        ) {
            posObj.x = x;
            posObj.y = y;
            posObj.z = z;
            changed = true;
        }
    });
    return changed;
}

export function syncRuntimeState(snapshot: Record<string, any> = {}): void {
    withStateMutation(() => {
        Object.entries(snapshot).forEach(([key, value]) => {
            (state as any)[key] = value;
        });
    });
}

export function getRuntimeStateSnapshot(): any {
    return {
        navState: state.navState,
        targetPositions: (state as any).targetPositions,
        focusPocketMotionByIndex: (state as any).focusPocketMotionByIndex,
        focusPocketTransitionStartedAt: (state as any).focusPocketTransitionStartedAt,
        nodesAreSettling: state.nodesAreSettling,
        autoRotate: state.autoRotate
    };
}
