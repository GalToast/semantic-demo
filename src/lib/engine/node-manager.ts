/**
 * @lib/engine/node-manager.ts — TypeScript port of js/modules/three-node-manager.ts
 *
 * Creates the instanced point-cloud and spore field for the 3D semantic mycelium.
 * Preserves the exact same public API as the legacy module.
 *
 * Import strategy:
 *   - @lib/*   for engine-local and utility modules with TS ports
 *   - @legacy/* for modules still owned by the legacy tree
 */

import * as THREE from 'three';
import { state as _state } from /* @vite-ignore */ '@legacy/state';
const state = _state as any;
import { webglContext } from './webgl-context';
import { SCENE_PALETTE } from './design-tokens';
import { computeOverviewScatterOffsets } from '@lib/utils/geo-data';
import { getThreadCategoryColor } from '@lib/utils/ui-presentation';
import { createSporeTexture, createFocusRingTexture, createFocusNextCueTexture } from '@lib/utils/three-textures';
import { seededUnit } from '@lib/utils/seeded-random';
import { CONFIG } from './config';
import { disposeObject3D } from './resource-tracker';

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
    toneExposure: 0.78,
    pointOpacityScale: 1.0,
    sporeOpacity: 0.05
});

const NODE_SPORE_BASE_RADIUS = 0.0019;
const NODE_SPORE_COLOR_LIFT = new THREE.Color(SCENE_PALETTE.sporeLift);
const THREAD_TINT_COLOR = SCENE_PALETTE.threadTint;

const SPORE_SEGMENTS_VISIBLE = 6;
const SPORE_SEGMENTS_HIT_PROXY = 4;

const _nodeSporeObject = new THREE.Object3D();
const _nodeSporeColor = new THREE.Color();
const _trackedTextures: THREE.Texture[] = [];

function trackTexture<T extends THREE.Texture>(texture: T): T {
    _trackedTextures.push(texture);
    return texture;
}

