/**
 * journey-arrival-handoff.ts
 * Canonical TS module — preserves export/import parity with the prior
 * journey-arrival-handoff.js twin.
 */
import { state } from '../state.ts';
import * as THREE from 'three';
import { ROUTE_TRACE_COLORS } from './design-tokens.ts';
import {
    ARRIVAL_HANDOFF_SEGMENT_STEPS,
    disposeLineObject,
    getNodeVector,
    getArcPoint,
    pushArcSegments,
    getLineSegmentCount
} from './journey-webgl-utils.ts';

export function removeArrivalHandoffOverlay(): void {
    if (!state.arrivalHandoffGroup) return;
    const scene = state.scene as { remove?: (obj: any) => void } | null;
    scene?.remove?.(state.arrivalHandoffGroup);
    const group = state.arrivalHandoffGroup as { traverse?: (cb: (child: any) => void) => void };
    group.traverse?.((child: any) => disposeLineObject(child));
    state.arrivalHandoffGroup = null;
    state.arrivalHandoffDiagnostics = {
        active: false,
        fromIndex: null,
        targetIndex: null,
        phase: 'idle',
        segmentCount: 0,
        endpointCount: 0,
        opacity: 0
    };
}

export function buildArrivalHandoffOverlay(fromIndex: number, targetIndex: number): void {
    const from = getNodeVector(fromIndex);
    const to = getNodeVector(targetIndex);
    const scene = state.scene as { add?: (obj: any) => void } | null;
    if (!from || !to || !scene?.add) return;
    removeArrivalHandoffOverlay();
    const group = new THREE.Group();
    group.name = 'arrival-memory-strand';
    group.userData = { fromIndex, targetIndex };
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color(ROUTE_TRACE_COLORS.cue);
    [-1, 0, 1, 2].forEach((side) => {
        pushArcSegments(positions, colors, fromIndex, targetIndex, color, {
            steps: ARRIVAL_HANDOFF_SEGMENT_STEPS,
            lift: 0.16,
            side: side * 0.42
        });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
    group.add(new THREE.LineSegments(geometry, material));
    scene.add(group);
    state.arrivalHandoffGroup = group;
    state.arrivalHandoffDiagnostics = {
        active: true,
        fromIndex,
        targetIndex,
        phase: state.strandContinuityState.phase,
        segmentCount: getLineSegmentCount((group.children as any[])[0]),
        endpointCount: 2,
        opacity: material.opacity
    };
}

export function disposeArrivalHandoffOverlay(): void {
    removeArrivalHandoffOverlay();
}

export function syncArrivalHandoffOverlay(): void {
    const phase = state.strandContinuityState?.phase;
    const fromIndex = state.strandContinuityState?.fromIndex;
    const targetIndex = state.strandContinuityState?.targetIndex;
    if (!['exploring', 'arrived'].includes(phase) || !Number.isFinite(fromIndex) || !Number.isFinite(targetIndex)) {
        removeArrivalHandoffOverlay();
        return;
    }
    const existing = (state.arrivalHandoffGroup as any)?.userData || {};
    if (
        !state.arrivalHandoffGroup
        || existing.fromIndex !== fromIndex
        || existing.targetIndex !== targetIndex
    ) {
        buildArrivalHandoffOverlay(fromIndex!, targetIndex!);
    }
    updateArrivalHandoffOverlay();
}

export function updateArrivalHandoffOverlay(): void {
    const group = state.arrivalHandoffGroup as any;
    const phase = state.strandContinuityState?.phase;
    if (!group || !['exploring', 'arrived'].includes(phase)) {
        if (group) removeArrivalHandoffOverlay();
        return;
    }
    const line = group.children?.[0];
    const fromIndex = group.userData?.fromIndex;
    const targetIndex = group.userData?.targetIndex;
    const from = getNodeVector(fromIndex);
    const to = getNodeVector(targetIndex);
    if (!line?.geometry?.attributes?.position || !from || !to) return;
    const positions = line.geometry.attributes.position.array as Float32Array;
    let offset = 0;
    [-1, 0, 1, 2].forEach((side) => {
        for (let segment = 0; segment < ARRIVAL_HANDOFF_SEGMENT_STEPS; segment += 1) {
            const p0 = getArcPoint(from, to, segment / ARRIVAL_HANDOFF_SEGMENT_STEPS, 0.16, side * 0.42);
            const p1 = getArcPoint(from, to, (segment + 1) / ARRIVAL_HANDOFF_SEGMENT_STEPS, 0.16, side * 0.42);
            if (p0 && p1) {
                positions[offset++] = p0.x;
                positions[offset++] = p0.y;
                positions[offset++] = p0.z;
                positions[offset++] = p1.x;
                positions[offset++] = p1.y;
                positions[offset++] = p1.z;
            }
        }
    });
    line.geometry.attributes.position.needsUpdate = true;
    const age = Math.max(0, performance.now() - (state.strandContinuityState.startedAt || performance.now()));
    const opacity = phase === 'exploring'
        ? 0.5
        : THREE.MathUtils.clamp(0.5 - Math.max(0, age - 650) / 6200, 0.12, 0.5);
    line.material.opacity = opacity;
    state.arrivalHandoffDiagnostics = {
        active: true,
        fromIndex,
        targetIndex,
        phase,
        segmentCount: getLineSegmentCount(line),
        endpointCount: 2,
        opacity
    };
}
