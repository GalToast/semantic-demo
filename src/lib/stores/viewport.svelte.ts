/**
 * @lib/stores/viewport.svelte.ts — Viewport dimensions, DPR, reduced-motion, and breakpoints
 *
 * Replaces js/modules/environment.js viewport helpers.
 * Single source of truth for viewport state. Syncs body data-* attributes
 * via $effect for CSS coexistence during migration.
 */
import { writable, get, type Readable, type Subscriber, type Unsubscriber } from 'svelte/store';
import type { ViewportState } from '@lib/types/state';

// ── Constants ────────────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;
const COMPACT_LANDSCAPE_MAX_HEIGHT = 740;
const ULTRA_COMPACT_MAX_WIDTH = 430;
const ULTRA_COMPACT_MIN_HEIGHT = 741;
const ULTRA_COMPACT_MAX_HEIGHT = 860;
const MAX_DPR = 3;

// ── Initial state (SSR-safe defaults) ────────────────────────────────────────

function getInitialViewport(): ViewportState {
  if (typeof window === 'undefined') {
    return {
      width: 1920,
      height: 1080,
      dpr: 1,
      reducedMotion: false,
      isCompact: false,
      isMobile: false,
      isLandscape: true
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isCompact: window.innerWidth <= MOBILE_BREAKPOINT,
    isMobile: window.innerWidth <= MOBILE_BREAKPOINT,
    isLandscape: window.innerWidth > window.innerHeight
  };
}

// ── Store (writable-backed, callable) ────────────────────────────────────────

const _viewportWritable = writable<ViewportState>(getInitialViewport());

/**
 * Viewport store: callable as `viewport()` for direct state access,
 * and satisfies `Readable<ViewportState>` + `.update()`/`.set()` for store consumers.
 * `get(viewport)` from svelte/store works because it delegates to `.subscribe()`.
 */
export type ViewportStoreApi = (() => ViewportState) &
  Readable<ViewportState> & {
    update(fn: (s: ViewportState) => ViewportState): void;
    set(value: ViewportState): void;
  };

function _createViewportStore(): ViewportStoreApi {
  const fn = (() => get(_viewportWritable)) as ViewportStoreApi;

  fn.subscribe = _viewportWritable.subscribe;
  fn.update = _viewportWritable.update;
  fn.set = _viewportWritable.set;

  return fn;
}

/** Single reactive instance of the viewport state. */
export const viewport: ViewportStoreApi = _createViewportStore();

// ── Derived ──────────────────────────────────────────────────────────────────

export const viewportWidth = () => get(_viewportWritable).width;
export const viewportHeight = () => get(_viewportWritable).height;
export const dpr = () => get(_viewportWritable).dpr;
export const reducedMotion = () => get(_viewportWritable).reducedMotion;
export const isCompact = () => get(_viewportWritable).isCompact;
export const isMobile = () => get(_viewportWritable).isMobile;
export const isLandscape = () => get(_viewportWritable).isLandscape;

/** Compact landscape: max-width 768px AND max-height 740px (common small mobile). */
export const isCompactLandscape = () => {
  const vp = get(_viewportWritable);
  return vp.width <= MOBILE_BREAKPOINT && vp.height <= COMPACT_LANDSCAPE_MAX_HEIGHT;
};

/** Ultra-compact portrait: max-width 430px, height 741-860px. */
export const isUltraCompactPortrait = () => {
  const vp = get(_viewportWritable);
  return (
    vp.width <= ULTRA_COMPACT_MAX_WIDTH &&
    vp.height >= ULTRA_COMPACT_MIN_HEIGHT &&
    vp.height <= ULTRA_COMPACT_MAX_HEIGHT
  );
};

// ── Actions ──────────────────────────────────────────────────────────────────

/** Re-read the viewport from the browser and update the store. */
export function syncViewport(): void {
  if (typeof window === 'undefined') return;

  _viewportWritable.set({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isCompact: window.innerWidth <= MOBILE_BREAKPOINT,
    isMobile: window.innerWidth <= MOBILE_BREAKPOINT,
    isLandscape: window.innerWidth > window.innerHeight
  });
}

/**
 * Initialize viewport listeners (resize + prefers-reduced-motion).
 * Call once on mount. Returns a cleanup function.
 */
export function initViewportListeners(): () => void {
  if (typeof window === 'undefined') return () => {};

  let resizeRaf: number | null = null;
  const onResize = () => {
    if (resizeRaf !== null) return;
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = null;
      syncViewport();
    });
  };
  const onMotionChange = (e: MediaQueryListEvent) => {
    _viewportWritable.update(s => ({ ...s, reducedMotion: e.matches }));
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.reducedMotion = String(e.matches);
    }
  };

  window.addEventListener('resize', onResize, { passive: true });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', onMotionChange);

  // Initial sync
  syncViewport();

  // Sync body data attributes on init
  if (typeof document !== 'undefined' && document.body) {
    const vp = getInitialViewport();
    document.body.dataset.reducedMotion = String(vp.reducedMotion);
    document.body.dataset.compact = String(vp.isCompact);
    document.body.dataset.mobile = String(vp.isMobile);
  }

  return () => {
    window.removeEventListener('resize', onResize);
    if (resizeRaf !== null) window.cancelAnimationFrame(resizeRaf);
    motionQuery.removeEventListener('change', onMotionChange);
  };
}

// ── Query helpers (read-only, no store dependency) ───────────────────────────

/** Returns the current viewport size (imperative, no subscription). */
export function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Returns true when viewport width is at or below the mobile breakpoint. */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
}

/** Returns true when the focus-stage UI should use compact (mobile) layout. */
export function isCompactFocusStage(): boolean {
  return isMobileViewport();
}

/** Returns true when the user prefers reduced motion (OS-level). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  );
}

/** Returns true when the current device has a coarse pointer (touch). */
export function hasCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)')?.matches === true
  );
}

/** Returns the device pixel ratio, defaulting to 1 when unavailable. */
export function getDevicePixelRatio(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio !== undefined
    ? window.devicePixelRatio
    : 1;
}

/**
 * Returns the current `data-panel-surface` value from `<body>`, or empty string
 * when unavailable (SSR, tests without a DOM).
 */
export function getPanelSurface(): string {
  if (typeof document === 'undefined') return '';
  return document.body?.dataset?.panelSurface || '';
}

/** Returns true when the mobile map-focus-search surface is active. */
export function isMapSummarySurface(): boolean {
  return getPanelSurface() === 'map-focus-search';
}

/** Returns true when the mobile semantic-dive surface is active. */
export function isSemanticDiveSurface(): boolean {
  return getPanelSurface() === 'semantic-dive';
}

/**
 * Safe wrapper for `window.matchMedia`. Returns null in SSR/test environments.
 */
export function matchMediaSafe(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

/** Returns `window.location` when available, otherwise null for SSR/test. */
export function getLocation(): Location | null {
  return typeof window !== 'undefined' ? window.location : null;
}

/** Returns the current URL string, or empty string for SSR/test. */
export function getCurrentUrl(): string {
  return typeof window !== 'undefined' ? window.location.href : '';
}