export function disposeTextures(): void {
    for (let i = _trackedTextures.length - 1; i >= 0; i -= 1) {
        _trackedTextures[i]?.dispose();
    }
    _trackedTextures.length = 0;
    webglContext.focusBeaconTexture = null;
    webglContext.focusRingTexture = null;
    webglContext.focusNextCueTexture = null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getNodeSporeScale(index: any) {
    let emphasis = 1;
    if (Number.isFinite(state.focusedNode)) {
        if (index === state.focusedNode) {
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
    return NODE_SPORE_BASE_RADIUS * (0.86 + seededUnit(index, 2.7) * 0.48) * emphasis;
}

export function setNodeSporeInstanceMatrix(index: number, targetMesh: THREE.InstancedMesh | null = webglContext.nodeSporeMesh, scaleMultiplier = 1) {
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
    const hitProxy = webglContext.nodeSporeHitMesh;
    if (targetMesh === webglContext.nodeSporeMesh && hitProxy) {
        const hitBase = NODE_SPORE_BASE_RADIUS * (0.86 + seededUnit(index, 2.7) * 0.48) * 1.85;
        _nodeSporeObject.position.set(pos.x, pos.y, pos.z);
        _nodeSporeObject.scale.set(hitBase, hitBase, hitBase);
        _nodeSporeObject.updateMatrix();
        hitProxy.setMatrixAt(index, _nodeSporeObject.matrix);
    }
}

export function getNodeSporeColor(index: any, factor = 1) {
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

export function getPointBoundsCenter(points: Array<{ x?: number; y?: number; z?: number }>, positionBuffer: Float32Array | null = null) {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let count = 0;

    if (positionBuffer && positionBuffer.length >= points.length * 3) {
        const len = points.length;
        for (let i = 0; i < len; i += 1) {
            const rawX = positionBuffer[i * 3];
            const rawY = positionBuffer[i * 3 + 1];
            const rawZ = positionBuffer[i * 3 + 2];
            if (rawX === undefined || rawY === undefined || rawZ === undefined) continue;
            const x = Number(rawX);
            const y = Number(rawY);
            const z = Number(rawZ);
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
        points.forEach((point: { x?: number; y?: number; z?: number }) => {
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
    if (!webglContext.renderer || !webglContext.scene || !webglContext.camera || !webglContext.pointsMaterial) return;
    webglContext.pointsMaterial.needsUpdate = true;
    try {
        if (typeof webglContext.renderer.compile === 'function') {
            webglContext.renderer.compile(webglContext.scene, webglContext.camera);
        }
        if (!webglContext.pointsMaterial.userData.shader) {
            webglContext.renderer.render(webglContext.scene, webglContext.camera);
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

function installPointMaterialShader(material: any) {
    const uniforms = createPointShaderUniforms();
    material.userData.shader = { uniforms };
    material.onBeforeCompile = (shader: any) => {
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
    if (webglContext.pointsMesh) {
        disposeObject3D(webglContext.pointsMesh);
        webglContext.pointsMesh = null;
    }
    if (webglContext.nodeSporeMesh) {
        disposeObject3D(webglContext.nodeSporeMesh);
        webglContext.nodeSporeMesh = null;
    }
    if (webglContext.nodeSporeHitMesh) {
        disposeObject3D(webglContext.nodeSporeHitMesh);
        webglContext.nodeSporeHitMesh = null;
    }
    disposeTextures();
}

export function createNodeSporeLayer() {
    if (!webglContext.scene || !state.points?.length || !state.nodePositions?.length) return;
    const sporeGeo = new THREE.SphereGeometry(1, SPORE_SEGMENTS_VISIBLE, SPORE_SEGMENTS_VISIBLE - 1);
    const sporeMat = new THREE.MeshPhongMaterial({
        color: 0xc8d4d0,
        emissive: 0x16453f,
        emissiveIntensity: 0.34,
        shininess: 58,
        transparent: true,
        opacity: SCENE_ATMOSPHERE.sporeOpacity,
        vertexColors: true,
        blending: THREE.NormalBlending,
        depthWrite: false
    });
    const sporeMesh = new THREE.InstancedMesh(sporeGeo, sporeMat, state.points.length);
    sporeMesh.name = 'node-spore-instanced-field';
    sporeMesh.frustumCulled = false;
    sporeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    webglContext.nodeSporeMesh = sporeMesh;
    webglContext.nodeSporeMaterial = sporeMat;
    const SPORE_INSTANCE_COLOR_FACTOR = 0.85;
    for (let i = 0; i < state.points.length; i += 1) {
        setNodeSporeInstanceMatrix(i, sporeMesh);
        sporeMesh.setColorAt(i, getNodeSporeColor(i, SPORE_INSTANCE_COLOR_FACTOR));
    }
    if (sporeMesh.instanceColor) sporeMesh.instanceColor.needsUpdate = true;
    sporeMesh.instanceMatrix.needsUpdate = true;
    sporeMesh.visible = true;
    webglContext.scene.add(sporeMesh);

    const hitMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
    });
    const hitGeo = new THREE.SphereGeometry(1, SPORE_SEGMENTS_HIT_PROXY, SPORE_SEGMENTS_HIT_PROXY - 1);
    const hitMesh = new THREE.InstancedMesh(hitGeo, hitMat, state.points.length);
    hitMesh.name = 'node-spore-instanced-hit-proxy';
    hitMesh.frustumCulled = false;
    hitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < state.points.length; i += 1) {
        setNodeSporeInstanceMatrix(i, hitMesh, 1.8);
    }
    hitMesh.instanceMatrix.needsUpdate = true;
    webglContext.nodeSporeHitMesh = hitMesh;
    webglContext.scene.add(hitMesh);
}

export function createPoints() {
    disposeNodeVisuals();
    if (!state.points || !state.points.length) return;
    const geometry = new THREE.BufferGeometry();
    const positions: any[] = [];
    const colors: any[] = [];

    state.nodePositions = [];
    state.targetPositions = [];
    state.originalPositions = [];
    state.pointBaseColors = new Float32Array(state.points.length * 3);
    state.pointColorStateVersion += 1;
    state.searchGlowRenderStateKey = '';
    const rawPositionsBuffer = webglContext.rawPositionsBuffer || state.rawPositionsBuffer;
    const rawClustersBuffer = webglContext.rawClustersBuffer || state.rawClustersBuffer;
    const scatterOffsets = computeOverviewScatterOffsets(state.points);
    const bounds = getPointBoundsCenter(state.points, rawPositionsBuffer);
    const renderCenter = bounds.center;
    state.overviewBounds = {
        sourceMin: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
        sourceMax: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
        sourceCenter: { x: renderCenter.x, y: renderCenter.y, z: renderCenter.z },
        renderCenterOffset: { x: -renderCenter.x, y: -renderCenter.y, z: -renderCenter.z },
        count: bounds.count
    };

    const sporeTexture = trackTexture(createSporeTexture());
    webglContext.focusBeaconTexture = sporeTexture;
    webglContext.focusRingTexture = trackTexture(createFocusRingTexture());
    webglContext.focusNextCueTexture = trackTexture(createFocusNextCueTexture());

    const hasRawBuffers = rawPositionsBuffer && rawClustersBuffer && rawClustersBuffer.length === state.points.length;

    state.points.forEach((point: any, i: number) => {
        const scatter = scatterOffsets[i] || { x: 0, y: 0, z: 0 };
        let px, py, pz, cluster;

        if (hasRawBuffers) {
            px = rawPositionsBuffer[i * 3];
            py = rawPositionsBuffer[i * 3 + 1];
            pz = rawPositionsBuffer[i * 3 + 2];
            cluster = rawClustersBuffer[i];
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

    webglContext.pointsMaterial = new THREE.PointsMaterial({
        size: CONFIG.POINTS_MATERIAL_BASE_SIZE,
        vertexColors: true,
        transparent: true,
        opacity: SCENE_ATMOSPHERE.pointOpacityScale,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    installPointMaterialShader(webglContext.pointsMaterial);

    const pointsMesh = new THREE.Points(geometry, webglContext.pointsMaterial);
    pointsMesh.name = 'points-instanced-field';
    pointsMesh.frustumCulled = false;
    webglContext.scene!.add(pointsMesh);

    webglContext.pointsMesh = pointsMesh;
    createCountyOutline({ min: bounds.min, max: bounds.max, center: renderCenter });

    createNodeSporeLayer();
}

/**
 * Draws a 4-segment line at the X-Y plane of the point cloud's bounding box.
 */
function createCountyOutline({ min, max, center }: { min: any, max: any, center: any }) {
    if (!webglContext.scene) return;
    const existing = webglContext.scene.getObjectByName('county-outline');
    if (existing) {
        disposeObject3D(existing);
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
    webglContext.scene.add(line);
}
