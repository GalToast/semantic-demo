import * as THREE from 'three';
import { state } from '../state.js';

let _labelElements = new Map();
let _clusterCentroids = new Map();
let _clusterStats = new Map();
let _clusterIndices = new Map();

const LABEL_BUDGETS = {
    overview: { desktop: 8, mobile: 3 },
    search: { desktop: 5, mobile: 2 },
    focus: { desktop: 1, mobile: 1 },
    inside: { desktop: 3, mobile: 1 }
};

function getLabelMode() {
    if (state.semanticDiveMode || document.body?.dataset.semanticDive === 'active') return 'inside';
    if (state.focusedNode !== null && state.focusedNode !== undefined) return 'focus';
    if (state.currentSearchSummary) return 'search';
    return 'overview';
}

function getActiveCluster() {
    const focusIndex = Number.isFinite(state.focusedNode)
        ? state.focusedNode
        : Number.isFinite(state.currentSearchSummary?.anchorIndex)
            ? state.currentSearchSummary.anchorIndex
            : null;
    const point = Number.isFinite(focusIndex) ? state.points?.[focusIndex] : null;
    return Number.isFinite(point?.cluster) ? point.cluster : null;
}

function getRectForLabel(x, y, el, mode, isMobile) {
    const width = Math.max(80, el.offsetWidth || 128);
    const height = Math.max(24, el.offsetHeight || 34);
    const padding = isMobile ? 14 : (mode === 'overview' ? 18 : 22);
    return {
        left: x - width / 2 - padding,
        right: x + width / 2 + padding,
        top: y - height / 2 - padding,
        bottom: y + height / 2 + padding
    };
}

function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function getClusterScreenAnchor(cluster, fallbackPos, widthHalf, heightHalf, sampleBudget = 72) {
    const indices = _clusterIndices.get(cluster) || [];
    if (!indices.length) return null;

    const step = Math.max(1, Math.ceil(indices.length / sampleBudget));
    let xSum = 0;
    let ySum = 0;
    let visibleCount = 0;
    const scratch = new THREE.Vector3();

    for (let i = 0; i < indices.length; i += step) {
        const nodePos = state.nodePositions[indices[i]];
        if (!nodePos) continue;
        scratch.copy(nodePos).project(state.camera);
        if (scratch.z >= 1 || Math.abs(scratch.x) >= 1.08 || Math.abs(scratch.y) >= 1.08) continue;
        xSum += (scratch.x * widthHalf) + widthHalf;
        ySum += -(scratch.y * heightHalf) + heightHalf;
        visibleCount += 1;
    }

    if (visibleCount > 0) {
        return {
            x: xSum / visibleCount,
            y: ySum / visibleCount,
            visibleCount
        };
    }

    const fallback = fallbackPos.clone().project(state.camera);
    if (fallback.z >= 1 || Math.abs(fallback.x) >= 1.08 || Math.abs(fallback.y) >= 1.08) return null;
    return {
        x: (fallback.x * widthHalf) + widthHalf,
        y: -(fallback.y * heightHalf) + heightHalf,
        visibleCount: 0
    };
}

