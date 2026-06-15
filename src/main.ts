/**
 * @/main.ts — Svelte 5 app entry point
 *
 * Imports App.svelte and mounts to #app target using the Svelte 5 `mount` API.
 * Initializes stores from URL params (?demo=force, ?nodemo=1).
 */
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import LegacyCompassSurface from '@components/LegacyCompassSurface.svelte';
import { testState } from '@lib/stores/index.svelte.ts';
import { installWindowActions } from '@lib/orchestration/window-actions';
import { hydrateFromLegacyState } from '@lib/data-store';
import { appState } from '@lib/state/app.svelte.ts';
import { state as legacyState } from '@lib/engine/state-bridge';
import { initRouteTraceSubscriptions } from '@lib/engine/adapters-bridge';
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

// Ensure legacy state is exposed on window before any async data loads
// so that semantic-threads.ts (which may fall back to window.__APP_STATE__)
// writes to the real state object instead of an empty placeholder.
if (typeof window !== 'undefined') {
  (window as any).__LEGACY_APP_STATE__ = legacyState;
}

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

// Initialize legacy route trace event subscriptions so the Svelte track
// still builds WebGL route trace overlays and writes routeTraceDiagnostics
// for visual-audit compatibility.
initRouteTraceSubscriptions();

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

type TestCompatWindow = Window & {
  __APP_STATE__?: unknown;
  __TEST_STATE__?: unknown;
  __LEGACY_APP_STATE__?: unknown;
  __refreshTestCompatState__?: () => void;
};

let latestTestState: unknown = null;
let testCompatProxy: Record<string, unknown> | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function getCompatSources(): {
  legacyState: Record<string, unknown>;
  svelteState: Record<string, unknown>;
} {
  const w = window as TestCompatWindow;
  return {
    legacyState: asRecord(w.__LEGACY_APP_STATE__),
    svelteState: asRecord(latestTestState),
  };
}

function getCompatNavState(): Record<string, unknown> {
  const { legacyState, svelteState } = getCompatSources();
  return {
    ...asRecord(legacyState.navState),
    ...asRecord(svelteState.navState),
  };
}

function getCompatValue(prop: string | symbol): unknown {
  if (typeof prop !== 'string') return undefined;
  const { legacyState, svelteState } = getCompatSources();
  if (prop === 'navState') return getCompatNavState();
  if (prop === 'state') {
    return {
      ...asRecord(legacyState.state),
      ...asRecord(svelteState.state),
      currentView: svelteState.currentView ?? legacyState.currentView,
      navState: getCompatNavState(),
    };
  }
  const svelteValue = svelteState[prop];
  if (svelteValue !== undefined) return svelteValue;
  const legacyValue = legacyState[prop];
  if (legacyValue !== undefined) return legacyValue;
  // Fallback to Svelte appState for properties not synced to legacy/testState
  return (appState as any)[prop];
}

function createTestCompatProxy(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        return getCompatValue(prop);
      },
      set(_target, prop, value) {
        if (typeof prop !== 'string') return false;
        const { legacyState } = getCompatSources();
        legacyState[prop] = value;
        return true;
      },
      has(_target, prop) {
        if (typeof prop !== 'string') return false;
        const { legacyState, svelteState } = getCompatSources();
        return prop in legacyState || prop in svelteState || prop === 'state';
      },
      ownKeys() {
        const { legacyState, svelteState } = getCompatSources();
        return Array.from(new Set([...Reflect.ownKeys(legacyState), ...Reflect.ownKeys(svelteState), 'state']));
      },
      getOwnPropertyDescriptor(_target, prop) {
        return {
          configurable: true,
          enumerable: true,
          value: getCompatValue(prop),
        };
      },
      deleteProperty(_target, prop) {
        if (typeof prop !== 'string') return false;
        const { legacyState } = getCompatSources();
        return delete legacyState[prop];
      },
    }
  );
}

function publishTestCompatState(): void {
  const w = window as TestCompatWindow;
  testCompatProxy ??= createTestCompatProxy();
  w.__TEST_STATE__ = testCompatProxy;
  w.__APP_STATE__ = testCompatProxy;
}

((window as unknown) as TestCompatWindow).__refreshTestCompatState__ = publishTestCompatState;
const unsubTestState = testState.subscribe((value) => {
  latestTestState = value;
  publishTestCompatState();
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
