import { webglContext, getLiveResourceCounts } from './webgl-context.ts';
import { switchView } from './view-controller.ts';
import { updateClusterLabels } from './cluster-labels.ts';
import { applyFocusPocketBreathing } from './focus-pocket.ts';
import { getSceneRevealProgress, setSceneRevealDataset } from './scene-reveal.ts';
import * as THREE from 'three';
if (typeof window !== 'undefined') {
    (window as any).THREE = THREE;
}

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state as _state, withStateMutation } from '../state.ts';
const state = _state as any;
import { debugWarn } from './diagnostic-adapter.ts';
import {
    releaseFocusCameraAssist,
    focusCameraAssistIsActive,
    noteSceneInteraction,
    scheduleAutoRotateResume,
    updateAutoRotateSoftResume,
    applySemanticCentroidCamera,
    cancelFocusCameraAnimation
} from './camera-controls.ts';
import { initMap } from './map-state.ts';
import { easeInOutCubic, easeOutQuint } from './utils/math-easing.ts';
import {
    updateMyceliumThreads
} from './mycelium-engine.ts';
import { showExperienceToast } from './ui-feedback.ts';
import { applyMapFlatteningLayout } from './map-flattening-layout.ts';
import { restoreWebGLContext } from './webgl-restore-adapter.ts';
import { disposeObject3D } from './resource-tracker.ts';
import { updateInspectedStrandOverlayFrame } from './inspected-strand-overlay-adapter.ts';
import { disposeFocusAnchorIndicator } from './focus-anchor-indicator.ts';
import {
    updateArrivalHandoffOverlayFrame,
    updateRouteTraceOverlayFrame
} from './route-arrival-overlay-adapter.ts';

import {
    createPoints,
    disposeNodeVisuals,
    setNodeSporeInstanceMatrix,
    compilePointMaterialForReadiness,
    MYCELIUM_FIELD_SCALE,
    SCENE_ATMOSPHERE
} from './three-node-manager.ts';

import {
    createMycelium,
    shouldRenderThreads,
    shouldRenderBridgeThreads,
    getThreadPulseOpacity,
    getMyceliumPresentationProfile
} from './three-thread-manager.ts';

import {
    triggerSearchHeroMoment,
    triggerCorridorNodeGlow,
    updateCorridorNodeGlow,
    triggerSearchCorridorAnimation,
    updateSearchCorridorAnimation,
    disposeSearchCorridorAnimation,
    disposeHeroAnimation
} from './three-search-animations.ts';
import { disposeAudio } from './audio-scape.ts';
import { disposeEventListeners } from './event-bindings.ts';
import { cancelLoadingHide } from './loading-ui.ts';

import {
    updateInteractionVisuals,
    disposeInteractionVisuals,
    initSemanticLens,
    initSemanticManifold
} from './three-interaction-visuals.ts';
import {
    initPostProcessing,
    renderPostProcessing,
    disposePostProcessing,
    resizePostProcessing,
} from './three-postprocessing.ts';
import { CONFIG } from './config.ts';

export {
    updateMyceliumThreads,
    applyMapFlatteningLayout,
    triggerSearchHeroMoment,
    triggerCorridorNodeGlow,
    updateCorridorNodeGlow,
    triggerSearchCorridorAnimation,
    updateSearchCorridorAnimation,
    disposeSearchCorridorAnimation,
    updateInteractionVisuals,
    disposeInteractionVisuals,
    initSemanticLens,
    initSemanticManifold,
    shouldRenderThreads,
    shouldRenderBridgeThreads,
    createPoints,
    createMycelium,
    SCENE_ATMOSPHERE,
    MYCELIUM_FIELD_SCALE
};

// RAF handle for cancelation on deinit/re-init
let _rafId: number | null = null;
let _webglContextLost = false;
let _circuitBreakerTripped = false;
let _webglRestoreTimer: number | null = null;

