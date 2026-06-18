/**
 * @lib/journey/semantic-overlay.ts — Focus-stage semantic thread overlay rendering
 *
 * Ported from: js/modules/journey-semantic-overlay.ts
 * GLSL-enhanced Line2 material for semantic thread visualization.
 */

import { state } from '@lib/engine/state-bridge';
import { subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { Vector3, Color, AdditiveBlending, Float32BufferAttribute } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { isPointVisible } from '@lib/utils/geo-data';
import { getThreadCandidatesForIndex } from '@lib/journey/thread-model';
import { getCurrentTrailFocusIndex, getNextWalkCandidateForIndex } from '@lib/journey/neighborhood';
import { getFocusThreadCurvePoint } from '@lib/journey/focus-pocket';
import { prefersReducedMotion } from '@lib/utils/environment';
import { CLUSTER_COLORS, FOCUS_SEMANTIC_COLORS } from '@lib/utils/design-tokens';
import { getLineSegmentCount } from '@lib/journey/webgl-utils';
import { registerDiagnosticProbe } from '@lib/utils/diagnostic-adapter';

const _state = state as any;

// Phase 3: Declarative synchronization
subscribe(EVENTS.CAMERA_NODE_FOCUSED, () => {
    refreshFocusSemanticOverlay();
});

export function resetFocusThreadDiagnostics(reason: string = 'inactive'): void {
    _state.focusThreadDiagnostics = {
        active: false,
        reason,
        edgeCount: 0,
        directEdgeCount: 0,
        supportEdgeCount: 0,
        subduedEdgeCount: 0,
        segmentCount: 0,
        vertexCount: 0,
        overlayNodeCount: 0,
        nextCueSegments: 0,
        denseBundleMode: false,
        buildMs: 0,
        avgFrameMs: _state.focusFrameDiagnostics?.avgFrameMs || 0,
        maxFrameMs: _state.focusFrameDiagnostics?.maxFrameMs || 0
    };
}

export function removeFocusSemanticOverlay(): void {
    if (!_state.focusSemanticLines) return;
    const parent = _state.focusSemanticLines.parent || _state.myceliumGroup || _state.scene;
    if (parent) parent.remove(_state.focusSemanticLines);
    _state.focusSemanticLines.geometry?.dispose?.();
    _state.focusSemanticLines.material?.dispose?.();
    _state.focusSemanticLines = null;
    _state.focusSemanticConnectionPairs = [];
}

function getFocusCurvePointLocal(edge: any, t: number): Vector3 {
    if (typeof getFocusThreadCurvePoint === 'function') {
        return getFocusThreadCurvePoint(edge, t);
    }
    const a = _state.nodePositions[edge.a];
    const b = _state.nodePositions[edge.b];
    if (!a || !b) return new Vector3();
    const ax = Number.isFinite(a.x) ? a.x : 0;
    const ay = Number.isFinite(a.y) ? a.y : 0;
    const az = Number.isFinite(a.z) ? a.z : 0;
    const bx = Number.isFinite(b.x) ? b.x : 0;
    const by = Number.isFinite(b.y) ? b.y : 0;
    const bz = Number.isFinite(b.z) ? b.z : 0;
    return new Vector3(ax, ay, az).lerp(new Vector3(bx, by, bz), t);
}

function buildFocusThreadLineMaterial(): any {
    const baseOpacity = _state.navState.focusPocketMeta?.active ? 0.18 : 0.24;
    const lineMaterial = new LineMaterial({
        linewidth: 1.35,
        transparent: true,
        opacity: baseOpacity,
        vertexColors: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending
    } as any);
    (lineMaterial as any).uniforms.time = { value: performance.now() / 1000 };
    (lineMaterial as any).uniforms.semanticScore = { value: 0.5 };
    (lineMaterial as any).uniforms.reducedMotion = { value: prefersReducedMotion() ? 1 : 0 };
    (lineMaterial as any).uniforms.denseBundleMode = { value: 0 };
    (lineMaterial as any).userData.shader = { uniforms: (lineMaterial as any).uniforms };

    (lineMaterial as any).onBeforeCompile = (shader: any) => {
        shader.vertexShader = shader.vertexShader.replace(
            'void main() {',
            `attribute float progress;
            attribute float cue;
            attribute float priority;
            attribute float lane;
            void main() {`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_pars_vertex>',
            `#include <color_pars_vertex>
            varying float vProgress;
            varying float vCue;
            varying float vPriority;
            varying float vLane;`
        );
        shader.vertexShader = shader.vertexShader.replace(
            'gl_Position = clip;',
            `vProgress = progress;
            vCue = cue;
            vPriority = priority;
            vLane = lane;
            gl_Position = clip;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            'uniform float opacity;',
            `uniform float opacity;
            uniform float time;
            uniform float semanticScore;
            uniform float reducedMotion;
            uniform float denseBundleMode;
            varying float vProgress;
            varying float vCue;
            varying float vPriority;
            varying float vLane;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, alpha );',
            `vec4 diffuseColor = vec4( diffuse, alpha );

            vec3 teal = vec3(0.43, 1.0, 0.91);
            vec3 gold = vec3(1.0, 0.85, 0.38);
            vec3 pearl = vec3(0.92, 1.0, 0.96);

            vec3 gradientColor = mix(teal, gold, smoothstep(0.18, 0.92, vProgress));
            vec3 baseColor = mix(diffuseColor.rgb, gradientColor, 0.58);

            float motionScale = 1.0 - step(0.5, reducedMotion);
            float denseScale = 1.0 - step(0.5, denseBundleMode) * 0.72;
            float flow = fract(vProgress - time * 0.82 * motionScale);
            float pulseFreq = 0.52 + (semanticScore * 1.6);
            float sporeFlow = fract(vProgress - time * pulseFreq * motionScale + abs(vLane) * 0.08);
            float sporeSize = 1.8 + (semanticScore * 3.2);
            float spore = pow(1.0 - abs(sporeFlow - 0.58) * 2.0, sporeSize) * motionScale * denseScale;
            float bead = pow(1.0 - abs(flow - 0.58) * 2.0, 3.0) * motionScale * denseScale;
            float breath = mix(1.0, 0.78 + sin(time * 2.4 + vLane * 2.2) * 0.16, motionScale * denseScale);

            vec3 finalColor = mix(baseColor, pearl, spore * 0.36);
            vec3 cueColor = vec3(1.0, 0.82, 0.34);
            finalColor = mix(finalColor, cueColor, vCue * (0.42 + bead * 0.1));
            float priorityFloor = mix(0.16, 0.72, smoothstep(0.18, 1.0, vPriority));
            alpha = diffuseColor.a * breath * priorityFloor
                + spore * 0.06
                + bead * 0.025
                + vCue * 0.055
                + semanticScore * 0.045;
            diffuseColor = vec4(finalColor, min(alpha, 0.42));`
        );

        shader.uniforms.time = (lineMaterial as any).uniforms.time;
        shader.uniforms.semanticScore = (lineMaterial as any).uniforms.semanticScore;
        shader.uniforms.reducedMotion = (lineMaterial as any).uniforms.reducedMotion;
        shader.uniforms.denseBundleMode = (lineMaterial as any).uniforms.denseBundleMode;

        (lineMaterial as any).userData.shader = shader;
    };

    return lineMaterial;
}

