// js/modules/micro-demo-guards.js
// Eligibility guards for the micro-demo

import { state } from '../state.js';
import { prefersReducedMotion } from './environment.js';
import { debugWarn } from './diagnostic-adapter.js';

export const STORAGE_KEY = 'moco_mycelium_demo_v1';
export const SESSION_STORAGE_KEY = 'moco_mycelium_demo_session_v1';

export function isAppReadyForDemo() {
    const overlay = document.getElementById('loading-overlay');
    return (
        state.currentView === 'galaxy' &&
        state.focusedNode === null &&
        !state.currentSearchSummary &&
        state.navState.mode === 'overview' &&
        !state.sceneRevealActive &&
        Array.isArray(state.points) &&
        state.points.length > 0 &&
        overlay && overlay.classList.contains('hidden')
    );
}

export function guardNotSeen() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return true;
        const stored = JSON.parse(raw);
        return stored.seen !== true;
    } catch {
        return true;
    }
}

export function guardReducedMotion() {
    const osPref = prefersReducedMotion();
    if (osPref) return false;
    const devFlag = document.documentElement.dataset.reduceMotion === 'true';
    return !devFlag;
}

export function guardWebGL() {
    const renderer = state.renderer;
    if (!renderer?.domElement) return false;
    const gl = renderer.getContext();
    if (!gl) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return true;
    const unmasked = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    const softwareRenderers = ['swiftShader', 'llvmpipe', 'Software Rasterizer'];
    const isSoftware = softwareRenderers.some(r =>
        String(unmasked).toLowerCase().includes(r.toLowerCase())
    );
    return !isSoftware;
}

export function guardUrlParam() {
    const params = new URLSearchParams(window.location.search);
    return !params.has('nodemo');
}

export function recordCompletion() {
    try {
        const entry = {
            seen: true,
            seenAt: new Date().toISOString(),
            version: 1
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch (e) {
        debugWarn('[micro-demo] Could not write localStorage:', e);
    }
}

export function notifyDemoUnableToStart() {
    window.dispatchEvent(new CustomEvent('demo-cancelled'));
}