// EMA decay applied to peak frame/update/render timings so the running max
// is weighted toward recent samples. A single constant keeps the three
// sites in lockstep.
const SCENE_PERF_EMA_DECAY = 0.992;

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectWebGLSupport() {
    if (typeof document === 'undefined') return { supported: false, reason: 'document-unavailable' };
    const canvas = document.createElement('canvas');
    const contextAttributes = {
        alpha: true,
        antialias: true
    };
    try {
        const context = (canvas.getContext('webgl2', contextAttributes)
            || canvas.getContext('webgl', contextAttributes)
            || canvas.getContext('experimental-webgl', contextAttributes)) as WebGLRenderingContext | null;
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
            reason: (error as Error)?.message || 'context-probe-threw'
        };
    }
}

function showWebGLFallback(container: HTMLElement, detail: { supported?: boolean; reason?: string } = {}) {
    if (!container) return;
    document.body.dataset.graphicsMode = 'fallback';
    withStateMutation(() => {
        state.scenePerformanceDiagnostics.active = false;
        state.scenePerformanceDiagnostics.reason = detail.reason || 'webgl-unavailable';
    });
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
    // Build the fallback notice with DOM APIs (not innerHTML) so the
    // structure cannot accidentally become an XSS vector if a future
    // change interpolates a dynamic value. The content here is fully
    // static today, but using createElement/textContent makes it
    // impossible to regress. The data-attribute below preserves the
    // diagnostic reason for any tooling that wants to surface it.
    const kicker = document.createElement('div');
    kicker.className = 'webgl-fallback-kicker';
    kicker.textContent = 'Graphics fallback';

    const heading = document.createElement('h2');
    heading.textContent = '3D view is unavailable on this device.';

    const body = document.createElement('p');
    body.textContent =
        'The county records still load. Use the map view while graphics acceleration is blocked or unavailable.';

    const mapActionButton = document.createElement('button');
    mapActionButton.type = 'button';
    mapActionButton.className = 'webgl-fallback-map';
    mapActionButton.setAttribute('data-webgl-fallback-map', '');
    mapActionButton.textContent = 'Open map view';

    if (detail.reason) {
        notice.setAttribute('data-webgl-fallback-reason', detail.reason);
    }

    notice.appendChild(kicker);
    notice.appendChild(heading);
    notice.appendChild(body);
    notice.appendChild(mapActionButton);
    container.appendChild(notice);

    const mapButton = notice.querySelector<HTMLElement>('[data-webgl-fallback-map]');
    mapButton?.addEventListener('click', () => {
        if (typeof switchView === 'function') {
            switchView('map');
            return;
        }
        document.getElementById('map-container')?.classList.add('active');
        container.classList.add('hidden');
        if (typeof initMap === 'function') initMap();
    });

    showExperienceToast('Graphics fallback active', 'Map view remains available while 3D graphics are unavailable.');
}

function smoothDiagnosticValue(current: number, next: number, sampleCount: number): number {
    const divisor = Math.max(1, Math.min(sampleCount, 120));
    return (current * (divisor - 1) + next) / divisor;
}

export function getSceneRenderableDiagnostics() {
    const perf = state.scenePerformanceDiagnostics;
    const resources = getLiveResourceCounts();
    return {
        active: perf.active,
        fps: Math.round(1000 / Math.max(1, perf.avgFrameMs || 0)),
        drawCalls: perf.drawCalls,
        triangles: perf.triangles,
        points: state.points?.length || 0,
        myceliumCoreSegments: perf.myceliumCoreSegments,
        myceliumWispySegments: perf.myceliumWispySegments,
        myceliumBridgeSegments: perf.myceliumBridgeSegments,
        memory: resources
    };
}

interface ScenePerformanceTimings {
    controlsMs?: number;
    nodeMotionMs?: number;
    threadUpdateMs?: number;
    glowMs?: number;
    lensMs?: number;
    updateMs?: number;
    renderMs?: number;
    overlayUpdateMs?: number;
}

