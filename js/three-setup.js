import * as THREE from 'three';
window.THREE = THREE;
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { state } from './state.js';
import {
    releaseFocusCameraAssist,
    focusCameraAssistIsActive,
    noteSceneInteraction,
    scheduleAutoRotateResume,
    updateAutoRotateSoftResume
} from './modules/camera-controls.js';
import { initMap } from './modules/map-state.js';
import {
    easeInOutCubic,
    easeOutQuint,
    getThreadCategoryColor,
    computeOverviewScatterOffsets,
    createSporeTexture,
    createFocusRingTexture,
    createFocusNextCueTexture
} from './utils.js';
import {
    buildGeometricMyceliumEdges,
    buildSemanticMyceliumEdges,
    pushBezierLinePair,
    updateMyceliumThreads
} from './modules/mycelium-engine.js';
import { setSceneRevealDataset } from './modules/scene-reveal.js';
import { showExperienceToast } from './modules/ui-feedback.js';
import { applyMapFlatteningLayout } from './modules/map-flattening-layout.js';
import { triggerCorridorBloom } from './modules/audio-scape.js';
import { updateInspectedStrandOverlayFrame } from './modules/inspected-strand-overlay-adapter.js';
import {
    updateArrivalHandoffOverlayFrame,
    updateRouteTraceOverlayFrame
} from './modules/route-arrival-overlay-adapter.js';
import { restoreWebGLContext } from './modules/webgl-restore-adapter.js';

// three-setup.js - Three.js state.scene initialization, state.scene management, animation loop
// Extracted from vector-explorer-polished.html inline script

export { updateMyceliumThreads, applyMapFlatteningLayout };

// RAF handle for cancelation on deinit/re-init
let _rafId = null;
let _webglContextLost = false;
let _webglRestoreTimer = null;

function detectWebGLSupport() {
    if (typeof document === 'undefined') return { supported: false, reason: 'document-unavailable' };
    const canvas = document.createElement('canvas');
    const contextAttributes = {
        alpha: true,
        antialias: true
    };
    try {
        const context = canvas.getContext('webgl2', contextAttributes)
            || canvas.getContext('webgl', contextAttributes)
            || canvas.getContext('experimental-webgl', contextAttributes);
        if (!context) return { supported: false, reason: 'context-unavailable' };
        const debugInfo = context.getExtension?.('WEBGL_debug_renderer_info');
        return {
            supported: true,
            reason: 'available',
            renderer: debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
            vendor: debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null
        };
    } catch (error) {
        return {
            supported: false,
            reason: error?.message || 'context-probe-threw'
        };
    }
}

