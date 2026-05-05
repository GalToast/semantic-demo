// js/modules/focus-pocket.js — extracted from monolithic HTML
import { state } from '../state.js';
import { describeCluster, normalizeCityForFilter } from '../utils.js';
import { getSemanticThreadCandidates } from './thread-inspector.js';

// === Pure geometry/easing utilities ===

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}

function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function seededUnit(...values) {
    const seed = values.reduce((sum, value, index) => sum + (Number(value) || 0) * (index + 1) * 12.9898, 78.233);
    const x = Math.sin(seed) * 43758.5453;
    return x - Math.floor(x);
}

// === Focus constellation geometry ===

export function getFocusViewBasis(focusVector) {
    const viewVector = state.camera
        ? new THREE.Vector3().subVectors(state.camera.position, focusVector)
        : new THREE.Vector3(0.28, 0.2, 1);
    if (viewVector.lengthSq() < 0.0001) viewVector.set(0.28, 0.2, 1);
    viewVector.normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const rightVector = new THREE.Vector3().crossVectors(worldUp, viewVector);
    if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0);
    rightVector.normalize();
    const upVector = new THREE.Vector3().crossVectors(viewVector, rightVector).normalize();
    return { viewVector, rightVector, upVector };
}

export function getFocusConstellationMotif(index) {
    const point = state.points[index] || {};
    const clusterLabel = (describeCluster(point.cluster) || '').toLowerCase();
    let key = 'market';
    if (/(food|hospitality|beauty|wellness|arts|culture)/.test(clusterLabel)) {
        key = 'rosette';
    } else if (/(construction|trades|industrial|logistics|automotive|property|real estate)/.test(clusterLabel)) {
        key = 'lattice';
    } else if (/(agriculture|ranching|public agencies|economic development)/.test(clusterLabel)) {
        key = 'delta';
    } else if (
        /(church|faith|community|nonprofit|foundation|education|childcare|healthcare|medical|therapy|counseling)/.test(
            clusterLabel
        )
    ) {
        key = 'civic';
    }
    const motif = state.FOCUS_CONSTELLATION_MOTIFS[key] || state.FOCUS_CONSTELLATION_MOTIFS.market;
    return {
        key,
        ...motif,
        seed: (point.cluster ?? 0) * 0.41 + (index % 11) * 0.07
    };
}

export function getNeighborhoodPersonality(index) {
    const viewportProfile = getFocusConstellationViewportProfile();
    const primaryCandidates = getSemanticCandidateSlice(index, viewportProfile.primaryLimit);
    const degree = primaryCandidates.length;
    const avgScore = primaryCandidates.reduce((sum, c) => sum + (c.semanticScore || c.score || 0), 0) / (degree || 1);

    const cities = new Set(primaryCandidates.map((c) => normalizeCityForFilter(state.points[c.index]?.city)));

    let personality = {
        type: 'STANDARD',
        motifOverride: null,
        cameraDuration: 980,
        cameraArc: 'standard',
        staggerMult: 1.0,
        compressionMult: 1.0,
        easing: 'easeInOutCubic',
        microVariation: {
            rotation: (seededUnit(index, degree, avgScore) - 0.5) * 0.16,
            scale: 0.97 + seededUnit(index, degree, cities.size) * 0.06
        }
    };

    const lastType = state.recentArrangements[state.recentArrangements.length - 1];

    if (degree >= 8 && avgScore >= 0.85 && lastType !== 'DENSE_HUB') {
        personality.type = 'DENSE_HUB';
        personality.cameraDuration = 1240;
        personality.cameraArc = 'wide';
        personality.staggerMult = 1.35;
        personality.compressionMult = 0.82;
        personality.easing = 'easeOutQuint';
    } else if (degree >= 4 && cities.size >= 2 && lastType !== 'BRIDGE_NODE') {
        personality.type = 'BRIDGE_NODE';
        personality.motifOverride = 'lattice';
        personality.cameraDuration = 1120;
        personality.cameraArc = 'side';
        personality.staggerMult = 1.15;
    } else if (degree > 0 && degree <= 3 && lastType !== 'EDGE_NODE') {
        personality.type = 'EDGE_NODE';
        personality.motifOverride = 'delta';
        personality.cameraDuration = 840;
        personality.staggerMult = 0.8;
        personality.compressionMult = 1.18;
        personality.easing = 'easeOutBack';
    } else if (avgScore >= 0.92 && lastType !== 'TIGHT_CLUSTER') {
        personality.type = 'TIGHT_CLUSTER';
        personality.motifOverride = 'civic';
        personality.cameraDuration = 880;
        personality.easing = 'easeOutQuint';
        personality.compressionMult = 1.08;
    }

    state.recentArrangements.push(personality.type);
    if (state.recentArrangements.length > 5) state.recentArrangements.shift();

    return personality;
}

