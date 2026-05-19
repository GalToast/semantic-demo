import * as THREE from 'three';
import { state } from '../state.js';

export function startSceneReveal() {
    if (!state.camera || state.currentView !== 'galaxy') return;
    state.sceneRevealActive = true;
    state.sceneRevealStartedAt = performance.now();
    state.sceneRevealCameraEnd = state.camera.position.clone();

    state.sceneRevealCameraStart = (() => {
        const cx = state.sceneRevealCameraEnd.x, cy = state.sceneRevealCameraEnd.y, cz = state.sceneRevealCameraEnd.z;
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) return new THREE.Vector3(0, 0, 1);
        return new THREE.Vector3(cx * 0.42, cy * 0.34, Math.max(0.96, cz * 0.58));
    })();

    if (typeof window.clearAutoRotateResumeTimer === 'function') window.clearAutoRotateResumeTimer();
    if (typeof window.setAutoRotateSuspended === 'function') window.setAutoRotateSuspended(true);
}

export function getSceneRevealProgress(frameNow) {
    if (!state.sceneRevealActive || !state.sceneRevealStartedAt) return 1;
    const prefersReduced = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
        return 1.0;
    }
    const elapsed = frameNow - state.sceneRevealStartedAt;
    return Math.min(1, Math.max(0, elapsed / 2800));
}

export function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    if (window.map) window.map.invalidateSize();

    // Keep CSS breakpoints aligned with JS-side compact viewport logic.
    const isMobile = window.innerWidth <= 768;
    document.body.classList.toggle('is-mobile', isMobile);

    if (typeof window.updateCameraViewportOffset === 'function') {
        window.updateCameraViewportOffset();
    }

    if (typeof window.syncClusterSectionState === 'function') window.syncClusterSectionState();
    if (typeof window.updateTraversalUi === 'function') window.updateTraversalUi();
}