function showWebGLFallback(container, detail = {}) {
    if (!container) return;
    document.body.dataset.graphicsMode = 'fallback';
    state.scenePerformanceDiagnostics.active = false;
    state.scenePerformanceDiagnostics.reason = detail.reason || 'webgl-unavailable';
    state.scene = null;
    state.camera = null;
    state.renderer = null;
    state.controls = null;

    container.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
    const existingNotice = container.querySelector('.webgl-fallback-notice');
    if (existingNotice) existingNotice.remove();

    const notice = document.createElement('section');
    notice.className = 'webgl-fallback-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.innerHTML = `
        <div class="webgl-fallback-kicker">Graphics fallback</div>
        <h2>3D view is unavailable on this device.</h2>
        <p>The county records still load. Use the map view while graphics acceleration is blocked or unavailable.</p>
        <button type="button" class="webgl-fallback-map" data-webgl-fallback-map>Open map view</button>
    `;
    container.appendChild(notice);

    const mapButton = notice.querySelector('[data-webgl-fallback-map]');
    mapButton?.addEventListener('click', () => {
        document.body.dataset.activeView = 'map';
        document.getElementById('map-container')?.classList.add('active');
        container.classList.add('hidden');
        state.currentView = 'map';
        initMap();
        if (typeof window.switchView === 'function') {
            window.switchView('map', { reason: 'webgl-fallback' });
        }
    });

    showExperienceToast('Graphics fallback active', 'Map view remains available while 3D graphics are unavailable.');
}

const MYCELIUM_FIELD_SCALE = Object.freeze({
    x: 2.8,
    y: 2.25,
    z: 3.25
});

const SCENE_ATMOSPHERE = Object.freeze({
    fogColor: 0x070a12,
    fogDensity: 0.0034,
    clearAlpha: 1,
    toneExposure: 0.92,
    pointOpacityScale: 0.82,
    sporeOpacity: 0.22
});

const NODE_SPORE_BASE_RADIUS = 0.0019;
const NODE_SPORE_COLOR_LIFT = new THREE.Color(0xbffdf4);
const _nodeSporeObject = new THREE.Object3D();
const _nodeSporeColor = new THREE.Color();
const FOCUS_WISP_COUNT = 18;
const FOCUS_WISP_SEGMENTS = 18;
const FOCUS_MOTE_COUNT = 46;
const FOCUS_PETAL_COUNT = 26;

// Constants used in animation
const THREAD_TINT_COLOR = 0x4ecdc4;

function getNavigationMode() {
    return state.navState?.mode ?? state.navState?.currentMode;
}

// --- Progressive thread visibility by mode ---
// Threads only render when they make semantic sense for the current context.
// This prevents framerate death at county overview and avoids noise during map view.

export function shouldRenderThreads() {
    const currentMode = getNavigationMode();
    const { trailDepth } = state.navState || {};
    const { currentSearchSummary } = state;
    const { focusedNode } = state;

    // County overview: threads ON for ambient visualization
    if (currentMode === 'overview' || currentMode === undefined) return true;

    // Map view: geographic context is primary, threads are visual noise
    if (currentMode === 'map') return false;

    // Search active: anchor thread ON (the trail IS the story)
    if (currentSearchSummary) return true;

    // Focus stage: neighborhood threads ON (meaningful relationships when anchor selected)
    if (currentMode === 'focus' && focusedNode !== null && focusedNode !== undefined) return true;

    // Step Inside (trail mode): full thread trail ON (the path IS the experience)
    if (trailDepth >= 1) return true;

    // Bridge mode EXCEPTION: selective threads visible at overview level
    // since cross-cluster connectors are defined by their connections
    if (currentMode === 'bridge') return true;

    return false;
}

export function shouldRenderBridgeThreads() {
    // Bridge mode shows cross-cluster threads as the primary visual
    const currentMode = getNavigationMode();
    return currentMode === 'bridge';
}

function getLineSegmentCount(line) {
    const positionCount = line?.geometry?.attributes?.position?.count || 0;
    return Math.floor(positionCount / 2);
}

function getGroupLineSegmentCount(group) {
    let segmentCount = 0;
    group?.traverse?.((child) => {
        segmentCount += getLineSegmentCount(child);
    });
    return segmentCount;
}

function smoothDiagnosticValue(current, next, sampleCount) {
    const divisor = Math.max(1, Math.min(sampleCount, 120));
    return current + (next - current) / divisor;
}

function getSceneRenderableDiagnostics() {
    return {
        pointCount: state.pointsMesh?.geometry?.attributes?.position?.count || state.points.length || 0,
        sporeInstanceCount: state.nodeSporeMesh?.count || 0,
        myceliumCoreSegments: state.scenePerformanceDiagnostics.myceliumCoreSegments || 0,
        myceliumWispySegments: state.scenePerformanceDiagnostics.myceliumWispySegments || 0,
        myceliumBridgeSegments: state.scenePerformanceDiagnostics.myceliumBridgeSegments || 0,
        focusThreadSegments: state.focusThreadDiagnostics?.segmentCount || 0,
        routeTraceSegments: state.routeTraceDiagnostics?.segmentCount || getLineSegmentCount(state.routeTraceLines),
        arrivalHandoffSegments: state.arrivalHandoffDiagnostics?.segmentCount || getGroupLineSegmentCount(state.arrivalHandoffGroup)
    };
}

function seededUnit(index, salt = 0) {
    const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

function getNodeSporeScale(index) {
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

function setNodeSporeInstanceMatrix(index, targetMesh = state.nodeSporeMesh, scaleMultiplier = 1) {
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

function getNodeSporeColor(index, factor = 1) {
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

export function syncNodeSporeColorsFromPointColors() {
    if (!state.nodeSporeMesh || !state.pointsMesh?.geometry?.attributes?.color) return;
    const colors = state.pointsMesh.geometry.attributes.color.array;
    for (let i = 0; i < state.points.length; i += 1) {
        const colorOffset = i * 3;
        _nodeSporeColor.setRGB(
            colors[colorOffset] ?? 0.35,
            colors[colorOffset + 1] ?? 0.75,
            colors[colorOffset + 2] ?? 0.72
        ).lerp(NODE_SPORE_COLOR_LIFT, 0.08);
        state.nodeSporeMesh.setColorAt(i, _nodeSporeColor);
    }
    if (state.nodeSporeMesh.instanceColor) state.nodeSporeMesh.instanceColor.needsUpdate = true;
}

function sampleScenePerformance(frameMs, timings = {}) {
    const diagnostics = state.scenePerformanceDiagnostics;
    diagnostics.active = !!(state.renderer && state.scene && state.camera && state.currentView === 'galaxy');
    diagnostics.reason = diagnostics.active ? 'sampling' : 'inactive-view';
    diagnostics.sampleCount = Math.min(600, (diagnostics.sampleCount || 0) + 1);
    diagnostics.avgFrameMs = smoothDiagnosticValue(diagnostics.avgFrameMs || 0, frameMs, diagnostics.sampleCount);
    diagnostics.maxFrameMs = Math.max(frameMs, (diagnostics.maxFrameMs || 0) * 0.992);
    diagnostics.avgControlsMs = smoothDiagnosticValue(diagnostics.avgControlsMs || 0, timings.controlsMs || 0, diagnostics.sampleCount);
    diagnostics.avgNodeMotionMs = smoothDiagnosticValue(diagnostics.avgNodeMotionMs || 0, timings.nodeMotionMs || 0, diagnostics.sampleCount);
    diagnostics.avgThreadUpdateMs = smoothDiagnosticValue(diagnostics.avgThreadUpdateMs || 0, timings.threadUpdateMs || 0, diagnostics.sampleCount);
    diagnostics.avgGlowMs = smoothDiagnosticValue(diagnostics.avgGlowMs || 0, timings.glowMs || 0, diagnostics.sampleCount);
    diagnostics.avgLensMs = smoothDiagnosticValue(diagnostics.avgLensMs || 0, timings.lensMs || 0, diagnostics.sampleCount);
    diagnostics.avgUpdateMs = smoothDiagnosticValue(diagnostics.avgUpdateMs || 0, timings.updateMs || 0, diagnostics.sampleCount);
    diagnostics.maxUpdateMs = Math.max(timings.updateMs || 0, (diagnostics.maxUpdateMs || 0) * 0.992);
    diagnostics.avgRenderMs = smoothDiagnosticValue(diagnostics.avgRenderMs || 0, timings.renderMs || 0, diagnostics.sampleCount);
    diagnostics.maxRenderMs = Math.max(timings.renderMs || 0, (diagnostics.maxRenderMs || 0) * 0.992);
    diagnostics.renderables = getSceneRenderableDiagnostics();
}

function getScenePerformanceProbe() {
    return {
        ...state.scenePerformanceDiagnostics,
        overviewBounds: state.overviewBounds || null,
        renderables: getSceneRenderableDiagnostics()
    };
}

function bindWebGLContextResilience(renderer) {
    const canvas = renderer?.domElement;
    if (!canvas || canvas.dataset.webglContextGuardBound === 'true') return;
    canvas.dataset.webglContextGuardBound = 'true';

    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        _webglContextLost = true;
        if (_rafId !== null) {
            window.cancelAnimationFrame(_rafId);
            _rafId = null;
        }
        state.scenePerformanceDiagnostics.reason = 'webgl-context-lost';
        showExperienceToast('Graphics context paused', 'The scene will restore automatically.');
    }, false);

    canvas.addEventListener('webglcontextrestored', () => {
        _webglContextLost = false;
        state.scenePerformanceDiagnostics.reason = 'webgl-context-restored';
        if (_webglRestoreTimer) window.clearTimeout(_webglRestoreTimer);
        _webglRestoreTimer = window.setTimeout(() => {
            _webglRestoreTimer = null;
            showExperienceToast('Graphics context restored', 'Rebuilding the semantic scene.');
            restoreWebGLContext().catch((err) => console.error('WebGL context restore reinit failed:', err));
        }, 80);
    }, false);
}

function compilePointMaterialForReadiness() {
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

function getPointBoundsCenter(points) {
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

function getThreadPulseOpacity(baseOpacity, pulse, requestedAmplitude, revealProgress = 1) {
    const safeBase = Math.max(0, Number.isFinite(baseOpacity) ? baseOpacity : 0);
    const safeReveal = Math.max(0, Number.isFinite(revealProgress) ? revealProgress : 1);
    // Keep pulse motion legible without letting threads disappear at the trough.
    const amplitude = Math.min(
        Math.max(0, Number.isFinite(requestedAmplitude) ? requestedAmplitude : 0),
        Math.max(0.0006, safeBase * 0.26)
    );
    return Math.max(0, safeBase + pulse * amplitude) * safeReveal;
}

/**
 * Returns the four named mycelium thread opacity profiles used by the visual
 * polish contract.  Each profile is keyed by visibility stage name.
 * These are frozen design constants — not runtime-derived.
 */
export function getThreadOpacityEnvelope() {
    // overview profile — county overview ambient thread legibility
    return { core: 0.13, wispy: 0.055, bridge: 0.08, pulse: 0.028 };
    // focused profile — neighborhood / focus stage
    return { core: 0.40, wispy: 0.18, bridge: 0.28, pulse: 0.092 };
    // searchActive profile — search result context
    return { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 };
    // trailActive profile — step-inside trail depth
    return { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 };
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

export function updateCameraViewportOffset() {
    if (!state.camera) return;
    const panel = document.querySelector('.info-panel');
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (panel && panel.classList.contains('active') && width > 768) {
        const rect = panel.getBoundingClientRect();
        const offset = rect.right / 2;
        state.camera.setViewOffset(width, height, -offset, 0, width, height);
    } else {
        state.camera.clearViewOffset();
    }
    state.camera.updateProjectionMatrix();
}

export function initThreeJS() {
    // Prevent duplicate loops and clean up old resources before re-init
    cancelAnimate();

    const container = document.getElementById('canvas-container');
    if (!container) throw new Error('initThreeJS: #canvas-container element not found in DOM');

    const webglSupport = detectWebGLSupport();
    if (!webglSupport.supported) {
        console.warn('WebGL unavailable; using semantic demo graphics fallback.', webglSupport);
        showWebGLFallback(container, webglSupport);
        return false;
    }

    state.scene = new THREE.Scene();

    // 10/10 Polish: High-Fidelity Atmospheric Depth
    state.scene.fog = new THREE.FogExp2(SCENE_ATMOSPHERE.fogColor, SCENE_ATMOSPHERE.fogDensity);

    state.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    state.camera.position.set(1.5, 1.2, 2.0);
    state.camera.lookAt(0, 0, 0);

    // 10/10 Polish: Cinema Lighting Rig
    state.hemiLight = new THREE.HemisphereLight(0xe8f4ff, 0x080820, 0);
    state.scene.add(state.hemiLight);

    state.dirLight = new THREE.DirectionalLight(0xffffff, 0);
    state.dirLight.position.set(5, 5, 5);
    state.scene.add(state.dirLight);

    try {
        state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (error) {
        console.error('WebGL renderer creation failed; using semantic demo graphics fallback.', error);
        showWebGLFallback(container, { reason: error?.message || 'renderer-create-failed' });
        return false;
    }
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setClearColor(SCENE_ATMOSPHERE.fogColor, SCENE_ATMOSPHERE.clearAlpha);
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = SCENE_ATMOSPHERE.toneExposure;
    container.querySelectorAll('canvas').forEach((canvas) => {
        if (canvas !== state.renderer.domElement) canvas.remove();
    });
    state.renderer.domElement.setAttribute('aria-label', 'Semantic business visualization of Montgomery County businesses');
    bindWebGLContextResilience(state.renderer);
    container.appendChild(state.renderer.domElement);

    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.rotateSpeed = state.ORBIT_ROTATE_SPEED_DEFAULT;
    state.controls.zoomSpeed = 1.0;
    state.controls.minDistance = state.ORBIT_MIN_DISTANCE_DEFAULT;
    state.controls.maxDistance = state.ORBIT_MAX_DISTANCE_DEFAULT;
    state.controls.enablePan = true;
    state.controls.panSpeed = state.ORBIT_PAN_SPEED_DEFAULT;

    // Respect user's motion preference at initialization
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        state.autoRotate = false;
        const rotateBtn = document.getElementById('btn-rotate');
        if (rotateBtn) rotateBtn.setAttribute('aria-pressed', 'false');
    }

    state.controls.autoRotate = state.autoRotate && !state.autoRotateSuspended;
    state.controls.autoRotateSpeed = state.AUTO_ROTATE_BASE_SPEED;
    state.controls.addEventListener('start', () => {
        releaseFocusCameraAssist('user-control');
        noteSceneInteraction(state.AUTO_ROTATE_MANUAL_IDLE_MS);
    });
    state.controls.addEventListener('end', () => {
        scheduleAutoRotateResume(state.AUTO_ROTATE_MANUAL_IDLE_MS);
    });

    // Large semantic atmosphere: a depth cue, not a literal object to inspect.
    const glowGeo = new THREE.SphereGeometry(3.15, 32, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x0d2024,
        transparent: true,
        opacity: 0.026,
        side: THREE.BackSide
    });
    const glowSphere = new THREE.Mesh(glowGeo, glowMat);
    glowSphere.scale.set(1.16, 0.9, 1.34);
    glowSphere.name = 'semantic-depth-atmosphere';
    state.scene.add(glowSphere);

    // Sparse contour shell gives parallax and scale without competing with the node field.
    const refGeo = new THREE.SphereGeometry(2.35, 48, 24);
    const refMat = new THREE.MeshBasicMaterial({
        color: 0x4ecdc4,
        wireframe: true,
        transparent: true,
        opacity: 0.0045,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const refSphere = new THREE.Mesh(refGeo, refMat);
    refSphere.scale.set(1.12, 0.86, 1.28);
    refSphere.name = 'county-depth-reference';
    state.scene.add(refSphere);

    createPoints();
    compilePointMaterialForReadiness();
    initSemanticLens();
    initSemanticManifold();
    document.body.dataset.graphicsMode = 'webgl';
    updateCameraViewportOffset();
    return true;
}

function initSemanticManifold() {
    const manifoldGeo = new THREE.CircleGeometry(4, 64);
    const manifoldMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uRippleTime: { value: -1000.0 },
            uRippleCenter: { value: new THREE.Vector3(0, 0, 0) },
            uColor: { value: new THREE.Color(0x4ecdc4) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vUv = uv;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uRippleTime;
            uniform vec3 uRippleCenter;
            uniform vec3 uColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vec2 centeredUv = vUv - 0.5;
                float distToCenter = length(centeredUv) * 2.0;
                if (distToCenter > 1.0) discard;

                // Ripple interaction
                float d = distance(vWorldPosition, uRippleCenter);
                float rippleWave = (uRippleTime - d * 2.0);
                float rippleActive = (rippleWave > 0.0 && rippleWave < 1.0) ? (1.0 - rippleWave) : 0.0;

                float horizonFade = smoothstep(1.0, 0.0, distToCenter);
                float innerFade = smoothstep(0.08, 0.36, distToCenter);
                float breathingMist = 0.5 + sin(uTime * 0.45 + distToCenter * 7.0) * 0.5;
                float contourA = 1.0 - smoothstep(0.0, 0.016, abs(sin(distToCenter * 31.0 + uTime * 0.08)));
                float contourB = 1.0 - smoothstep(0.0, 0.012, abs(sin((vWorldPosition.x * 0.85 + vWorldPosition.z * 0.42) * 7.0)));
                float contours = contourA * 0.18 + contourB * 0.055;

                float opacity = (0.012 + contours + breathingMist * 0.005) * horizonFade * innerFade;
                vec3 finalColor = mix(vec3(0.1, 0.2, 0.2), uColor, 0.54 + breathingMist * 0.16);
                if (rippleActive > 0.0) {
                    opacity += rippleActive * 0.065;
                    finalColor = mix(finalColor, vec3(1.0, 0.88, 0.48), rippleActive);
                }

                gl_FragColor = vec4(finalColor, opacity);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    state.semanticManifold = new THREE.Mesh(manifoldGeo, manifoldMat);
    state.semanticManifold.rotation.x = -Math.PI / 2;
    state.semanticManifold.position.y = -0.8;
    state.scene.add(state.semanticManifold);
}

function initSemanticLens() {
    state.semanticLensGroup = new THREE.Group();
    state.semanticLensGroup.visible = false;
    state.scene.add(state.semanticLensGroup);

    const glowGeo = new THREE.SphereGeometry(0.12, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(0x4ecdc4) },
            uOpacity: { value: 0 },
            uSignalScore: { value: 0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uSignalScore;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 3.0);
                float signalLift = 0.76 + clamp(uSignalScore, 0.0, 1.0) * 0.34;
                float pulse = 0.82 + sin(uTime * 2.4) * 0.18;
                gl_FragColor = vec4(uColor * signalLift, intensity * uOpacity * pulse);
            }
        `,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.NormalBlending,
        depthWrite: false
    });
    state.semanticLensGlow = new THREE.Mesh(glowGeo, glowMat);
    state.semanticLensGroup.add(state.semanticLensGlow);

    const spokeGeo = new THREE.BufferGeometry();
    const spokePos = new Float32Array(12 * 2 * 3);
    const spokeAlpha = new Float32Array(12 * 2);
    spokeGeo.setAttribute('position', new THREE.BufferAttribute(spokePos, 3));
    spokeGeo.setAttribute('alpha', new THREE.BufferAttribute(spokeAlpha, 1));

    const spokeMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(0xfff4ba) }
        },
        vertexShader: `
            attribute float alpha;
            varying float vAlpha;
            void main() {
                vAlpha = alpha;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
                float wave = 0.72 + sin(uTime * 4.0 + vAlpha * 10.0) * 0.28;
                gl_FragColor = vec4(uColor, vAlpha * (0.4 + wave * 0.6));
            }
        `,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false
    });
    state.semanticLensSpokes = new THREE.LineSegments(spokeGeo, spokeMat);
    state.semanticLensGroup.add(state.semanticLensSpokes);
}

