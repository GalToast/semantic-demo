/**
 * js/modules/journey-point-color.ts
 *
 * TypeScript shadow of journey-point-color.js.
 * Point color management: filter colors, thread lens description.
 */
import * as THREE from 'three';
import { state as _state } from '../state.ts';
import { publish, EVENTS } from '@lib/orchestration/event-bus';
import { describeCluster } from './utils/ui-presentation.ts';
import { formatBusinessName } from './utils/dom-formatters.ts';
import { isPointVisible } from './utils/geo-data.ts';

const state = _state as any;
const nodeSporeSyncColor = new THREE.Color();

function toIndexArray(value: unknown): number[] {
    if (Array.isArray(value)) return value.filter(Number.isFinite);
    if (value instanceof Set) return Array.from(value).filter(Number.isFinite) as number[];
    if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
        return Array.from(value as Iterable<unknown>).filter(Number.isFinite) as number[];
    }
    return [];
}

function syncNodeSporeColorsFromPointColors(): void {
    if (!state.nodeSporeMesh || !state.pointsMesh?.geometry?.attributes?.color) return;
    const colors = (state.pointsMesh as any).geometry.attributes.color.array;
    for (let i = 0; i < state.points.length; i++) {
        const colorOffset = i * 3;
        nodeSporeSyncColor.setRGB(
            Math.min(1, colors[colorOffset] * 1.62),
            Math.min(1, colors[colorOffset + 1] * 1.62),
            Math.min(1, colors[colorOffset + 2] * 1.62)
        );
        (state.nodeSporeMesh as any).setColorAt(i, nodeSporeSyncColor);
    }
    if ((state.nodeSporeMesh as any).instanceColor) (state.nodeSporeMesh as any).instanceColor.needsUpdate = true;
}

export function applyPointFilterColors(): void {
    if (!state.pointsMesh || !state.pointBaseColors) return;
    const trailNeighborIndices = toIndexArray(state.navState.trailNeighborIndices);
    const focusPocketIndices = toIndexArray(state.navState.focusPocketIndices);
    const walkHistoryIndices = toIndexArray(state.navState.walkHistoryIndices);
    const colorStateKey = [
        state.filterVersion,
        state.navState.mode || 'overview',
        state.navState.focusedIndex ?? 'none',
        state.focusedNode ?? 'none',
        state.trailDepth ?? 0,
        state.myceliumMode || 'default',
        state.navState.threadSource || 'none',
        trailNeighborIndices.slice(0, 12).join(','),
        focusPocketIndices.slice(0, 18).join(','),
        walkHistoryIndices.slice(-6).join(',')
    ].join('|');
    if (state.filterColorStateKey === colorStateKey) return;
    const colors = (state.pointsMesh as any).geometry.attributes.color.array;
    const focusLocalIndices = state.navState.focusedIndex !== null
        ? new Set([
            state.navState.focusedIndex,
            ...trailNeighborIndices.slice(0, 12),
            ...focusPocketIndices
        ])
        : new Set<number>();

    const historySet = new Set(walkHistoryIndices);

    if (!state.points || !state.pointBaseColors || (state.pointBaseColors as any).length < state.points.length * 3) return;
    const signalScores: number[] = (state as any).signalScores || [];
    const bridgeScores: number[] = (state as any).bridgeScores || [];

    for (let i = 0; i < state.points.length; i++) {
        const colorOffset = i * 3;
        const baseR = (state.pointBaseColors as any)[colorOffset] ?? 0;
        const baseG = (state.pointBaseColors as any)[colorOffset + 1] ?? 0;
        const baseB = (state.pointBaseColors as any)[colorOffset + 2] ?? 0;
        const visible = isPointVisible(i, state.points, null, state.activeFilters);
        const isVisited = historySet.has(i);
        let factor = visible ? 1 : 0.08;
        if (visible) {
            const nodeMinFloor = 0.65;
            if (state.navState.focusedIndex !== null) {
                const semanticFocus = state.navState.threadSource === 'semantic';
                if (state.navState.mode === 'trail') {
                    factor = (state as any).trailIndices.size
                        ? ((state as any).trailIndices.has(i) ? (i === state.navState.focusedIndex ? 2.14 : (semanticFocus ? 1.74 : 1.48)) : (isVisited ? 1.18 : (semanticFocus ? 0.24 : 0.18)))
                        : (isVisited ? 1.18 : 0.28);
                } else {
                    const inPocket = focusPocketIndices.includes(i);
                    const role = state.navState.focusPocketRoleByIndex?.get(i);
                    const raw = focusLocalIndices.has(i)
                        ? (i === state.navState.focusedIndex
                            ? 3.18
                            : (role === 'primary'
                                ? 2.52
                                : (role === 'support'
                                    ? 1.78
                                    : (inPocket ? 2.1 : (semanticFocus ? 1.8 : 1.34)))))
                        : (isVisited ? 1.28 : (semanticFocus ? 0.32 : 0.22));
                    factor = Math.max(raw, nodeMinFloor);
                }
            } else if (state.myceliumMode === 'bloom') {
                factor = (state as any).bloomIndices.has(i)
                    ? 1.08
                    : Math.max(0.22, Math.min(0.66, 0.30 + (signalScores[i] ?? 0) * 0.08));
            } else if (state.myceliumMode === 'bridge') {
                factor = (state as any).bridgeIndices.has(i) ? 1.38 : Math.max(0.16, Math.min(0.88, 0.22 + (bridgeScores[i] ?? 0) * 0.32));
            } else if (state.myceliumMode === 'trail') {
                factor = (state as any).trailIndices.size
                    ? ((state as any).trailIndices.has(i) ? (i === state.focusedNode ? 1.48 : 1.18) : 0.12)
                    : 0.34;
            }
        }
        colors[colorOffset] = baseR * factor;
        colors[colorOffset + 1] = baseG * factor;
        colors[colorOffset + 2] = baseB * factor;
    }
    (state.pointsMesh as any).geometry.attributes.color.needsUpdate = true;
    (state as any).pointColorStateVersion += 1;
    (state as any).filterColorVersion = state.filterVersion;
    (state as any).filterColorStateKey = colorStateKey;
    syncNodeSporeColorsFromPointColors();
    if (state.searchGlowActive && state.searchGlowIndices && state.searchGlowIndices.size > 0) {
        (state as any).searchGlowRenderStateKey = '';
        const topIndex = (state as any).searchGlowTopIndex ?? (state.searchGlowIndices.values().next().value ?? -1);
        const topPoint = Number.isFinite(topIndex) ? state.points[topIndex] : null;
        publish(EVENTS.SEARCH_STATUS_SYNC_REQUESTED, {
            point: topPoint,
            options: { fromSearchResult: true, skipTraversalUiUpdate: true }
        });
    }
}

