/**
 * @lib/demo/guards.ts — Eligibility guards for the micro-demo
 *
 * Port of
 *
 * Checks: app readiness, lifetime guard, reduced motion, WebGL/software renderer, URL param.
 */
import { appState } from '@lib/state/app.svelte'
import { prefersReducedMotion } from '@lib/utils/environment'
import { debugWarn } from '@lib/utils/debug'

export const STORAGE_KEY = 'moco_mycelium_demo_v1'
export const SESSION_STORAGE_KEY = 'moco_mycelium_demo_session_v1'

export function isAppReadyForDemo(): boolean {
    const overlay = document.getElementById('loading-overlay')
    return (
        appState.currentView === 'galaxy' &&
        appState.focusedNode === null &&
        !appState.currentSearchSummary &&
        appState.navState.mode === 'overview' &&
        !appState.sceneRevealActive &&
        Array.isArray(appState.points) &&
        appState.points.length > 0 &&
        overlay !== null &&
        overlay.classList.contains('hidden')
    )
}

export function guardNotSeen(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return true
        const stored = JSON.parse(raw) as { seen?: boolean }
        return stored.seen !== true
    } catch {
        return true
    }
}

export function guardReducedMotion(): boolean {
    const osPref = prefersReducedMotion()
    if (osPref) return false
    const devFlag = document.documentElement.dataset.reduceMotion === 'true'
    return !devFlag
}

export function guardWebGL(): boolean {
    const renderer = appState.renderer
    if (!renderer?.domElement) return false
    const gl = renderer.getContext?.()
    if (!gl) return false
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    if (!dbg) return true
    const unmasked = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
    const softwareRenderers = ['swiftShader', 'llvmpipe', 'Software Rasterizer']
    const isSoftware = softwareRenderers.some((r: string) => String(unmasked).toLowerCase().includes(r.toLowerCase()))
    return !isSoftware
}

export function guardUrlParam(): boolean {
    const params = new URLSearchParams(window.location.search)
    return !params.has('nodemo')
}

export function recordCompletion(): void {
    try {
        const entry = {
            seen: true,
            seenAt: new Date().toISOString(),
            version: 1
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
    } catch (e) {
        debugWarn('[micro-demo] Could not write localStorage:', e)
    }
}

export function notifyDemoUnableToStart(): void {
    document.dispatchEvent(new CustomEvent('demo-cancelled'))
}