function createNodeSporeLayer() {
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
        // Fix 1: adaptive node scaling — hover boost + camera-distance density shrink
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

    // Semantic Lens initialization
    const lensGeo = new THREE.IcosahedronGeometry(0.08, 3);
    const lensMat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0x7ce7dd) },
            opacity: { value: 0.0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color;
            uniform float opacity;
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vec3 viewDir = normalize(-vPosition);
                float fresnel = pow(1.0 - dot(viewDir, vNormal), 3.0);
                float pulse = sin(time * 2.5) * 0.15 + 0.85;
                float dist = length(vPosition);
                gl_FragColor = vec4(color * pulse, (fresnel * 0.6 + 0.05) * opacity);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    state.focusLens = new THREE.Mesh(lensGeo, lensMat);
    state.focusLens.visible = false;
    state.scene.add(state.focusLens);

    // Step Inside bloom: warm point light at anchor node when trailDepth === 2
    // This gives the "earned glow" for the inside label
    const anchorBloomLight = new THREE.PointLight(0xfff4ba, 0, 0.6);
    anchorBloomLight.name = 'anchorBloomLight';
    state.scene.add(anchorBloomLight);
    state.anchorBloomLight = anchorBloomLight;
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

// 10/10 Polish: Search Corridor Hero Moment
export function triggerSearchHeroMoment(anchorIndex) {
    if (!state.pointsMaterial || !state.pointsMaterial.userData.shader || !state.nodePositions) return;
    const shader = state.pointsMaterial.userData.shader;

    if (Number.isFinite(anchorIndex) && state.nodePositions[anchorIndex]) {
        const pos = state.nodePositions[anchorIndex];
        shader.uniforms.uRippleCenter.value.set(pos.x, pos.y, pos.z);
    } else {
        shader.uniforms.uRippleCenter.value.set(0, 0, 0);
    }

    shader.uniforms.uRippleTime.value = 0.0;

    const duration = 2400;
    const startTime = performance.now();

    function animateHero(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);

        if (state.pointsMaterial && state.pointsMaterial.userData.shader) {
            const currentShader = state.pointsMaterial.userData.shader;
            currentShader.uniforms.uRippleTime.value = progress * 15.0;

            const bloom = Math.sin(progress * Math.PI);
            currentShader.uniforms.uGlowIntensity.value = bloom * 3.0;
        }

        if (progress < 1.0) {
            requestAnimationFrame(animateHero);
        } else if (state.pointsMaterial && state.pointsMaterial.userData.shader) {
            state.pointsMaterial.userData.shader.uniforms.uGlowIntensity.value = 0.0;
            state.pointsMaterial.userData.shader.uniforms.uRippleTime.value = -1000.0;
        }
    }

    requestAnimationFrame(animateHero);
}

// 10/10 Polish: Corridor node glow — light up all nodes along the search trail when it blooms
// Called from animateCameraToSearchCorridor before camera flight begins
let _corridorGlowToken = 0;
const CORRIDOR_NODE_BOOST = 1.18;
const CORRIDOR_NODE_REDUCED_BOOST = 1.06;
const CORRIDOR_NODE_FADE_DELAY = 480;
const CORRIDOR_NODE_FADE_DURATION = 900;
const CORRIDOR_NODE_REDUCED_FADE_DELAY = 0;
const CORRIDOR_NODE_REDUCED_FADE_DURATION = 260;

export function triggerCorridorNodeGlow(anchorIndex, routeIndices = []) {
    if (!state.pointsMaterial?.userData?.shader || !state.nodePositions) return;
    const shader = state.pointsMaterial.userData.shader;
    // Clear any in-progress glow from a previous call (new call takes priority)
    for (const k of Object.keys(_corridorGlowNodes)) { delete _corridorGlowNodes[k]; }
    const allIndices = [...new Set([anchorIndex, ...(routeIndices || [])])].filter((i) => Number.isFinite(i));
    const reduceMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targetBoost = reduceMotion ? CORRIDOR_NODE_REDUCED_BOOST : CORRIDOR_NODE_BOOST;
    const fadeStartDelay = reduceMotion ? CORRIDOR_NODE_REDUCED_FADE_DELAY : CORRIDOR_NODE_FADE_DELAY;
    const fadeDuration = reduceMotion ? CORRIDOR_NODE_REDUCED_FADE_DURATION : CORRIDOR_NODE_FADE_DURATION;
    const token = ++_corridorGlowToken;

    // Stagger: anchor glows first, route nodes follow with small delays
    allIndices.forEach((idx, order) => {
        const delay = idx === anchorIndex ? 0 : 80 + order * 40;
        setTimeout(() => {
            if (token !== _corridorGlowToken) return;
            if (!state.nodePositions[idx]) return;

            const pos = state.nodePositions[idx];
            shader.uniforms.uHoverNodePos.value.set(pos.x, pos.y, pos.z);
            // Target boost drives the lerp in the render loop (uHoverBoost pushes toward 1.35)
            // We set a temporary override state tracked via a token flag
            _corridorGlowNodes[idx] = {
                startedAt: performance.now(),
                fadeStartDelay,
                fadeDuration,
                targetBoost
            };
            shader.uniforms.uHoverBoost.value = targetBoost;

            setTimeout(() => {
                if (token !== _corridorGlowToken) return;
                _corridorGlowNodes[idx] = null;
                // Don't reset boost here — let the render loop lerp naturally back to 1.0
            }, fadeStartDelay + fadeDuration);
        }, delay);
    });
}

// Transient per-node glow override timestamps (cleared after fade)
const _corridorGlowNodes = {};

export function updateCorridorNodeGlow(frameNow) {
    // This is called from the main animation loop to decay corridor glows
    if (!state.pointsMaterial?.userData?.shader) return;
    const shader = state.pointsMaterial.userData.shader;
    let anyActive = false;
    for (const idx of Object.keys(_corridorGlowNodes)) {
        const key = Number(idx);
        const glowState = _corridorGlowNodes[key];
        if (!glowState) continue;
        const startedAt = typeof glowState === 'number' ? glowState : glowState.startedAt;
        const fadeStartDelay = typeof glowState === 'number' ? CORRIDOR_NODE_FADE_DELAY : glowState.fadeStartDelay;
        const fadeDuration = typeof glowState === 'number' ? CORRIDOR_NODE_FADE_DURATION : glowState.fadeDuration;
        const targetBoost = typeof glowState === 'number' ? CORRIDOR_NODE_BOOST : glowState.targetBoost;
        const elapsed = frameNow - startedAt;
        if (elapsed > fadeStartDelay) {
            const fadeProgress = Math.min((elapsed - fadeStartDelay) / fadeDuration, 1);
            const boost = 1.0 + (targetBoost - 1.0) * (1.0 - fadeProgress);
            shader.uniforms.uHoverBoost.value = boost;
            if (fadeProgress >= 1.0) {
                _corridorGlowNodes[key] = null;
            } else {
                anyActive = true;
            }
        } else {
            anyActive = true;
        }
    }
    return anyActive;
}

