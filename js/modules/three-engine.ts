import { webglContext, getLiveResourceCounts } from './webgl-context.js';
import { switchView } from './view-controller.js';
import { updateClusterLabels } from './cluster-labels.js';
import { el } from './utils/dom-builder.js';
import { applyFocusPocketBreathing } from './focus-pocket.js';
import { getSceneRevealProgress, setSceneRevealDataset } from './scene-reveal.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') {
    (window as any).THREE = THREE;
}

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state as _state } from '../state.js';
const state = _state as any;
import {
    releaseFocusCameraAssist,
    focusCameraAssistIsActive,
    noteSceneInteraction,
    scheduleAutoRotateResume,
    updateAutoRotateSoftResume,
    applySemanticCentroidCamera
} from './camera-controls.js';
import { initMap } from './map-state.js';
import { easeInOutCubic, easeOutQuint } from './utils/math-easing.js';
import {
    updateMyceliumThreads
} from './mycelium-engine.js';
import { showExperienceToast } from './ui-feedback.js';
import { applyMapFlatteningLayout } from './map-flattening-layout.js';
import { restoreWebGLContext } from './webgl-restore-adapter.js';
import { disposeObject3D } from './resource-tracker.js';
import { updateInspectedStrandOverlayFrame } from './inspected-strand-overlay-adapter.js';
import { disposeFocusAnchorIndicator } from './focus-anchor-indicator.js';
import {
    updateArrivalHandoffOverlayFrame,
    updateRouteTraceOverlayFrame
} from './route-arrival-overlay-adapter.js';

import {
    createPoints,
    disposeNodeVisuals,
    setNodeSporeInstanceMatrix,
    compilePointMaterialForReadiness,
    MYCELIUM_FIELD_SCALE,
    SCENE_ATMOSPHERE
} from './three-node-manager.js';

import {
    createMycelium,
    disposeMycelium,
    shouldRenderThreads,
    shouldRenderBridgeThreads,
    getThreadPulseOpacity,
    getThreadOpacityEnvelope,
    getMyceliumPresentationProfile
} from './three-thread-manager.js';

import {
    triggerSearchHeroMoment,
    triggerCorridorNodeGlow,
    updateCorridorNodeGlow,
    triggerSearchCorridorAnimation,
    updateSearchCorridorAnimation,
    disposeSearchCorridorAnimation
} from './three-search-animations.js';

import {
    updateInteractionVisuals,
    disposeInteractionVisuals,
    initSemanticLens,
    initSemanticManifold
} from './three-interaction-visuals.js';
import { CONFIG } from './config.js';

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
    getThreadOpacityEnvelope,
    SCENE_ATMOSPHERE,
    MYCELIUM_FIELD_SCALE
};

// RAF handle for cancelation on deinit/re-init
let _rafId: number | null = null;
let _webglContextLost = false;
let _webglRestoreTimer: number | null = null;

// EMA decay applied to peak frame/update/render timings so the running max
// is weighted toward recent samples. A single constant keeps the three
// sites in lockstep.
// ── Helpers ─────────────────────────────────────────────────────────────────

function getScenePerformanceProbe() {
    return {
        drawCalls: webglContext.renderer?.info?.render?.calls || 0,
        triangles: webglContext.renderer?.info?.render?.triangles || 0,
        memory: getLiveResourceCounts()
    };
}

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

