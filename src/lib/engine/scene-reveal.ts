/**
 * @lib/engine/scene-reveal.ts — Scene reveal animation and window resize handler
 *
 * Port of js/modules/scene-reveal.ts.
 * Manages the camera pull-in animation that runs when the 3D scene first
 * becomes visible, and resizes the renderer + camera when the window changes.
 */
import * as THREE from 'three';
import { appState as state } from '@lib/state/app.svelte.ts';
import type { SemanticState } from '../../../js/state';
import { clearAutoRotateResumeTimer, setAutoRotateSuspended, settleCameraToOverviewPose } from '../engine/camera-controls';
import { updateCameraViewportOffset } from './three-engine';
import { syncClusterSectionState } from '../../../js/modules/cluster-labels';
import { updateTraversalUi } from '../../../js/modules/journey';
import { getViewportSize, prefersReducedMotion, isMobileViewport } from '@lib/utils/environment';

// Note: `state` (Svelte 5 AppState) is structurally a `SemanticState` (the
// interface from the legacy state). The structural cast is no longer
// needed — the Svelte 5 class is properly typed.

export function setSceneRevealDataset(active: boolean): void {
    if (typeof document !== 'undefined' && document.body?.dataset) {
        document.body.dataset.sceneReveal = active ? 'active' : 'inactive';
    }
}

export function startSceneReveal(): void {
    const camera = state.camera as { position: THREE.Vector3 } | null;
    if (!camera || state.currentView !== 'galaxy') return;
    state.sceneRevealActive = true;
    setSceneRevealDataset(true);
    state.sceneRevealStartedAt = performance.now();
    state.sceneRevealCameraEnd = camera.position.clone();

    state.sceneRevealCameraStart = (() => {
        const cx = state.sceneRevealCameraEnd.x;
        const cy = state.sceneRevealCameraEnd.y;
        const cz = state.sceneRevealCameraEnd.z;
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
            return new THREE.Vector3(0, 0, 1);
        }
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
    const camera = state.camera as { aspect: number; updateProjectionMatrix(): void } | null;
    const renderer = state.renderer as { setSize(w: number, h: number): void } | null;
    if (!camera || !renderer) return;
    const { width, height } = getViewportSize();
    const isMobile = isMobileViewport();

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    const w = window as unknown as { map?: { invalidateSize(): void } };
    if (w.map) w.map.invalidateSize();

    document.body.classList.toggle('is-mobile', isMobile);
    updateCameraViewportOffset();
    settleCameraToOverviewPose();
    syncClusterSectionState();
    updateTraversalUi();
}
