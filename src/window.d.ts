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

import type { AppState } from './lib/state/app.svelte'

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
        __LEGACY_APP_STATE__?: AppState | undefined

        /**
         * Test compat state proxy published by orchestration/app-init.ts.
         * A bag of action handles for Playwright tests; the .state getter
         * returns a snapshot of the live AppState.
         */
        __APP_STATE__?: AppState | undefined

        /**
         * Test compat action proxy published by orchestration/app-init.ts.
         * Methods are added at runtime; type as a loose record.
         */
        __APP_ACTIONS__?: Record<string, (...args: any[]) => any>

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
         * Live postprocessing state mirror set by
         * engine/three-postprocessing.ts. Loose record shape.
         */
        __semanticPostprocessing?: Record<string, unknown> & {
            isPremiumMode?: () => boolean
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
            capture(
                canvasSelector?: string,
                maxFrames?: number
            ): Promise<{
                ok: boolean
                reason?: string
                frameCount?: number
                commandCount?: number
                canvas?: string
                mode?: string
                capture?: unknown
                error?: string
            }>
            stop(): { ok: boolean; reason?: string; capture?: unknown; error?: string }
            resume(): { ok: boolean; reason?: string; error?: string }
            listCanvases(): string[]
            getLastCapture(): unknown
            getActiveCanvas(): string
        }

        /**
         * Test-only function hook set by the semantic guide module so Playwright
         * can trigger a guide request without clicking the UI button.
         */
        requestSemanticGuide?: () => void

        /**
         * Test-only function hook set by the connection analysis module so Playwright
         * can trigger a story fetch without clicking the UI button.
         */
        showSemanticThreadsDetail?: () => Promise<void>

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

        /**
         * Test-only function hooks published by `lib/orchestration/toast.ts`
         * (re-exporting from `stores/toast.svelte.ts`). Lets Playwright trigger
         * `showErrorToast(title, copy)`, `dismissToast()`, and `clearToastQueue()`
         * without engineering a corrupt-catalogue scenario in the search store.
         * Same surface pattern as `__refreshTestCompatState__`,
         * `showSemanticThreadsDetail`, and `requestSemanticGuide` above.
         */
        __toastHooks__?: {
            showErrorToast: (title: string, copy: string) => void
            dismissToast: () => void
            clearToastQueue: () => void
            /**
             * Full spec variant — lets tests pin a known duration so the
             * toast stays visible long enough to assert against, instead of
             * racing the default error-variant 8s auto-dismiss. Optional
             * `dedupeKey` lets repeated test invocations exponent out by
             * id rather than stacking in the queue.
             */
            showToastSpec: (spec: {
                title: string
                copy: string
                variant?: 'info' | 'warning' | 'error'
                duration?: number
                dedupeKey?: string
            }) => void
        }
    }
}