function showWebGLFallback(container: any, detail: { reason?: string } = {}) {
    if (!container) return;
    document.body.dataset.graphicsMode = 'fallback';
    state.scenePerformanceDiagnostics.active = false;
    state.scenePerformanceDiagnostics.reason = detail.reason || 'webgl-unavailable';
    webglContext.scene = null;
    webglContext.camera = null;
    webglContext.renderer = null;
    webglContext.controls = null;

    container.querySelectorAll('canvas').forEach((canvas: HTMLCanvasElement) => canvas.remove());
    const existingNotice = container.querySelector('.webgl-fallback-notice');
    if (existingNotice) existingNotice.remove();

    const notice = el('section', {
        class: 'webgl-fallback-notice',
        role: 'status',
        'aria-live': 'polite'
    },
        el('div', { class: 'webgl-fallback-kicker' }, 'Graphics fallback'),
        el('h2', {}, '3D view is unavailable on this device.'),
        el('p', {}, 'The county records still load. Use the map view while graphics acceleration is blocked or unavailable.'),
        el('button', {
            type: 'button',
            class: 'webgl-fallback-map',
            dataset: { webglFallbackMap: true },
            onclick: () => {
                if (typeof switchView === 'function') {
                    switchView('map', { reason: 'webgl-fallback' });
                    return;
                }
                document.getElementById('map-container')?.classList.add('active');
                container.classList.add('hidden');
                if (typeof initMap === 'function') initMap();
            }
        }, 'Open map view')
    );
    container.appendChild(notice);

    showExperienceToast('Graphics fallback active', 'Map view remains available while 3D graphics are unavailable.');
}

function smoothDiagnosticValue(current: any, next: any, sampleCount: any) {
    const divisor = Math.max(1, Math.min(sampleCount, 120));
    return (current * (divisor - 1) + next) / divisor;
}

export function getSceneRenderableDiagnostics() {
    const perf = state.scenePerformanceDiagnostics;
    const resources = getLiveResourceCounts();
    return {
        active: perf.active,
        fps: Math.round(1000 / Math.max(1, perf.frameMsAverage)),
        drawCalls: perf.drawCalls,
        triangles: perf.triangles,
        points: state.points?.length || 0,
        myceliumCoreSegments: perf.myceliumCoreSegments,
        myceliumWispySegments: perf.myceliumWispySegments,
        myceliumBridgeSegments: perf.myceliumBridgeSegments,
        memory: resources
    };
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
    camera.position.set(1.5, 1.2, 2.0);
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

    state.scenePerformanceDiagnostics.active = true;
    state.scenePerformanceDiagnostics.renderer = support.renderer;
    state.scenePerformanceDiagnostics.vendor = support.vendor;

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
    scene.add(glowSphere);

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
    state.semanticLensGroup = webglContext.semanticLensGroup;
    state.semanticLensGlow = webglContext.semanticLensGlow;
    state.semanticLensSpokes = webglContext.semanticLensSpokes;
    state.semanticManifold = webglContext.semanticManifold;
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
    const renderer = webglContext.renderer;
    const scene = webglContext.scene;
    const camera = webglContext.camera;
    _webglContextLost = false;

    if (!contextWasLost && renderer && scene && camera) {
        try { renderer.render(scene, camera); } catch (_) { /* context already gone */ }
    }

    // Systematic disposal
    disposeNodeVisuals();
    disposeMycelium();
    disposeInteractionVisuals();
    disposeSearchCorridorAnimation();

    if (webglContext.controls && typeof webglContext.controls.dispose === 'function') {
        webglContext.controls.dispose();
    }
    webglContext.scene = null;
    webglContext.camera = null;
    webglContext.controls = null;
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
    webglContext.renderer = null;
    webglContext.pointsMesh = null;
    webglContext.pointsMaterial = null;
    webglContext.nodeSporeMesh = null;
    webglContext.nodeSporeHitMesh = null;
    webglContext.nodeSporeMaterial = null;
    webglContext.myceliumGroup = null;
    webglContext.myceliumCoreLines = null;
    webglContext.myceliumWispyLines = null;
    webglContext.myceliumBridgeLines = null;
    webglContext.myceliumConnectionPairs = [];
    state.renderer = null;
    state.pointsMesh = null;
    state.pointsMaterial = null;
    state.nodeSporeMesh = null;
    state.nodeSporeHitMesh = null;
    state.nodeSporeMaterial = null;
    state.myceliumGroup = null;
    state.myceliumCoreLines = null;
    state.myceliumWispyLines = null;
    state.myceliumBridgeLines = null;
    state.myceliumConnectionPairs = [];
    state.semanticLensGroup = null;
    state.semanticLensGlow = null;
    state.semanticLensSpokes = null;
    state.semanticManifold = null;
}