// =============================================================================
// Search Corridor Hero Moment — Thread Drawing Animation + Particle Trail
// =============================================================================

/**
 * Creates a bezier-approximated corridor path from anchor to a target point.
 * Returns an array of Vector3 positions along the curve.
 */
function getCorridorPathPoints(anchorPos, targetPos, segments = 20) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Slight arch upward in Y for the corridor feel
        const x = anchorPos.x + (targetPos.x - anchorPos.x) * t;
        const y = anchorPos.y + (targetPos.y - anchorPos.y) * t + Math.sin(t * Math.PI) * 0.04;
        const z = anchorPos.z + (targetPos.z - anchorPos.z) * t;
        points.push(new THREE.Vector3(x, y, z));
    }
    return points;
}

/**
 * Builds corridor line geometry using LineGeometry for thick strands.
 * Each segment carries a progress value used by the shader to clip un-drawn parts.
 * Returns a LineGeometry object.
 */
function buildCorridorLineGeometry(anchorIndex, routeIndices) {
    const anchorPos = state.nodePositions[anchorIndex];
    if (!anchorPos) return null;

    const targetIndices = (routeIndices || [])
        .filter((i) => Number.isFinite(i) && i !== anchorIndex)
        .slice(0, 12);

    if (targetIndices.length === 0) return null;

    const SEGMENTS = 24;
    const positions = [];
    const colors = [];

    targetIndices.forEach((targetIdx) => {
        const targetPos = state.nodePositions[targetIdx];
        if (!targetPos) return;
        const pathPoints = getCorridorPathPoints(anchorPos, targetPos, SEGMENTS);

        // Build continuous path for LineGeometry
        for (let s = 0; s <= SEGMENTS; s++) {
            const p = pathPoints[s];
            const t = s / SEGMENTS;
            positions.push(p.x, p.y, p.z);
            colors.push(0.42 + (0.74 - 0.42) * t, 0.92 + (0.86 - 0.92) * t, 0.88 + (0.68 - 0.88) * t);
        }
    });

    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);

    // We'll use the 'instanceDistance' or a custom attribute for progress-based clipping.
    // LineGeometry doesn't make it easy to add per-vertex attributes that stay synced
    // with instances, so we'll use a custom instanced attribute.
    const segmentCount = targetIndices.length * SEGMENTS;
    const progressArr = new Float32Array(segmentCount);
    for (let i = 0; i < targetIndices.length; i++) {
        for (let s = 0; s < SEGMENTS; s++) {
            progressArr[i * SEGMENTS + s] = s / SEGMENTS;
        }
    }
    geometry.setAttribute('instanceProgress', new THREE.InstancedBufferAttribute(progressArr, 1));

    return geometry;
}

/**
 * Builds the particle trail geometry — sparse particles that flow along each corridor path.
 * Returns THREE.Points object.
 */
function buildCorridorParticleTrail(anchorIndex, routeIndices) {
    const anchorPos = state.nodePositions[anchorIndex];
    if (!anchorPos) return null;

    const targetIndices = (routeIndices || [])
        .filter((i) => Number.isFinite(i) && i !== anchorIndex)
        .slice(0, 12);

    if (targetIndices.length === 0) return null;

    const PARTICLE_COUNT = 36;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const progressValues = new Float32Array(PARTICLE_COUNT);
    const lifetimes = new Float32Array(PARTICLE_COUNT);
    const segmentOffsets = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);

    let pIdx = 0;
    targetIndices.forEach((targetIdx) => {
        const targetPos = state.nodePositions[targetIdx];
        if (!targetPos) return;
        const pathPoints = getCorridorPathPoints(anchorPos, targetPos, 24);
        const particlesForPath = Math.floor(PARTICLE_COUNT / Math.max(targetIndices.length, 1));

        for (let p = 0; p < particlesForPath && pIdx < PARTICLE_COUNT; p++, pIdx++) {
            const baseProgress = (p / particlesForPath);
            const offset = (Math.random() - 0.5) * 0.08;
            const segIdx = Math.min(Math.floor(baseProgress * (pathPoints.length - 1)), pathPoints.length - 1);
            const pt = pathPoints[segIdx];

            positions[pIdx * 3] = pt.x + offset;
            positions[pIdx * 3 + 1] = pt.y + offset * 0.5;
            positions[pIdx * 3 + 2] = pt.z + offset;

            progressValues[pIdx] = baseProgress;
            lifetimes[pIdx] = 0.5 + Math.random() * 0.5;
            segmentOffsets[pIdx] = offset;
            speeds[pIdx] = 0.3 + Math.random() * 0.7;
        }
    });

    for (let i = pIdx; i < PARTICLE_COUNT; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = -9999;
        positions[i * 3 + 2] = 0;
        progressValues[i] = 1.0;
        lifetimes[i] = 0;
        segmentOffsets[i] = 0;
        speeds[i] = 1.0;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aProgress', new THREE.BufferAttribute(progressValues, 1));
    particleGeometry.setAttribute('aLifetime', new THREE.BufferAttribute(lifetimes, 1));
    particleGeometry.setAttribute('aOffset', new THREE.BufferAttribute(segmentOffsets, 1));
    particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uDrawProgress: { value: 0 },
            uFadeOpacity: { value: 1.0 }
        },
        vertexShader: `
            attribute float aProgress;
            attribute float aLifetime;
            attribute float aOffset;
            attribute float aSpeed;
            uniform float uTime;
            uniform float uDrawProgress;
            uniform float uFadeOpacity;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                float particleT = clamp((uDrawProgress - aProgress * 0.5) / max(aLifetime, 0.001), 0.0, 1.0);
                vProgress = particleT;
                vAlpha = smoothstep(0.0, 0.15, particleT) * smoothstep(1.0, 0.7, particleT);

                vec3 pos = position;
                pos.x += sin(uTime * 3.0 + aOffset * 20.0) * 0.006;
                pos.y += cos(uTime * 2.5 + aOffset * 15.0) * 0.004;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = (1.4 + aSpeed * 0.9) * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vAlpha;
            varying float vProgress;
            uniform float uFadeOpacity;

            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float dist = length(uv);
                if (dist > 0.5) discard;
                float alpha = (1.0 - dist * 2.0) * vAlpha * 0.34 * uFadeOpacity;
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 ember = vec3(0.74, 0.86, 0.68);
                vec3 color = mix(teal, ember, vProgress);
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.frustumCulled = false;
    return particles;
}

// Corridor animation state
let _corridorAnimState = null;
let _corridorAnimStartTime = null;
const CORRIDOR_SOFT_DRAW_DURATION = 950;
const CORRIDOR_SOFT_TOTAL_DURATION = 2800;

export function triggerSearchCorridorAnimation(anchorIndex, routeIndices = []) {
    disposeSearchCorridorAnimation();
    const reduceMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    triggerCorridorBloom();
    if (!state.scene) return;

    const lineGeometry = buildCorridorLineGeometry(anchorIndex, routeIndices);
    if (!lineGeometry) return;

    // Custom ShaderMaterial that clips segments based on uDrawProgress
    const lineMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uDrawProgress: { value: 0.0 },
            uFadeOpacity: { value: 1.0 },
            uTime: { value: 0 }
        },
        vertexShader: `
            attribute float progress;
            varying float vProgress;
            varying vec3 vColor;
            uniform float uDrawProgress;
            uniform float uTime;

            void main() {
                vProgress = progress;
                vColor = color;

                // Clip vertices not yet drawn by pushing them off-screen
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                if (progress > uDrawProgress) {
                    mvPosition.xy = vec2(99999.0, 99999.0);
                }
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vProgress;
            varying vec3 vColor;
            uniform float uFadeOpacity;
            uniform float uTime;

            void main() {
                // Soft glow: fade in at the drawing tip
                float tipFade = smoothstep(vProgress - 0.08, vProgress + 0.02, vProgress);
                float alpha = tipFade * 0.38 * uFadeOpacity;

                // Pulsing brightness along the thread
                float pulse = 0.72 + sin(uTime * 1.8 + vProgress * 8.0) * 0.055;
                vec3 finalColor = vColor * pulse;

                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true
    });

    const corridorLine = new THREE.LineSegments(lineGeometry, lineMaterial);

    // Build particle trail
    const particles = buildCorridorParticleTrail(anchorIndex, routeIndices);

    const corridorGroup = new THREE.Group();
    corridorGroup.name = 'search-corridor-hero';
    corridorGroup.add(corridorLine);
    if (particles) corridorGroup.add(particles);

    state.scene.add(corridorGroup);
    state.searchCorridorGroup = corridorGroup;

    _corridorAnimStartTime = performance.now();
    _corridorAnimState = {
        anchorIndex,
        routeIndices,
        line: corridorLine,
        particles,
        material: lineMaterial,
        done: false
    };
}

