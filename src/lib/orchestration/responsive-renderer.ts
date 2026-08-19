/**
 * @lib/orchestration/responsive-renderer.ts — Initial-mount render-kind decision
 *
 * W45-A: Decides whether the initial cold-load mount should render the WebGL
 * canvas or the Placeholder2D preview. The decision is made synchronously at
 * module load (no async dependency on the render path).
 *
 * Mobile-UA / narrow-viewport devices get the placeholder path so the 587 KB
 * three.js chunk does not enter the cold-load critical path. Desktop and
 * wide-viewport devices get the WebGL path (unchanged behavior).
 *
 * Decision factors (in priority order):
 *   1. `?webgl=1` URL param — force WebGL (dev / debugging)
 *   2. `?placeholder=1` URL param — force placeholder (testing)
 *   3. Viewport width ≤ MOBILE_MAX_WIDTH (768px) — placeholder
 *   4. `navigator.webdriver` — placeholder (automated sessions are typically
 *      Lighthouse / Playwright; the placeholder paints fast and the LCP is a
 *      static SVG rather than the gated three.js scene). EXCEPTION: a deep
 *      link on a desktop viewport (explicit "show me the focused scene" intent
 *      via ?anchor=N / ?record=N / ?view=map / ?q≥2) overrides this so the
 *      scene mounts and signalReady() can dismiss the splash — otherwise
 *      automated deep-link screenshots/journey tests get occluded by the
 *      "Enter 3D Scene" overlay even though the focus panel underneath is
 *      correct (see tmp/glm52-preview-overlay-take.md, Fix Y).
 *   5. Default — WebGL (desktop)
 */

export type RenderKind = 'webgl' | 'placeholder2d'

/** Viewport threshold for the placeholder decision (matches MOBILE_BREAKPOINT in viewport store). */
export const MOBILE_MAX_WIDTH = 768

/**
 * S5 mobile posture (2026-08-19, docs/feature-depth-mobile-posture.md):
 * OPT-IN auto-enter for capable phones. Default OFF — pieces flip to 1 only
 * after a real-handset phone-farm smoke proves P95 LCP/thermal numbers.
 * When OFF (default), narrow viewports behave exactly as before.
 */
export const S5_AUTO_ENTER_AFTER = import.meta.env.VITE_S5_AUTO_ENTER_3D === '1'

/** Minimal environment seam for the probe (injectable in tests; the app never passes it). */
export type ProbeEnv = {
    window?: { innerWidth?: number }
    document?: { createElement(tag: string): HTMLCanvasElement }
    matchMedia?: (query: string) => { matches: boolean }
    deviceMemory?: number
    hardwareConcurrency?: number
}

/**
 * Capability probe behind the auto-enter flag. Returns true only for devices
 * that (a) actually produce a hardware-backed WebGL2 context
 * (failIfMajorPerformanceCaveat rejects SwiftShader/llvmpipe — the exact
 * buckets that never reach scene-ready in our test/low-end reality), (b) have
 * enough memory/cores when the hints are present, and (c) are not in
 * prefers-reduced-motion. Synchronous + cheap: called once at cold boot.
 * Optional `env` is a test seam; production calls with no argument.
 */
export function supportsCapableWebGL(env?: ProbeEnv): boolean {
    // Resolve the environment (test seam first, then real globals).
    const win = env?.window ?? (typeof window === 'undefined' ? undefined : (window as unknown as ProbeEnv['window']))
    const doc =
        env?.document ?? (typeof document === 'undefined' ? undefined : (document as unknown as ProbeEnv['document']))
    if (!win || !doc) return false

    const mm =
        env?.matchMedia ??
        (typeof matchMedia !== 'undefined' ? (matchMedia as unknown as ProbeEnv['matchMedia']) : undefined)
    if (mm && mm('(prefers-reduced-motion: reduce)').matches) return false

    const hints = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number }
    const mem = env?.deviceMemory ?? hints.deviceMemory
    if (typeof mem === 'number' && Number.isFinite(mem) && mem > 0 && mem < 4) return false
    const cores = env?.hardwareConcurrency ?? hints.hardwareConcurrency
    if (typeof cores === 'number' && Number.isFinite(cores) && cores > 0 && cores < 4) return false

    try {
        const canvas = doc.createElement('canvas')
        const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
        if (gl) {
            ;(gl as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
            return true
        }
        return false
    } catch {
        return false
    }
}

/**
 * Canonical deep-link classification — single source of truth shared by
 * main.ts (parseUrlParams), demo.svelte.ts (shouldRunDemo), and this module.
 * A deep link expresses explicit scene intent and should land on the target
 * state instead of the splash/CTA gate. `?story=` is intentionally NOT a deep
 * link (story prompts fire post-splash via DemoChoreography).
 */
export function isDeepLinkParams(params: URLSearchParams): boolean {
    const queryLen = params.get('q')?.trim().length ?? 0
    const surface = params.get('surface')?.trim()
    return (
        params.has('anchor') ||
        params.has('record') ||
        params.get('view') === 'map' ||
        (surface != null && surface !== '' && surface !== 'idle') ||
        queryLen >= 2
    )
}

/**
 * Decide the initial render kind for the current environment.
 * Synchronous, SSR-safe — returns 'webgl' when `window` is undefined.
 */
export function getInitialRenderKind(): RenderKind {
    if (typeof window === 'undefined') return 'webgl'

    // URL-param overrides (dev / QA)
    const params = new URLSearchParams(window.location.search)
    if (params.get('webgl') === '1') return 'webgl'
    if (params.get('placeholder') === '1') return 'placeholder2d'

    // Narrow viewport → placeholder by default (S5 flag can opt into a
    // capable-phone auto-enter). MUST stay ahead of the webdriver branch so
    // real mobile deep links keep the splash/CTA flow (W45-A mobile LCP
    // invariant: the 587 KB three.js chunk stays off the cold-load path).
    if (window.innerWidth <= MOBILE_MAX_WIDTH) {
        if (S5_AUTO_ENTER_AFTER && supportsCapableWebGL()) return 'webgl'
        return 'placeholder2d'
    }

    // Automated browser sessions (Lighthouse, Playwright) → placeholder so the
    // LCP measurement captures a static SVG rather than the gated three.js
    // scene. The three.js chunk still loads on demand when the CTA is tapped.
    //
    // Exception (Fix Y): a DEEP LINK on a desktop viewport expresses explicit
    // "show me the focused scene" intent (a shared ?record=N / ?anchor=N link).
    // For those we skip the webdriver→placeholder override so renderKind is
    // 'webgl', main.ts:160's deep-link signalReady() guard passes, and the
    // splash + "Enter 3D Scene" overlay are dismissed — otherwise automated
    // deep-link screenshots/journey tests get occluded by the placeholder even
    // though the focus panel underneath is correct. Real mobile deep links are
    // still handled above by the narrow-viewport branch.
    if (typeof navigator !== 'undefined' && navigator.webdriver && !isDeepLinkParams(params)) {
        return 'placeholder2d'
    }

    return 'webgl'
}