export function getFocusConstellationViewportProfile() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const compact = w <= 768;
    const short = h <= 540;
    if (compact && short)
        return {
            key: 'condensed',
            primaryLimit: 5,
            supportLimit: 4,
            haloLimit: 3,
            primaryRadiusScale: 0.74,
            supportRadiusScale: 0.72,
            haloRadiusScale: 0.7,
            primarySpreadScale: 1.82,
            supportSpreadScale: 1.54,
            haloSpreadScale: 1.12,
            primaryRadiusFloor: 0.066,
            primaryRadiusCeiling: 0.12,
            supportRadiusFloor: 0.094,
            supportRadiusCeiling: 0.18,
            primaryStagedBlend: 0.94,
            supportStagedBlend: 0.9,
            haloStagedBlend: 0.9,
            primaryOriginBlend: 0.025,
            supportOriginBlend: 0.06,
            haloOriginBlend: 0.04,
            zScale: 0.72,
            beaconLimit: 6,
            overlayLimit: 5,
            primaryBeam: 8,
            supportBeam: 6,
            supportSeedLimit: 3,
            supportNeighborLimit: 3,
            cameraPadding: 1.52,
            cameraDistanceMax: 1.32,
            targetOffsetLimit: 0.036,
            compositionRightOffset: 0.004,
            compositionLift: 0.004
        };
    if (compact)
        return {
            key: 'compact',
            primaryLimit: 8,
            supportLimit: 6,
            haloLimit: 4,
            primaryRadiusScale: 0.78,
            supportRadiusScale: 0.76,
            haloRadiusScale: 0.74,
            primarySpreadScale: 1.74,
            supportSpreadScale: 1.46,
            haloSpreadScale: 1.12,
            primaryRadiusFloor: 0.074,
            primaryRadiusCeiling: 0.132,
            supportRadiusFloor: 0.105,
            supportRadiusCeiling: 0.2,
            primaryStagedBlend: 0.92,
            supportStagedBlend: 0.9,
            haloStagedBlend: 0.9,
            primaryOriginBlend: 0.03,
            supportOriginBlend: 0.065,
            haloOriginBlend: 0.045,
            zScale: 0.76,
            beaconLimit: 8,
            overlayLimit: 6,
            primaryBeam: 8,
            supportBeam: 6,
            supportSeedLimit: 4,
            supportNeighborLimit: 3,
            cameraPadding: 1.82,
            cameraDistanceMax: 1.58,
            targetOffsetLimit: 0.04,
            compositionRightOffset: 0.006,
            compositionLift: 0.006
        };
    return {
        key: 'roomy',
        primaryLimit: 12,
        supportLimit: 10,
        haloLimit: 8,
        primaryRadiusScale: 0.7,
        supportRadiusScale: 0.68,
        haloRadiusScale: 0.66,
        primarySpreadScale: 1.34,
        supportSpreadScale: 1.2,
        haloSpreadScale: 1.08,
        primaryRadiusFloor: 0.055,
        primaryRadiusCeiling: 0.108,
        supportRadiusFloor: 0.082,
        supportRadiusCeiling: 0.18,
        primaryStagedBlend: 0.9,
        supportStagedBlend: 0.88,
        haloStagedBlend: 0.9,
        primaryOriginBlend: 0.035,
        supportOriginBlend: 0.07,
        haloOriginBlend: 0.05,
        zScale: 0.78,
        beaconLimit: 12,
        overlayLimit: 8,
        primaryBeam: 10,
        supportBeam: 8,
        supportSeedLimit: 5,
        supportNeighborLimit: 4
    };
}

export function getFocusBeaconDeclutterProfile(viewportProfile = {}) {
    return viewportProfile;
}

export function getDeclutteredFocusBeaconIndices(rawIndices, limit) {
    return rawIndices.slice(0, limit);
}