export function updateSearchCorridorAnimation(frameNow) {
    if (!_corridorAnimState || !_corridorAnimState.line) return false;
    const st = _corridorAnimState;
    const elapsed = frameNow - _corridorAnimStartTime;

    const drawProgress = Math.min(elapsed / CORRIDOR_SOFT_DRAW_DURATION, 1.0);

    // Update line shader
    if (st.material?.uniforms) {
        st.material.uniforms.uDrawProgress.value = drawProgress;
        st.material.uniforms.uTime.value = frameNow / 1000;
    }

    // Update particle shader
    if (st.particles?.material?.uniforms) {
        st.particles.material.uniforms.uDrawProgress.value = drawProgress;
        st.particles.material.uniforms.uTime.value = frameNow / 1000;
    }

    // Fade out after draw completes
    if (elapsed > CORRIDOR_SOFT_DRAW_DURATION) {
        const fadeProgress = Math.min(
            (elapsed - CORRIDOR_SOFT_DRAW_DURATION) / (CORRIDOR_SOFT_TOTAL_DURATION - CORRIDOR_SOFT_DRAW_DURATION),
            1.0
        );
        const lineOpacity = 1.0 - fadeProgress;
        if (st.material?.uniforms?.uFadeOpacity) st.material.uniforms.uFadeOpacity.value = lineOpacity;
        if (st.material) st.material.opacity = lineOpacity;
        if (st.particles?.material?.uniforms?.uFadeOpacity) st.particles.material.uniforms.uFadeOpacity.value = lineOpacity;
        if (st.particles?.material) st.particles.material.opacity = lineOpacity;
    }

    if (elapsed >= CORRIDOR_SOFT_TOTAL_DURATION) {
        disposeSearchCorridorAnimation();
        return false;
    }
    return true;
}

export function disposeSearchCorridorAnimation() {
    if (state.searchCorridorGroup) {
        state.scene.remove(state.searchCorridorGroup);
        state.searchCorridorGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        state.searchCorridorGroup = null;
    }
    _corridorAnimState = null;
    _corridorAnimStartTime = null;
}

export function cancelAnimate() {
    if (_rafId !== null) {
        window.cancelAnimationFrame(_rafId);
        _rafId = null;
    }
    if (_webglRestoreTimer) {
        window.clearTimeout(_webglRestoreTimer);
        _webglRestoreTimer = null;
    }
    _webglContextLost = false;
    // Flush any pending draws before tearing down WebGL resources.
    // Headless screenshot readback can trigger context loss; flushing
    // ensures the frame is committed before we tear down.
    const renderer = state.renderer;
    const scene = state.scene;
    const camera = state.camera;
    if (renderer && scene && camera) {
        try { renderer.render(scene, camera); } catch (_) { /* context already gone */ }
    }
    // Nullify active handles before disposal so accidental RAF re-entry exits safely.
    state.scene = null;
    state.camera = null;
    state.controls = null;
    // Dispose renderer and remove its canvas.
    if (renderer) {
        renderer.dispose();
        const canvas = renderer.domElement;
        if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    }
    state.renderer = null;
    disposeObject3D(scene);
    state.pointsMesh = null;
    state.pointsMaterial = null;
    state.nodeSporeMesh = null;
    state.nodeSporeHitMesh = null;
    state.nodeSporeMaterial = null;
}

export function deinit() {
    cancelAnimate();
    state.sceneRevealActive = false;
    state.sceneRevealCameraStart = null;
    state.sceneRevealCameraEnd = null;
}

function updateSelectedNodeMotes(worldPos, time, isInside) {
    if (!state.focusMoteGroup || !Array.isArray(state.focusMotes)) return;
    const hasFocus = Boolean(worldPos);
    const targetOpacity = hasFocus ? (isInside ? 0.64 : 0.54) : 0;
    state.focusMoteGroup.visible = hasFocus || state.focusMotes.some((mote) => mote.material.opacity > 0.01);
    if (hasFocus) {
        state.focusMoteGroup.position.copy(worldPos);
        state.focusMoteGroup.rotation.set(
            Math.sin(time * 0.19) * 0.14,
            Math.sin(time * 0.13 + 0.7) * 0.18,
            Math.sin(time * 0.17 + 1.4) * 0.1
        );
    }

    state.focusMotes.forEach((mote, index) => {
        const data = mote.userData || {};
        mote.material.opacity += (targetOpacity - mote.material.opacity) * 0.08;
        mote.visible = mote.material.opacity > 0.01;
        if (!hasFocus) return;

        const phase = (data.phase || 0) + time * (data.speed || 0.45);
        const radius = data.radius || 0.028;
        const breath = 0.82 + Math.sin(time * 0.92 + index * 0.61) * 0.16 + Math.sin(time * 0.31 + index) * 0.07;
        const curl = phase + Math.sin(time * 0.42 + index) * 0.62 + Math.sin(time * 0.17 + index * 1.7) * 0.28;
        const wander = data.drift || 0.6;
        const verticalDrift = Math.sin(phase * 0.61) * radius * 0.46 + Math.sin(time * 0.58 + index) * 0.009 * wander;
        mote.position.set(
            Math.cos(curl) * radius * breath + Math.sin(time * 0.33 + index * 2.1) * 0.004 * wander,
            (data.lift || 0) + verticalDrift,
            Math.sin(curl) * radius * (data.tilt || 0.72) * breath + Math.cos(time * 0.29 + index * 1.6) * 0.004 * wander
        );
        const moteScale = (data.scale || 0.007) * (1.0 + Math.sin(time * 1.08 + index * 0.7) * 0.24 + Math.sin(time * 0.41 + index) * 0.09);
        mote.scale.set(moteScale, moteScale, 1);
    });
}

function updateSelectedNodePetals(worldPos, time, isInside) {
    if (!state.focusPetalGroup || !Array.isArray(state.focusPetals)) return;
    const hasFocus = Boolean(worldPos);
    const targetOpacity = hasFocus ? (isInside ? 0.5 : 0.42) : 0;
    state.focusPetalGroup.visible = hasFocus || state.focusPetals.some((petal) => petal.material.opacity > 0.01);
    if (hasFocus) {
        state.focusPetalGroup.position.copy(worldPos);
        state.focusPetalGroup.rotation.set(
            Math.sin(time * 0.12 + 0.3) * 0.1,
            Math.sin(time * 0.16 + 1.1) * 0.16,
            Math.sin(time * 0.1 + 2.1) * 0.08
        );
    }

    state.focusPetals.forEach((petal, index) => {
        const data = petal.userData || {};
        petal.material.opacity += (targetOpacity - petal.material.opacity) * 0.1;
        petal.visible = petal.material.opacity > 0.01;
        if (!hasFocus) return;

        const phase = (data.phase || 0) + time * (data.speed || 0.28);
        const radius = data.radius || 0.026;
        const sway = Math.sin(time * 0.38 + index * 0.77) * 0.38 + Math.sin(time * 0.16 + index * 1.43) * 0.18;
        const angle = phase + sway;
        const breath = 0.82 + Math.sin(time * 0.64 + index) * 0.18 + Math.sin(time * 0.23 + index * 1.8) * 0.07;
        petal.position.set(
            Math.cos(angle) * radius * breath,
            (data.lift || 0) + Math.sin(phase * 0.61) * radius * 0.34,
            Math.sin(angle) * radius * (data.tilt || 0.72) * breath
        );
        petal.material.rotation = angle + Math.PI * 0.5 + Math.sin(time * 0.46 + index) * 0.44;
        const length = (data.length || 0.042) * (1.0 + Math.sin(time * 0.72 + index * 0.9) * 0.18);
        const thickness = data.thickness || 0.008;
        petal.scale.set(length, thickness, 1);
    });
}

function updateSelectedNodeFilaments(worldPos, time, isInside) {
    if (!state.focusFilaments?.geometry?.attributes?.position) return;
    const positions = state.focusFilaments.geometry.attributes.position.array;
    const hasFocus = Boolean(worldPos);
    const targetOpacity = hasFocus ? (isInside ? 0.48 : 0.36) : 0;
    state.focusFilaments.material.opacity += (targetOpacity - state.focusFilaments.material.opacity) * 0.1;
    state.focusFilaments.visible = state.focusFilaments.material.opacity > 0.01;
    if (!hasFocus) {
        positions.fill(0);
        state.focusFilaments.geometry.attributes.position.needsUpdate = true;
        return;
    }

    let offset = 0;
    for (let i = 0; i < FOCUS_WISP_COUNT; i += 1) {
        const seed = i * 1.713;
        const phase = time * (0.2 + i * 0.008) + seed;
        const rootOrbit = 0.004 + (i % 7) * 0.0011;
        const length = 0.017 + (i % 8) * 0.0024 + Math.sin(time * 0.34 + seed) * 0.002;
        const curlStrength = 0.0045 + (i % 6) * 0.0017;
        const lean = Math.sin(seed * 1.37) * (0.0022 + (i % 5) * 0.0009);
        const shell = 0.66 + (i % 4) * 0.11;
        const root = {
            x: worldPos.x + Math.cos(seed + time * 0.06) * rootOrbit,
            y: worldPos.y - 0.007 + Math.sin(seed * 0.7 + time * 0.09) * 0.0035,
            z: worldPos.z + Math.sin(seed + time * 0.055) * rootOrbit * 0.78
        };
        let prev = null;
        for (let s = 0; s <= FOCUS_WISP_SEGMENTS; s += 1) {
            const t = s / FOCUS_WISP_SEGMENTS;
            const taper = Math.sin(t * Math.PI);
            const ease = t * t * (3 - 2 * t);
            const curl = phase + ease * (2.25 + i * 0.055) + Math.sin(time * 0.34 + seed + t * 5.6) * 0.72 + Math.sin(time * 0.12 + seed * 2.1 + t * 9.2) * 0.3;
            const drift = Math.sin(time * 0.48 + seed + t * 6.8) * taper;
            const lateral = curlStrength * ease * (0.62 + taper * shell);
            const float = Math.sin(time * 0.28 + seed * 0.8 + t * 3.7) * taper * 0.0075;
            const point = {
                x: root.x + Math.cos(curl) * lateral + Math.sin(phase * 1.1 + t * 4.6) * taper * 0.0032 + lean * ease,
                y: root.y + Math.sin(t * Math.PI * 0.74) * length * 0.24 + ease * length * 0.07 + float,
                z: root.z + Math.sin(curl) * lateral * 0.9 + drift * 0.0048
            };
            if (prev) {
                positions[offset++] = prev.x;
                positions[offset++] = prev.y;
                positions[offset++] = prev.z;
                positions[offset++] = point.x;
                positions[offset++] = point.y;
                positions[offset++] = point.z;
            }
            prev = point;
        }
    }
    while (offset < positions.length) positions[offset++] = 0;
    state.focusFilaments.geometry.attributes.position.needsUpdate = true;
}

