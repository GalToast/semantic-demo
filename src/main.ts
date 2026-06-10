/**
 * @/main.ts — Svelte 5 app entry point
 *
 * Imports App.svelte and mounts to #app target using the Svelte 5 `mount` API.
 * Initializes stores from URL params (?demo=force, ?nodemo=1).
 */
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import { testState } from '@lib/stores/index';
import './lib/css/biofield.css';

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
const mountTarget = document.getElementById('app') ?? document.getElementById('app-root');
let app: ReturnType<typeof mount> | undefined;

if (mountTarget) {
  app = mount(App, {
    target: mountTarget,
    props: { forceDemo, noDemo }
  });
}

// ── __TEST_STATE__ sync (visual settle for Playwright surface/visual tests) ──

const unsubTestState = testState.subscribe((value) => {
  (window as any).__TEST_STATE__ = value;
});

// ── Cleanup on page unload ────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  unsubTestState();
  if (app) unmount(app);
});

export default app;
