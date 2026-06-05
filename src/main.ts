/**
 * @/main.ts — Svelte 5 app entry point
 *
 * Imports App.svelte and mounts to #app target using the Svelte 5 `mount` API.
 * Initializes stores from URL params (?demo=force, ?nodemo=1).
 */
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import { initViewportListeners } from '@lib/stores/viewport';

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

// Initialize viewport listeners (resize, reduced-motion)
const cleanupViewport = initViewportListeners();

// Mount the Svelte 5 app
const app = mount(App, {
  target: document.getElementById('app')!,
  props: {
    forceDemo,
    noDemo
  }
});

// ── Cleanup on page unload ────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  cleanupViewport();
  unmount(app);
});

export default app;