function getSemanticLensNeighborIndices(focusedNode) {
    const point = state.points?.[focusedNode];
    const leadId = point?.lead_id === null || point?.lead_id === undefined ? '' : String(point.lead_id);
    if (!leadId) return [];
    const semanticNode = state.semanticNeighborMapByLeadId ? state.semanticNeighborMapByLeadId.get(leadId) : null;
    if (!semanticNode?.neighbors?.length || !state.pointIndexByLeadId?.size) return [];
    return semanticNode.neighbors
        .map((neighbor) => state.pointIndexByLeadId.get(String(neighbor.leadId)))
        .filter((index) => Number.isFinite(index) && index !== focusedNode && state.nodePositions?.[index])
        .slice(0, 12);
}

/**
 * Animate interaction sprites as soft in-scene blooms instead of flat target rings.
 */
function updateInteractionVisuals(now, hoveredNode, focusedNode) {
    if (!state.pointsMesh) return;
    const time = now / 1000;

    // Determine active node (focus takes priority over hover)
    const activeNode = Number.isFinite(focusedNode) && focusedNode >= 0 ? focusedNode
        : (Number.isFinite(hoveredNode) && hoveredNode >= 0 ? hoveredNode : null);
    const isFocused = activeNode === focusedNode;

    // 1. Disable ring/reticle sprites; hover is handled by shader lift and cursor feedback.
    if (state.hoverHalo) {
        state.hoverHalo.material.opacity = 0;
        state.hoverHalo.visible = false;
    }

    // 2. Handle Focus Bloom & Core
    if (state.focusCore) {
        const focusIdx = focusedNode;
        const hasFocus = Number.isFinite(focusIdx) && focusIdx >= 0;
        const isInside = state.trailDepth === 2;
        const isActive = hasFocus && isFocused;
        const auraTargetOpacity = hasFocus ? (isInside ? 0.26 : 0.18) : 0.0;
        const coreTargetOpacity = hasFocus ? (isInside ? 0.98 : 0.92) : 0.0;
        const baseScale = isActive ? 0.042 : (isInside ? 0.039 : 0.037);

        if (state.focusHalo) {
            state.focusHalo.material.color.setHex(isActive ? 0x8ff8ed : 0x7ce7dd);
            state.focusHalo.material.opacity += (auraTargetOpacity - state.focusHalo.material.opacity) * 0.1;
            state.focusHalo.visible = state.focusHalo.material.opacity > 0.01;
        }

        if (isActive) {
            state.focusCore.material.color.setHex(0xeafffb);
            const corePulse = 1.0 + Math.sin(time * 1.2) * 0.09;
            state.focusCore.scale.set(baseScale * corePulse, baseScale * corePulse, 1);
        } else if (hasFocus) {
            state.focusCore.material.color.setHex(0xcffcf4);
            const corePulse = isInside
                ? 1.0 + Math.sin(time * 1.25) * 0.09
                : 1.0 + Math.sin(time * 2.4) * 0.045;
            state.focusCore.scale.set(baseScale * corePulse, baseScale * corePulse, 1);
        }

        state.focusCore.material.opacity += (coreTargetOpacity - state.focusCore.material.opacity) * 0.15;

        state.focusCore.visible = state.focusCore.material.opacity > 0.01;

        if (hasFocus && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx];
            const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos);

            if (state.focusHalo) {
                const auraPulse = 1.0 + Math.sin(time * 0.82) * 0.09 + Math.sin(time * 0.31 + 1.4) * 0.035;
                state.focusHalo.position.copy(worldPos);
                const auraScale = isInside ? 0.13 : 0.11;
                state.focusHalo.scale.set(auraScale * auraPulse, auraScale * auraPulse, 1);
            }
            state.focusCore.position.copy(worldPos);
            updateSelectedNodeMotes(worldPos, time, isInside);
            updateSelectedNodePetals(worldPos, time, isInside);
            updateSelectedNodeFilaments(worldPos, time, isInside);
        } else {
            updateSelectedNodeMotes(null, time, false);
            updateSelectedNodePetals(null, time, false);
            updateSelectedNodeFilaments(null, time, false);
        }
    } else {
        updateSelectedNodeMotes(null, time, false);
        updateSelectedNodePetals(null, time, false);
        updateSelectedNodeFilaments(null, time, false);
    }

    if (state.semanticLensGroup && state.semanticLensGlow && state.semanticLensSpokes) {
        const focusIdx = focusedNode;
        const hasFocus = Number.isFinite(focusIdx) && focusIdx >= 0 && state.nodePositions?.[focusIdx];
        const isInside = state.trailDepth === 2;
        const group = state.semanticLensGroup;
        const glowUniforms = state.semanticLensGlow.material?.uniforms;
        const spokes = state.semanticLensSpokes;

        if (!hasFocus || !glowUniforms) {
            if (glowUniforms?.uOpacity) glowUniforms.uOpacity.value += (0 - glowUniforms.uOpacity.value) * 0.12;
            group.visible = Boolean(glowUniforms?.uOpacity?.value > 0.01);
            spokes.visible = false;
        } else {
            const focusPos = state.nodePositions[focusIdx];
            const worldPos = new THREE.Vector3(focusPos.x, focusPos.y, focusPos.z);
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos);
            group.position.copy(worldPos);
            group.visible = true;
            if (!isInside) {
                spokes.visible = false;
            }
            const targetOpacity = isInside ? 0.2 : 0.11;
            glowUniforms.uOpacity.value += (targetOpacity - glowUniforms.uOpacity.value) * 0.12;

            const positionAttr = spokes.geometry.attributes.position;
            const alphaAttr = spokes.geometry.attributes.alpha;
            const positions = positionAttr.array;
            const alphas = alphaAttr.array;
            positions.fill(0);
            alphas.fill(0);

            if (isInside) {
                const maxSpokeLength = 0.12;
                let positionOffset = 0;
                let alphaOffset = 0;
                getSemanticLensNeighborIndices(focusIdx).forEach((neighborIndex) => {
                    const neighborPos = state.nodePositions[neighborIndex];
                    const neighborWorld = new THREE.Vector3(neighborPos.x, neighborPos.y, neighborPos.z);
                    if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(neighborWorld);
                    neighborWorld.sub(worldPos);
                    const distance = neighborWorld.length();
                    if (distance <= 0.0001) return;
                    neighborWorld.normalize().multiplyScalar(Math.min(distance, maxSpokeLength));
                    positions[positionOffset++] = 0;
                    positions[positionOffset++] = 0;
                    positions[positionOffset++] = 0;
                    positions[positionOffset++] = neighborWorld.x;
                    positions[positionOffset++] = neighborWorld.y;
                    positions[positionOffset++] = neighborWorld.z;
                    alphas[alphaOffset++] = 0.025;
                    alphas[alphaOffset++] = 0.18;
                });
                spokes.visible = positionOffset > 0;
            }
            positionAttr.needsUpdate = true;
            alphaAttr.needsUpdate = true;
        }
    }

    // 3. Handle Semantic Lens (The icosahedron focus lens)
    if (state.focusLens) {
        const focusIdx = focusedNode;
        const hasFocus = Number.isFinite(focusIdx) && focusIdx >= 0;
        const isDiving = hasFocus && state.semanticDiveMode;

        const targetOpacity = hasFocus ? (isDiving ? 0.36 : 0.24) : 0.0;
        const lerpSpeed = isDiving ? 0.15 : 0.09;

        if (state.focusLens.material.uniforms) {
            state.focusLens.material.uniforms.opacity.value += (targetOpacity - state.focusLens.material.uniforms.opacity.value) * lerpSpeed;
            state.focusLens.material.uniforms.time.value = time;
            state.focusLens.material.uniforms.color.value.setHex(isDiving ? 0xd8fff8 : 0x9fffee);
        }
        state.focusLens.visible = state.focusLens.material.uniforms?.opacity?.value > 0.01;

        if (state.focusLens.visible && hasFocus && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx];
            const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos);
            state.focusLens.position.copy(worldPos);

            const rotationSpeed = isDiving ? 0.02 : 0.008;
            const pulseFreq = isDiving ? 1.35 : 0.82;
            const pulseAmp = isDiving ? 0.17 : 0.09;
            const baseScale = isDiving ? 1.55 : 1.28;
            const pulse = baseScale + Math.sin(time * pulseFreq) * pulseAmp + Math.sin(time * 0.37 + 1.7) * 0.04;

            state.focusLens.rotation.y += rotationSpeed;
            state.focusLens.rotation.z += rotationSpeed * 0.5;
            state.focusLens.scale.set(pulse, pulse, pulse);
        }
    }
    // 4. Step Inside anchor bloom light
    if (state.anchorBloomLight) {
        const focusIdx = focusedNode;
        const hasFocus = Number.isFinite(focusIdx) && focusIdx >= 0;
        const isInside = state.trailDepth === 2;
        const targetIntensity = hasFocus ? (isInside ? 0.62 : 0.24) : 0.0;
        state.anchorBloomLight.intensity += (targetIntensity - state.anchorBloomLight.intensity) * 0.08;
        if (hasFocus && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx];
            state.anchorBloomLight.position.set(pos.x, pos.y, pos.z);
            if (state.pointsMesh?.localToWorld) state.anchorBloomLight.position.applyMatrix4(state.pointsMesh.matrixWorld);
        }
        state.anchorBloomLight.visible = state.anchorBloomLight.intensity > 0.01;
    }
}