function sampleScenePerformance(frameMs: number, timings: ScenePerformanceTimings = {}) {
    const diagnostics = state.scenePerformanceDiagnostics;
    diagnostics.active = !!(state.renderer && state.scene && state.camera && state.currentView === 'galaxy');
    diagnostics.reason = diagnostics.active ? 'sampling' : 'inactive-view';
    diagnostics.sampleCount = Math.min(600, (diagnostics.sampleCount || 0) + 1);
    diagnostics.avgFrameMs = smoothDiagnosticValue(diagnostics.avgFrameMs || 0, frameMs, diagnostics.sampleCount);
    diagnostics.maxFrameMs = Math.max(frameMs, (diagnostics.maxFrameMs || 0) * SCENE_PERF_EMA_DECAY);
    diagnostics.avgControlsMs = smoothDiagnosticValue(diagnostics.avgControlsMs || 0, timings.controlsMs || 0, diagnostics.sampleCount);
    diagnostics.avgNodeMotionMs = smoothDiagnosticValue(diagnostics.avgNodeMotionMs || 0, timings.nodeMotionMs || 0, diagnostics.sampleCount);
    diagnostics.avgThreadUpdateMs = smoothDiagnosticValue(diagnostics.avgThreadUpdateMs || 0, timings.threadUpdateMs || 0, diagnostics.sampleCount);
    diagnostics.avgGlowMs = smoothDiagnosticValue(diagnostics.avgGlowMs || 0, timings.glowMs || 0, diagnostics.sampleCount);
    diagnostics.avgLensMs = smoothDiagnosticValue(diagnostics.avgLensMs || 0, timings.lensMs || 0, diagnostics.sampleCount);
    diagnostics.avgUpdateMs = smoothDiagnosticValue(diagnostics.avgUpdateMs || 0, timings.updateMs || 0, diagnostics.sampleCount);
    diagnostics.maxUpdateMs = Math.max(timings.updateMs || 0, (diagnostics.maxUpdateMs || 0) * SCENE_PERF_EMA_DECAY);
    diagnostics.avgRenderMs = smoothDiagnosticValue(diagnostics.avgRenderMs || 0, timings.renderMs || 0, diagnostics.sampleCount);
    diagnostics.maxRenderMs = Math.max(timings.renderMs || 0, (diagnostics.maxRenderMs || 0) * SCENE_PERF_EMA_DECAY);
    diagnostics.renderables = getSceneRenderableDiagnostics();
}

