import * as THREE from 'three';
import { state } from '../state.js';
import { webglContext } from './webgl-context.js';
import { SCENE_PALETTE } from './design-tokens.js';
import { computeOverviewScatterOffsets } from './utils/geo-data.js';
import { getThreadCategoryColor } from './utils/ui-presentation.js';
import { createSporeTexture, createFocusRingTexture, createFocusNextCueTexture } from './utils/three-textures.js';
import { seededUnit } from './utils/seeded-random.js';
import { CONFIG } from './config.js';
import { disposeObject3D } from './resource-tracker.js';

// ── Constants ───────────────────────────────────────────────────────────────

export const MYCELIUM_FIELD_SCALE = Object.freeze({
    x: 3.2,
    y: 2.6,
    z: 3.7
});

export const SCENE_ATMOSPHERE = Object.freeze({
    fogColor: SCENE_PALETTE.fog,
    fogDensity: 0.0028,
    clearAlpha: 1,
    toneExposure: 0.95,
    pointOpacityScale: 1.0,
    sporeOpacity: 0.65
});

const NODE_SPORE_BASE_RADIUS = 0.0019;
const NODE_SPORE_COLOR_LIFT = new THREE.Color(SCENE_PALETTE.sporeLift);
const THREAD_TINT_COLOR = SCENE_PALETTE.threadTint;

// Reduced segment counts: at the rendered size (~2 px) the lower-poly
// spheres read identically to the former 10x8 meshes but save ~60% of
// triangle throughput on the GPU.
const SPORE_SEGMENTS_VISIBLE = 6;   // was 10

const _nodeSporeObject = new THREE.Object3D();
const _nodeSporeColor = new THREE.Color();

// Per-cluster size factor: each cluster ID maps to a deterministic scale
// multiplier (0.82–1.18) so dense clusters have smaller individual nodes
// and sparse clusters have larger, more isolated ones.  Derived from
// seededUnit so the mapping is stable across frames and sessions.
const _clusterSizeCache = new Map();
function getClusterSizeFactor(clusterId) {
    if (_clusterSizeCache.has(clusterId)) return _clusterSizeCache.get(clusterId);
    // Map cluster ID to a 0.82–1.18 multiplier via seededUnit
    const factor = 0.82 + seededUnit(clusterId, 42.7) * 0.36;
    _clusterSizeCache.set(clusterId, factor);
    return factor;
}

// ── Texture tracking ─────────────────────────────────────────────────────────
// Canvas-backed CanvasTextures are GPU-heavy resources.  Track every
// instance created during createPoints() so they can be bulk-disposed
// on re-init or engine teardown without relying on individual state slots.
const _trackedTextures = [];

function trackTexture(texture) {
    if (texture) _trackedTextures.push(texture);
    return texture;
}