// === Micro-demo Visual Bridge ===

let _demoHighlightNode = null;
let _demoHighlightBoost = 1.0;

/**
 * Listener for micro-demo visual events.
 * Handles the 'glow' and 'arrived' phases for the showcase node.
 */
if (typeof document !== 'undefined' && document && document.addEventListener) {
    document.addEventListener('micro-demo-node-highlight', (e) => {
        const { index, phase } = e.detail;
        if (!state.pointsMaterial?.userData?.shader) return;
        const shader = state.pointsMaterial.userData.shader;

        if (phase === 'glow' || phase === 'gliding') {
            _demoHighlightNode = index;
            _demoHighlightBoost = (phase === 'gliding') ? 1.55 : 1.35;
            const pos = state.nodePositions[index];
            if (pos) {
                shader.uniforms.uHoverNodePos.value.set(pos.x, pos.y, pos.z);
                shader.uniforms.uHoverBoost.value = _demoHighlightBoost;
                shader.uniforms.uHoverRadius.value = 0.12;
            }
        } else if (phase === 'arrived') {
            _demoHighlightNode = index;
            _demoHighlightBoost = 1.65;
            // Trigger a ripple on arrival
            if (typeof triggerSearchHeroMoment === 'function') {
                triggerSearchHeroMoment(index);
            }
        } else if (phase === 'cleanup' || phase === 'wide_view') {
            _demoHighlightNode = null;
            _demoHighlightBoost = 1.0;
            shader.uniforms.uHoverBoost.value = 1.0;
        }
    });

    document.addEventListener('micro-demo-name-pulse', () => {
        const nameEl = document.querySelector('#info-panel h2');
        if (nameEl) {
            nameEl.style.transition = 'text-shadow 0.4s ease, color 0.4s ease';
            nameEl.style.color = '#fff';
            nameEl.style.textShadow = '0 0 12px rgba(78, 205, 196, 0.8)';
            setTimeout(() => {
                nameEl.style.color = '';
                nameEl.style.textShadow = '';
            }, 600);
        }
    });
}