export function describeThreadLensForPoint(point: any): string {
    if (!point) return 'Waiting for a semantic thread.';

    const leadId = point.lead_id !== undefined && point.lead_id !== null
        ? String(point.lead_id).trim()
        : null;

    const neighborRecord = leadId && state.semanticNeighborMapByLeadId
        ? state.semanticNeighborMapByLeadId.get(leadId)
        : null;

    if (!neighborRecord) {
        const mode = state.myceliumMode || 'default';
        const clusterLabel = describeCluster(point.cluster);
        const LENS_BY_MODE: Record<string, string> = {
            bloom: 'Signal-rich — surfaced for businesses with a website plus email or phone',
            bridge: 'Between neighborhoods — highlighted for businesses linking neighborhoods',
            trail: 'Connection Trail — focused on semantic neighbors of ' + (point.name ? formatBusinessName(point.name) : 'the focused business'),
            default: clusterLabel ? clusterLabel + ' neighborhood' : 'County View'
        };
        const base = (LENS_BY_MODE[mode] ?? LENS_BY_MODE.default)!;
        if (point.status === 'disqualified') return 'Archive layer — ' + base;
        return base;
    }

    const neighborCount = Array.isArray(neighborRecord.neighbors) ? neighborRecord.neighbors.length : 0;
    const clusterLabel = describeCluster(point.cluster);

    if (neighborCount === 0) {
        return 'Isolated node — no semantic connections yet.';
    }
    if (neighborCount <= 3) {
        return 'Sparse node — only ' + neighborCount + ' connection' + (neighborCount === 1 ? '' : 's') + '.';
    }
    if (neighborCount >= 20) {
        const anchorWord = clusterLabel ? clusterLabel : 'County';
        return 'Strong anchor in ' + anchorWord + ' cluster with ' + neighborCount + ' semantic neighbors.';
    }
    return 'Connected node — ' + neighborCount + ' semantic neighbors in ' + (clusterLabel || 'local') + ' cluster.';
}