function getActiveNextFocusIndex(): number | null {
    const focusedIndex = Number.isFinite(_state.navState.focusedIndex)
        ? _state.navState.focusedIndex
        : getCurrentTrailFocusIndex(_state.navState.focusedIndex ?? null);
    if (!Number.isFinite(focusedIndex)) return null;
    const candidate = getNextWalkCandidateForIndex(focusedIndex, {
        requireSemantic: _state.currentView === 'galaxy',
        requireOnCanvas: _state.currentView === 'galaxy'
    });
    if (!candidate) return null;
    return Number.isFinite(candidate.index) ? candidate.index : null;
}

export function refreshFocusSemanticOverlay(): void {
    const startedAt = performance.now();
    removeFocusSemanticOverlay();
    resetFocusThreadDiagnostics('refreshing');

    const focusLineParent = _state.myceliumGroup || _state.scene;
    if (!focusLineParent) {
        resetFocusThreadDiagnostics('no-mycelium');
        return;
    }
    if (!Number.isFinite(_state.navState.focusedIndex)) {
        resetFocusThreadDiagnostics('no-focus');
        return;
    }
    if (_state.navState.threadSource !== 'semantic') {
        resetFocusThreadDiagnostics('non-semantic-thread');
        return;
    }

    const focusIndex = _state.navState.focusedIndex;
    const nextFocusIndex = getActiveNextFocusIndex();
    const focusPointAtFocus = (Number.isFinite(focusIndex) && focusIndex >= 0 && focusIndex < _state.points.length) ? _state.points[focusIndex] : null;
    const focusCluster = focusPointAtFocus?.cluster ?? 0;
    const semanticCandidates = (_state.navState.threadCandidates || [])
        .filter((candidate: any) => candidate?.source === 'semantic' && candidate.index !== focusIndex)
        .filter((candidate: any) => isPointVisible(candidate.index, _state.points, null, _state.activeFilters))
        .slice(0, 10);
    const roleByIndex = _state.navState.focusPocketRoleByIndex instanceof Map
        ? _state.navState.focusPocketRoleByIndex
        : new Map();
    const roleBudgets: Record<string, number> = { primary: 12, support: 6, halo: 3, trail: 4 };
    const roleOrder: Record<string, number> = { primary: 0, support: 1, halo: 2, trail: 3 };
    const roleCounts: Record<string, number> = { primary: 0, support: 0, halo: 0, trail: 0 };
    const pocketThreadIndices = (_state.navState.focusPocketIndices || [])
        .filter((index: number) => Number.isFinite(index) && index !== focusIndex)
        .sort((a: number, b: number) => {
            const roleA = roleByIndex.get(a) || 'trail';
            const roleB = roleByIndex.get(b) || 'trail';
            return (roleOrder[roleA] ?? 4) - (roleOrder[roleB] ?? 4);
        })
        .filter((index: number) => {
            const role = roleByIndex.get(index) || 'trail';
            const budget = roleBudgets[role] ?? roleBudgets.trail;
            const count = roleCounts[role] ?? 0;
            if (count >= (budget ?? 0)) return false;
            roleCounts[role] = count + 1;
            return true;
        });
    const pocketThreadSet = new Set(pocketThreadIndices);
    const stagedSemanticIndices = semanticCandidates
        .map((candidate: any) => candidate.index)
        .filter((index: number) => pocketThreadSet.has(index));
    const overlayIndices = [...new Set([
        nextFocusIndex,
        ...pocketThreadIndices,
        ...stagedSemanticIndices
    ])].filter((index): index is number => Number.isFinite(index) && index !== focusIndex);

    if (!overlayIndices.length) {
        resetFocusThreadDiagnostics('empty-overlay');
        return;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const progress: number[] = [];
    const cue: number[] = [];
    const priority: number[] = [];
    const lane: number[] = [];
    const semanticScore: number[] = [];
    const localEdgeKeys = new Set<string>();
    const pocketSet = new Set(_state.navState.focusPocketIndices || []);
    const focusColor = new Color((CLUSTER_COLORS as any)[focusCluster % (CLUSTER_COLORS as any).length]).lerp(new Color((FOCUS_SEMANTIC_COLORS as any).focusLerp), 0.42);
    const cueColor = new Color((FOCUS_SEMANTIC_COLORS as any).cue);
    let nextCueSegments = 0;
    let directEdgeCount = 0;
    let supportEdgeCount = 0;
    let subduedEdgeCount = 0;

    const addEdge = (a: number, b: number, role: string = 'direct', edgePriority: number = 0.66): void => {
        const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (localEdgeKeys.has(edgeKey)) return;
        if (!_state.nodePositions[a] || !_state.nodePositions[b]) return;
        localEdgeKeys.add(edgeKey);
        if (role === 'direct') directEdgeCount += 1;
        else supportEdgeCount += 1;
        if (edgePriority < 0.42) subduedEdgeCount += 1;

        const isNextEdge = Number.isFinite(nextFocusIndex)
            && ((a === focusIndex && b === nextFocusIndex) || (b === focusIndex && a === nextFocusIndex));
        const candidateCluster = _state.points[b]?.cluster ?? focusCluster;
        const candidateColor = new Color((CLUSTER_COLORS as any)[candidateCluster % (CLUSTER_COLORS as any).length]).lerp(
            isNextEdge ? cueColor : new Color((FOCUS_SEMANTIC_COLORS as any).candidate),
            isNextEdge ? 0.58 : 0.24
        );
        const edge = {
            a,
            b,
            side: ((a * 31 + b * 17) % 2 === 0) ? 1 : -1,
            rise: (((a + b) % 5) - 2) / 2 || 0.45,
            depth: role === 'direct' ? 0.9 : 0.42,
            curveLift: role === 'direct' ? (pocketSet.has(b) ? 0.68 : 0.54) : 0.34,
            motifBraid: 0.56,
            anchorPull: role === 'direct' ? 0.14 : 0.24,
            role,
            priority: edgePriority
        };

        for (let segment = 0; segment < _state.FOCUS_THREAD_SEGMENTS; segment += 1) {
            const t0 = segment / _state.FOCUS_THREAD_SEGMENTS;
            const t1 = (segment + 1) / _state.FOCUS_THREAD_SEGMENTS;
            const segmentEdge = { ...edge, t0, t1, cue: isNextEdge ? 1 : 0 };
            _state.focusSemanticConnectionPairs.push(segmentEdge);
            const p0 = getFocusCurvePointLocal(segmentEdge, t0);
            const p1 = getFocusCurvePointLocal(segmentEdge, t1);
            const c0 = focusColor.clone().lerp(candidateColor, t0);
            const c1 = focusColor.clone().lerp(candidateColor, t1);
            if (isNextEdge) {
                c0.lerp(cueColor, 0.34);
                c1.lerp(cueColor, 0.44);
                nextCueSegments += 1;
            }
            positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
            progress.push(t0, t1);
            cue.push(isNextEdge ? 1 : 0, isNextEdge ? 1 : 0);
            priority.push(edgePriority, edgePriority);
            lane.push(edge.side, edge.side);
            semanticScore.push(edgePriority, edgePriority);
        }
    };

    const getPocketEdgePriority = (index: number, order: number): number => {
        const role = roleByIndex.get(index);
        if (role === 'primary') return 0.78;
        if (role === 'support') return 0.54;
        if (role === 'halo') return 0.34;
        return pocketSet.has(index) ? 0.62 : 0.58 - order * 0.025;
    };

    overlayIndices.forEach((index: number, order: number) => {
        const isNext = index === nextFocusIndex;
        const pocketRole = roleByIndex.get(index);
        const edgeRole = pocketRole === 'support' || pocketRole === 'halo' ? 'support' : 'direct';
        addEdge(focusIndex, index, edgeRole, isNext ? 1 : getPocketEdgePriority(index, order));
    });

    overlayIndices.slice(0, 3).forEach((index: number) => {
        getThreadCandidatesForIndex(index)
            .filter((candidate: any) => overlayIndices.includes(candidate.index) && candidate.index !== focusIndex)
            .slice(0, 1)
            .forEach((candidate: any) => addEdge(index, candidate.index, 'support', 0.28));
    });

    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(positions);
    lineGeometry.setColors(colors);

    lineGeometry.setAttribute('progress', new Float32BufferAttribute(progress, 1));
    lineGeometry.setAttribute('cue', new Float32BufferAttribute(cue, 1));
    lineGeometry.setAttribute('priority', new Float32BufferAttribute(priority, 1));
    lineGeometry.setAttribute('lane', new Float32BufferAttribute(lane, 1));
    lineGeometry.setAttribute('semanticScore', new Float32BufferAttribute(semanticScore, 1));

    const denseBundleMode = overlayIndices.length >= 6 ? 1 : 0;
    const lineMaterial = buildFocusThreadLineMaterial();
    (lineMaterial as any).userData.denseBundleMode = denseBundleMode;
    const avgSemanticScore = semanticScore.length > 0
        ? semanticScore.reduce((s: number, v: number) => s + v, 0) / semanticScore.length
        : 0.5;
    if ((lineMaterial as any).userData?.shader) {
        (lineMaterial as any).userData.shader.uniforms.semanticScore.value = avgSemanticScore;
        (lineMaterial as any).userData.shader.uniforms.denseBundleMode.value = denseBundleMode;
    }
    if ((lineMaterial as any).uniforms?.semanticScore) {
        (lineMaterial as any).uniforms.semanticScore.value = avgSemanticScore;
    }
    if ((lineMaterial as any).uniforms?.denseBundleMode) {
        (lineMaterial as any).uniforms.denseBundleMode.value = denseBundleMode;
    }

    _state.focusSemanticLines = new Line2(lineGeometry, lineMaterial);
    _state.focusSemanticLines.computeLineDistances();
    _state.focusSemanticLines.userData = {
        focusedIndex: focusIndex,
        nextIndex: Number.isFinite(nextFocusIndex) ? nextFocusIndex : null,
        nextCueSegments,
        edgeCount: localEdgeKeys.size,
        directEdgeCount,
        supportEdgeCount,
        subduedEdgeCount,
        segmentCount: _state.focusSemanticConnectionPairs.length,
        vertexCount: positions.length / 3,
        overlayNodeCount: overlayIndices.length,
        parentKind: _state.myceliumGroup ? 'mycelium' : 'scene',
        denseBundleMode,
        buildMs: performance.now() - startedAt
    };
    _state.focusFrameDiagnostics = {
        lastFrameAt: 0,
        sampleCount: 0,
        avgFrameMs: 0,
        maxFrameMs: 0
    };
    _state.focusThreadDiagnostics = {
        active: true,
        reason: 'built',
        edgeCount: localEdgeKeys.size,
        directEdgeCount,
        supportEdgeCount,
        subduedEdgeCount,
        segmentCount: _state.focusSemanticConnectionPairs.length,
        vertexCount: positions.length / 3,
        overlayNodeCount: overlayIndices.length,
        parentKind: _state.myceliumGroup ? 'mycelium' : 'scene',
        denseBundleMode: denseBundleMode === 1,
        nextCueSegments,
        buildMs: performance.now() - startedAt,
        avgFrameMs: 0,
        maxFrameMs: 0
    };
    focusLineParent.add(_state.focusSemanticLines);
}

export function updateFocusSemanticOverlayPositions(now: number = performance.now()): void {
    const line = _state.focusSemanticLines;
    const pairs = _state.focusSemanticConnectionPairs || [];
    if (!line?.geometry?.attributes?.instanceStart || !pairs.length) return;
    const reducedMotion = prefersReducedMotion();
    const startAttr = line.geometry.attributes.instanceStart;
    const endAttr = line.geometry.attributes.instanceEnd;
    let offset = 0;
    pairs.forEach((edge: any) => {
        const p0 = getFocusCurvePointLocal(edge, edge.t0);
        const p1 = getFocusCurvePointLocal(edge, edge.t1);
        startAttr.array[offset] = Number.isFinite(p0.x) ? p0.x : 0;
        startAttr.array[offset + 1] = Number.isFinite(p0.y) ? p0.y : 0;
        startAttr.array[offset + 2] = Number.isFinite(p0.z) ? p0.z : 0;
        endAttr.array[offset] = Number.isFinite(p1.x) ? p1.x : 0;
        endAttr.array[offset + 1] = Number.isFinite(p1.y) ? p1.y : 0;
        endAttr.array[offset + 2] = Number.isFinite(p1.z) ? p1.z : 0;
        offset += 3;
    });
    startAttr.needsUpdate = true;
    endAttr.needsUpdate = true;
    if (line.material?.userData?.shader) {
        line.material.userData.shader.uniforms.reducedMotion.value = reducedMotion ? 1 : 0;
        line.material.userData.shader.uniforms.denseBundleMode.value = line.userData?.denseBundleMode ? 1 : 0;
        if (!reducedMotion) {
            line.material.userData.shader.uniforms.time.value = now / 1000;
        }
    }
    if (!reducedMotion && line.material?.uniforms?.time) {
        line.material.uniforms.time.value = now / 1000;
    }
    if (line.material?.uniforms?.reducedMotion) {
        line.material.uniforms.reducedMotion.value = reducedMotion ? 1 : 0;
    }
    if (line.material?.uniforms?.denseBundleMode) {
        line.material.uniforms.denseBundleMode.value = line.userData?.denseBundleMode ? 1 : 0;
    }
}

export function getSemanticFocusCueProbeSnapshot(): Record<string, unknown> {
    return {
        visible: !!_state.focusSemanticLines && !!_state.focusThreadDiagnostics?.active,
        threadSource: _state.navState.threadSource || null,
        focusedIndex: Number.isFinite(_state.navState.focusedIndex) ? _state.navState.focusedIndex : null,
        nextIndex: Number.isFinite(_state.focusSemanticLines?.userData?.nextIndex) ? _state.focusSemanticLines.userData.nextIndex : null,
        lineNextIndex: Number.isFinite(_state.focusSemanticLines?.userData?.nextIndex) ? _state.focusSemanticLines.userData.nextIndex : null,
        nextCueSegments: _state.focusSemanticLines?.userData?.nextCueSegments || _state.focusThreadDiagnostics?.nextCueSegments || 0,
        focusThreadSegments: getLineSegmentCount(_state.focusSemanticLines),
        threadDiagnostics: { ...(_state.focusThreadDiagnostics || {}) }
    };
}

// Window exposures for inline scripts and compatibility
if (typeof window !== 'undefined') {
    registerDiagnosticProbe('__semanticFocusCueProbe', getSemanticFocusCueProbeSnapshot);
}