export function animate() {
    if (_webglContextLost) {
        _rafId = null;
        return;
    }
    // Guard against calling animate() after cancelAnimate() nullified handles.
    if (!state.renderer || !state.scene || !state.camera) {
        _rafId = null;
        return;
    }

    // Only continue the loop if we're in the galaxy view or explicitly forced
    if (state.currentView !== 'galaxy' && !state.forceAnimate) {
        _rafId = null;
        return;
    }

    _rafId = requestAnimationFrame(animate);

    const frameNow = performance.now();
        const sceneFrameMs = state.scenePerformanceDiagnostics.lastFrameAt
            ? Math.min(250, Math.max(0, frameNow - state.scenePerformanceDiagnostics.lastFrameAt))
            : 0;
        state.scenePerformanceDiagnostics.lastFrameAt = frameNow;
        if (state.focusFrameDiagnostics.lastFrameAt) {
            const frameMs = Math.min(250, Math.max(0, frameNow - state.focusFrameDiagnostics.lastFrameAt));
            state.focusFrameDiagnostics.sampleCount = Math.min(240, state.focusFrameDiagnostics.sampleCount + 1);
            const smoothingBase = Math.max(1, Math.min(state.focusFrameDiagnostics.sampleCount, 90));
            state.focusFrameDiagnostics.avgFrameMs += (frameMs - state.focusFrameDiagnostics.avgFrameMs) / smoothingBase;
            state.focusFrameDiagnostics.maxFrameMs = Math.max(frameMs, state.focusFrameDiagnostics.maxFrameMs * 0.992);
            state.focusThreadDiagnostics.avgFrameMs = state.focusFrameDiagnostics.avgFrameMs;
            state.focusThreadDiagnostics.maxFrameMs = state.focusFrameDiagnostics.maxFrameMs;
        }
        state.focusFrameDiagnostics.lastFrameAt = frameNow;
        updateAutoRotateSoftResume(frameNow);

        const controlsStart = performance.now();
        focusCameraAssistIsActive(frameNow);
        if (state.controls) {
            state.controls.update();
        }
        const controlsMs = performance.now() - controlsStart;

        const nodeMotionStart = performance.now();
        const revealProgress = typeof window.getSceneRevealProgress === 'function' ? window.getSceneRevealProgress(frameNow) : 1;
        const pointsRevealProgress = easeOutQuint(Math.min(1, Math.max(0, revealProgress / 0.7)));
        const cameraRevealProgress = easeInOutCubic(Math.min(1, Math.max(0, revealProgress)));

        // Smooth node positions toward staged targets, then layer focus-pocket breathing.
        let anyNodeMoved = false;
        if (state.nodePositions && state.targetPositions) {
            const lerpFactor = state.nodesAreSettling ? 0.14 : 0.08;
            state.nodePositions.forEach((pos, i) => {
                const target = state.targetPositions[i];
                if (!target) return;

                const dx = target.x - pos.x;
                const dy = target.y - pos.y;
                const dz = target.z - pos.z;

                if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001 || Math.abs(dz) > 0.0001) {
                    pos.x += dx * lerpFactor;
                    pos.y += dy * lerpFactor;
                    pos.z += dz * lerpFactor;
                    setNodeSporeInstanceMatrix(i);
                    anyNodeMoved = true;
                }
            });

            if (typeof window.applyFocusPocketBreathing === 'function') {
                if (window.applyFocusPocketBreathing(frameNow, state.nodePositions)) {
                    state.focusPocketMotionByIndex.forEach((_, idx) => {
                        setNodeSporeInstanceMatrix(idx);
                        // Keep hit-proxy aligned with visual spore for focus-pocket nodes during breathing
                        if (state.nodeSporeHitMesh && state.navState.focusPocketIndices?.includes(idx)) {
                            setNodeSporeInstanceMatrix(idx, state.nodeSporeHitMesh);
                        }
                    });
                    anyNodeMoved = true;
                }
            }

            if (anyNodeMoved) {
                if (state.nodeSporeMesh) state.nodeSporeMesh.instanceMatrix.needsUpdate = true;
                if (state.nodeSporeHitMesh) state.nodeSporeHitMesh.instanceMatrix.needsUpdate = true;
                state.myceliumDirty = true;
            }
        }

        if (state.sceneRevealActive && state.sceneRevealCameraStart && state.sceneRevealCameraEnd && state.focusedNode === null) {
            if (!state.camera) return;
            state.camera.position.lerpVectors(state.sceneRevealCameraStart, state.sceneRevealCameraEnd, cameraRevealProgress);
            if (state.controls) {
                state.controls.target.set(0, 0, 0);
            }
            if (revealProgress >= 1) {
                state.sceneRevealActive = false;
                setSceneRevealDataset(false);
                state.sceneRevealCameraStart = null;
                state.sceneRevealCameraEnd = null;
                scheduleAutoRotateResume(1200);
            }
        }

        // --- Ghost graph: global point cloud becomes faint context in focus modes ---
        if (state.pointsMaterial) {
            const isFocused = Number.isFinite(state.focusedNode);
            const isSemanticDive = state.trailDepth >= 2;
            const isSemanticPocketFocus = state.navState?.threadSource === 'semantic' && state.navState?.focusPocketMeta?.active;
            // Semantic pocket focus owns the scene; non-semantic focus can keep a faint ghost layer.
            const pointsOpacityScale = isFocused
                ? (isSemanticDive || isSemanticPocketFocus ? 0.0 : 0.06)
                : 1.0;
            const pointsSizeScale = isFocused ? 0.44 : 1.0;
            state.pointsMesh.visible = pointsOpacityScale > 0;
            state.pointsMaterial.opacity = state.POINTS_MATERIAL_BASE_OPACITY * SCENE_ATMOSPHERE.pointOpacityScale * pointsRevealProgress * pointsOpacityScale;
            state.pointsMaterial.size = state.POINTS_MATERIAL_BASE_SIZE * (1.06 + pointsRevealProgress * 0.46) * pointsSizeScale;
            if (state.pointsMaterial.userData.shader) {
                state.pointsMaterial.userData.shader.uniforms.uRevealProgress.value = pointsRevealProgress;
            }
        }

        // 10/10 Polish: Fog and Light Choreography
        if (state.scene.fog && state.scene.fog.isFogExp2) {
            state.scene.fog.density = SCENE_ATMOSPHERE.fogDensity * pointsRevealProgress;
        }
        if (state.hemiLight) {
            state.hemiLight.intensity = 0.52 * pointsRevealProgress;
        }
        if (state.dirLight) {
            state.dirLight.intensity = 0.44 * pointsRevealProgress;
        }
        if (state.nodeSporeMaterial) {
            const focusBoost = Number.isFinite(state.focusedNode) ? 1.18 : 1.0;
            state.nodeSporeMaterial.opacity = SCENE_ATMOSPHERE.sporeOpacity * pointsRevealProgress * focusBoost;
        }
        const nodeMotionMs = performance.now() - nodeMotionStart;

        // --- Settling watchdog: track max position delta across focus pocket ---
        if (state.navState.focusPocketIndices.length > 0 || Number.isFinite(state.navState.focusedIndex)) {
            const focusIndices = new Set(state.navState.focusPocketIndices);
            if (Number.isFinite(state.navState.focusedIndex)) focusIndices.add(state.navState.focusedIndex);
            let maxDelta = 0;
            focusIndices.forEach((idx) => {
                const nodePos = state.nodePositions[idx];
                const targetPos = state.targetPositions[idx];
                if (!nodePos || !targetPos) return;
                const dx = Math.abs(nodePos.x - targetPos.x);
                const dy = Math.abs(nodePos.y - targetPos.y);
                const dz = Math.abs(nodePos.z - targetPos.z);
                const delta = Math.max(dx, dy, dz);
                if (delta > maxDelta) maxDelta = delta;
            });
            state._settlingMaxDelta = maxDelta;

            // Settling watchdog: flip nodesAreSettling back to false once positions have
            // stabilised (maxDelta < 0.001) for 3 consecutive frames AND the camera
            // animation has reached at least 96% completion.
            if (state.nodesAreSettling) {
                if (maxDelta < 0.001) {
                    if (!state._settlingLowFrames) state._settlingLowFrames = 0;
                    state._settlingLowFrames++;
                    if (state._settlingLowFrames >= 3) {
                        // Check camera animation progress using actual motion durations so
                        // stagger-delayed nodes are given full time before we clear settling.
                        const transitionAge = performance.now() - state.focusPocketTransitionStartedAt;
                        let maxMotionT = 0;
                        state.focusPocketMotionByIndex.forEach((motion) => {
                            const delay = motion.delay || 0;
                            const duration = motion.duration || 800;
                            const t = Math.min(1, Math.max(0, (transitionAge - delay) / duration));
                            if (t > maxMotionT) maxMotionT = t;
                        });
                        if (maxMotionT >= 0.96) {
                            state.nodesAreSettling = false;
                            state._settlingLowFrames = 0;
                        }
                    }
                } else {
                    state._settlingLowFrames = 0;
                }
            }
        }

        // --- Progressive thread visibility: only show threads when contextually meaningful ---
        const threadsVisible = shouldRenderThreads();

        // Show/hide myceliumGroup based on mode; this also hides focus threads via parent group
        if (state.myceliumGroup) {
            state.myceliumGroup.visible = threadsVisible;
        }

        // Pulse mycelium threads (only active when visible)
        const threadUpdateStart = performance.now();

        // 10/10 Polish: Make breathing speed weather-aware (wind drives the mycelium energy)
        const prefersReduced = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const basePulseSpeed = prefersReduced ? 0.0 : 0.015;
        const windSpeed = state.weather?.wind_speed_10m ?? 8.0; // Default to gentle breeze
        const pulseIncrement = basePulseSpeed * (0.6 + (windSpeed / 15.0));
        state.pulsePhase += pulseIncrement;

        const threadRevealProgress = easeOutQuint(Math.min(1.0, Math.max(0.0, (pointsRevealProgress - 0.25) / 0.5)));
        const graphProfile = getMyceliumPresentationProfile();

        // Only pulse threads when they are visible (mode allows rendering)
        if (threadsVisible) {
            if (state.myceliumCoreLines) {
                state.myceliumCoreLines.material.opacity = getThreadPulseOpacity(
                    graphProfile.core,
                    Math.sin(state.pulsePhase),
                    graphProfile.pulse,
                    threadRevealProgress
                );
            }
            if (state.myceliumWispyLines) {
                state.myceliumWispyLines.material.opacity = getThreadPulseOpacity(
                    graphProfile.wispy,
                    Math.sin(state.pulsePhase * 0.7),
                    graphProfile.pulse * 0.36,
                    threadRevealProgress
                );
            }
            if (state.myceliumBridgeLines) {
                state.myceliumBridgeLines.material.opacity = getThreadPulseOpacity(
                    graphProfile.bridge,
                    Math.sin(state.pulsePhase * 0.45),
                    graphProfile.pulse * 0.28,
                    threadRevealProgress
                );
            }
        } else {
            // Fade out threads when not in a thread-visible mode
            if (state.myceliumCoreLines) state.myceliumCoreLines.material.opacity = 0;
            if (state.myceliumWispyLines) state.myceliumWispyLines.material.opacity = 0;
            if (state.myceliumBridgeLines) state.myceliumBridgeLines.material.opacity = 0;
        }
        if (state.myceliumDirty && threadsVisible) {
            updateMyceliumThreads();
        }
        const threadUpdateMs = performance.now() - threadUpdateStart;
        const overlayUpdateStart = performance.now();
        try {
            // Fix 1 & 5: Update hover shader uniforms before interaction visuals
            // Fix 5: Search result card → node highlight ring via searchGlowIndices
            const _hoverIdx = state.hoverHighlightIndex;
            const _hasHover = Number.isFinite(_hoverIdx) && _hoverIdx >= 0;
            const _focusIdx = state.focusedNode;
            const _hasFocus = Number.isFinite(_focusIdx) && _focusIdx >= 0;
            if (state.pointsMaterial && state.pointsMaterial.userData.shader) {
                const shader = state.pointsMaterial.userData.shader;
                // Fix 3: distinct glow states — hover=teal, focus=yellow, active=bright white+yellow
                // Update hover boost: 1.5x for hover, 1.0 otherwise
                const targetBoost = _hasHover ? 1.5 : 1.0;
                shader.uniforms.uHoverBoost.value += (targetBoost - shader.uniforms.uHoverBoost.value) * 0.2;
                if (_hasHover && state.nodePositions[_hoverIdx]) {
                    const hPos = state.nodePositions[_hoverIdx];
                    shader.uniforms.uHoverNodePos.value.set(hPos.x, hPos.y, hPos.z);
                }
                const focusWakeTarget = _hasFocus ? 1.0 : 0.0;
                if (shader.uniforms.uFocusWake) {
                    shader.uniforms.uFocusWake.value += (focusWakeTarget - shader.uniforms.uFocusWake.value) * 0.14;
                }
                if (_hasFocus && state.nodePositions[_focusIdx] && shader.uniforms.uFocusNodePos) {
                    const fPos = state.nodePositions[_focusIdx];
                    shader.uniforms.uFocusNodePos.value.set(fPos.x, fPos.y, fPos.z);
                }
                if (shader.uniforms.uFocusRadius) {
                    shader.uniforms.uFocusRadius.value += ((state.trailDepth === 2 ? 0.22 : 0.16) - shader.uniforms.uFocusRadius.value) * 0.08;
                }
            }

            if (typeof window.updateFocusSemanticOverlayPositions === 'function') {
                window.updateFocusSemanticOverlayPositions(frameNow);
            }

            // 10/10 Polish: Corridor node glow decay (search trail bloom effect)
            updateCorridorNodeGlow(frameNow);

            // 10/10 Polish: Search corridor hero moment — thread drawing + particle trail
            updateSearchCorridorAnimation(frameNow);

            // 10/10 Polish: Animate interaction sprites (hover/focus halos)
            // Fix 3: pass distinct glow colors — hover=teal, focus=yellow, active=bright white
            updateInteractionVisuals(frameNow, _hasHover ? _hoverIdx : -1, _hasFocus ? _focusIdx : -1);

            // Step Inside: shift camera lookAt to semantic centroid of the focus pocket
            if (typeof window.applySemanticCentroidCamera === 'function') {
                window.applySemanticCentroidCamera(frameNow);
            }

            // 10/10 Polish: Ensure the lens glow is also updated with time and score
            if (state.semanticLensGlow?.material?.uniforms) {
                const glowUniforms = state.semanticLensGlow.material.uniforms;
                glowUniforms.uTime.value = frameNow / 1000;
                const focusedPoint = (Number.isFinite(state.focusedNode) && state.focusedNode >= 0 && state.focusedNode < state.points.length) ? state.points[state.focusedNode] : null;
                if (focusedPoint && typeof window.calculateSignalScore === 'function') {
                    glowUniforms.uSignalScore.value = window.calculateSignalScore(focusedPoint);
                }
            }
            updateInspectedStrandOverlayFrame(frameNow);
            updateRouteTraceOverlayFrame(frameNow);
            updateArrivalHandoffOverlayFrame(frameNow);
            if (typeof window.updateClusterLabels === 'function') {
                window.updateClusterLabels();
            }
        } catch (overlayErr) {
            console.warn('overlay update threw:', overlayErr);
        }
        const overlayUpdateMs = performance.now() - overlayUpdateStart;

        let renderMs = 0;
        if (state.renderer && state.scene && state.camera) {
            const renderStart = performance.now();
            state.renderer.render(state.scene, state.camera);
            renderMs = performance.now() - renderStart;
        }
        sampleScenePerformance(sceneFrameMs, {
            controlsMs,
            nodeMotionMs,
            threadUpdateMs,
            glowMs: overlayUpdateMs,
            lensMs: 0,
            updateMs: controlsMs + nodeMotionMs + threadUpdateMs + overlayUpdateMs,
            renderMs
        });
    }

// Global exposure for compatibility
if (typeof window !== "undefined") {
    window.updateCameraViewportOffset = updateCameraViewportOffset;
    window.createPoints = createPoints;
    window.syncNodeSporeColorsFromPointColors = syncNodeSporeColorsFromPointColors;
    window.createMycelium = createMycelium;
    window.triggerSearchHeroMoment = triggerSearchHeroMoment;
    window.triggerCorridorNodeGlow = triggerCorridorNodeGlow;
    window.triggerSearchCorridorAnimation = triggerSearchCorridorAnimation;
    window.updateMyceliumThreads = updateMyceliumThreads;
    window.shouldRenderThreads = shouldRenderThreads;
    window.shouldRenderBridgeThreads = shouldRenderBridgeThreads;
    window.animate = animate;
    window.deinit = deinit;
    window.__semanticScenePerformanceProbe = getScenePerformanceProbe;
    // Preserve corridor functions from esbuild tree-shaking — called from animation loop via window
    window.__keepCorridorFns = () => { void buildCorridorLineGeometry; void buildCorridorParticleTrail; void updateSearchCorridorAnimation; };
}
