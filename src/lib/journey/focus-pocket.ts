/**
 * @lib/journey/focus-pocket.ts — Focus pocket node layout, animation, and owner API
 *
 * Port of js/modules/focus-pocket.ts.
 * Focus pocket is the constellation of nearby businesses that appears when
 * a single point is focused. This module owns its indices, motion state,
 * role map, and breathing animation.
 */
import * as THREE from 'three';
import { state, withStateMutation, type NavFocusPocketMeta, type Point, type SemanticState } from '../../../js/state';
import { prefersReducedMotion } from '@lib/utils/environment';
import { normalizeCityForFilter } from '../../../js/modules/utils/geo-data';
import {
    buildFocusedPocketStagedPositions,
    buildFocusedSemanticPocket,
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
    type PocketEntry,
} from '../../../js/modules/focus-pocket-geometry';
import {
    getNeighborhoodPersonality,
    getSemanticCandidateSlice,
    type NeighborhoodPersonality,
} from '../../../js/modules/focus-pocket-personality';

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
    getSemanticCandidateSlice,
};

const _state = state as unknown as SemanticState & {
    focusPocketMotionByIndex: Map<number, unknown>;
    focusPocketTransitionStartedAt: number;
    focusPocketAnimationFrameId: number | undefined;
    targetPositions: Array<{ x: number; y: number; z: number }>;
    nodePositions: Array<{ x: number; y: number; z: number }>;
    originalPositions: Array<{ x: number; y: number; z: number }>;
    points: Point[];
    camera: { position: THREE.Vector3 } | null;
    nodesAreSettling: boolean;
    autoRotate: boolean;
    trailDepth: number;
    focusedIndex: number;
};

export function getFocusPocketIndices(): number[] {
    const indices = _state.navState.focusPocketIndices;
    return Array.isArray(indices) ? indices : [];
}

export function setFocusPocketIndices(indices: number[]): void {
    _state.navState.focusPocketIndices = indices;
}

export function getFocusPocketRoleByIndex(): Map<number, string> {
    return _state.navState.focusPocketRoleByIndex ?? new Map();
}

export function setFocusPocketRoleByIndex(map: Map<number, string>): void {
    _state.navState.focusPocketRoleByIndex = map;
}

export function setFocusPocketRoleForIndex(index: number, role: string): void {
    if (!(_state.navState.focusPocketRoleByIndex instanceof Map)) {
        _state.navState.focusPocketRoleByIndex = new Map();
    }
    _state.navState.focusPocketRoleByIndex.set(index, role);
}

export function clearFocusPocketRoleByIndex(): void {
    _state.navState.focusPocketRoleByIndex = new Map();
}

export function getFocusPocketMotionByIndex(): Map<number, unknown> {
    return _state.focusPocketMotionByIndex ?? new Map();
}

export function setFocusPocketMotionByIndex(map: Map<number, unknown>): void {
    _state.focusPocketMotionByIndex = map;
}

export function setFocusPocketMotionForIndex(index: number, motion: unknown): void {
    if (!(_state.focusPocketMotionByIndex instanceof Map)) {
        _state.focusPocketMotionByIndex = new Map();
    }
    _state.focusPocketMotionByIndex.set(index, motion);
}

export function clearFocusPocketMotionByIndex(): void {
    _state.focusPocketMotionByIndex = new Map();
}

export function clearFocusPocketIndices(): void {
    _state.navState.focusPocketIndices = [];
}

export function getFocusPocketMeta(): unknown {
    return _state.navState.focusPocketMeta ?? null;
}

export function setFocusPocketMeta(meta: NavFocusPocketMeta | null): void {
    _state.navState.focusPocketMeta = meta;
}

export function clearFocusPocketMeta(): void {
    _state.navState.focusPocketMeta = null;
}

