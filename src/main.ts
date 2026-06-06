/**
 * @/main.ts — Svelte 5 app entry point
 *
 * Imports App.svelte and mounts to #app target using the Svelte 5 `mount` API.
 * Initializes stores from URL params (?demo=force, ?nodemo=1).
 */
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import { testState } from '@lib/stores/index';

// ── URL parameter initialization ──────────────────────────────────────────────

function parseUrlParams(): { forceDemo: boolean; noDemo: boolean } {
  const params = new URLSearchParams(window.location.search);
  return {
    forceDemo: params.get('demo') === 'force',
    noDemo: params.get('nodemo') === '1'
  };
}

// ── Mount ─────────────────────────────────────────────────────────────────────

const { forceDemo, noDemo } = parseUrlParams();

// Mount the Svelte 5 app
const app = mount(App, {
  target: document.getElementById('app')!,
  props: {
    forceDemo,
    noDemo
  }
});

// ── __TEST_STATE__ sync (visual settle for Playwright surface/visual tests) ──

/**
 * Subscribe to the derived `testState` store and write to `window.__TEST_STATE__`
 * on every change. This exposes the same visual-state contract that the legacy
 * bridge-registry.js provided, enabling surface tests to waitForReady without
 * timing out.
 */
const unsubTestState = testState.subscribe((value) => {
  (window as any).__TEST_STATE__ = value;
});

// ── Cleanup on page unload ────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  unsubTestState();
  unmount(app);
});

export default app;
