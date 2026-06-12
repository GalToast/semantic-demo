/**
 * @/main.ts — Svelte 5 app entry point
 *
 * Imports App.svelte and mounts to #app target using the Svelte 5 `mount` API.
 * Initializes stores from URL params (?demo=force, ?nodemo=1).
 */
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import LegacyCompassSurface from '@components/LegacyCompassSurface.svelte';
import { testState } from '@lib/stores/index';
import { installWindowActions } from '@lib/orchestration/window-actions';
import { hydrateFromLegacyState } from '@lib/data-store';
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
const overlayTarget = document.body;
let app: ReturnType<typeof mount> | undefined;
let legacyCompassSurface: ReturnType<typeof mount> | undefined;

if (mountTarget) {
  app = mount(App, {
    target: mountTarget,
    props: { forceDemo, noDemo }
  });
}

if (overlayTarget) {
  legacyCompassSurface = mount(LegacyCompassSurface, {
    target: overlayTarget
  });
}

// Hydrate Svelte stores from the legacy state after mount.
// The legacy init path sets __APP_STATE__ asynchronously; retry until the
// data is present or the cap is reached.
let hydrateAttempts = 0;
let hydrateSuccess = false;
const tryHydrate = (): void => {
  hydrateFromLegacyState();
  hydrateAttempts += 1;
  if (hydrateSuccess) return;
  if (hydrateAttempts < 60) {
    window.setTimeout(tryHydrate, 500);
  }
};
tryHydrate();

// ── __TEST_STATE__ sync (visual settle for Playwright surface/visual tests) ──

const unsubTestState = testState.subscribe((value) => {
  (window as any).__TEST_STATE__ = value;
});
const cleanupWindowActions = installWindowActions();

// ── Cleanup on page unload ────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  unsubTestState();
  cleanupWindowActions();
  if (app) unmount(app);
  if (legacyCompassSurface) unmount(legacyCompassSurface);
});

export default app;