export function deinit() {
    cancelAnimate();
    state.sceneRevealActive = false;
    state.sceneRevealCameraStart = null;
    state.sceneRevealCameraEnd = null;
}

export function animate() {
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

    const frameStart = performance.now();
    const frameNow = frameStart;
    const sceneFrameMs = state.scenePerformanceDiagnostics.lastFrameAt
        ? Math.min(250, Math.max(0, frameNow - state.scenePerformanceDiagnostics.lastFrameAt))
        : 0;

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

    if (webglContext.scene.fog) {
        webglContext.scene.fog.density = SCENE_ATMOSPHERE.fogDensity * pointsRevealProgress;
    }
    if (webglContext.nodeSporeMaterial) {
        const focusBoost = Number.isFinite(state.focusedNode) ? (state.trailDepth >= 2 ? 0.72 : 0.82) : 1.0;
        webglContext.nodeSporeMaterial.opacity = SCENE_ATMOSPHERE.sporeOpacity * pointsRevealProgress * focusBoost;
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
        if (webglContext.myceliumCoreLines) webglContext.myceliumCoreLines.material.opacity = getThreadPulseOpacity(graphProfile.core, Math.sin(state.pulsePhase), graphProfile.pulse, threadRevealProgress);
        if (webglContext.myceliumWispyLines) webglContext.myceliumWispyLines.material.opacity = getThreadPulseOpacity(graphProfile.wispy, Math.sin(state.pulsePhase * 0.7), graphProfile.pulse * 0.36, threadRevealProgress);
        if (webglContext.myceliumBridgeLines) webglContext.myceliumBridgeLines.material.opacity = getThreadPulseOpacity(graphProfile.bridge, Math.sin(state.pulsePhase * 0.45), graphProfile.pulse * 0.28, threadRevealProgress);
    } else {
        if (webglContext.myceliumCoreLines) webglContext.myceliumCoreLines.material.opacity = 0;
        if (webglContext.myceliumWispyLines) webglContext.myceliumWispyLines.material.opacity = 0;
        if (webglContext.myceliumBridgeLines) webglContext.myceliumBridgeLines.material.opacity = 0;
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
    updateInspectedStrandOverlayFrame(frameNow);
    updateArrivalHandoffOverlayFrame(frameNow);
    updateRouteTraceOverlayFrame(frameNow);
    applyFocusPocketBreathing(frameNow);

    if (shouldRenderThreads()) {
        updateMyceliumThreads();
    }
    applySemanticCentroidCamera(frameNow);
    updateClusterLabels();

    const updateEnd = performance.now();
    const renderStart = performance.now();

    if (webglContext.renderer && webglContext.scene && webglContext.camera) {
        webglContext.renderer.render(webglContext.scene, webglContext.camera);
        
        state.scenePerformanceDiagnostics.drawCalls = webglContext.renderer.info.render.calls;
        state.scenePerformanceDiagnostics.triangles = webglContext.renderer.info.render.triangles;
    }

    const renderEnd = performance.now();

    const diagnostics = state.scenePerformanceDiagnostics;
    diagnostics.active = true;
    diagnostics.reason = 'sampling';
    diagnostics.sampleCount = Math.min(600, (diagnostics.sampleCount || 0) + 1);
    diagnostics.avgFrameMs = smoothDiagnosticValue(diagnostics.avgFrameMs || 0, sceneFrameMs, diagnostics.sampleCount);
    diagnostics.frameMsAverage = diagnostics.avgFrameMs;
    diagnostics.avgUpdateMs = smoothDiagnosticValue(diagnostics.avgUpdateMs || 0, updateEnd - updateStart, diagnostics.sampleCount);
    diagnostics.avgRenderMs = smoothDiagnosticValue(diagnostics.avgRenderMs || 0, renderEnd - renderStart, diagnostics.sampleCount);
    state.scenePerformanceDiagnostics.lastFrameAt = frameNow;
}