export function getFocusConstellationPlacement(
    motif,
    entry,
    order,
    group,
    total,
    viewportProfile = getFocusConstellationViewportProfile(),
    personality = null
) {
    const score = Math.max(0, Math.min(1, entry.score || 0));
    const isPrimary = group === 'primary';
    const isHalo = group === 'halo';
    const normalized = total <= 1 ? 0 : order / Math.max(1, total - 1) - 0.5;
    const absNormalized = Math.abs(normalized);
    const sameCityBias = entry.sameCity ? -0.018 : 0.018;
    let angle = motif.seed;
    let radius;
    let zOffset;
    let breatheAmp;

    const compressionMult = personality?.compressionMult || 1.0;

    if (motif.key === 'rosette') {
        const petalStep = (Math.PI * 2) / Math.max(5, total + (isPrimary ? 1 : 3));
        angle += (isPrimary ? -Math.PI * 0.48 : isHalo ? Math.PI * 0.46 : Math.PI * 0.18) + order * petalStep;
        radius = isPrimary
            ? 0.145 + (order % 2) * 0.024 + (1 - score) * 0.014
            : isHalo
              ? 0.295 + absNormalized * 0.036
              : 0.245 + absNormalized * 0.05 + (entry.sameCity ? -0.014 : 0.012);
        zOffset = isPrimary ? 0.036 * Math.cos(order * petalStep) : isHalo ? -0.036 : -0.028 - (order % 2) * 0.012;
    } else if (motif.key === 'lattice') {
        const lane = order % 2 === 0 ? -1 : 1;
        angle += (isPrimary ? -0.24 : isHalo ? Math.PI + 0.58 : Math.PI + 0.2) + normalized * Math.PI * 0.9;
        radius = isPrimary
            ? 0.155 + absNormalized * 0.07 + sameCityBias
            : isHalo
              ? 0.286 + absNormalized * 0.05
              : 0.23 + absNormalized * 0.078;
        zOffset = (isPrimary ? 0.012 : isHalo ? -0.038 : -0.03) + lane * (isHalo ? 0.012 : 0.018);
        breatheAmp = isPrimary ? 0.0028 : isHalo ? 0.003 : 0.0042;
    } else if (motif.key === 'delta') {
        angle +=
            (isPrimary ? -0.04 : isHalo ? Math.PI + 0.46 : Math.PI + 0.1) +
            normalized * (isPrimary ? Math.PI * 0.72 : Math.PI * 1.08);
        radius = isPrimary
            ? 0.15 + order * 0.009 + (1 - score) * 0.02
            : isHalo
              ? 0.284 + order * 0.01
              : 0.238 + order * 0.018;
        zOffset = isPrimary ? 0.03 - absNormalized * 0.018 : isHalo ? -0.034 - order * 0.003 : -0.018 - order * 0.006;
    } else if (motif.key === 'civic') {
        angle += (isPrimary ? -Math.PI * 0.52 : isHalo ? Math.PI * 0.72 : Math.PI * 0.45) + normalized * Math.PI * 1.34;
        radius = isPrimary
            ? 0.17 + absNormalized * 0.026 + sameCityBias
            : isHalo
              ? 0.302 + absNormalized * 0.034
              : 0.265 + absNormalized * 0.05;
        zOffset = isPrimary ? 0.018 * Math.cos(normalized * Math.PI * 2) : isHalo ? -0.034 : -0.024;
        breatheAmp = isPrimary ? 0.0026 : isHalo ? 0.003 : 0.0038;
    } else {
        const arcSpan = isPrimary
            ? Math.min(Math.PI * 1.28, 1.0 + total * 0.18)
            : Math.min(Math.PI * 1.5, 1.15 + total * 0.2);
        angle += (isPrimary ? -0.36 : isHalo ? Math.PI + 0.62 : Math.PI + 0.34) + normalized * arcSpan;
        radius = isPrimary
            ? 0.154 + absNormalized * 0.052 + (1 - score) * 0.016
            : isHalo
              ? 0.302 + absNormalized * 0.038
              : 0.258 + absNormalized * 0.062 + (1 - score) * 0.022;
        zOffset = isPrimary ? 0.03 * Math.cos(normalized * Math.PI) : isHalo ? -0.036 : -0.022 - (order % 2) * 0.016;
    }

    radius *= compressionMult;

    const radiusScale = isPrimary
        ? viewportProfile.primaryRadiusScale
        : isHalo
          ? viewportProfile.haloRadiusScale
          : viewportProfile.supportRadiusScale;
    radius *= radiusScale || 0.7;
    zOffset *= viewportProfile.zScale || 0.78;
    breatheAmp *= isHalo ? 0.72 : 1;

    return { angle, radius, zOffset, breatheAmp };
}

// === Semantic candidate slice ===

function getSemanticCandidateSlice(index, limit = 8) {
    return getSemanticThreadCandidates(index).slice(0, limit);
}

// === Build pocket positions ===