export function disposeTextures() {
    for (let i = _trackedTextures.length - 1; i >= 0; i -= 1) {
        if (_trackedTextures[i] && typeof _trackedTextures[i].dispose === 'function') {
            _trackedTextures[i].dispose();
        }
    }
    _trackedTextures.length = 0;
    // Also clear any stale state references
    if (state.focusBeaconTexture) { state.focusBeaconTexture = null; }
    if (state.focusRingTexture) { state.focusRingTexture = null; }
    if (state.focusNextCueTexture) { state.focusNextCueTexture = null; }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getNodeSporeScale(index) {
    let emphasis = 1;
    if (Number.isFinite(state.focusedNode)) {
        if (index === state.focusedNode) {
            // Bumped from 1.4 -> 2.4 so the focused anchor reads as visibly
            // larger than its neighbors in a dense cloud.  Combined with the
            // ring halo + gentle pulse from focus-anchor-indicator.js the
            // user can see at a glance which business the search returned.
            emphasis = 2.4;
        } else if (state.navState.focusPocketIndices?.includes(index)) {
            const role = state.navState.focusPocketRoleByIndex?.get(index);
            emphasis = role === 'primary' ? 1.3 : 1.15;
        } else {
            const trailNeighbors = state.navState.trailNeighborIndices || [];
            for (let i = 0; i < Math.min(12, trailNeighbors.length); i += 1) {
                if (trailNeighbors[i] === index) {
                    emphasis = 1.2;
                    break;
                }
            }
            if (emphasis === 1) emphasis = 0.62;
        }
    }
    if (index === state.hoverHighlightIndex) {
        emphasis = Math.max(emphasis, 1.45);
    }
    // Per-cluster size variation: dense clusters get slightly smaller nodes,
    // sparse clusters get larger ones.  Only applied when no focus/hover is
    // active so emphasis cues are not diluted.
    let clusterScale = 1;
    if (emphasis === 1 && state.points?.[index]) {
        const cluster = state.rawClustersBuffer?.[index] ?? state.points[index].cluster;
        if (Number.isFinite(cluster)) {
            clusterScale = getClusterSizeFactor(cluster);
        }
    }
    return NODE_SPORE_BASE_RADIUS * (0.86 + seededUnit(index, 2.7) * 0.48) * emphasis * clusterScale;
}

export function setNodeSporeInstanceMatrix(index, targetMesh = state.nodeSporeMesh, scaleMultiplier = 1) {
    const pos = state.nodePositions[index];
    if (!targetMesh || !pos) return;
    const base = getNodeSporeScale(index) * scaleMultiplier;
    _nodeSporeObject.position.set(pos.x, pos.y, pos.z);
    _nodeSporeObject.rotation.set(
        seededUnit(index, 3.1) * Math.PI,
        seededUnit(index, 4.2) * Math.PI * 2,
        seededUnit(index, 5.3) * Math.PI
    );
    _nodeSporeObject.scale.set(
        base * (0.94 + seededUnit(index, 6.4) * 0.12),
        base * (0.94 + seededUnit(index, 7.5) * 0.12),
        base * (0.94 + seededUnit(index, 8.6) * 0.12)
    );
    _nodeSporeObject.updateMatrix();
    targetMesh.setMatrixAt(index, _nodeSporeObject.matrix);
}

export function getNodeSporeColor(index, factor = 1) {
    const colorOffset = index * 3;
    const baseR = state.pointBaseColors?.[colorOffset] ?? 0.45;
    const baseG = state.pointBaseColors?.[colorOffset + 1] ?? 0.82;
    const baseB = state.pointBaseColors?.[colorOffset + 2] ?? 0.78;
    const lift = 0.015 + seededUnit(index, 9.7) * 0.045;
    return _nodeSporeColor
        .setRGB(baseR, baseG, baseB)
        .lerp(NODE_SPORE_COLOR_LIFT, lift)
        .multiplyScalar(THREE.MathUtils.clamp(factor, 0.04, 2.6));
}

export function getPointBoundsCenter(points, positionBuffer = null) {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let count = 0;

    if (positionBuffer && positionBuffer.length >= points.length * 3) {
        const len = points.length;
        for (let i = 0; i < len; i += 1) {
            const x = positionBuffer[i * 3];
            const y = positionBuffer[i * 3 + 1];
            const z = positionBuffer[i * 3 + 2];
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            if (x < min.x) min.x = x;
            if (y < min.y) min.y = y;
            if (z < min.z) min.z = z;
            if (x > max.x) max.x = x;
            if (y > max.y) max.y = y;
            if (z > max.z) max.z = z;
            count += 1;
        }
    } else {
        points.forEach((point) => {
            const x = Number(point?.x);
            const y = Number(point?.y);
            const z = Number(point?.z);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
            if (x < min.x) min.x = x;
            if (y < min.y) min.y = y;
            if (z < min.z) min.z = z;
            if (x > max.x) max.x = x;
            if (y > max.y) max.y = y;
            if (z > max.z) max.z = z;
            count += 1;
        });
    }

    if (!count) {
        return {
            center: new THREE.Vector3(0, 0, 0),
            min: new THREE.Vector3(0, 0, 0),
            max: new THREE.Vector3(0, 0, 0),
            count: 0
        };
    }

    return {
        center: min.clone().add(max).multiplyScalar(0.5),
        min,
        max,
        count
    };
}

export function compilePointMaterialForReadiness() {
    if (!state.renderer || !state.scene || !state.camera || !state.pointsMaterial) return;
    state.pointsMaterial.needsUpdate = true;
    try {
        if (typeof state.renderer.compile === 'function') {
            state.renderer.compile(state.scene, state.camera);
        }
        if (!state.pointsMaterial.userData.shader) {
            state.renderer.render(state.scene, state.camera);
        }
    } catch (error) {
        console.warn('Semantic point shader precompile failed:', error);
    }
}

function createPointShaderUniforms() {
    return {
        uGlowIntensity: { value: 0.0 },
        uRippleTime: { value: -1000.0 },
        uRippleCenter: { value: new THREE.Vector3(0, 0, 0) },
        uHoverNodePos: { value: new THREE.Vector3(0, 0, 0) },
        uHoverBoost: { value: 1.0 },
        uHoverRadius: { value: 0.12 },
        uRevealProgress: { value: 1.0 }
    };
}

function installPointMaterialShader(material) {
    const uniforms = createPointShaderUniforms();
    material.userData.shader = { uniforms };
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float uRippleTime;
uniform vec3 uRippleCenter;
uniform vec3 uHoverNodePos;
uniform float uHoverBoost;
uniform float uHoverRadius;
uniform float uRevealProgress;
varying float vSemanticPointBoost;`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
float semanticHoverDistance = distance(position, uHoverNodePos);
float semanticHoverMask = 1.0 - smoothstep(0.0, uHoverRadius, semanticHoverDistance);
float semanticRippleMask = max(0.0, 1.0 - abs((uRippleTime - distance(position, uRippleCenter) * 2.0)) * 2.5);
vSemanticPointBoost = max(0.08, uRevealProgress) * max(0.55, mix(1.0, uHoverBoost, semanticHoverMask) + semanticRippleMask * 0.38);`
            )
            .replace(
                'gl_PointSize = clamp(size, 1.0, 128.0);',
                'gl_PointSize = clamp(size * vSemanticPointBoost, 1.0, 128.0);'
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float uGlowIntensity;
uniform float uRevealProgress;
varying float vSemanticPointBoost;`
            )
            .replace(
                'outgoingLight = diffuseColor.rgb;',
                `// Soft circle mask: eliminates the default square sprite look.
float _ptDist = length(gl_PointCoord - vec2(0.5));
float _ptAlpha = 1.0 - smoothstep(0.28, 0.5, _ptDist);
diffuseColor.a *= _ptAlpha;
diffuseColor.a *= clamp(uRevealProgress * clamp(vSemanticPointBoost, 0.55, 1.85), 0.0, 1.0);
outgoingLight = diffuseColor.rgb + vec3(0.18, 0.62, 0.56) * uGlowIntensity * 0.12;`
            );
        material.userData.shader = shader;
    };
}

// ── Public API ──────────────────────────────────────────────────────────────

export function disposeNodeVisuals() {
    if (state.pointsMesh) {
        disposeObject3D(state.pointsMesh);
        state.pointsMesh = null;
    }
    if (state.nodeSporeMesh) {
        disposeObject3D(state.nodeSporeMesh);
        state.nodeSporeMesh = null;
    }
    if (state.nodeSporeHitMesh) {
        disposeObject3D(state.nodeSporeHitMesh);
        state.nodeSporeHitMesh = null;
    }
    // Dispose all tracked GPU canvas textures via the array-based
    // tracker (covers focusBeacon, focusRing, focusNextCue, and any
    // future textures added via trackTexture()).
    disposeTextures();

    // Also clean webglContext intermediary used by the TS module
    webglContext.pointsMesh = null;
    webglContext.pointsMaterial = null;
    webglContext.nodeSporeMesh = null;
    webglContext.nodeSporeHitMesh = null;
    webglContext.nodeSporeMaterial = null;
    webglContext.focusBeaconTexture = null;
    webglContext.focusRingTexture = null;
    webglContext.focusNextCueTexture = null;
}

export function createNodeSporeLayer() {
    if (!state.scene || !state.points?.length || !state.nodePositions?.length) return;
    const sporeGeo = new THREE.SphereGeometry(1, SPORE_SEGMENTS_VISIBLE, SPORE_SEGMENTS_VISIBLE - 1);
    const sporeMat = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0x2a8a7a,
        emissiveIntensity: 0.55,
        shininess: 58,
        transparent: true,
        opacity: SCENE_ATMOSPHERE.sporeOpacity,
        vertexColors: true,
        blending: THREE.NormalBlending,
        depthWrite: false
    });
    const sporeMesh = new THREE.InstancedMesh(sporeGeo, sporeMat, state.points.length);
    sporeMesh.name = 'node-spore-instanced-field';
    sporeMesh.frustumCulled = true;
    sporeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    state.nodeSporeMesh = sporeMesh;
    state.nodeSporeMaterial = sporeMat;
    webglContext.nodeSporeMesh = sporeMesh;
    webglContext.nodeSporeMaterial = sporeMat;
    for (let i = 0; i < state.points.length; i += 1) {
        setNodeSporeInstanceMatrix(i, sporeMesh);
        sporeMesh.setColorAt(i, getNodeSporeColor(i, 1.62));
    }
    if (sporeMesh.instanceColor) sporeMesh.instanceColor.needsUpdate = true;
    sporeMesh.instanceMatrix.needsUpdate = true;
    sporeMesh.visible = true;
    state.scene.add(sporeMesh);
}

export function createPoints() {
    disposeNodeVisuals();
    if (!state.points || !state.points.length) return;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    state.nodePositions = [];
    state.targetPositions = [];
    state.originalPositions = [];
    state.pointBaseColors = new Float32Array(state.points.length * 3);
    state.pointColorStateVersion += 1;
    state.searchGlowRenderStateKey = '';
    const scatterOffsets = computeOverviewScatterOffsets(state.points);
    const bounds = getPointBoundsCenter(state.points, state.rawPositionsBuffer);
    const renderCenter = bounds.center;
    state.overviewBounds = {
        sourceMin: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
        sourceMax: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
        sourceCenter: { x: renderCenter.x, y: renderCenter.y, z: renderCenter.z },
        renderCenterOffset: { x: -renderCenter.x, y: -renderCenter.y, z: -renderCenter.z },
        count: bounds.count
    };

    state.focusBeaconTexture = trackTexture(createSporeTexture(THREE));
    state.focusRingTexture = trackTexture(createFocusRingTexture(THREE));
    state.focusNextCueTexture = trackTexture(createFocusNextCueTexture(THREE));

    const hasRawBuffers = state.rawPositionsBuffer && state.rawClustersBuffer && state.rawClustersBuffer.length === state.points.length;

    state.points.forEach((point, i) => {
        const scatter = scatterOffsets[i] || { x: 0, y: 0, z: 0 };
        let px, py, pz, cluster;

        if (hasRawBuffers) {
            px = state.rawPositionsBuffer[i * 3];
            py = state.rawPositionsBuffer[i * 3 + 1];
            pz = state.rawPositionsBuffer[i * 3 + 2];
            cluster = state.rawClustersBuffer[i];
        } else {
            px = Number.isFinite(point.x) ? point.x : 0;
            py = Number.isFinite(point.y) ? point.y : 0;
            pz = Number.isFinite(point.z) ? point.z : 0;
            cluster = point.cluster;
        }

        const fx = (px - renderCenter.x + scatter.x) * MYCELIUM_FIELD_SCALE.x;
        const fy = (py - renderCenter.y + scatter.y) * MYCELIUM_FIELD_SCALE.y;
        const fz = (pz - renderCenter.z + scatter.z) * MYCELIUM_FIELD_SCALE.z;
        positions.push(fx, fy, fz);

        // Store for dynamic animation
        state.nodePositions.push({x: fx, y: fy, z: fz});
        state.targetPositions.push({x: fx, y: fy, z: fz});
        state.originalPositions.push({x: fx, y: fy, z: fz});

        const color = getThreadCategoryColor(cluster, CONFIG.COLORS).lerp(new THREE.Color(THREAD_TINT_COLOR), 0.005);
        const radialDepth = Math.sqrt(fx * fx + fy * fy + fz * fz);
        const depthFactor = THREE.MathUtils.clamp(1.16 - radialDepth * 0.14, 0.82, 1.12);
        const colorOffset = i * 3;
        color.offsetHSL(0, 0.045, -0.01);
        const baseR = Math.min(1, color.r * depthFactor * 1.18 + 0.018);
        const baseG = Math.min(1, color.g * depthFactor * 1.18 + 0.022);
        const baseB = Math.min(1, color.b * depthFactor * 1.18 + 0.019);

        state.pointBaseColors[colorOffset] = baseR;
        state.pointBaseColors[colorOffset + 1] = baseG;
        state.pointBaseColors[colorOffset + 2] = baseB;
        colors.push(baseR, baseG, baseB);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    state.pointsMaterial = new THREE.PointsMaterial({
        size: CONFIG.POINTS_MATERIAL_BASE_SIZE,
        vertexColors: true,
        transparent: true,
        opacity: SCENE_ATMOSPHERE.pointOpacityScale,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    installPointMaterialShader(state.pointsMaterial);

    const pointsMesh = new THREE.Points(geometry, state.pointsMaterial);
    pointsMesh.name = 'points-instanced-field';
    pointsMesh.frustumCulled = false;
    state.scene.add(pointsMesh);

    state.pointsMesh = pointsMesh;
    webglContext.pointsMesh = pointsMesh;
    webglContext.pointsMaterial = state.pointsMaterial;
    createCountyOutline({ min: bounds.min, max: bounds.max, center: renderCenter });

    createNodeSporeLayer();
}

/**
 * Draws a 4-segment line at the X-Y plane of the point cloud's bounding box.
 * This is an approximation of the county outline (which we don't have as
 * GeoJSON); the actual geographic outline would replace this with the
 * real boundary polygon. Until then, the bounding box gives the cloud
 * a clear sense of "where the county is" instead of a free-floating
 * starfield.
 */
function createCountyOutline({ min, max, center }) {
    if (!state.scene) return;
    const existing = state.scene.getObjectByName('county-outline');
    if (existing) {
        state.scene.remove(existing);
        existing.geometry?.dispose?.();
        existing.material?.dispose?.();
    }
    if (!min || !max) return;
    const inset = 0.02;
    const minX = (min.x - center.x) * MYCELIUM_FIELD_SCALE.x + inset;
    const maxX = (max.x - center.x) * MYCELIUM_FIELD_SCALE.x - inset;
    const minY = (min.y - center.y) * MYCELIUM_FIELD_SCALE.y + inset;
    const maxY = (max.y - center.y) * MYCELIUM_FIELD_SCALE.y - inset;
    const centerZ = 0;
    const points = [
        new THREE.Vector3(minX, minY, centerZ),
        new THREE.Vector3(maxX, minY, centerZ),
        new THREE.Vector3(maxX, maxY, centerZ),
        new THREE.Vector3(minX, maxY, centerZ),
        new THREE.Vector3(minX, minY, centerZ)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0x4ecdc4,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
    });
    const line = new THREE.LineLoop(geometry, material);
    line.name = 'county-outline';
    state.scene.add(line);
}
