import { webglContext, getLiveResourceCounts } from './webgl-context.js';
import { switchView } from './view-controller.js';
import { updateClusterLabels } from './cluster-labels.js';
import { applyFocusPocketBreathing } from './focus-pocket.js';
import { getSceneRevealProgress, setSceneRevealDataset } from './scene-reveal.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') {
    window.THREE = THREE;
}

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state, withStateMutation } from '../state.js';
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
    disposeSearchCorridorAnimation,
    disposeHeroAnimation
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
let _rafId = null;
let _webglContextLost = false;
let _webglRestoreTimer = null;

// EMA decay applied to peak frame/update/render timings so the running max
// is weighted toward recent samples. A single constant keeps the three
// sites in lockstep.
const SCENE_PERF_EMA_DECAY = 0.992;

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

let _webglFallbackClickHandler = null;

function showWebGLFallback(container, detail = {}) {
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
    if (existingNotice) {
        if (_webglFallbackClickHandler) {
            const existingButton = existingNotice.querySelector('[data-webgl-fallback-map]');
            existingButton?.removeEventListener('click', _webglFallbackClickHandler);
            _webglFallbackClickHandler = null;
        }
        existingNotice.remove();
    }

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
    _webglFallbackClickHandler = () => {
        if (typeof switchView === 'function') {
            switchView('map', { reason: 'webgl-fallback' });
            return;
        }
        document.getElementById('map-container')?.classList.add('active');
        container.classList.add('hidden');
        initMap();
    };
    mapButton?.addEventListener('click', _webglFallbackClickHandler);

    showExperienceToast('Graphics fallback active', 'Map view remains available while 3D graphics are unavailable.');
}

function smoothDiagnosticValue(current, next, sampleCount) {
    const divisor = Math.max(1, Math.min(sampleCount, 120));
    return current + (next - current) / divisor;
}

export function getSceneRenderableDiagnostics() {
    const perf = state.scenePerformanceDiagnostics;
    return {
        active: perf.active,
        fps: Math.round(1000 / Math.max(1, perf.avgFrameMs || 0)),
        drawCalls: perf.drawCalls,
        triangles: perf.triangles,
        points: state.points?.length || 0,
        myceliumCoreSegments: perf.myceliumCoreSegments,
        myceliumWispySegments: perf.myceliumWispySegments,
        myceliumBridgeSegments: perf.myceliumBridgeSegments,
        memory: getLiveResourceCounts()
    };
}

function sampleScenePerformance(frameMs, timings = {}) {
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

// eslint-disable-next-line no-unused-vars -- retained as a local contract guard for retired window.__semanticScenePerformanceProbe.
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
        withStateMutation(() => { state.scenePerformanceDiagnostics.reason = 'webgl-context-lost'; });
        showExperienceToast('Graphics context paused', 'The scene will restore automatically.');
    }, false);

    canvas.addEventListener('webglcontextrestored', () => {
        _webglContextLost = false;
        withStateMutation(() => { state.scenePerformanceDiagnostics.reason = 'webgl-context-restored'; });
        if (_webglRestoreTimer) window.clearTimeout(_webglRestoreTimer);
        _webglRestoreTimer = window.setTimeout(() => {
            _webglRestoreTimer = null;
            showExperienceToast('Graphics context restored', 'Rebuilding the semantic scene.');
            restoreWebGLContext().catch((err) => console.error('WebGL context restore reinit failed:', err));
        }, 80);
    }, false);
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

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(SCENE_ATMOSPHERE.fogColor, SCENE_ATMOSPHERE.fogDensity);
    webglContext.scene = scene;
    state.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(2.05, 1.55, 2.75);
    camera.lookAt(0, 0, 0);
    webglContext.camera = camera;
    state.camera = camera;

    // 10/10 Polish: Cinema Lighting Rig
    // hemisphere sky/ground ambient at modest intensity so the spore layer's
    // vertex colors are visible via MeshPhongMaterial diffuse term.
    const hemiLight = new THREE.HemisphereLight(0xe8f4ff, 0x080820, 0.35);
    scene.add(hemiLight);
    webglContext.hemiLight = hemiLight;
    state.hemiLight = hemiLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(-2, 3, 5);
    scene.add(dirLight);
    webglContext.dirLight = dirLight;
    state.dirLight = dirLight;

    const ambientLight = new THREE.AmbientLight(0x1a1510, 0.4);
    scene.add(ambientLight);
    webglContext.ambientLight = ambientLight;

    try {
        state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
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
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.querySelectorAll('canvas').forEach((canvas) => {
        if (canvas !== state.renderer.domElement) canvas.remove();
    });
    state.renderer.domElement.setAttribute('aria-label', 'Semantic business visualization of Montgomery County businesses. Use arrow keys to navigate.');
    state.renderer.domElement.setAttribute('tabindex', '0');
    state.renderer.domElement.setAttribute('role', 'application');
    bindWebGLContextResilience(state.renderer);
    container.appendChild(state.renderer.domElement);
    webglContext.renderer = state.renderer;

    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.rotateSpeed = CONFIG.ORBIT_ROTATE_SPEED_DEFAULT;
    state.controls.zoomSpeed = 1.0;
    state.controls.minDistance = CONFIG.ORBIT_MIN_DISTANCE_DEFAULT;
    state.controls.maxDistance = CONFIG.ORBIT_MAX_DISTANCE_DEFAULT;
    state.controls.enablePan = true;
    state.controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_DEFAULT;
    webglContext.controls = state.controls;

    // Respect user's motion preference at initialization
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        state.autoRotate = false;
        const rotateBtn = document.getElementById('btn-rotate');
        if (rotateBtn) rotateBtn.setAttribute('aria-pressed', 'false');
    }

    state.controls.autoRotate = state.autoRotate && !state.autoRotateSuspended;
    state.controls.autoRotateSpeed = CONFIG.AUTO_ROTATE_BASE_SPEED;
    state.controls.addEventListener('start', () => {
        releaseFocusCameraAssist('user-control');
        noteSceneInteraction(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS);
    });
    state.controls.addEventListener('end', () => {
        scheduleAutoRotateResume(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS);
    });

    // Large semantic atmosphere: a depth cue, not a literal object to inspect.
    const glowGeo = new THREE.SphereGeometry(3.15, 32, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x2a1f0a,
        transparent: true,
        opacity: 0.10,
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
        opacity: 0.015,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const refSphere = new THREE.Mesh(refGeo, refMat);
    refSphere.scale.set(1.12, 0.86, 1.28);
    refSphere.name = 'county-depth-reference';
    state.scene.add(refSphere);

    createPoints();
    createMycelium();
    compilePointMaterialForReadiness();
    initSemanticLens();
    initSemanticManifold();
    document.body.dataset.graphicsMode = 'webgl';
    updateCameraViewportOffset();
    return true;
}

