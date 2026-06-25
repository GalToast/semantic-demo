/**
 * src/window.d.ts — Canonical ambient declarations for window globals
 *
 * Consolidates the previously scattered `declare global { interface Window { ... } }`
 * blocks from app-init.ts, diagnostic-adapter.ts, semantic-lane.ts, lifecycle.ts,
 * and others into a single source of truth. Replaces the `(window as unknown as
 * { __X__?: unknown })` cast pattern with proper typed access.
 *
 * Globals covered here are test/dev affordances that bridge the Svelte 5 state
 * surface to Playwright tests, browser devtools, and the legacy state proxy.
 * For runtime-extensible key stores (e.g. SEMANTIC_EXPLORER_DATA_*), use the
 * `WindowWithExtensibleGlobals` index signature directly — that pattern is
 * intentional and the cast is correct there.
 */

export {}

declare global {
    interface Window {
        /**
         * Set by Playwright in browser context at test-time so app code can
         * detect when it's running under automation (used to skip dev-only
         * UX branches, disable certain animations, etc.).
         */
        __PLAYWRIGHT__?: unknown

        /**
         * Mirror of `appState` published by main.ts for Playwright's
         * `page.evaluate(() => window.__LEGACY_APP_STATE__)` access path.
         * Loose shape — the contract tests assert specific properties exist.
         */
        __LEGACY_APP_STATE__?: Record<string, unknown>

        /**
         * Test compat state proxy published by orchestration/app-init.ts.
         * A bag of action handles for Playwright tests; the .state getter
         * returns a snapshot of the live AppState.
         */
        __APP_STATE__?: {
            readonly state: Record<string, unknown> | null
        } & Record<string, unknown>

        /**
         * Test compat action proxy published by orchestration/app-init.ts.
         * Methods are added at runtime; type as a loose record.
         */
        __APP_ACTIONS__?: Record<string, (...args: unknown[]) => unknown>

        /**
         * Set by main.ts at startup so semantic-threads.ts and other modules
         * can read the live AppState instance directly without going through
         * the `__APP_STATE__.state` snapshot proxy.
         */
        __SEMANTIC_EXPLORER_APP_STATE_DIRECT__?: Record<string, unknown>

        /**
         * Boolean flag for the diagnostic probe system. Set in local dev
         * environments; missing in production.
         */
        __DEBUG_PROBES__?: boolean

        /**
         * Numeric override for the semantic guide API timeout, in ms.
         * Test-only escape hatch for fast-failing Playwright runs.
         */
        __SEMANTIC_GUIDE_TIMEOUT_MS__?: number

        /**
         * Published by main.ts as a function that refreshes the test
         * compat state snapshot after app-init writes occur.
         */
        __refreshTestCompatState__?: () => void

        /**
         * Set by state/session.svelte.ts on cold start so reloads after
         * the first paint can still recover the original launch seed.
         */
        __semanticExplorerSessionSeed?: number

        /**
         * Live state mirror published by DevGui for `window.__semanticState`
         * console inspection during dev work.
         */
        __semanticState?: Record<string, unknown>

        /**
         * Live postprocessing state mirror set by
         * engine/three-postprocessing.ts. Loose record shape.
         */
        __semanticPostprocessing?: Record<string, unknown> & {
            setPremiumMode?: (enabled: boolean) => void
            updateBloomParams?: (
                params: Partial<{ intensity: number; luminanceThreshold: number; radius: number }>
            ) => void
            setDofEnabled?: (enabled: boolean) => void
        }

        /**
         * Live camera state mirror set by camera controls. Loose shape —
         * DevGui uses this for auto-rotate toggling when running with the
         * legacy state bridge active.
         */
        __semanticCamera?: {
            autoRotate?: boolean
            userAutoRotateSpeed?: number
        }

        /**
         * SpectorInspector capture bridge — headless WebGL inspection
         * via `window.__spector.capture(canvasSelector?)`.
         */
        __spector?: {
            isReady(): boolean
            capture(canvasSelector?: string): Promise<{ ok: boolean; frameCount?: number }>
            stop(): Promise<{ ok: boolean; commandCount: number; capture: unknown }>
            listCanvases(): string[]
        }

        /**
         * Read-only status snapshot published alongside `__spector` so
         * DevGui and tests can poll capture state without invoking the
         * capture itself.
         */
        __spectorStatus?: Record<string, unknown>

        /**
         * Test-only function hook set by search/result-renderer so Playwright
         * can force a layout refresh after mutating the result DOM externally.
         */
        refreshSearchResultHierarchy?: (el: HTMLElement) => void

        /**
         * Test-only function hook set by stores/test-compat so Playwright can
         * force the body-attribute → test-state store sync after manipulating
         * data-attributes externally.
         */
        syncTestStateFromBody?: () => void
    }
}
