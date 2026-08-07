/**
 * @lib/engine/renderer/webgl-fallback.ts
 * WebGL capability detection and fallback DOM UI.
 *
 * Extracted from three-engine.ts during the W46 renderer decomposition.
 * All public signatures are preserved for backward compatibility.
 */

import { appState } from '@lib/state/app.svelte'

export interface WebGLSupportDetail {
    supported: boolean
    reason: string
    renderer?: string | null
    vendor?: string | null
}

export function detectWebGLSupport(): WebGLSupportDetail {
    if (typeof document === 'undefined') return { supported: false, reason: 'document-unavailable' }
    const canvas = document.createElement('canvas')
    const contextAttributes = { alpha: true, antialias: true }
    try {
        const context = (canvas.getContext('webgl2', contextAttributes) ||
            canvas.getContext('webgl', contextAttributes) ||
            canvas.getContext('experimental-webgl', contextAttributes)) as WebGLRenderingContext | null
        if (!context) return { supported: false, reason: 'context-unavailable' }
        const debugInfo = context.getExtension?.('WEBGL_debug_renderer_info')
        const result: WebGLSupportDetail = {
            supported: true,
            reason: 'available',
            renderer: debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
            vendor: debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null
        }
        // Release the probe context so it doesn't count against the browser's
        // ~16 active WebGL context limit. Journey tests mount/unmount the
        // engine repeatedly; a leaked probe per call accelerates context
        // exhaustion (W58 F1).
        const loseExt = context.getExtension?.('WEBGL_lose_context')
        loseExt?.loseContext()
        return result
    } catch (error) {
        return { supported: false, reason: (error as Error)?.message || 'context-probe-threw' }
    }
}

export interface FallbackHandlerDeps {
    state?: {
        scene: unknown
        camera: unknown
        renderer: unknown
        controls: unknown
        scenePerformanceDiagnostics: unknown
    } | null
    viewController?: { switchView(view: string, options?: Record<string, unknown>): void } | null
    mapState?: { initMap(): void } | null
    uiFeedback?: { showExperienceToast(title: string, message: string): void } | null
}

/**
 * Render a WebGL-fallback notice into the given container.
 * @returns The click handler for the fallback map button, so callers can
 *          store it and clean it up later (e.g. in {@link cancelAnimate}).
 */
export function showWebGLFallback(
    container: HTMLElement,
    detail: { supported?: boolean; reason?: string } = {},
    deps: FallbackHandlerDeps = {}
): ((event: MouseEvent) => void) | null {
    if (!container) return null

    // Update diagnostics via modern appState first, then legacy state
    const diagnostics = appState.scenePerformanceDiagnostics
    diagnostics.active = false
    diagnostics.reason = detail.reason || 'webgl-unavailable'

    if (deps.state) {
        const diagnostics = deps.state.scenePerformanceDiagnostics as { active: boolean; reason: string }
        diagnostics.active = false
        diagnostics.reason = detail.reason || 'webgl-unavailable'
    }

    // Clear existing renderer references (legacy path)
    if (deps.state) {
        deps.state.scene = null
        deps.state.camera = null
        deps.state.renderer = null
        deps.state.controls = null
    }

    container.querySelectorAll('canvas').forEach((c) => c.remove())
    const existingNotice = container.querySelector('.webgl-fallback-notice')
    if (existingNotice) existingNotice.remove()

    const notice = document.createElement('section')
    notice.className = 'webgl-fallback-notice'
    notice.setAttribute('role', 'status')
    notice.setAttribute('aria-live', 'polite')

    const kicker = document.createElement('div')
    kicker.className = 'webgl-fallback-kicker'
    kicker.textContent = 'Graphics fallback'

    const heading = document.createElement('h2')
    heading.textContent = '3D view is unavailable on this device.'

    const body = document.createElement('p')
    body.textContent =
        'The county businesses still load. Use the map view while graphics acceleration is blocked or unavailable.'

    const mapButton = document.createElement('button')
    mapButton.type = 'button'
    mapButton.className = 'webgl-fallback-map'
    mapButton.setAttribute('data-webgl-fallback-map', '')
    mapButton.textContent = 'Open map view'

    notice.append(kicker, heading, body, mapButton)
    container.appendChild(notice)

    const _mapButtonClickHandler = (event: MouseEvent) => {
        event.preventDefault()
        if (deps.viewController?.switchView) {
            deps.viewController.switchView('map')
            return
        }
        document.getElementById('map-container')?.classList.add('active')
        container.classList.add('hidden')
        deps.mapState?.initMap?.()
    }
    mapButton.addEventListener('click', _mapButtonClickHandler)

    deps.uiFeedback?.showExperienceToast(
        'Graphics fallback active',
        'Map view remains available while 3D graphics are unavailable.'
    )

    return _mapButtonClickHandler
}

/**
 * Remove any rendered fallback notice from the canvas container.
 * Idempotent — safe to call when no notice is present.
 * Used by the restore retry machine to clear a stale notice after
 * a successful re-init (P2-3).
 */
export function removeWebGLFallbackNotice(): void {
    if (typeof document === 'undefined') return
    const container = document.getElementById('canvas-container')
    if (!container) return
    const notice = container.querySelector('.webgl-fallback-notice')
    if (notice) notice.remove()
}
