/**
 * @lib/engine/three-engine-init-helpers.ts — Extracted initThreeJS concerns
 *
 * Phase 5 quick-pick extraction of four self-contained concerns from
 * initThreeJS() in three-engine-core.ts. Each function is parameter-driven
 * with no new module-level state.
 *
 * References:
 *   - docs/three-engine-decomposition-plan.md §5 (Phase 5 — C2, C8, C9, C16)
 */

import type { SceneSetup } from './renderer/scene-init'
import { buildThreeScene } from './renderer/scene-init'
import { showWebGLFallback } from './renderer/webgl-fallback'
import { webglContext } from '@lib/engine/webgl-context'
import { CONFIG } from '@lib/engine/config'

// ── C2 — Scene build + fallback ──────────────────────────────────────────────

/**
 * Build the Three.js scene, or show a WebGL-fallback notice on failure.
 *
 * On success returns `{ success: true, setup }` with the scene objects the
 * caller must wire into stores. On failure, registers the fallback click
 * handler on `engineState.mapButtonClickHandler` (via caller-injected
 * setter) and returns `{ success: false }`.
 *
 * @param container — DOM element to attach the canvas into
 * @param width — viewport width for camera / renderer
 * @param height — viewport height for camera / renderer
 * @param mapButtonClickHandlerSetter — callback to store the fallback
 *   click handler (typically `(fn) => { engineState.mapButtonClickHandler = fn }`)
 * @param fallbackDeps — deps forwarded to {@link showWebGLFallback}
 *   Plan reference: docs/three-engine-decomposition-plan.md §5 (C2)
 */
export async function buildThreeSceneOrFallback(
    container: HTMLElement,
    width: number,
    height: number,
    mapButtonClickHandlerSetter: (handler: ((event: MouseEvent) => void) | null) => void,
    fallbackDeps: {
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
): Promise<{ success: true; setup: SceneSetup } | { success: false }> {
    const result = await buildThreeScene(container, width, height)
    if (!result.success) {
        mapButtonClickHandlerSetter(
            showWebGLFallback(
                container,
                { reason: result.reason || 'webgl-unavailable' },
                fallbackDeps
            )
        )
        return { success: false }
    }
    return { success: true, setup: result.setup }
}

// ── C8 — Reduced-motion gate ─────────────────────────────────────────────────

/**
 * Check `prefers-reduced-motion` and disable auto-rotation if active.
 *
 * Mutates `appState.autoRotate` AND `state.autoRotate` (legacy mirror)
 * to keep them in lockstep. Also clears the rotate button's
 * `aria-pressed` attribute when the DOM element is present.
 *
 * @param state — legacy engine state mirror (may be null during early init)
 * @param appStateRef — the reactive appState (imported by caller)
 *   Plan reference: docs/three-engine-decomposition-plan.md §5 (C8)
 */
export function applyReducedMotionGate(
    state: { autoRotate: boolean } | null | undefined,
    appStateRef: { autoRotate: boolean },
    windowObj: typeof window = window
): void {
    if (windowObj.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        appStateRef.autoRotate = false
        if (state) state.autoRotate = false
        const rotateBtn = windowObj.document?.getElementById('btn-rotate')
        if (rotateBtn) rotateBtn.setAttribute('aria-pressed', 'false')
    }
}

// ── C9 — Controls autoRotate config ─────────────────────────────────────────

/**
 * Derive and write `controls.autoRotate` + `controls.autoRotateSpeed` from
 * the current appState / engineState flags. Pure derivation — only mutates
 * the `controls` object.
 *
 * @param controls — OrbitControls instance (or any object with autoRotate/autoRotateSpeed)
 * @param state — legacy engine state mirror for autoRotate/autoRotateSuspended reads
 * @param appStateRef — the reactive appState for autoRotate/autoRotateSuspended reads
 *   Plan reference: docs/three-engine-decomposition-plan.md §5 (C9)
 */
export function applyAutoRotateConfig(
    controls: { autoRotate: boolean; autoRotateSpeed: number },
    state: { autoRotate?: boolean; autoRotateSuspended?: boolean } | null | undefined,
    appStateRef: { autoRotate?: boolean; autoRotateSuspended?: boolean }
): void {
    controls.autoRotate = !!(
        (appStateRef.autoRotate || state?.autoRotate) &&
        !(appStateRef.autoRotateSuspended || state?.autoRotateSuspended)
    )
    controls.autoRotateSpeed = CONFIG.AUTO_ROTATE_BASE_SPEED
}

// ── C16 — Dev-only Spector bridge ────────────────────────────────────────────

interface WindowWithDevGlobals {
    __semanticEngine?: {
        readonly renderer: unknown
        readonly scene: unknown
        readonly camera: unknown
        readonly canvas: HTMLCanvasElement | null
        renderOnce: () => void
    }
}

/**
 * Expose `window.__semanticEngine` for the Spector.js frame-capture bridge.
 * DEV-only: Vite dead-code-eliminates the false branch in production builds.
 *
 * Reads from `webglContext` module-scope (existing pattern) via lazy
 * getters so dev tools always see current values.
 *
 * @param dev — pass `import.meta.env.DEV` to keep the Vite guard in the
 *   caller (allows test injection without stubbing import.meta.env)
 * @param windowObj — optional window override for test isolation
 *   Plan reference: docs/three-engine-decomposition-plan.md §5 (C16)
 */
export function exposeDevEngineBridge(
    dev: boolean = import.meta.env.DEV,
    windowObj: typeof window = window
): void {
    if (!dev || typeof windowObj === 'undefined') return
    ;(windowObj as WindowWithDevGlobals).__semanticEngine = {
        get renderer() {
            return webglContext.renderer
        },
        get scene() {
            return webglContext.scene
        },
        get camera() {
            return webglContext.camera
        },
        get canvas() {
            return webglContext.renderer?.domElement ?? null
        },
        renderOnce: () => {
            if (webglContext.renderer && webglContext.scene && webglContext.camera) {
                webglContext.renderer.render(webglContext.scene, webglContext.camera)
            }
        }
    }
}