export function initClusterLabels() {
    if (!state.points || !state.points.length) return;

    // 1. Calculate centroids
    const sums = new Map();
    _clusterCentroids.clear();
    _clusterStats.clear();
    _clusterIndices.clear();
    state.points.forEach((point, i) => {
        const pos = state.nodePositions[i];
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

    // 2. Create elements
    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Clean up old labels
    _labelElements.forEach(el => el.remove());
    _labelElements.clear();

    _clusterCentroids.forEach((pos, cluster) => {
        const labelText = state.CLUSTER_NAMES[cluster] || `Cluster ${cluster}`;
        const el = document.createElement('div');
        el.className = 'galaxy-cluster-label';
        el.innerHTML = `${labelText}<span class="galaxy-cluster-label-dot"></span>`;

        el.addEventListener('pointerenter', () => {
            state.hoveredCluster = cluster;
        });
        el.addEventListener('pointerleave', () => {
            if (state.hoveredCluster === cluster) {
                state.hoveredCluster = null;
            }
        });

        container.appendChild(el);
        _labelElements.set(cluster, el);
    });
}

export function updateClusterLabels() {
    if (state.currentView !== 'galaxy' || !_labelElements.size || !state.camera) {
        _labelElements.forEach(el => el.classList.remove('visible'));
        return;
    }

    const widthHalf = window.innerWidth / 2;
    const heightHalf = window.innerHeight / 2;
    const cameraPos = state.camera.position;
    const mode = getLabelMode();
    const activeCluster = getActiveCluster();
    const isMobile = window.innerWidth <= 720;
    const budget = LABEL_BUDGETS[mode]?.[isMobile ? 'mobile' : 'desktop'] || 4;
    const candidates = [];

    _clusterCentroids.forEach((pos, cluster) => {
        const el = _labelElements.get(cluster);
        if (!el) return;

        // Check distance - hide if too close (overwhelming) or too far (pointless)
        const dist = cameraPos.distanceTo(pos);
        const distanceFade = dist > 0.28 && dist < 5.8;
        const anchor = getClusterScreenAnchor(
            cluster,
            pos,
            widthHalf,
            heightHalf,
            mode === 'overview' ? 120 : 72
        );

        if (anchor && distanceFade) {
            const x = anchor.x;
            const y = anchor.y;
            const isActive = activeCluster !== null && cluster === activeCluster;
            const stats = _clusterStats.get(cluster) || { count: 0 };
            const normalizedX = (x - widthHalf) / widthHalf;
            const normalizedY = (heightHalf - y) / heightHalf;
            const centerPull = 1 - Math.min(1, Math.hypot(normalizedX, normalizedY) / 1.15);
            let score = stats.count * 0.02 + centerPull * 2.2 + (1 / Math.max(0.2, dist));
            score += Math.min(1.8, anchor.visibleCount * 0.08);
            if (isActive) score += 100;
            if (mode === 'search' && isActive) score += 20;
            if (mode === 'focus' && !isActive) score -= 0.8;
            if (mode === 'inside' && !isActive) score -= 1.4;

            candidates.push({
                cluster,
                el,
                x,
                y,
                score,
                isActive,
                rect: getRectForLabel(x, y, el, mode, isMobile)
            });
        } else {
            el.classList.remove('visible');
        }
    });

    const accepted = [];
    const seenTexts = new Set();
    candidates
        .sort((a, b) => b.score - a.score)
        .forEach((candidate) => {
            const text = state.CLUSTER_NAMES[candidate.cluster] || `Cluster ${candidate.cluster}`;
            if (seenTexts.has(text)) return;

            const collides = accepted.some((placed) => rectsOverlap(candidate.rect, placed.rect));
            if (collides && !candidate.isActive) return;
            if (accepted.length >= budget && !candidate.isActive) return;

            seenTexts.add(text);
            accepted.push(candidate);
        });

    const visibleClusters = new Set(accepted.map((candidate) => candidate.cluster));
    _labelElements.forEach((el, cluster) => {
        const candidate = accepted.find((item) => item.cluster === cluster);
        el.classList.toggle('visible', visibleClusters.has(cluster));
        el.classList.toggle('is-active', !!candidate?.isActive);
        el.classList.toggle('is-context', !!candidate && !candidate.isActive);
        el.dataset.labelMode = mode;
        if (candidate) {
            // Calculate distance to camera to apply depth-based scaling and fading
            const pos = _clusterCentroids.get(cluster);
            let scale = 1.0;
            let depthOpacity = 1.0;
            if (pos && state.camera) {
                const dist = state.camera.position.distanceTo(pos);
                scale = Math.max(0.62, Math.min(1.15, 1.8 / (dist + 0.45)));
                if (dist < 0.6) {
                    depthOpacity = Math.max(0.0, (dist - 0.28) / 0.32);
                } else if (dist > 3.0) {
                    depthOpacity = Math.max(0.28, 1.0 - (dist - 3.0) / 2.6);
                }
            }

            // Sinusoidal floating animation based on time and cluster index
            const floatOffset = Math.sin(performance.now() * 0.0014 + cluster * 7.0) * 4.0;

            el.style.transform = `translate(-50%, -50%) translate(${candidate.x}px, ${candidate.y + floatOffset}px) scale(${scale.toFixed(3)})`;

            // Multiply base opacity with depth opacity
            const baseOpacity = candidate.isActive ? 1.0 : (candidate.isContext ? 0.58 : 0.88);
            el.style.opacity = (baseOpacity * depthOpacity).toFixed(3);

            el.style.color = state.COLORS?.[cluster % state.COLORS.length] || '';
        }
    });
}

export function syncClusterSectionState() {
    const clusterSection = document.getElementById('cluster-section');
    if (clusterSection && window.innerWidth <= 768) {
        clusterSection.open = false;
    }
}

window.initClusterLabels = initClusterLabels;
window.updateClusterLabels = updateClusterLabels;
