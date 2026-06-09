/**
 * js/modules/scene-reveal.ts
 *
 * TypeScript shadow of scene-reveal.js.
 * Scene reveal animation and window resize handler.
 */
import * as THREE from 'three';
import { state as _state } from '../state.js';
import { clearAutoRotateResumeTimer, setAutoRotateSuspended, settleCameraToOverviewPose } from './camera-controls.js';
import { updateCameraViewportOffset } from './three-engine.js';
import { syncClusterSectionState } from './cluster-labels.js';
import { updateTraversalUi } from './journey.js';
import { getViewportSize, prefersReducedMotion, isMobileViewport } from './environment.js';

const state = _state as any;

export function setSceneRevealDataset(active: boolean): void {
    if (typeof document !== 'undefined' && document.body?.dataset) {
        document.body.dataset.sceneReveal = active ? 'active' : 'inactive';
    }
}

export function startSceneReveal(): void {
    if (!state.camera || state.currentView !== 'galaxy') return;
    state.sceneRevealActive = true;
    setSceneRevealDataset(true);
    state.sceneRevealStartedAt = performance.now();
    state.sceneRevealCameraEnd = (state.camera as any).position.clone();

    state.sceneRevealCameraStart = (() => {
        const cx = (state.sceneRevealCameraEnd as any).x, cy = (state.sceneRevealCameraEnd as any).y, cz = (state.sceneRevealCameraEnd as any).z;
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) return new THREE.Vector3(0, 0, 1);
        return new THREE.Vector3(cx * 0.42, cy * 0.34, Math.max(0.96, cz * 0.58));
    })();

    clearAutoRotateResumeTimer();
    setAutoRotateSuspended(true);
}

export function getSceneRevealProgress(frameNow: number): number {
    if (!state.sceneRevealActive || !state.sceneRevealStartedAt) return 1;
    if (prefersReducedMotion()) {
        setSceneRevealDataset(false);
        state.sceneRevealActive = false;
        return 1.0;
    }
    const elapsed = frameNow - state.sceneRevealStartedAt;
    return Math.min(1, Math.max(0, elapsed / 2800));
}

export function onWindowResize(): void {
    if (!state.camera || !state.renderer) return;
    const { width, height } = getViewportSize();
    const isMobile = isMobileViewport();

    (state.camera as any).aspect = width / height;
    (state.camera as any).updateProjectionMatrix();
    (state.renderer as any).setSize(width, height);
    if ((window as any).map) (window as any).map.invalidateSize();

    document.body.classList.toggle('is-mobile', isMobile);
    updateCameraViewportOffset();
    settleCameraToOverviewPose();
    syncClusterSectionState();
    updateTraversalUi();
}