export function buildFocusedPocketStagedPositions(index, pocketEntries) {
    const focusOrig = state.originalPositions[index];
    if (!focusOrig)
        return { positions: new Map(), motion: new Map(), roles: new Map(), motif: null, viewportProfile: null };
    const focusVector = new THREE.Vector3(focusOrig.x, focusOrig.y, focusOrig.z);
    const { viewVector, rightVector, upVector } = getFocusViewBasis(focusVector);

    const pocketPositions = new Map();
    pocketPositions.set(index, { x: focusOrig.x, y: focusOrig.y, z: focusOrig.z });

    const entries = [...pocketEntries.values()].sort((a, b) => {
        const rank = { primary: 0, support: 1, halo: 2 };
        if (a.kind !== b.kind) return (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3);
        return (b.score || 0) - (a.score || 0);
    });
    const primaryEntries = entries.filter((entry) => entry.kind === 'primary');
    const supportEntries = entries.filter((entry) => entry.kind === 'support');
    const haloEntries = entries.filter((entry) => entry.kind === 'halo');

    const personality = state.navState.currentPersonality || { type: 'STANDARD', staggerMult: 1, compressionMult: 1 };
    const motif = personality.motifOverride
        ? state.FOCUS_CONSTELLATION_MOTIFS[personality.motifOverride] || getFocusConstellationMotif(index)
        : getFocusConstellationMotif(index);

    const viewportProfile = getFocusConstellationViewportProfile();
    const motion = new Map();
    const roles = new Map([[index, 'anchor']]);
    motion.set(index, {
        role: 'anchor',
        delay: 0,
        duration: personality.cameraDuration * 0.7,
        speed: 0.42,
        motif: motif.key,
        breatheAmp: 0.0022,
        personality: personality.type
    });

    const placeEntry = (entry, order, group) => {
        const original = state.originalPositions[entry.index];
        if (!original) return;
        const isPrimary = group === 'primary';
        const isHalo = group === 'halo';
        const total = isPrimary ? primaryEntries.length : isHalo ? haloEntries.length : supportEntries.length;
        const placement = { ...getFocusConstellationPlacement(
            motif,
            entry,
            order,
            group,
            total,
            viewportProfile,
            personality
        ) };
        const relationSeed = seededUnit(index, entry.index, order, total, entry.score || 0);
        const relationSwing = isPrimary ? 0.18 : isHalo ? 0.16 : 0.24;
        placement.angle += (relationSeed - 0.5) * relationSwing;
        placement.radius *= 0.94 + seededUnit(entry.index, index, group.length, order) * (isPrimary ? 0.13 : 0.17);
        placement.radius *= isPrimary
            ? viewportProfile.primarySpreadScale || 1
            : isHalo
              ? viewportProfile.haloSpreadScale || 1
              : viewportProfile.supportSpreadScale || 1;
        if (isPrimary) {
            placement.radius = clampNumber(
                placement.radius,
                viewportProfile.primaryRadiusFloor || 0.24,
                viewportProfile.primaryRadiusCeiling || 0.52
            );
        } else if (!isHalo) {
            placement.radius = clampNumber(
                placement.radius,
                viewportProfile.supportRadiusFloor || 0.3,
                viewportProfile.supportRadiusCeiling || 0.66
            );
        }

        const stagedOffset = new THREE.Vector3()
            .addScaledVector(rightVector, Math.cos(placement.angle) * placement.radius)
            .addScaledVector(upVector, Math.sin(placement.angle) * placement.radius)
            .addScaledVector(viewVector, placement.zOffset);

        // Apply micro-variations (Layer 3)
        if (personality.microVariation) {
            stagedOffset.applyAxisAngle(viewVector, personality.microVariation.rotation);
            stagedOffset.multiplyScalar(personality.microVariation.scale);
        }

        const originalOffset = new THREE.Vector3(
            original.x - focusOrig.x,
            original.y - focusOrig.y,
            original.z - focusOrig.z
        );
        const originalDistance = originalOffset.length();
        if (originalDistance > 0.0001) {
            originalOffset.normalize().multiplyScalar(Math.min(originalDistance, placement.radius * 1.35));
        }

        stagedOffset.multiplyScalar(
            isPrimary
                ? viewportProfile.primaryStagedBlend ?? 0.82
                : isHalo
                  ? viewportProfile.haloStagedBlend ?? 0.9
                  : viewportProfile.supportStagedBlend ?? 0.86
        );
        originalOffset.multiplyScalar(
            isPrimary
                ? viewportProfile.primaryOriginBlend ?? 0.18
                : isHalo
                  ? viewportProfile.haloOriginBlend ?? 0.055
                  : viewportProfile.supportOriginBlend ?? 0.12
        );
        const finalVector = focusVector.clone().add(stagedOffset).add(originalOffset);
        pocketPositions.set(entry.index, { x: finalVector.x, y: finalVector.y, z: finalVector.z });
        roles.set(entry.index, isPrimary ? 'primary' : isHalo ? 'halo' : 'support');

        const baseDelay = isPrimary ? order * 52 : isHalo ? 300 + order * 58 : 210 + order * 62;
        const baseDuration = isPrimary ? 980 : isHalo ? 1280 : 1120;

        const origin = state.nodePositions[entry.index] || state.originalPositions[entry.index] || finalVector;
        motion.set(entry.index, {
            role: isPrimary ? 'primary' : isHalo ? 'halo' : 'support',
            motif: motif.key,
            delay: baseDelay * personality.staggerMult,
            duration: baseDuration * (personality.cameraDuration / 980),
            speed: isPrimary ? 0.24 : isHalo ? 0.14 : 0.19,
            breatheAmp: placement.breatheAmp,
            phase: placement.angle,
            personality: personality.type,
            _originPos: { x: origin.x, y: origin.y, z: origin.z },
            _firstFrameApplied: false
        });
    };

    primaryEntries.forEach((entry, order) => placeEntry(entry, order, 'primary'));
    supportEntries.forEach((entry, order) => placeEntry(entry, order, 'support'));
    haloEntries.forEach((entry, order) => placeEntry(entry, order, 'halo'));
    return { positions: pocketPositions, motion, roles, motif, viewportProfile };
}

