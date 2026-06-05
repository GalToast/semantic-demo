import * as THREE from 'three';
import { getSemanticDiveMode, getFocusedNode, getCurrentView } from '../state/selectors/index.js';
import { getCurrentSearchSummary, getPoints, getNodePositions } from '../state/selectors/index.js';
import { getColors, getClusterNames, getCamera } from '../state/selectors/index.js';
import { subscribe, EVENTS } from './event-bus.js';
import { isMobileViewport } from './environment.js';

let _labelElements = new Map();
let _clusterCentroids = new Map();
let _clusterStats = new Map();
let _clusterIndices = new Map();

function getLabelMode() {
    if (getSemanticDiveMode()) return 'inside';
    if (getFocusedNode() !== null && getFocusedNode() !== undefined) return 'focus';
    if (getCurrentSearchSummary()) return 'search';
    return 'overview';
}

function getActiveCluster() {
    const focusIndex = Number.isFinite(getFocusedNode())
        ? getFocusedNode()
        : Number.isFinite(getCurrentSearchSummary()?.anchorIndex)
            ? getCurrentSearchSummary().anchorIndex
            : null;
    const point = Number.isFinite(focusIndex) ? getPoints()?.[focusIndex] : null;
    return Number.isFinite(point?.cluster) ? point.cluster : null;
}

function getLabelPresentation(dist) {
    const scale = Math.max(0.62, Math.min(1.15, 1.8 / (dist + 0.45)));
    let depthOpacity = 1.0;
    if (dist < 0.6) {
        depthOpacity = Math.max(0.0, (dist - 0.28) / 0.32);
    } else if (dist > 3.0) {
        depthOpacity = Math.max(0.28, 1.0 - (dist - 3.0) / 2.6);
    }
    return { scale, depthOpacity };
}

function getModePresentation(mode, isActive, isContext) {
    if (mode === 'search') {
        return {
            visible: isActive,
            scale: 0.8,
            opacity: isActive ? 1.0 : 0
        };
    }

    if (mode === 'focus' || mode === 'inside') {
        return {
            visible: isActive || isContext,
            scale: isActive ? 1.0 : 0.8,
            opacity: isActive ? 1.0 : 0.6
        };
    }

    return {
        visible: true,
        scale: 1.0,
        opacity: 0.8
    };
}

function formatLabelText(text) {
    const compact = String(text || '')
        .replace(/\s*&\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return compact.length > 22 ? compact.slice(0, 22) : compact;
}

export function initClusterLabels() {
    const points = getPoints();
    if (!points || !points.length) return;

    const container = document.getElementById('scene-container');
    if (!container) return;

    // 1. Calculate centroids
    const sums = new Map();
    _clusterCentroids.clear();
    _clusterStats.clear();
    _clusterIndices.clear();
    const positions = getNodePositions();
    points.forEach((point, i) => {
        const pos = positions[i];
        if (!pos) return;
        if (!sums.has(point.cluster)) {
            sums.set(point.cluster, { x: 0, y: 0, z: 0, count: 0 });
        }
        if (!_clusterIndices.has(point.cluster)) {
            _clusterIndices.set(point.cluster, []);
        }
        _clusterIndices.get(point.cluster).push(i);
        const s = sums.get(point.cluster);
        s.x += pos.x;
        s.y += pos.y;
        s.z += pos.z;
        s.count++;
    });

    sums.forEach((s, cluster) => {
        _clusterCentroids.set(cluster, new THREE.Vector3(s.x / s.count, s.y / s.count, s.z / s.count));
        _clusterStats.set(cluster, { count: s.count });
    });

    // 2. Create DOM Elements
    // Clean up old elements
    _labelElements.forEach(el => {
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    });
    _labelElements.clear();

    _clusterCentroids.forEach((pos, cluster) => {
        const clusterNames = getClusterNames();
        const colors = getColors();
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

export function updateClusterLabels() {
    const camera = getCamera();
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

    // Use a projection matrix to map 3D positions to 2D screen space
    const widthHalf = window.innerWidth / 2;
    const heightHalf = window.innerHeight / 2;

    _clusterCentroids.forEach((pos, cluster) => {
        const el = _labelElements.get(cluster);
        if (!el) return;

        // Check distance - hide if too close (overwhelming) or too far (pointless)
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

            // Project to 2D
            const vec = pos.clone();

            // Add sinusoidal floating animation based on time and cluster index
            const floatOffset = Math.sin(performance.now() * 0.0014 + cluster * 7.0) * 0.015;
            vec.y += floatOffset;

            vec.project(camera);

            // Check if behind camera
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
            el.style.opacity = modePresentation.opacity * depthOpacity;
        } else {
            el.classList.toggle('visible', false);
        }
    });
}

export function syncClusterSectionState() {
    // Left empty as it was mobile DOM specific
}

// Event Bus Subscriptions
subscribe(EVENTS.VIEW_CHANGED, () => {
    syncClusterSectionState();
});
