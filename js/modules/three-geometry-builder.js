import * as THREE from 'three';
import { state } from '../state.js';
import { getThreadCategoryColor } from './utils/ui-presentation.js';
import { computeOverviewScatterOffsets } from './utils/geo-data.js';
import { createSporeTexture, createFocusRingTexture, createFocusNextCueTexture } from './utils/three-textures.js';
import {
    buildGeometricMyceliumEdges,
    buildSemanticMyceliumEdges,
    pushBezierLinePair
} from './mycelium-engine.js';
import { SCENE_PALETTE } from './design-tokens.js';

export const MYCELIUM_FIELD_SCALE = Object.freeze({
    x: 2.8,
    y: 2.25,
    z: 3.25
});

export const SCENE_ATMOSPHERE = Object.freeze({
    fogColor: SCENE_PALETTE.fog,
    fogDensity: 0.0034,
    clearAlpha: 1,
    toneExposure: 0.92,
    pointOpacityScale: 0.82,
    sporeOpacity: 0.22
});

const NODE_SPORE_BASE_RADIUS = 0.0019;
const NODE_SPORE_COLOR_LIFT = new THREE.Color(SCENE_PALETTE.sporeLift);
const _nodeSporeObject = new THREE.Object3D();
const _nodeSporeColor = new THREE.Color();
const FOCUS_WISP_COUNT = 18;
const FOCUS_WISP_SEGMENTS = 18;
const FOCUS_MOTE_COUNT = 46;
const FOCUS_PETAL_COUNT = 26;
export const THREAD_TINT_COLOR = SCENE_PALETTE.threadTint;

function getNavigationMode() {
    return state.navState?.mode ?? state.navState?.currentMode;
}

export function getThreadOpacityEnvelope() {
    return {
        overview: { core: 0.13, wispy: 0.055, bridge: 0.08, pulse: 0.028 },
        focused: { core: 0.40, wispy: 0.18, bridge: 0.28, pulse: 0.092 },
        searchActive: { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 },
        trailActive: { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 }
    };
}

function getMyceliumPresentationProfile() {
    const currentMode = getNavigationMode();
    if (currentMode === 'overview' || currentMode === undefined) {
        return { core: 0.112, wispy: 0.047, bridge: 0.068, pulse: 0.022 };
    }
    if (state.focusedNode !== null && state.focusedNode !== undefined) {
        return { core: 0.40, wispy: 0.18, bridge: 0.28, pulse: 0.092 };
    }
    if (state.currentSearchSummary || state.searchGlowActive) {
        return { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 };
    }
    if (state.trailDepth >= 1) {
        return { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 };
    }
    return { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 };
}

function seededUnit(index, salt = 0) {
    const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

function disposeObject3D(object) {
    if (!object) return;
    object.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
            child.material.forEach((material) => material?.dispose?.());
        } else {
            child.material?.dispose?.();
        }
    });
}

function createLineSegments(positions, colors, opacity) {
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        linewidth: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
}

