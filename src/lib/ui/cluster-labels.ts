/**
 * @lib/ui/cluster-labels.ts — Per-cluster text labels in the 3D galaxy view
 *
 * Port of js/modules/cluster-labels.ts.
 * Renders and animates per-cluster text labels in the 3D galaxy view.
 */
import * as THREE from 'three';
import {
    getSemanticDiveMode,
    getFocusedNode,
    getCurrentView,
    getCurrentSearchSummary,
    getPoints,
    getNodePositions,
    getColors,
    getClusterNames,
    getCamera,
} from '@lib/engine/state-selectors-bridge';
import { subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { getViewportSize, isMobileViewport } from '@lib/utils/environment';

interface ClusterStats {
    count: number;
}

interface LabelPresentation {
    scale: number;
    depthOpacity: number;
}

interface ModePresentation {
    visible: boolean;
    scale: number;
    opacity: number;
}

let _labelElements: Map<number, HTMLElement> = new Map();
let _clusterCentroids: Map<number, THREE.Vector3> = new Map();
let _clusterStats: Map<number, ClusterStats> = new Map();
let _clusterIndices: Map<number, number[]> = new Map();

function getLabelMode(): string {
    if (getSemanticDiveMode()) return 'inside';
    if (getFocusedNode() !== null && getFocusedNode() !== undefined) return 'focus';
    if (getCurrentSearchSummary()) return 'search';
    return 'overview';
}

function getActiveCluster(): number | null {
    const focusedNode = getFocusedNode();
    const searchSummary = getCurrentSearchSummary() as unknown as { anchorIndex?: number } | null;
    const focusIndex = Number.isFinite(focusedNode)
        ? focusedNode
        : Number.isFinite(searchSummary?.anchorIndex)
            ? searchSummary!.anchorIndex
            : null;
    const points = getPoints() as Array<{ cluster?: number }> | undefined;
    const point = Number.isFinite(focusIndex) && points ? points[focusIndex as number] : null;
    return Number.isFinite(point?.cluster) ? point!.cluster! : null;
}

function getLabelPresentation(dist: number): LabelPresentation {
    const scale = Math.max(0.62, Math.min(1.15, 1.8 / (dist + 0.45)));
    let depthOpacity = 1.0;
    if (dist < 0.6) {
        depthOpacity = Math.max(0.0, (dist - 0.28) / 0.32);
    } else if (dist > 3.0) {
        depthOpacity = Math.max(0.28, 1.0 - (dist - 3.0) / 2.6);
    }
    return { scale, depthOpacity };
}

function getModePresentation(mode: string, isActive: boolean, isContext: boolean): ModePresentation {
    if (mode === 'search') {
        return { visible: isActive, scale: 0.8, opacity: isActive ? 1.0 : 0 };
    }
    if (mode === 'focus' || mode === 'inside') {
        return {
            visible: isActive || isContext,
            scale: isActive ? 1.0 : 0.8,
            opacity: isActive ? 1.0 : 0.6
        };
    }
    return { visible: true, scale: 1.0, opacity: 0.8 };
}

function formatLabelText(text: string): string {
    const compact = String(text || '')
        .replace(/\s*&\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return compact.length > 22 ? compact.slice(0, 22) : compact;
}

export function initClusterLabels(): void {
    const points = getPoints() as Array<{ cluster: number }> | undefined;
    if (!points || !points.length) return;

    const container = document.getElementById('scene-container');
    if (!container) return;

    const sums = new Map<number, { x: number; y: number; z: number; count: number }>();
    _clusterCentroids.clear();
    _clusterStats.clear();
    _clusterIndices.clear();
    const positions = getNodePositions() as Array<{ x: number; y: number; z: number }> | undefined;
    points.forEach((point, i) => {
        const pos = positions?.[i];
        if (!pos) return;
        if (!sums.has(point.cluster)) {
            sums.set(point.cluster, { x: 0, y: 0, z: 0, count: 0 });
        }
        if (!_clusterIndices.has(point.cluster)) {
            _clusterIndices.set(point.cluster, []);
        }
        _clusterIndices.get(point.cluster)!.push(i);
        const s = sums.get(point.cluster)!;
        s.x += pos.x;
        s.y += pos.y;
        s.z += pos.z;
        s.count++;
    });

    sums.forEach((s, cluster) => {
        _clusterCentroids.set(cluster, new THREE.Vector3(s.x / s.count, s.y / s.count, s.z / s.count));
        _clusterStats.set(cluster, { count: s.count });
    });

    _labelElements.forEach(el => {
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    });
    _labelElements.clear();

    _clusterCentroids.forEach((_pos, cluster) => {
        const clusterNames = getClusterNames() as string[];
        const colors = getColors() as string[];
        const labelText = clusterNames[cluster] || `Cluster ${cluster}`;
        const color = colors?.[cluster % colors.length] || '#ffffff';

        const el = document.createElement('div');
        el.className = 'galaxy-cluster-label';

        const dot = document.createElement('div');
        dot.className = 'galaxy-cluster-label-dot';
        dot.style.color = color;
        dot.style.backgroundColor = color;

        const textNode = document.createTextNode(formatLabelText(labelText));

        el.appendChild(dot);
        el.appendChild(textNode);

        container.appendChild(el);
        _labelElements.set(cluster, el);
    });
}

export function updateClusterLabels(): void {
    const camera = getCamera() as THREE.PerspectiveCamera | null;
    if (getCurrentView() !== 'galaxy' || !_labelElements.size || !camera) {
        _labelElements.forEach(el => {
            el.classList.toggle('visible', false);
        });
        return;
    }

    const mode = getLabelMode();
    const suppressMobileLabels = isMobileViewport();
    if (suppressMobileLabels) {
        _labelElements.forEach(el => {
            el.classList.toggle('visible', false);
        });
        return;
    }

    const activeCluster = getActiveCluster();
    const cameraPos = camera.position;

    const { width: innerWidth, height: innerHeight } = getViewportSize();
    const widthHalf = innerWidth / 2;
    const heightHalf = innerHeight / 2;

    _clusterCentroids.forEach((pos, cluster) => {
        const el = _labelElements.get(cluster);
        if (!el) return;

        const dist = cameraPos.distanceTo(pos);
        const distanceFade = dist > 0.28 && dist < 5.8;

        if (distanceFade) {
            const isActive = activeCluster !== null && cluster === activeCluster;
            const isContext = activeCluster !== null && !isActive;
            const modePresentation = getModePresentation(mode, isActive, isContext);

            if (!modePresentation.visible) {
                el.classList.toggle('visible', false);
                return;
            }

            const { scale, depthOpacity } = getLabelPresentation(dist);
            const finalScale = scale * modePresentation.scale * (isActive ? 1.06 : 1.0);

            const vec = pos.clone();
            const floatOffset = Math.sin(performance.now() * 0.0014 + cluster * 7.0) * 0.015;
            vec.y += floatOffset;
            vec.project(camera);

            if (vec.z > 1) {
                el.classList.toggle('visible', false);
                return;
            }

            const x = (vec.x * widthHalf) + widthHalf;
            const y = -(vec.y * heightHalf) + heightHalf;

            el.classList.toggle('visible', true);
            el.classList.toggle('is-active', isActive);
            el.classList.toggle('is-context', isContext);
            el.dataset.labelMode = mode;

            el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${finalScale})`;
            el.style.opacity = String(modePresentation.opacity * depthOpacity);
        } else {
            el.classList.toggle('visible', false);
        }
    });
}

export function syncClusterSectionState(): void {
    // Left empty as it was mobile DOM specific
}

subscribe(EVENTS.VIEW_CHANGED, () => {
    syncClusterSectionState();
});
