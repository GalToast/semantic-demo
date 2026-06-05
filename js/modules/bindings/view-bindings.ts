/**
 * view-bindings.ts
 * Typechecked sibling for view-bindings.js
 * Core click helper, zoom, and view controls.
 */

import { state as _state } from '../../state.js';
const state = _state as any;
import { switchView } from '../view-controller.js';
import { toggleAutoRotate } from '../camera-controls.js';
import { resetExperienceState, copyCurrentViewLink } from '../lifecycle.js';
import { showExperienceToast } from '../ui-feedback.js';
import { zoomMap } from '../map-state.js';

interface BindClickOptions {
    optional?: boolean;
}

type EventHandler = (event?: MouseEvent) => void;

export function bindClick(id: string, handler: EventHandler, options: BindClickOptions = {}): void {
    const element = document.getElementById(id);
    if (!element) {
        if (!options.optional) console.warn('[event-bindings] button not found:', id);
        return;
    }
    element.onclick = handler;
}

export function zoomCamera(multiplier: number): void {
    if (state.currentView === 'map' && typeof zoomMap === 'function') {
        zoomMap(multiplier);
        return;
    }
    if (!state.camera || !state.controls) return;
    const target = state.controls.target;
    const direction = state.camera.position.clone().sub(target).normalize();
    const currentDistance = state.camera.position.distanceTo(target);
    const newDistance = currentDistance * multiplier;
    const minDist = state.controls.minDistance || state.ORBIT_MIN_DISTANCE_DEFAULT;
    const maxDist = state.controls.maxDistance || state.ORBIT_MAX_DISTANCE_DEFAULT;
    const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance));
    state.camera.position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)));
}

export function bindViewControls(): void {
    bindClick('btn-galaxy', () => switchView('galaxy'));
    bindClick('btn-map', () => switchView('map'));
    bindClick('btn-zoom-in', () => zoomCamera(0.84));
    bindClick('btn-zoom-out', () => zoomCamera(1.18));
    bindClick('btn-reset', () => resetExperienceState());
    bindClick('btn-rotate', () => toggleAutoRotate());
    bindClick('btn-share-view', () => {
        const btn = document.getElementById('btn-share-view');
        if (!btn) return;
        const originalHTML = btn.innerHTML;
        const originalLabel = btn.getAttribute('aria-label') || 'Copy current view link';
        if (typeof copyCurrentViewLink === 'function') {
            copyCurrentViewLink().then(() => {
                btn.innerHTML = `<span class="share-toggle-label" aria-hidden="true">Copied</span>`;
                btn.setAttribute('aria-label', 'Link copied to clipboard');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.setAttribute('aria-label', originalLabel);
                }, 2000);
            }).catch(() => {
                showExperienceToast('Copy unavailable', 'Use the address bar to copy this current view.');
            });
        }
    }, { optional: true });
}
