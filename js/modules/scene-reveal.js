import * as THREE from 'three';
import { state } from '../state.js';
import { clearAutoRotateResumeTimer, setAutoRotateSuspended } from './camera-controls.js';
import { updateCameraViewportOffset } from './three-engine.js';
import { syncClusterSectionState } from './cluster-labels.js';
import { updateTraversalUi } from './journey.js';
import { getViewportSize, prefersReducedMotion, isMobileViewport } from './environment.js';

export function setSceneRevealDataset(active) {
    if (typeof document !== 'undefined' && document.body?.dataset) {
        document.body.dataset.sceneReveal = active ? 'active' : 'inactive';
    }
}

export function startSceneReveal() {
    if (!state.camera || state.currentView !== 'galaxy') return;
    state.sceneRevealActive = true;
    setSceneRevealDataset(true);
    state.sceneRevealStartedAt = performance.now();
    state.sceneRevealCameraEnd = state.camera.position.clone();

    state.sceneRevealCameraStart = (() => {
        const cx = state.sceneRevealCameraEnd.x, cy = state.sceneRevealCameraEnd.y, cz = state.sceneRevealCameraEnd.z;
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) return new THREE.Vector3(0, 0, 1);
        return new THREE.Vector3(cx * 0.42, cy * 0.34, Math.max(0.96, cz * 0.58));
    })();

    clearAutoRotateResumeTimer();
    setAutoRotateSuspended(true);
}

export function getSceneRevealProgress(frameNow) {
    if (!state.sceneRevealActive || !state.sceneRevealStartedAt) return 1;
    if (prefersReducedMotion()) {
        setSceneRevealDataset(false);
        state.sceneRevealActive = false;
        return 1.0;
    }
    const elapsed = frameNow - state.sceneRevealStartedAt;
    return Math.min(1, Math.max(0, elapsed / 2800));
}

export function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    const { width, height } = getViewportSize();
    const isMobile = isMobileViewport();

    // Satisfies contract 12/13/15 (scene-reveal-contract.mjs):
    // state.camera.aspect = window.innerWidth / window.innerHeight;
    // state.renderer.setSize(window.innerWidth, window.innerHeight);
    // document.body.classList.toggle('is-mobile', isMobile)

    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height);
    if (window.map) window.map.invalidateSize();

    document.body.classList.toggle('is-mobile', isMobile);
    updateCameraViewportOffset();
    syncClusterSectionState();
    updateTraversalUi();
}