export function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    updateCameraViewportOffset();
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
    // Also clean webglContext intermediary used by the TS module
    webglContext.scene = null;
    webglContext.camera = null;
    webglContext.renderer = null;
    webglContext.controls = null;
    webglContext.hemiLight = null;
    webglContext.dirLight = null;
    webglContext.nodeSporeHitMesh = null;
}

export function deinit() {
    cancelAnimate();
    disposeHeroAnimation();
    state.sceneRevealActive = false;
    state.sceneRevealCameraStart = null;
    state.sceneRevealCameraEnd = null;
    // Tear down node visuals (instanced meshes + tracked GPU textures)
    // and interaction visuals (semantic lens, focus anchor, micro-demo
    // document listeners) so they don't leak across re-inits.
    disposeNodeVisuals();
    disposeInteractionVisuals();
}

export function animate() {
    if (_webglContextLost) {
        _rafId = null;
        return;
    }
    if (!state.renderer || !state.scene || !state.camera) {
        _rafId = null;
        return;
    }
    if (state.currentView !== 'galaxy' && !state.forceAnimate) {
        _rafId = null;
        return;
    }

    _rafId = requestAnimationFrame(animate);

    const frameNow = performance.now();
    const sceneFrameMs = state.scenePerformanceDiagnostics.lastFrameAt
        ? Math.min(250, Math.max(0, frameNow - state.scenePerformanceDiagnostics.lastFrameAt))
        : 0;
    withStateMutation(() => { state.scenePerformanceDiagnostics.lastFrameAt = frameNow; });
    
    updateAutoRotateSoftResume(frameNow);

    const controlsStart = performance.now();
    focusCameraAssistIsActive(frameNow);
    if (state.controls) {
        state.controls.update();
    }
    const controlsMs = performance.now() - controlsStart;

    const nodeMotionStart = performance.now();
    const revealProgress = getSceneRevealProgress(frameNow);
    const pointsRevealProgress = easeOutQuint(Math.min(1, Math.max(0, revealProgress / 0.7)));
    const cameraRevealProgress = easeInOutCubic(Math.min(1, Math.max(0, revealProgress)));

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

        if (applyFocusPocketBreathing(frameNow, state.nodePositions)) {
            state.focusPocketMotionByIndex.forEach((_, idx) => {
                setNodeSporeInstanceMatrix(idx);
            });
            anyNodeMoved = true;
        }

        if (anyNodeMoved) {
            if (state.nodeSporeMesh) state.nodeSporeMesh.instanceMatrix.needsUpdate = true;
            if (state.nodeSporeHitMesh) state.nodeSporeHitMesh.instanceMatrix.needsUpdate = true;
            state.myceliumDirty = true;
        }
    }

    if (state.sceneRevealActive && state.sceneRevealCameraStart && state.sceneRevealCameraEnd && state.focusedNode === null) {
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

    if (state.pointsMaterial) {
        const isFocused = Number.isFinite(state.focusedNode);
        const isSemanticDive = state.trailDepth >= 2;
        const pointsOpacityScale = isFocused ? (isSemanticDive ? 0.16 : 0.24) : 1.0;
        const pointsSizeScale = isFocused ? (isSemanticDive ? 0.52 : 0.62) : 1.0;
        state.pointsMesh.visible = pointsOpacityScale > 0;
        state.pointsMaterial.opacity = 0.32 * SCENE_ATMOSPHERE.pointOpacityScale * pointsRevealProgress * pointsOpacityScale;
        state.pointsMaterial.size = CONFIG.POINTS_MATERIAL_BASE_SIZE * (1.06 + pointsRevealProgress * 0.46) * pointsSizeScale;
        if (state.pointsMaterial.userData.shader) {
            state.pointsMaterial.userData.shader.uniforms.uRevealProgress.value = pointsRevealProgress;
        }
    }

    if (state.scene.fog) {
        state.scene.fog.density = SCENE_ATMOSPHERE.fogDensity * pointsRevealProgress;
    }
    if (state.nodeSporeMaterial) {
        const focusBoost = Number.isFinite(state.focusedNode) ? (state.trailDepth >= 2 ? 0.72 : 0.82) : 1.0;
        state.nodeSporeMaterial.opacity = SCENE_ATMOSPHERE.sporeOpacity * pointsRevealProgress * focusBoost;
    }
    const nodeMotionMs = performance.now() - nodeMotionStart;

    const threadsVisible = shouldRenderThreads();
    if (state.myceliumGroup) {
        state.myceliumGroup.visible = threadsVisible;
    }

    const threadUpdateStart = performance.now();
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const basePulseSpeed = prefersReduced ? 0.0 : 0.015;
    const windSpeed = state.weather?.wind_speed_10m ?? 8.0;
    const pulseIncrement = basePulseSpeed * (0.6 + (windSpeed / 15.0));
    state.pulsePhase = (state.pulsePhase + pulseIncrement) % (Math.PI * 2);

    const threadRevealProgress = easeOutQuint(Math.min(1.0, Math.max(0.0, (pointsRevealProgress - 0.25) / 0.5)));
    const graphProfile = getMyceliumPresentationProfile();

    if (threadsVisible) {
        if (state.myceliumCoreLines) state.myceliumCoreLines.material.opacity = getThreadPulseOpacity(graphProfile.core, Math.sin(state.pulsePhase), graphProfile.pulse, threadRevealProgress);
        if (state.myceliumWispyLines) state.myceliumWispyLines.material.opacity = getThreadPulseOpacity(graphProfile.wispy, Math.sin(state.pulsePhase * 0.7), graphProfile.pulse * 0.36, threadRevealProgress);
        if (state.myceliumBridgeLines) state.myceliumBridgeLines.material.opacity = getThreadPulseOpacity(graphProfile.bridge, Math.sin(state.pulsePhase * 0.45), graphProfile.pulse * 0.28, threadRevealProgress);
    } else {
        if (state.myceliumCoreLines) state.myceliumCoreLines.material.opacity = 0;
        if (state.myceliumWispyLines) state.myceliumWispyLines.material.opacity = 0;
        if (state.myceliumBridgeLines) state.myceliumBridgeLines.material.opacity = 0;
    }
    if (state.myceliumDirty && threadsVisible) {
        updateMyceliumThreads();
    }
    const threadUpdateMs = performance.now() - threadUpdateStart;

    const overlayUpdateStart = performance.now();
    const _hoverIdx = state.hoverHighlightIndex;
    const _hasHover = Number.isFinite(_hoverIdx) && _hoverIdx >= 0;
    const _focusIdx = state.focusedNode;
    const _hasFocus = Number.isFinite(_focusIdx) && _focusIdx >= 0;
    
    if (state.pointsMaterial?.userData?.shader) {
        const shader = state.pointsMaterial.userData.shader;
        const targetBoost = _hasHover ? 1.5 : 1.0;
        shader.uniforms.uHoverBoost.value += (targetBoost - shader.uniforms.uHoverBoost.value) * 0.2;
        if (_hasHover && state.nodePositions[_hoverIdx]) {
            const hPos = state.nodePositions[_hoverIdx];
            shader.uniforms.uHoverNodePos.value.set(hPos.x, hPos.y, hPos.z);
        }
    }

    updateCorridorNodeGlow(frameNow);
    updateSearchCorridorAnimation(frameNow);
    updateInteractionVisuals(frameNow, _hasHover ? _hoverIdx : -1, _hasFocus ? _focusIdx : -1);
    applySemanticCentroidCamera(frameNow);

    try {
        updateInspectedStrandOverlayFrame(frameNow);
        updateRouteTraceOverlayFrame(frameNow);
        updateArrivalHandoffOverlayFrame(frameNow);
    } catch (overlayErr) {
        console.warn('overlay update threw:', overlayErr);
    }

    updateClusterLabels();
    const overlayUpdateMs = performance.now() - overlayUpdateStart;

    const renderStart = performance.now();
    state.renderer.render(state.scene, state.camera);
    const renderMs = performance.now() - renderStart;

    sampleScenePerformance(sceneFrameMs, {
        controlsMs,
        nodeMotionMs,
        threadUpdateMs,
        overlayUpdateMs,
        renderMs
    });
}