export function getNodeSporeScale(index) {
    let emphasis = 1;
    if (Number.isFinite(state.focusedNode)) {
        if (index === state.focusedNode) {
            emphasis = 2.15;
        } else if (state.navState.focusPocketIndices?.includes(index)) {
            const role = state.navState.focusPocketRoleByIndex?.get(index);
            emphasis = role === 'primary' ? 1.74 : 1.42;
        } else {
            const trailNeighbors = state.navState.trailNeighborIndices || [];
            for (let i = 0; i < Math.min(12, trailNeighbors.length); i += 1) {
                if (trailNeighbors[i] === index) {
                    emphasis = 1.48;
                    break;
                }
            }
            if (emphasis === 1) emphasis = 0.62;
        }
    }
    if (index === state.hoverHighlightIndex) {
        emphasis = Math.max(emphasis, 1.95);
    }
    return NODE_SPORE_BASE_RADIUS * (0.86 + seededUnit(index, 2.7) * 0.48) * emphasis;
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
    const shouldSyncHitProxy = targetMesh === state.nodeSporeMesh && state.nodeSporeHitMesh && (
        index === state.focusedNode ||
        state.navState.focusPocketIndices?.includes(index) ||
        state.navState.trailNeighborIndices?.includes(index)
    );
    if (shouldSyncHitProxy) {
        const hitBase = NODE_SPORE_BASE_RADIUS * (0.86 + seededUnit(index, 2.7) * 0.48) * 1.85;
        _nodeSporeObject.position.set(pos.x, pos.y, pos.z);
        _nodeSporeObject.scale.set(hitBase, hitBase, hitBase);
        _nodeSporeObject.updateMatrix();
        state.nodeSporeHitMesh.setMatrixAt(index, _nodeSporeObject.matrix);
    }
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

export function getPointBoundsCenter(points) {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let count = 0;

    points.forEach((point) => {
        const x = Number(point?.x);
        const y = Number(point?.y);
        const z = Number(point?.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        min.z = Math.min(min.z, z);
        max.x = Math.max(max.x, x);
        max.y = Math.max(max.y, y);
        max.z = Math.max(max.z, z);
        count += 1;
    });

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

export function createNodeSporeLayer() {
    if (!state.scene || !state.points?.length || !state.nodePositions?.length) return;
    const sporeGeo = new THREE.SphereGeometry(1, 10, 8);
    const sporeMat = new THREE.MeshPhongMaterial({
        color: 0xffffff,
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
    state.nodeSporeMesh = sporeMesh;
    state.nodeSporeMaterial = sporeMat;
    for (let i = 0; i < state.points.length; i += 1) {
        setNodeSporeInstanceMatrix(i, sporeMesh);
        sporeMesh.setColorAt(i, getNodeSporeColor(i, 1.62));
    }
    if (sporeMesh.instanceColor) sporeMesh.instanceColor.needsUpdate = true;
    sporeMesh.instanceMatrix.needsUpdate = true;
    sporeMesh.visible = true;
    state.scene.add(sporeMesh);

    const hitMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
    });
    const hitMesh = new THREE.InstancedMesh(sporeGeo, hitMat, state.points.length);
    hitMesh.name = 'node-spore-instanced-hit-proxy';
    hitMesh.frustumCulled = false;
    hitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < state.points.length; i += 1) {
        setNodeSporeInstanceMatrix(i, hitMesh, 2.4);
    }
    hitMesh.instanceMatrix.needsUpdate = true;
    state.nodeSporeHitMesh = hitMesh;
    state.scene.add(hitMesh);
}

export function createPoints() {
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
    const bounds = getPointBoundsCenter(state.points);
    const renderCenter = bounds.center;
    state.overviewBounds = {
        sourceMin: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
        sourceMax: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
        sourceCenter: { x: renderCenter.x, y: renderCenter.y, z: renderCenter.z },
        renderCenterOffset: { x: -renderCenter.x, y: -renderCenter.y, z: -renderCenter.z },
        count: bounds.count
    };

    const sporeTexture = createSporeTexture(THREE);
    state.focusBeaconTexture = sporeTexture;
    state.focusRingTexture = createFocusRingTexture(THREE);
    state.focusNextCueTexture = createFocusNextCueTexture(THREE);

    state.points.forEach((point, i) => {
        const scatter = scatterOffsets[i] || { x: 0, y: 0, z: 0 };
        const rawX = Number.isFinite(point.x) ? point.x : 0;
        const rawY = Number.isFinite(point.y) ? point.y : 0;
        const rawZ = Number.isFinite(point.z) ? point.z : 0;
        const px = (rawX - renderCenter.x + scatter.x) * MYCELIUM_FIELD_SCALE.x;
        const py = (rawY - renderCenter.y + scatter.y) * MYCELIUM_FIELD_SCALE.y;
        const pz = (rawZ - renderCenter.z + scatter.z) * MYCELIUM_FIELD_SCALE.z;
        positions.push(px, py, pz);

        // Store for dynamic animation
        state.nodePositions.push({x: px, y: py, z: pz});
        state.targetPositions.push({x: px, y: py, z: pz});
        state.originalPositions.push({x: px, y: py, z: pz});

        const color = getThreadCategoryColor(point.cluster, state.COLORS).lerp(new THREE.Color(THREAD_TINT_COLOR), 0.018);
        const radialDepth = Math.sqrt(px * px + py * py + pz * pz);
        const depthFactor = THREE.MathUtils.clamp(1.16 - radialDepth * 0.14, 0.82, 1.12);
        const colorOffset = i * 3;
        color.offsetHSL(0, 0.045, -0.01);
        const baseR = Math.min(1, color.r * depthFactor * 1.18 + 0.018);
        const baseG = Math.min(1, color.g * depthFactor * 1.18 + 0.022);
        const baseB = Math.min(1, color.b * depthFactor * 1.18 + 0.019);
        colors.push(baseR, baseG, baseB);
        state.pointBaseColors[colorOffset] = baseR;
        state.pointBaseColors[colorOffset + 1] = baseG;
        state.pointBaseColors[colorOffset + 2] = baseB;
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const glowFactors = new Float32Array(state.points.length);
    geometry.setAttribute('glowFactor', new THREE.Float32BufferAttribute(glowFactors, 1));

    state.pointsMaterial = new THREE.PointsMaterial({
        size: state.POINTS_MATERIAL_BASE_SIZE * 1.52,
        vertexColors: true,
        transparent: true,
        opacity: state.POINTS_MATERIAL_BASE_OPACITY * SCENE_ATMOSPHERE.pointOpacityScale,
        sizeAttenuation: true,
        alphaTest: 0.006,
        map: sporeTexture,
        alphaMap: sporeTexture,
        blending: THREE.NormalBlending,
        depthWrite: false
    });

    // Inject shader logic for search glow pulse, semantic ripple, and hover adaptive scaling
    state.pointsMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.uGlowIntensity = { value: 0 };
        shader.uniforms.uRippleTime = { value: -1000.0 };
        shader.uniforms.uRippleCenter = { value: new THREE.Vector3(0,0,0) };
        shader.uniforms.uHoverBoost = { value: 1.0 };
        shader.uniforms.uHoverNodePos = { value: new THREE.Vector3(0,0,0) };
        shader.uniforms.uHoverRadius = { value: 0.08 };
        shader.uniforms.uRevealProgress = { value: 0.0 };
        shader.uniforms.uFocusWake = { value: 0.0 };
        shader.uniforms.uFocusNodePos = { value: new THREE.Vector3(0,0,0) };
        shader.uniforms.uFocusRadius = { value: 0.16 };

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            uniform float uGlowIntensity;
            uniform float uRippleTime;
            uniform vec3 uRippleCenter;
            uniform float uHoverBoost;
            uniform vec3 uHoverNodePos;
            uniform float uHoverRadius;
            uniform float uRevealProgress;
            uniform float uFocusWake;
            uniform vec3 uFocusNodePos;
            uniform float uFocusRadius;
            attribute float glowFactor;
            varying float vGlowFactor;
            varying float vRippleFactor;
            varying float vNodeTwinkle;
            varying float vDepthGlow;
            varying float vFocusWake;
            varying float vAlphaFactor;
            float hash13(vec3 p) {
                return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
            }`
        ).replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vGlowFactor = glowFactor;
            vNodeTwinkle = hash13(position);
            vDepthGlow = clamp(1.0 - length(position) * 0.1, 0.28, 1.0);
            float focusDist = distance(position, uFocusNodePos);
            vFocusWake = smoothstep(uFocusRadius, 0.0, focusDist) * uFocusWake;
            float dist = distance(position, uRippleCenter);
            float rippleWave = (uRippleTime - dist * 4.0);
            vRippleFactor = (rippleWave > 0.0 && rippleWave < 1.0) ? (1.0 - rippleWave) : 0.0;`
        ).replace(
            'gl_PointSize = size;',
            `// Adaptive scale adjusting size attenuation clamp boundary
            float camDist = -mvPosition.z;
            #ifdef USE_SIZEATTENUATION
                float attenAdjust = camDist / clamp(camDist, 0.45, 6.5);
            #else
                float attenAdjust = 1.0;
            #endif

            float densityScale = clamp(0.7 + camDist * 0.08, 0.7, 1.05);
            float hoverBoost = 1.0;
            if (uHoverBoost > 1.01) {
                float hDist = distance(position, uHoverNodePos);
                hoverBoost = mix(uHoverBoost, 1.0, clamp(hDist / uHoverRadius, 0.0, 1.0));
            }
            gl_PointSize = size * attenAdjust * hoverBoost * densityScale * (0.76 + vDepthGlow * 0.36 + vNodeTwinkle * 0.12 + vFocusWake * 1.15 + vGlowFactor * uGlowIntensity * 0.72 + vRippleFactor * 0.66);

            // Apply alpha factor to fade distant nodes into background without hiding them entirely (maintaining density)
            float depthAlpha = clamp(1.15 - camDist * 0.14, 0.22, 1.0);
            float intentVal = max(vFocusWake, max(vGlowFactor * uGlowIntensity, vRippleFactor));
            vAlphaFactor = mix(depthAlpha, 1.0, clamp(intentVal, 0.0, 1.0));

            // 10/10 Polish: Non-linear reveal scale for 'pop-in' effect
            gl_PointSize *= pow(uRevealProgress, 0.42);`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            varying float vGlowFactor;
            varying float vRippleFactor;
            varying float vDepthGlow;
            varying float vFocusWake;
            varying float vAlphaFactor;
            uniform float uGlowIntensity;`
        ).replace(
            'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
            `
            vec3 finalColor = outgoingLight;
            finalColor += vec3(0.01, 0.014, 0.01);
            if (vGlowFactor > 0.0) {
                finalColor += outgoingLight * vGlowFactor * uGlowIntensity * 1.32;
                finalColor += vec3(0.045, 0.068, 0.048) * vGlowFactor * uGlowIntensity;
            }
            if (vRippleFactor > 0.0) {
                finalColor += vec3(0.4, 0.9, 1.0) * vRippleFactor * 0.6;
            }
            if (vFocusWake > 0.0) {
                finalColor = mix(finalColor, vec3(0.78, 1.0, 0.95), vFocusWake * 0.42);
                finalColor += vec3(0.08, 0.2, 0.18) * vFocusWake;
            }
            finalColor *= (0.86 + vDepthGlow * 0.18);
            gl_FragColor = vec4( finalColor, diffuseColor.a * vAlphaFactor );
            `
        );
        state.pointsMaterial.userData.shader = shader;
    };
    state.pointsMaterial.customProgramCacheKey = () => 'moco-search-glow-v3';

    state.pointsMesh = new THREE.Points(geometry, state.pointsMaterial);
    state.scene.add(state.pointsMesh);
    createNodeSporeLayer();
    const haloMaterial = new THREE.SpriteMaterial({
        map: state.focusRingTexture,
        color: 0xf7f0b3,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
    state.focusHalo = new THREE.Sprite(haloMaterial);
    state.focusHalo.scale.set(0.076, 0.076, 1);
    state.focusHalo.visible = false;
    state.scene.add(state.focusHalo);

    const focusCoreMaterial = new THREE.SpriteMaterial({
        map: sporeTexture,
        color: 0xfff4ba,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
    state.focusCore = new THREE.Sprite(focusCoreMaterial);
    state.focusCore.scale.set(0.041, 0.041, 1);
    state.focusCore.visible = false;
    state.scene.add(state.focusCore);

    const filamentGeo = new THREE.BufferGeometry();
    filamentGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FOCUS_WISP_COUNT * FOCUS_WISP_SEGMENTS * 2 * 3), 3));
    const filamentMat = new THREE.LineBasicMaterial({
        color: 0x9ffdf0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
    });
    state.focusFilaments = new THREE.LineSegments(filamentGeo, filamentMat);
    state.focusFilaments.name = 'selected-node-living-filaments';
    state.focusFilaments.visible = false;
    state.scene.add(state.focusFilaments);

    state.focusMoteGroup = new THREE.Group();
    state.focusMoteGroup.name = 'selected-node-living-motes';
    state.focusMoteGroup.visible = false;
    state.focusMotes = [];
    for (let i = 0; i < FOCUS_MOTE_COUNT; i += 1) {
        const moteMaterial = new THREE.SpriteMaterial({
            map: sporeTexture,
            color: i % 5 === 0 ? 0xffef9e : (i % 3 === 0 ? 0xff8fd4 : 0x8ff8ed),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending
        });
        const mote = new THREE.Sprite(moteMaterial);
        const shell = Math.sqrt((i + 0.5) / FOCUS_MOTE_COUNT);
        const shimmer = seededUnit(i, 13.4);
        mote.userData = {
            phase: i * 2.399 + shimmer * 1.7,
            radius: 0.021 + shell * 0.061 + seededUnit(i, 14.6) * 0.009,
            lift: -0.028 + shell * 0.053 + (seededUnit(i, 15.8) - 0.5) * 0.018,
            speed: 0.18 + seededUnit(i, 16.2) * 0.24,
            scale: 0.0046 + shell * 0.0048 + seededUnit(i, 17.4) * 0.0018,
            tilt: 0.48 + seededUnit(i, 18.6) * 0.56,
            drift: 0.35 + seededUnit(i, 19.8) * 0.65
        };
        mote.visible = false;
        state.focusMotes.push(mote);
        state.focusMoteGroup.add(mote);
    }
    state.scene.add(state.focusMoteGroup);

    state.focusPetalGroup = new THREE.Group();
    state.focusPetalGroup.name = 'selected-node-living-veil';
    state.focusPetalGroup.visible = false;
    state.focusPetals = [];
    for (let i = 0; i < FOCUS_PETAL_COUNT; i += 1) {
        const petalMaterial = new THREE.SpriteMaterial({
            map: sporeTexture,
            color: i % 4 === 0 ? 0xffd982 : (i % 3 === 0 ? 0xff94d8 : 0x8bf8ef),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            rotation: i * 0.37
        });
        const petal = new THREE.Sprite(petalMaterial);
        const shell = Math.sqrt((i + 0.5) / FOCUS_PETAL_COUNT);
        petal.userData = {
            phase: i * 2.137 + seededUnit(i, 21.3),
            radius: 0.024 + shell * 0.056 + seededUnit(i, 22.5) * 0.008,
            lift: -0.016 + shell * 0.036 + (seededUnit(i, 23.7) - 0.5) * 0.012,
            speed: 0.11 + seededUnit(i, 24.9) * 0.18,
            length: 0.045 + shell * 0.037 + seededUnit(i, 25.2) * 0.012,
            thickness: 0.0085 + seededUnit(i, 26.4) * 0.0042,
            tilt: 0.55 + seededUnit(i, 27.6) * 0.44
        };
        petal.visible = false;
        state.focusPetals.push(petal);
        state.focusPetalGroup.add(petal);
    }
    state.scene.add(state.focusPetalGroup);

    const hoverHaloMaterial = new THREE.SpriteMaterial({
        map: state.focusRingTexture,
        color: 0x4ecdc4,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        depthTest: false
    });
    state.hoverHalo = new THREE.Sprite(hoverHaloMaterial);
    state.hoverHalo.scale.set(0.032, 0.032, 1);
    state.hoverHalo.visible = false;
    state.scene.add(state.hoverHalo);
}

export function createMycelium() {
    if (!state.pointsMesh || !state.points?.length || !state.nodePositions?.length) return;

    if (state.myceliumGroup) {
        state.pointsMesh.remove(state.myceliumGroup);
        disposeObject3D(state.myceliumGroup);
    }

    state.myceliumConnectionPairs = [];
    state.myceliumDirty = true;
    state.myceliumCoreLines = null;
    state.myceliumWispyLines = null;
    state.myceliumBridgeLines = null;

    const clusterMembers = new Map();
    const clusterCentroids = new Map();
    state.points.forEach((point, index) => {
        const pos = state.nodePositions[index];
        if (!pos) return;
        if (!clusterMembers.has(point.cluster)) {
            clusterMembers.set(point.cluster, []);
            clusterCentroids.set(point.cluster, { x: 0, y: 0, z: 0, count: 0 });
        }
        clusterMembers.get(point.cluster).push(index);
        const centroid = clusterCentroids.get(point.cluster);
        centroid.x += pos.x;
        centroid.y += pos.y;
        centroid.z += pos.z;
        centroid.count += 1;
    });

    clusterCentroids.forEach((centroid) => {
        centroid.x /= centroid.count || 1;
        centroid.y /= centroid.count || 1;
        centroid.z /= centroid.count || 1;
    });

    const semanticEdges = buildSemanticMyceliumEdges();
    const edgeSets = semanticEdges || buildGeometricMyceliumEdges(clusterMembers, clusterCentroids);
    const coreConnections = [];
    const coreColors = [];
    const wispyConnections = [];
    const wispyColors = [];
    const bridgeConnections = [];
    const bridgeColors = [];

    edgeSets.corePairs.forEach((pair) => {
        pushBezierLinePair(coreConnections, coreColors, pair, semanticEdges ? 0.38 : 0.28);
        state.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 0 });
    });
    edgeSets.wispyPairs.forEach((pair) => {
        pushBezierLinePair(wispyConnections, wispyColors, pair, semanticEdges ? 0.22 : 0.16);
        state.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 1 });
    });
    edgeSets.bridgePairs.forEach((pair) => {
        pushBezierLinePair(bridgeConnections, bridgeColors, pair, semanticEdges ? 0.32 : 0.24);
        state.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 2 });
    });

    state.myceliumGroup = new THREE.Group();
    const profile = getMyceliumPresentationProfile();
    state.myceliumCoreLines = createLineSegments(coreConnections, coreColors, profile.core);
    state.myceliumWispyLines = createLineSegments(wispyConnections, wispyColors, profile.wispy);
    state.myceliumBridgeLines = createLineSegments(bridgeConnections, bridgeColors, profile.bridge);

    if (state.myceliumCoreLines) state.myceliumGroup.add(state.myceliumCoreLines);
    if (state.myceliumWispyLines) state.myceliumGroup.add(state.myceliumWispyLines);
    if (state.myceliumBridgeLines) state.myceliumGroup.add(state.myceliumBridgeLines);
    if (!state.scene) return;
    state.pointsMesh.add(state.myceliumGroup);

    state.scenePerformanceDiagnostics.myceliumCoreSegments = coreConnections.length / 6;
    state.scenePerformanceDiagnostics.myceliumWispySegments = wispyConnections.length / 6;
    state.scenePerformanceDiagnostics.myceliumBridgeSegments = bridgeConnections.length / 6;
}