// === Build focused semantic pocket ===

export function buildFocusedSemanticPocket(index) {
    const viewportProfile = getFocusConstellationViewportProfile();
    const primaryCandidates = getSemanticCandidateSlice(index, viewportProfile.primaryLimit);
    if (!primaryCandidates.length) return null;

    const outerDirectCandidates = getSemanticCandidateSlice(
        index,
        viewportProfile.primaryLimit + viewportProfile.haloLimit
    ).slice(viewportProfile.primaryLimit);
    const focusPoint = state.points[index];
    const focusCity = normalizeCityForFilter(focusPoint?.city);
    const pocketEntries = new Map();

    primaryCandidates.forEach((candidate) => {
        pocketEntries.set(candidate.index, {
            index: candidate.index,
            kind: 'primary',
            score: candidate.semanticScore || candidate.score || 0,
            sameCity: normalizeCityForFilter(state.points[candidate.index]?.city) === focusCity,
            reason: candidate.reason || 'semantic neighbor'
        });
    });

    const supportScores = new Map();
    primaryCandidates.slice(0, viewportProfile.supportSeedLimit).forEach((candidate) => {
        getSemanticCandidateSlice(candidate.index, viewportProfile.supportNeighborLimit).forEach((support) => {
            if (support.index === index || pocketEntries.has(support.index)) return;
            const current = supportScores.get(support.index) || { count: 0, score: 0, sameCity: 0 };
            current.count += 1;
            current.score += support.semanticScore || support.score || 0;
            if (normalizeCityForFilter(state.points[support.index]?.city) === focusCity) current.sameCity += 1;
            supportScores.set(support.index, current);
        });
    });

    [...supportScores.entries()]
        .filter(([, entry]) => entry.count >= 2 || (entry.count >= 1 && entry.sameCity >= 1 && entry.score >= 0.72))
        .sort((a, b) => b[1].count - a[1].count || b[1].score - a[1].score)
        .slice(0, viewportProfile.supportLimit)
        .forEach(([supportIndex, entry]) => {
            pocketEntries.set(supportIndex, {
                index: supportIndex,
                kind: 'support',
                score: entry.score / Math.max(entry.count, 1),
                sameCity: entry.sameCity > 0,
                reason: 'local semantic support'
            });
        });

    outerDirectCandidates
        .filter((candidate) => !pocketEntries.has(candidate.index))
        .slice(0, viewportProfile.haloLimit)
        .forEach((candidate) => {
            pocketEntries.set(candidate.index, {
                index: candidate.index,
                kind: 'halo',
                score: (candidate.semanticScore || candidate.score || 0) * 0.86,
                sameCity: normalizeCityForFilter(state.points[candidate.index]?.city) === focusCity,
                reason: 'outer semantic echo'
            });
        });

    const pocketIndices = [index, ...[...pocketEntries.keys()]];
    if (pocketIndices.length < 2) return null;
    const pocketLayout = buildFocusedPocketStagedPositions(index, pocketEntries);

    return {
        positions: pocketLayout.positions,
        indices: pocketIndices,
        motion: pocketLayout.motion,
        roles: pocketLayout.roles,
        meta: {
            active: true,
            nodeCount: pocketIndices.length,
            primaryCount: primaryCandidates.length,
            supportCount: [...pocketEntries.values()].filter((entry) => entry.kind === 'support').length,
            haloCount: [...pocketEntries.values()].filter((entry) => entry.kind === 'halo').length,
            motif: pocketLayout.motif?.key || 'market',
            motifLabel: pocketLayout.motif?.label || 'semantic constellation',
            viewportProfile: pocketLayout.viewportProfile || viewportProfile
        }
    };
}

