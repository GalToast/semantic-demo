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
  });
}
