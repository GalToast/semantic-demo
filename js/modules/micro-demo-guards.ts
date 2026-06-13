/**
 * micro-demo-guards.ts — TypeScript shadow of micro-demo-guards.js
 * Eligibility guards for the micro-demo.
 */

import { state } from '../state.ts';
import { prefersReducedMotion } from './environment.ts';
import { debugWarn } from './diagnostic-adapter.ts';

export const STORAGE_KEY: string = 'moco_mycelium_demo_v1';
export const SESSION_STORAGE_KEY: string = 'moco_mycelium_demo_session_v1';

export function isAppReadyForDemo(): boolean {
    const overlay = document.getElementById('loading-overlay');
    const s = state as any;
    return (
        state.currentView === 'galaxy' &&
        s.focusedNode === null &&
        !state.currentSearchSummary &&
        state.navState.mode === 'overview' &&
        !state.sceneRevealActive &&
        Array.isArray(state.points) &&
        state.points.length > 0 &&
        overlay !== null && overlay.classList.contains('hidden')
    );
}

export function guardNotSeen(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return true;
        const stored = JSON.parse(raw) as { seen?: boolean };
        return stored.seen !== true;
    } catch {
        return true;
    }
}

export function guardReducedMotion(): boolean {
    const osPref = prefersReducedMotion();
    if (osPref) return false;
    const devFlag = document.documentElement.dataset.reduceMotion === 'true';
    return !devFlag;
}

export function guardWebGL(): boolean {
    const renderer = state.renderer as { domElement?: HTMLCanvasElement; getContext?: () => WebGLRenderingContext | null } | null;
    if (!renderer?.domElement) return false;
    const gl = renderer.getContext?.() ?? null;
    if (!gl) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return true;
    const unmasked = gl.getParameter((dbg as any).UNMASKED_RENDERER_WEBGL);
    const softwareRenderers = ['swiftShader', 'llvmpipe', 'Software Rasterizer'];
    const isSoftware = softwareRenderers.some(r =>
        String(unmasked).toLowerCase().includes(r.toLowerCase())
    );
    return !isSoftware;
}

export function guardUrlParam(): boolean {
    const params = new URLSearchParams(window.location.search);
    return !params.has('nodemo');
}

export function recordCompletion(): void {
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

export function notifyDemoUnableToStart(): void {
    window.dispatchEvent(new CustomEvent('demo-cancelled'));
}