export function applyLocalNeighborhoodFocus(index: number): void {
    const prevPocketIndexArray = Array.isArray(_state.navState.focusPocketIndices)
        ? _state.navState.focusPocketIndices
        : [];
    const prevPocketIndices = _state.navState.focusPocketMeta?.active
        ? new Set([index, ...prevPocketIndexArray])
        : new Set<number>();
    const prevTargetByIndex = new Map<number, { x: number; y: number; z: number }>();
    if (prevPocketIndices.size > 0) {
        prevPocketIndices.forEach((i) => {
            const currentPosition = _state.nodePositions[i] || _state.targetPositions[i];
            if (currentPosition) {
                prevTargetByIndex.set(i, { ...currentPosition });
            }
        });
    }

    if (!_state.points || !Array.isArray(_state.points) || !_state.originalPositions) return;
    for (let i = 0; i < _state.points.length; i++) {
        const pos = _state.originalPositions[i];
        const px = Number.isFinite(pos?.x) ? pos!.x : 0;
        const py = Number.isFinite(pos?.y) ? pos!.y : 0;
        const pz = Number.isFinite(pos?.z) ? pos!.z : 0;
        _state.targetPositions[i] = { x: px, y: py, z: pz };
    }

    const personality = getNeighborhoodPersonality(index);
    _state.navState.currentPersonality = personality as unknown as Record<string, unknown>;

    if (Number.isFinite(_state.focusPocketAnimationFrameId)) {
        cancelAnimationFrame(_state.focusPocketAnimationFrameId!);
        _state.focusPocketAnimationFrameId = undefined;
    }

    clearFocusPocketIndices();
    clearFocusPocketMeta();
    clearFocusPocketRoleByIndex();
    clearFocusPocketMotionByIndex();
    _state.focusPocketTransitionStartedAt = performance.now();

    if (_state.navState.threadSource === 'semantic') {
        const pocket = buildFocusedSemanticPocket(index) as {
            positions?: Map<number, { x: number; y: number; z: number }>;
            indices?: number[];
            roles?: Map<number, string>;
            motion?: Map<number, unknown>;
            meta?: { motif?: string; motifLabel?: string };
        } | null;
        if (pocket?.positions?.size) {
            pocket.positions.forEach((position, pocketIndex) => {
                if (position) {
                    _state.targetPositions[pocketIndex] = { x: position.x, y: position.y, z: position.z };
                }
            });
            setFocusPocketIndices(pocket.indices?.filter((candidateIndex: number) => candidateIndex !== index) ?? []);
            setFocusPocketRoleByIndex(pocket.roles || new Map());

            const newPocketSet = new Set(pocket.indices ?? []);
            const motion = (pocket.motion as Map<number, Record<string, unknown>>) || new Map();
            prevTargetByIndex.forEach((prevPos, pocketIndex) => {
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

            const pocketMeta = pocket.meta;
            const pocketMotif = pocketMeta?.motif || 'market';
            const pocketMotifLabel = pocketMeta?.motifLabel || 'semantic constellation';
            setFocusPocketMeta(pocketMeta || {
                active: getFocusPocketIndices().length > 0,
                nodeCount: pocket.indices?.length ?? 0,
                primaryCount: Math.min(12, getFocusPocketIndices().length),
                supportCount: Math.max(
                    0,
                    (pocket.indices?.length ?? 0) - 1 - Math.min(12, getFocusPocketIndices().length)
                ),
                motif: pocketMotif,
                motifLabel: pocketMotifLabel
            });
            _state.nodesAreSettling = true;
            _state.autoRotate = false;
        }
    }

    const focusPos = _state.originalPositions[index];
    if (!focusPos) {
        _state.nodesAreSettling = false;
        _state.autoRotate = true;
        return;
    }
    const viewportProfile = getFocusConstellationViewportProfile();
    const neighborhoodCandidates = (
        _state.navState.threadCandidates.length ? _state.navState.threadCandidates : []
    ).slice(0, viewportProfile.primaryLimit);

    const primaryIndices = neighborhoodCandidates.map((candidate: { index: number }) => candidate.index);
    const supportIndices: number[] = [];

    const localIndices = new Set([index, ...primaryIndices, ...supportIndices]);
    const fallbackPocketEntries = new Map<number, PocketEntry>();
    neighborhoodCandidates.forEach((candidate: { index: number; semanticScore?: number; score?: number; relationshipRole?: string; relationshipAxis?: string; roleReason?: string; reason?: string }) => {
        if (!candidate || !Number.isFinite(candidate.index) || candidate.index === index) return;
        const point = (Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < _state.points.length)
            ? _state.points[candidate.index] || {}
            : {};
        fallbackPocketEntries.set(candidate.index, {
            index: candidate.index,
            kind: 'primary',
            score: candidate.semanticScore || candidate.score || 0.62,
            relationshipRole: candidate.relationshipRole || '',
            relationshipAxis: candidate.relationshipAxis || '',
            roleReason: candidate.roleReason || '',
            sameCity:
                normalizeCityForFilter(point.city) ===
                normalizeCityForFilter((Number.isFinite(index) && index >= 0 && index < _state.points.length) ? _state.points[index]?.city : undefined),
            reason: candidate.reason || 'nearby business relationship'
        });
    });

    const fallbackPocket = fallbackPocketEntries.size
        ? buildFocusedPocketStagedPositions(index, fallbackPocketEntries) as {
            positions?: Map<number, { x: number; y: number; z: number }>;
            roles?: Map<number, string>;
            motion?: Map<number, unknown>;
            motif?: { key: string; label: string };
            viewportProfile?: unknown;
        } | null
        : null;
    if (fallbackPocket?.positions?.size) {
        fallbackPocket.positions.forEach((position, pocketIndex) => {
            if (position) {
                const px = Number.isFinite(position.x) ? position.x : 0;
                const py = Number.isFinite(position.y) ? position.y : 0;
                const pz = Number.isFinite(position.z) ? position.z : 0;
                _state.targetPositions[pocketIndex] = { x: px, y: py, z: pz };
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
            viewportProfile: (fallbackPocket.viewportProfile || viewportProfile) as NavFocusPocketMeta['viewportProfile']
        });
        _state.nodesAreSettling = true;
        _state.autoRotate = false;
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
        viewportProfile: viewportProfile as unknown as NavFocusPocketMeta['viewportProfile'],
        personality: personality.type
    });

    const focusPosX = Number.isFinite(focusPos.x) ? focusPos.x : 0;
    const focusPosY = Number.isFinite(focusPos.y) ? focusPos.y : 0;
    const focusPosZ = Number.isFinite(focusPos.z) ? focusPos.z : 0;
    if (!_state.points || !Array.isArray(_state.points)) return;
    for (let i = 0; i < _state.points.length; i++) {
        if (i === index) continue;
        if (!localIndices.has(i)) continue;
        const origPos = _state.originalPositions[i];
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
            ? _state.navState.threadSource === 'semantic'
                ? 0.62
                : 0.28
            : _state.navState.threadSource === 'semantic'
              ? 0.34
              : 0.18;

        if (_state.trailDepth === 2) {
            compression *= isPrimary ? 0.4 : 0.52;
        }

        compression *= personality.compressionMult;

        _state.targetPositions[i] = {
            x: origX + dx * compression,
            y: origY + dy * compression,
            z: origZ + dz * compression
        };
    }
    _state.nodesAreSettling = true;
}

export function applyFocusPocketBreathing(now: number, positions: Array<{ x: number; y: number; z: number }> | null): boolean {
    if (!_state.navState.focusPocketMeta?.active || !_state.focusPocketMotionByIndex.size || !positions) return false;
    if (prefersReducedMotion()) return false;
    const age = now - _state.focusPocketTransitionStartedAt;
    const anchorIndex = Number.isFinite(_state.navState.focusedIndex) ? _state.navState.focusedIndex : null;
    const anchor =
        Number.isFinite(anchorIndex)
            ? _state.targetPositions[anchorIndex!] || _state.nodePositions[anchorIndex!] || _state.originalPositions[anchorIndex!]
            : null;
    if (anchor && !(Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z))) return false;

    const viewVec = new THREE.Vector3(0, 0, 1);
    if (_state.camera && anchor) {
        viewVec.subVectors(_state.camera.position, new THREE.Vector3(anchor.x, anchor.y, anchor.z)).normalize();
    }

    let changed = false;
    (_state.focusPocketMotionByIndex as Map<number, { delay?: number; duration?: number; breatheAmp?: number; phase?: number; role?: string; speed?: number }>).forEach((motion, index) => {
        const basePosition = _state.targetPositions[index] || _state.nodePositions[index] || _state.originalPositions[index];
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

export function syncRuntimeState(snapshot: Record<string, unknown> = {}): void {
    withStateMutation(() => {
        Object.entries(snapshot).forEach(([key, value]) => {
            (_state as Record<string, unknown>)[key] = value;
        });
    });
}

export function getRuntimeStateSnapshot(): Record<string, unknown> {
    return {
        navState: _state.navState,
        targetPositions: _state.targetPositions,
        focusPocketMotionByIndex: _state.focusPocketMotionByIndex,
        focusPocketTransitionStartedAt: _state.focusPocketTransitionStartedAt,
        nodesAreSettling: _state.nodesAreSettling,
        autoRotate: _state.autoRotate
    };
}
