/**
 * vitest.setup.js — runs before any test file is loaded.
 *
 * Installs a minimal window.matchMedia stub so that jsdom-based
 * tests can import Svelte stores whose module-init code calls
 * window.matchMedia (e.g. src/lib/stores/viewport.ts).
 *
 * Without this stub, the test file errors at import time with
 * "TypeError: window.matchMedia is not a function" before any
 * test case runs.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => {}
        })
    })
}

/** ResizeObserver stub — used by Legend.svelte and other components. */
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}

/**
 * Canvas getContext stub — jsdom lacks WebGL; the 'canvas' npm package is not
 * installed. supportsCapableWebGL() must resolve FALSE, not throw/emit virtual-
 * console errors that kill forks-pool workers (vmThreads once masked this via
 * shared-VM pollution). webgl/webgl2 -> null; other context types stay native.
 */
if (
    typeof window !== 'undefined' &&
    window.HTMLCanvasElement &&
    !window.HTMLCanvasElement.prototype.getContext.__piStubbed
) {
    const nativeGetContext = window.HTMLCanvasElement.prototype.getContext
    window.HTMLCanvasElement.prototype.getContext = function (...args) {
        const type = String(args[0]).toLowerCase()
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
        return nativeGetContext.apply(this, args)
    }
    window.HTMLCanvasElement.prototype.getContext.__piStubbed = true
}