export function updateCameraViewportOffset() {
    const camera = webglContext.camera || state.camera;
    if (!camera) return;
    const panel = document.querySelector('.info-panel');
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (panel && panel.classList.contains('active') && width > 768) {
        const rect = panel.getBoundingClientRect();
        const offset = rect.right / 2;
        camera.setViewOffset(width, height, -offset, 0, width, height);
    } else {
        camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
}

export function initThreeJS() {
    // Prevent duplicate loops and clean up old resources before re-init.
    cancelAnimate();

    const container = document.getElementById('canvas-container');
    if (!container) throw new Error('initThreeJS: #canvas-container element not found in DOM');

    const support = detectWebGLSupport();
    if (!support.supported) {
        showWebGLFallback(container, { reason: support.reason });
        return false;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(SCENE_ATMOSPHERE.fogColor, SCENE_ATMOSPHERE.fogDensity);
    webglContext.scene = scene;
    state.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(2.05, 1.55, 2.75);
    camera.lookAt(0, 0, 0);
    webglContext.camera = camera;
    state.camera = camera;

    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });
    } catch (error) {
        console.error('WebGL renderer creation failed; using semantic demo graphics fallback.', error);
        showWebGLFallback(container, { reason: (error as Error)?.message || 'renderer-create-failed' });
        return false;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(SCENE_ATMOSPHERE.fogColor, SCENE_ATMOSPHERE.clearAlpha);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = SCENE_ATMOSPHERE.toneExposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.querySelectorAll('canvas').forEach((canvas) => {
        if (canvas !== renderer.domElement) canvas.remove();
    });
    renderer.domElement.setAttribute('aria-label', 'Semantic business visualization of Montgomery County businesses. Use arrow keys to navigate.');
    renderer.domElement.setAttribute('tabindex', '0');
    renderer.domElement.setAttribute('role', 'application');
    container.appendChild(renderer.domElement);
    webglContext.renderer = renderer;
    state.renderer = renderer;

    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        _webglContextLost = true;
        cancelAnimate();
        showExperienceToast('Graphics connection lost', 'Re-establishing 3D scene...');
    }, false);

    renderer.domElement.addEventListener('webglcontextrestored', () => {
        _webglContextLost = false;
        _webglRestoreTimer = window.setTimeout(() => {
            if (typeof restoreWebGLContext === 'function') {
                restoreWebGLContext().catch((err) => {
                    console.error('Failed to restore WebGL context:', err);
                });
            }
        }, 1000);
    }, false);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;
    controls.minDistance = CONFIG.ORBIT_MIN_DISTANCE_DEFAULT;
    controls.maxDistance = CONFIG.ORBIT_MAX_DISTANCE_DEFAULT;
    controls.enablePan = true;
    controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_DEFAULT;
    webglContext.controls = controls;
    state.controls = controls;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        state.autoRotate = false;
        const rotateBtn = document.getElementById('btn-rotate');
        if (rotateBtn) rotateBtn.setAttribute('aria-pressed', 'false');
    }

    controls.autoRotate = state.autoRotate && !state.autoRotateSuspended;
    controls.autoRotateSpeed = CONFIG.AUTO_ROTATE_BASE_SPEED;
    controls.addEventListener('start', () => {
        releaseFocusCameraAssist('user-control');
        noteSceneInteraction(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS);
    });
    controls.addEventListener('end', () => {
        scheduleAutoRotateResume(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS);
    });

    const hemiLight = new THREE.HemisphereLight(0xe8f4ff, 0x080820, 0);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
    webglContext.hemiLight = hemiLight;
    state.hemiLight = hemiLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, 0);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    webglContext.dirLight = dirLight;
    state.dirLight = dirLight;

    withStateMutation(() => {
        state.scenePerformanceDiagnostics.active = true;
        state.scenePerformanceDiagnostics.renderer = support.renderer;
        state.scenePerformanceDiagnostics.vendor = support.vendor;
    });

    const glowGeo = new THREE.SphereGeometry(3.15, 32, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x0d2024,
        transparent: true,
        opacity: 0.13,
        side: THREE.BackSide
    });
    const glowSphere = new THREE.Mesh(glowGeo, glowMat);
    glowSphere.scale.set(1.16, 0.9, 1.34);
    glowSphere.name = 'semantic-depth-atmosphere';
    scene.add(glowSphere);

    const refGeo = new THREE.SphereGeometry(2.35, 48, 24);
    const refMat = new THREE.MeshBasicMaterial({
        color: 0x4ecdc4,
        wireframe: true,
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const refSphere = new THREE.Mesh(refGeo, refMat);
    refSphere.scale.set(1.12, 0.86, 1.28);
    refSphere.name = 'county-depth-reference';
    scene.add(refSphere);

    createPoints();
    state.pointsMesh = webglContext.pointsMesh;
    state.pointsMaterial = webglContext.pointsMaterial;
    state.nodeSporeMesh = webglContext.nodeSporeMesh;
    state.nodeSporeHitMesh = webglContext.nodeSporeHitMesh;
    state.nodeSporeMaterial = webglContext.nodeSporeMaterial;
    createMycelium();
    state.myceliumGroup = webglContext.myceliumGroup;
    state.myceliumCoreLines = webglContext.myceliumCoreLines;
    state.myceliumWispyLines = webglContext.myceliumWispyLines;
    state.myceliumBridgeLines = webglContext.myceliumBridgeLines;
    state.myceliumConnectionPairs = webglContext.myceliumConnectionPairs;
    compilePointMaterialForReadiness();
    initSemanticLens();
    initSemanticManifold();
    // Initialize postprocessing composer (effects start disabled until premium mode)
    initPostProcessing(renderer, scene, camera);
    document.body.dataset.graphicsMode = 'webgl';
    updateCameraViewportOffset();
    return true;
}

export function onWindowResize() {
    const container = document.getElementById('canvas-container');
    const camera = webglContext.camera || state.camera;
    const renderer = webglContext.renderer || state.renderer;
    if (!container || !camera || !renderer) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    resizePostProcessing(width, height);
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
    const contextWasLost = _webglContextLost;
    _webglContextLost = false;
    const renderer = state.renderer;
    const scene = state.scene;
    const camera = state.camera;
    if (!contextWasLost && renderer && scene && camera) {
        try { renderer.render(scene, camera); } catch (_) { /* context already gone */ }
    }
    if (state.controls && typeof state.controls.dispose === 'function') {
        state.controls.dispose();
    }
    state.scene = null;
    state.camera = null;
    state.controls = null;
    disposeObject3D(scene);
    disposeFocusAnchorIndicator();
    if (renderer) {
        renderer.dispose();
        const canvas = renderer.domElement;
        if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    }
    state.renderer = null;
    state.pointsMesh = null;
    state.pointsMaterial = null;
    state.nodeSporeMesh = null;
    state.nodeSporeHitMesh = null;
    state.nodeSporeMaterial = null;
    // Dispose postprocessing composer before tearing down the renderer
    disposePostProcessing();
    // Also clean webglContext intermediary used by the TS module
    webglContext.scene = null;
    webglContext.camera = null;
    webglContext.renderer = null;
    webglContext.controls = null;
    webglContext.pointsMesh = null;
    webglContext.pointsMaterial = null;
    webglContext.nodeSporeMesh = null;
    webglContext.nodeSporeHitMesh = null;
    webglContext.nodeSporeMaterial = null;
}

export function deinit() {
    cancelAnimate();
    cancelFocusCameraAnimation();
    cancelLoadingHide();
    disposeHeroAnimation();
    state.sceneRevealActive = false;
    state.sceneRevealCameraStart = null;
    state.sceneRevealCameraEnd = null;
    // Explicitly drop the inspected-strand THREE.Group so GC can reclaim
    // the group, its children, and any attached GPU resources promptly.
    if (state.inspectedStrandGroup) {
        state.inspectedStrandGroup = null;
    }
    // Tear down node visuals (instanced meshes + tracked GPU textures)
    // and interaction visuals (semantic lens, focus anchor, micro-demo
    // document listeners) so they don't leak across re-inits.
    disposeNodeVisuals();
    disposeInteractionVisuals();
    disposeAudio();
    disposeEventListeners();
}

export function animate() {
    if (_circuitBreakerTripped) {
        _rafId = null;
        return;
    }
    if (_webglContextLost) {
        _rafId = null;
        return;
    }
    if (!webglContext.renderer || !webglContext.scene || !webglContext.camera) {
        _rafId = null;
        return;
    }
    if (state.currentView !== 'galaxy' && !state.forceAnimate) {
        _rafId = null;
        return;
    }

    _rafId = requestAnimationFrame(animate);
    try {

    const frameStart = performance.now();
    const frameNow = frameStart;
    const sceneFrameMs = state.scenePerformanceDiagnostics.lastFrameAt
        ? Math.min(250, Math.max(0, frameNow - state.scenePerformanceDiagnostics.lastFrameAt))
        : 0;
    withStateMutation(() => { state.scenePerformanceDiagnostics.lastFrameAt = frameNow; });

    updateAutoRotateSoftResume(frameNow);
    focusCameraAssistIsActive(frameNow);
    if (webglContext.controls) {
        webglContext.controls.update();
    }

    const updateStart = performance.now();
    const revealProgress = getSceneRevealProgress(frameNow);
    const pointsRevealProgress = easeOutQuint(Math.min(1, Math.max(0, revealProgress / 0.7)));
    const cameraRevealProgress = easeInOutCubic(Math.min(1, Math.max(0, revealProgress)));

    let anyNodeMoved = false;
    if (state.nodePositions && state.targetPositions) {
        const lerpFactor = state.nodesAreSettling ? 0.14 : 0.08;
        state.nodePositions.forEach((pos: any, i: number) => {
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

        if (applyFocusPocketBreathing(frameNow, state.nodePositions)) {
            state.focusPocketMotionByIndex.forEach((_: any, idx: number) => {
                setNodeSporeInstanceMatrix(idx);
                if (webglContext.nodeSporeHitMesh && state.navState.focusPocketIndices?.includes(idx)) {
                    setNodeSporeInstanceMatrix(idx, webglContext.nodeSporeHitMesh);
                }
            });
            anyNodeMoved = true;
        }

        if (anyNodeMoved) {
            if (webglContext.nodeSporeMesh) webglContext.nodeSporeMesh.instanceMatrix.needsUpdate = true;
            if (webglContext.nodeSporeHitMesh) webglContext.nodeSporeHitMesh.instanceMatrix.needsUpdate = true;
            state.myceliumDirty = true;
        }
    }

    if (state.sceneRevealActive && state.sceneRevealCameraStart && state.sceneRevealCameraEnd && state.focusedNode === null) {
        webglContext.camera.position.lerpVectors(state.sceneRevealCameraStart, state.sceneRevealCameraEnd, cameraRevealProgress);
        if (webglContext.controls) {
            webglContext.controls.target.set(0, 0, 0);
        }
        if (revealProgress >= 1) {
            state.sceneRevealActive = false;
            setSceneRevealDataset(false);
            state.sceneRevealCameraStart = null;
            state.sceneRevealCameraEnd = null;
            scheduleAutoRotateResume(1200);
        }
    }

    if (webglContext.pointsMaterial) {
        const isFocused = Number.isFinite(state.focusedNode);
        const isSemanticDive = state.trailDepth >= 2;
        const pointsOpacityScale = isFocused ? (isSemanticDive ? 0.16 : 0.24) : 1.0;
        const pointsSizeScale = isFocused ? (isSemanticDive ? 0.52 : 0.62) : 1.0;
        if (webglContext.pointsMesh) webglContext.pointsMesh.visible = pointsOpacityScale > 0;
        webglContext.pointsMaterial.opacity = 0.32 * SCENE_ATMOSPHERE.pointOpacityScale * pointsRevealProgress * pointsOpacityScale;
        webglContext.pointsMaterial.size = CONFIG.POINTS_MATERIAL_BASE_SIZE * (1.06 + pointsRevealProgress * 0.46) * pointsSizeScale;
        if (webglContext.pointsMaterial.userData.shader) {
            webglContext.pointsMaterial.userData.shader.uniforms.uRevealProgress.value = pointsRevealProgress;
        }
    }

    if (webglContext.scene.fog && 'density' in webglContext.scene.fog) {
        (webglContext.scene.fog as THREE.FogExp2).density = SCENE_ATMOSPHERE.fogDensity * pointsRevealProgress;
    }
    if (webglContext.nodeSporeMaterial) {
        const focusBoost = Number.isFinite(state.focusedNode) ? (state.trailDepth >= 2 ? 0.72 : 0.82) : 1.0;
        const targetSporeOpacity = SCENE_ATMOSPHERE.sporeOpacity * pointsRevealProgress * focusBoost;
        webglContext.nodeSporeMaterial.opacity += (targetSporeOpacity - webglContext.nodeSporeMaterial.opacity) * 0.12;
    }
    
    const hoveredNode = state.hoverHighlightIndex;
    const focusedNode = state.focusedNode;

    const threadsVisible = shouldRenderThreads();
    if (webglContext.myceliumGroup) {
        webglContext.myceliumGroup.visible = threadsVisible;
    }
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const basePulseSpeed = prefersReduced ? 0.0 : 0.015;
    const windSpeed = state.weather?.wind_speed_10m ?? 8.0;
    const pulseIncrement = basePulseSpeed * (0.6 + (windSpeed / 15.0));
    state.pulsePhase = (state.pulsePhase + pulseIncrement) % (Math.PI * 2);

    const threadRevealProgress = easeOutQuint(Math.min(1.0, Math.max(0.0, (pointsRevealProgress - 0.25) / 0.5)));
    const graphProfile = getMyceliumPresentationProfile();
    if (threadsVisible) {
        if (webglContext.myceliumCoreLines) (webglContext.myceliumCoreLines.material as THREE.Material).opacity = getThreadPulseOpacity(graphProfile.core, Math.sin(state.pulsePhase), graphProfile.pulse, threadRevealProgress);
        if (webglContext.myceliumWispyLines) (webglContext.myceliumWispyLines.material as THREE.Material).opacity = getThreadPulseOpacity(graphProfile.wispy, Math.sin(state.pulsePhase * 0.7), graphProfile.pulse * 0.36, threadRevealProgress);
        if (webglContext.myceliumBridgeLines) (webglContext.myceliumBridgeLines.material as THREE.Material).opacity = getThreadPulseOpacity(graphProfile.bridge, Math.sin(state.pulsePhase * 0.45), graphProfile.pulse * 0.28, threadRevealProgress);
    } else {
        if (webglContext.myceliumCoreLines) (webglContext.myceliumCoreLines.material as THREE.Material).opacity = 0;
        if (webglContext.myceliumWispyLines) (webglContext.myceliumWispyLines.material as THREE.Material).opacity = 0;
        if (webglContext.myceliumBridgeLines) (webglContext.myceliumBridgeLines.material as THREE.Material).opacity = 0;
    }

    if (webglContext.pointsMaterial?.userData?.shader) {
        const shader = webglContext.pointsMaterial.userData.shader;
        const hasHover = Number.isFinite(hoveredNode) && hoveredNode >= 0;
        const targetBoost = hasHover ? 1.5 : 1.0;
        shader.uniforms.uHoverBoost.value += (targetBoost - shader.uniforms.uHoverBoost.value) * 0.2;
        if (hasHover && state.nodePositions[hoveredNode]) {
            const hoverPos = state.nodePositions[hoveredNode];
            shader.uniforms.uHoverNodePos.value.set(hoverPos.x, hoverPos.y, hoverPos.z);
        }
    }

    updateInteractionVisuals(frameNow, hoveredNode, focusedNode);
    updateCorridorNodeGlow(frameNow);
    updateSearchCorridorAnimation(frameNow);

    try {
        updateInspectedStrandOverlayFrame(frameNow);
        updateRouteTraceOverlayFrame(frameNow);
        updateArrivalHandoffOverlayFrame(frameNow);
    } catch (overlayErr) {
        debugWarn('overlay update threw:', overlayErr);
    }

    applyFocusPocketBreathing(frameNow, state.nodePositions);

    if (shouldRenderThreads()) {
        updateMyceliumThreads();
    }
    applySemanticCentroidCamera(frameNow);
    updateClusterLabels();

    const updateEnd = performance.now();
    const renderStart = performance.now();

    if (webglContext.renderer && webglContext.scene && webglContext.camera) {
        // Premium mode: render through EffectComposer; fallback: vanilla render
        const renderedViaComposer = renderPostProcessing();
        if (!renderedViaComposer) {
            webglContext.renderer.render(webglContext.scene, webglContext.camera);
        }
        
        withStateMutation(() => {
            state.scenePerformanceDiagnostics.drawCalls = webglContext.renderer!.info.render.calls;
            state.scenePerformanceDiagnostics.triangles = webglContext.renderer!.info.render.triangles;
        });
    }

    const renderEnd = performance.now();

    sampleScenePerformance(sceneFrameMs, {
        updateMs: updateEnd - updateStart,
        renderMs: renderEnd - renderStart
    });
    } catch (err) {
        console.error("[three-engine] Unhandled exception in animate loop:", err);
        _circuitBreakerTripped = true;
    }
}