// === Apply local neighborhood focus ===

export function applyLocalNeighborhoodFocus(index) {
    // --- TRAVERSAL CONTINUITY: capture previous pocket before reset ---
    const prevPocketIndices = state.navState.focusPocketMeta?.active
        ? new Set([index, ...state.navState.focusPocketIndices])
        : new Set();
    const prevTargetByIndex = new Map();
    if (prevPocketIndices.size > 0) {
        prevPocketIndices.forEach((i) => {
            const currentPosition = state.nodePositions[i] || state.targetPositions[i];
            if (currentPosition) {
                prevTargetByIndex.set(i, { ...currentPosition });
            }
        });
    }

    for (let i = 0; i < state.points.length; i++) {
        state.targetPositions[i] = { ...state.originalPositions[i] };
    }

    // --- POLISH 312: Determine Personality ---
    const personality = getNeighborhoodPersonality(index);
    state.navState.currentPersonality = personality;
    // ------------------------------------------

    state.navState.focusPocketIndices = [];
    state.navState.focusPocketMeta = null;
    state.navState.focusPocketRoleByIndex = new Map();
    state.focusPocketMotionByIndex = new Map();
    state.focusPocketTransitionStartedAt = performance.now();

    if (state.navState.threadSource === 'semantic') {
        const pocket = buildFocusedSemanticPocket(index);
        if (pocket?.positions?.size) {
            pocket.positions.forEach((position, pocketIndex) => {
                state.targetPositions[pocketIndex] = { x: position.x, y: position.y, z: position.z };
            });
            state.navState.focusPocketIndices = pocket.indices.filter((candidateIndex) => candidateIndex !== index);
            state.navState.focusPocketRoleByIndex = pocket.roles || new Map();

            // --- TRAVERSAL CONTINUITY: inject preserved position into motion for continuing nodes ---
            const newPocketSet = new Set(pocket.indices);
            const motion = pocket.motion || new Map();
            prevTargetByIndex.forEach((prevPos, pocketIndex) => {
                if (newPocketSet.has(pocketIndex)) {
                    // Continuing node: preserve its current animated position so the animation
                    // loop tweens smoothly from old pocket position → new pocket position
                    const existing = motion.get(pocketIndex);
                    motion.set(pocketIndex, {
                        ...(existing || {}),
                        _preservePos: { ...prevPos },
                        _firstFrameApplied: false
                    });
                }
            });
            state.focusPocketMotionByIndex = motion;

            state.navState.focusPocketMeta = pocket.meta || {
                active: state.navState.focusPocketIndices.length > 0,
                nodeCount: pocket.indices.length,
                primaryCount: Math.min(12, state.navState.focusPocketIndices.length),
                supportCount: Math.max(
                    0,
                    pocket.indices.length - 1 - Math.min(12, state.navState.focusPocketIndices.length)
                ),
                motif: pocket.meta?.motif || 'market',
                motifLabel: pocket.meta?.motifLabel || 'semantic constellation'
            };
            state.nodesAreSettling = true;
            state.autoRotate = false;
            // syncAutoRotateButton() — deferred to main script
            return;
        }
    }

    // Fallback: geometric/thread-candidate path
    const focusPos = state.originalPositions[index];
    const viewportProfile = getFocusConstellationViewportProfile();
    const neighborhoodCandidates = (
        state.navState.threadCandidates.length ? state.navState.threadCandidates : []
    ).slice(0, viewportProfile.primaryLimit);

    const primaryIndices = neighborhoodCandidates.map((candidate) => candidate.index);
    const supportIndices = []; // Fallback doesn't usually have support indices defined this way

    const localIndices = new Set([index, ...primaryIndices, ...supportIndices]);
    const fallbackPocketEntries = new Map();
    neighborhoodCandidates.forEach((candidate) => {
        if (!candidate || !Number.isFinite(candidate.index) || candidate.index === index) return;
        const point = state.points[candidate.index] || {};
        fallbackPocketEntries.set(candidate.index, {
            index: candidate.index,
            kind: 'primary',
            score: candidate.semanticScore || candidate.score || 0.62,
            sameCity:
                normalizeCityForFilter(point.city) ===
                normalizeCityForFilter(state.points[index]?.city),
            reason: candidate.reason || 'nearby business relationship'
        });
    });

    const fallbackPocket = fallbackPocketEntries.size
        ? buildFocusedPocketStagedPositions(index, fallbackPocketEntries)
        : null;
    if (fallbackPocket?.positions?.size) {
        fallbackPocket.positions.forEach((position, pocketIndex) => {
            state.targetPositions[pocketIndex] = { x: position.x, y: position.y, z: position.z };
        });
        state.navState.focusPocketIndices = [...fallbackPocketEntries.keys()];
        state.navState.focusPocketRoleByIndex = fallbackPocket.roles || new Map([[index, 'anchor']]);
        state.focusPocketMotionByIndex = fallbackPocket.motion || new Map();
        state.navState.focusPocketMeta = {
            active: true,
            nodeCount: fallbackPocket.positions.size,
            primaryCount: fallbackPocketEntries.size,
            supportCount: 0,
            haloCount: 0,
            motif: fallbackPocket.motif?.key || 'market',
            motifLabel: fallbackPocket.motif?.label || 'threaded neighborhood',
            viewportProfile: fallbackPocket.viewportProfile || viewportProfile
        };
        state.nodesAreSettling = true;
        state.autoRotate = false;
        return;
    }

    state.navState.focusPocketIndices = [...localIndices].filter((candidateIndex) => candidateIndex !== index);
    state.navState.focusPocketRoleByIndex = new Map([[index, 'anchor']]);
    state.focusPocketMotionByIndex = new Map([
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
    ]);
    state.navState.focusPocketMeta = {
        active: state.navState.focusPocketIndices.length > 0,
        nodeCount: localIndices.size,
        primaryCount: primaryIndices.length,
        supportCount: supportIndices.length,
        haloCount: 0,
        viewportProfile,
        personality: personality.type
    };

    for (let i = 0; i < state.points.length; i++) {
        if (i === index) continue;
        if (!localIndices.has(i)) continue;

        const dx = focusPos.x - state.originalPositions[i].x;
        const dy = focusPos.y - state.originalPositions[i].y;
        const dz = focusPos.z - state.originalPositions[i].z;
        const isPrimary = primaryIndices.includes(i);
        state.navState.focusPocketRoleByIndex.set(i, isPrimary ? 'primary' : 'support');

        const baseDelay = isPrimary ? primaryIndices.indexOf(i) * 34 : 160; // Simplified for fallback

        state.focusPocketMotionByIndex.set(i, {
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

        compression *= personality.compressionMult;

        state.targetPositions[i] = {
            x: state.originalPositions[i].x + dx * compression,
            y: state.originalPositions[i].y + dy * compression,
            z: state.originalPositions[i].z + dz * compression
        };
    }
    state.nodesAreSettling = true;
}

// === Focus pocket breathing ===

export function applyFocusPocketBreathing(now, positions) {
    if (!state.navState.focusPocketMeta?.active || !state.focusPocketMotionByIndex.size || !positions) return false;
    const age = now - state.focusPocketTransitionStartedAt;
    const anchorIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    const anchor =
        Number.isFinite(anchorIndex)
            ? state.targetPositions[anchorIndex] || state.nodePositions[anchorIndex] || state.originalPositions[anchorIndex]
            : null;
    let changed = false;
    state.focusPocketMotionByIndex.forEach((motion, index) => {
        const basePosition = state.targetPositions[index] || state.nodePositions[index] || state.originalPositions[index];
        if (!basePosition || index === anchorIndex || !anchor) return;
        const delay = motion.delay || 0;
        const duration = motion.duration || 800;
        const elapsed = Math.max(0, age - delay);
        const t = Math.min(1, elapsed / duration);
        const breatheAmp = motion.breatheAmp || 0.003;
        const phase = motion.phase || 0;
        const settle = easeOutQuint(t);
        const breatheOffset = Math.sin(age * 0.0015 + phase) * breatheAmp * settle;
        const x = basePosition.x + (basePosition.x - anchor.x) * breatheOffset;
        const y = basePosition.y + (basePosition.y - anchor.y) * breatheOffset;
        const z = basePosition.z + (basePosition.z - anchor.z) * breatheOffset;
        const offset = index * 3;
        if (
            Math.abs((positions[offset] || 0) - x) > 0.00001 ||
            Math.abs((positions[offset + 1] || 0) - y) > 0.00001 ||
            Math.abs((positions[offset + 2] || 0) - z) > 0.00001
        ) {
            positions[offset] = x;
            positions[offset + 1] = y;
            positions[offset + 2] = z;
            changed = true;
        }
    });
    return changed;
}

// === Focus thread curve ===

export function getFocusThreadCurvePoint(edge, t) {
    const a = state.nodePositions[edge.a];
    const b = state.nodePositions[edge.b];
    if (!a || !b) return new THREE.Vector3();

    const start = new THREE.Vector3(a.x, a.y, a.z);
    const end = new THREE.Vector3(b.x, b.y, b.z);
    const mid = start.clone().lerp(end, 0.5);
    const span = new THREE.Vector3().subVectors(end, start);
    const spanLength = Math.max(span.length(), 0.001);
    const viewVector = state.camera
        ? new THREE.Vector3().subVectors(state.camera.position, mid)
        : new THREE.Vector3(0.28, 0.2, 1);
    if (viewVector.lengthSq() < 0.0001) viewVector.set(0.28, 0.2, 1);
    viewVector.normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const rightVector = new THREE.Vector3().crossVectors(worldUp, viewVector);
    if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0);
    rightVector.normalize();
    const upVector = new THREE.Vector3().crossVectors(viewVector, rightVector).normalize();
    const motifBraid = Number.isFinite(edge.motifBraid) ? edge.motifBraid : 0.52;
    const roleLift = edge.role === 'support' ? 0.78 : 1;
    const isFieldNodeWalk = document.body.dataset.focusPanelMode === 'field-node';
    const longArc =
        isFieldNodeWalk && edge.role === 'direct' ? THREE.MathUtils.clamp((spanLength - 0.18) / 0.34, 0, 1) : 0;
    const bendCap = isFieldNodeWalk ? 0.17 + longArc * 0.14 : 0.16;
    const bendFloor = isFieldNodeWalk ? 0.032 + longArc * 0.026 : 0.028;
    const bend = Math.min(bendCap, Math.max(bendFloor, spanLength * edge.curveLift * roleLift * (1 + longArc * 0.72)));
    const anchorPull = Number.isFinite(edge.anchorPull) ? edge.anchorPull : 0;
    const control = mid
        .addScaledVector(rightVector, bend * edge.side * (0.62 + motifBraid * 0.34 + longArc * 0.58))
        .addScaledVector(upVector, bend * (0.34 * edge.rise + longArc * 0.42))
        .addScaledVector(viewVector, bend * (edge.depth + longArc * 0.72));

    if (
        anchorPull > 0 &&
        Number.isFinite(state.navState.focusedIndex) &&
        state.nodePositions[state.navState.focusedIndex]
    ) {
        const anchor = state.nodePositions[state.navState.focusedIndex];
        const anchorVector = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
        const stem = anchorVector.lerp(mid, 0.42 + motifBraid * 0.16);
        control.lerp(stem, Math.min(0.44, anchorPull * (1 - longArc * 0.68)));
    }

    if (longArc > 0.01) {
        const curveCenter = start.clone().lerp(end, 0.5);
        const arcBias = bend * (0.92 + longArc * 0.72);
        const controlA = start
            .clone()
            .lerp(curveCenter, 0.42)
            .addScaledVector(rightVector, arcBias * edge.side * (0.78 + motifBraid * 0.28))
            .addScaledVector(upVector, arcBias * (0.3 + Math.max(0, edge.rise) * 0.28))
            .addScaledVector(viewVector, arcBias * 0.62);
        const controlB = end
            .clone()
            .lerp(curveCenter, 0.42)
            .addScaledVector(rightVector, arcBias * edge.side * (1.04 + motifBraid * 0.34))
            .addScaledVector(upVector, arcBias * (0.46 + longArc * 0.24))
            .addScaledVector(viewVector, arcBias * (0.82 + longArc * 0.3));
        const inv = 1 - t;
        return start
            .multiplyScalar(inv * inv * inv)
            .add(controlA.multiplyScalar(3 * inv * inv * t))
            .add(controlB.multiplyScalar(3 * inv * t * t))
            .add(end.multiplyScalar(t * t * t));
    }

    return start
        .multiplyScalar((1 - t) * (1 - t))
        .add(control.multiplyScalar(2 * (1 - t) * t))
        .add(end.multiplyScalar(t * t));
}

export function syncRuntimeState(snapshot = {}) {
    Object.entries(snapshot).forEach(([key, value]) => {
        state[key] = value;
    });
}

export function getRuntimeStateSnapshot() {
    return {
        navState: state.navState,
        targetPositions: state.targetPositions,
        focusPocketMotionByIndex: state.focusPocketMotionByIndex,
        focusPocketTransitionStartedAt: state.focusPocketTransitionStartedAt,
        nodesAreSettling: state.nodesAreSettling,
        autoRotate: state.autoRotate
    };
}

// Debug access
window._fp = {
    syncRuntimeState,
    getRuntimeStateSnapshot,
    getFocusConstellationMotif,
    getNeighborhoodPersonality,
    getFocusConstellationPlacement,
    getFocusConstellationViewportProfile,
    getFocusBeaconDeclutterProfile,
    getDeclutteredFocusBeaconIndices,
    getFocusViewBasis,
    getFocusThreadCurvePoint,
    buildFocusedPocketStagedPositions,
    buildFocusedSemanticPocket,
    applyLocalNeighborhoodFocus,
    applyFocusPocketBreathing
};
