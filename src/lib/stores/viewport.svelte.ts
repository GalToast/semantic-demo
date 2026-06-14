/**
 * @lib/stores/viewport.svelte.ts — Viewport dimensions, DPR, reduced-motion, and breakpoints
 *
 * Replaces js/modules/environment.js viewport helpers.
 * Single source of truth for viewport state. Syncs body data-* attributes
 * via $effect for CSS coexistence during migration.
 */
import { get, type Readable, toStore } from 'svelte/store';
import type { ViewportState } from '@lib/types/state';
import { appState } from '@lib/state/app.svelte.ts';

// ── Constants ────────────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;
const COMPACT_LANDSCAPE_MAX_HEIGHT = 740;
const ULTRA_COMPACT_MAX_WIDTH = 430;
const ULTRA_COMPACT_MIN_HEIGHT = 741;
const ULTRA_COMPACT_MAX_HEIGHT = 860;
const MAX_DPR = 3;

// ── Store (reactive binding to kernel) ───────────────────────────────────────

/** Reactive binding to the Svelte 5 state kernel. */
const _viewportWritable = toStore(
  () => ({
    width: appState.viewportWidth,
    height: appState.viewportHeight,
    dpr: appState.viewportDpr,
    reducedMotion: appState.viewportReducedMotion,
    isCompact: appState.viewportIsCompact,
    isMobile: appState.viewportIsCompact, // Unified in kernel
    isLandscape: appState.viewportWidth > appState.viewportHeight,
    isCompactLandscape: appState.viewportIsCompact && appState.viewportHeight <= COMPACT_LANDSCAPE_MAX_HEIGHT,
    isUltraCompactPortrait:
      appState.viewportWidth <= ULTRA_COMPACT_MAX_WIDTH &&
      appState.viewportHeight >= ULTRA_COMPACT_MIN_HEIGHT &&
      appState.viewportHeight <= ULTRA_COMPACT_MAX_HEIGHT
  }),
  (val) => appState.withMutation(() => {
    appState.viewportWidth = val.width;
    appState.viewportHeight = val.height;
    appState.viewportDpr = val.dpr;
    appState.viewportReducedMotion = val.reducedMotion;
    appState.viewportIsCompact = val.isCompact;
  })
);

/**
 * Viewport store: callable as `viewport()` for direct state access,
 * and satisfies `Readable<ViewportState>` + `.update()`/`.set()` for store consumers.
 */
export type ViewportStoreApi = (() => ViewportState) &
  Readable<ViewportState> & {
    update(fn: (s: ViewportState) => ViewportState): void;
    set(value: ViewportState): void;
  };

function _createViewportStore(): ViewportStoreApi {
  const fn = (() => ({
    width: appState.viewportWidth,
    height: appState.viewportHeight,
    dpr: appState.viewportDpr,
    reducedMotion: appState.viewportReducedMotion,
    isCompact: appState.viewportIsCompact,
    isMobile: appState.viewportIsCompact,
    isLandscape: appState.viewportWidth > appState.viewportHeight,
    isCompactLandscape: appState.viewportIsCompact && appState.viewportHeight <= COMPACT_LANDSCAPE_MAX_HEIGHT,
    isUltraCompactPortrait:
      appState.viewportWidth <= ULTRA_COMPACT_MAX_WIDTH &&
      appState.viewportHeight >= ULTRA_COMPACT_MIN_HEIGHT &&
      appState.viewportHeight <= ULTRA_COMPACT_MAX_HEIGHT
  })) as unknown as ViewportStoreApi;

  fn.subscribe = _viewportWritable.subscribe as any;
  fn.update = _viewportWritable.update as any;
  fn.set = _viewportWritable.set as any;

  return fn;
}

/** Single reactive instance of the viewport state. */
export const viewport: ViewportStoreApi = _createViewportStore();

// ── Derived ──────────────────────────────────────────────────────────────────

export const viewportWidth = () => appState.viewportWidth;
export const viewportHeight = () => appState.viewportHeight;
export const dpr = () => appState.viewportDpr;
export const reducedMotion = () => appState.viewportReducedMotion;
export const isCompact = () => appState.viewportIsCompact;
export const isMobile = () => appState.viewportIsCompact;
export const isLandscape = () => appState.viewportWidth > appState.viewportHeight;

/** Compact landscape: max-width 768px AND max-height 740px (common small mobile). */
export const isCompactLandscape = () => {
  return appState.viewportIsCompact && appState.viewportHeight <= COMPACT_LANDSCAPE_MAX_HEIGHT;
};

/** Ultra-compact portrait: max-width 430px, height 741-860px. */
export const isUltraCompactPortrait = () => {
  return (
    appState.viewportWidth <= ULTRA_COMPACT_MAX_WIDTH &&
    appState.viewportHeight >= ULTRA_COMPACT_MIN_HEIGHT &&
    appState.viewportHeight <= ULTRA_COMPACT_MAX_HEIGHT
  );
};

// ── Actions ──────────────────────────────────────────────────────────────────

/** Re-read the viewport from the browser and update the store. */
export function syncViewport(): void {
  if (typeof window === 'undefined') return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCompact = width <= MOBILE_BREAKPOINT;

  appState.withMutation(() => {
    appState.viewportWidth = width;
    appState.viewportHeight = height;
    appState.viewportDpr = dpr;
    appState.viewportReducedMotion = reducedMotion;
    appState.viewportIsCompact = isCompact;
  });

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.compact = String(isCompact);
    document.body.dataset.mobile = String(isCompact);
    document.body.dataset.reducedMotion = String(reducedMotion);
  }
}

/**
 * Initialize viewport listeners (resize + prefers-reduced-motion).
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
    appState.withMutation(() => {
      appState.viewportReducedMotion = e.matches;
    });
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.reducedMotion = String(e.matches);
    }
  };

  window.addEventListener('resize', onResize, { passive: true });
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', onMotionChange);

  syncViewport();

  return () => {
    window.removeEventListener('resize', onResize);
    if (resizeRaf !== null) window.cancelAnimationFrame(resizeRaf);
    motionQuery.removeEventListener('change', onMotionChange);
  };
}

// ── Query helpers ────────────────────────────────────────────────────────────

export function getViewportSize(): { width: number; height: number } {
  return { width: appState.viewportWidth, height: appState.viewportHeight };
}

export function isMobileViewport(): boolean {
  return appState.viewportIsCompact;
}

export function isCompactFocusStage(): boolean {
  return appState.viewportIsCompact;
}

export function prefersReducedMotion(): boolean {
  return appState.viewportReducedMotion;
}

export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function getDevicePixelRatio(): number {
  return appState.viewportDpr;
}

export function getPanelSurface(): string {
  if (typeof document === 'undefined') return '';
  return document.body?.dataset?.panelSurface || '';
}

export function isMapSummarySurface(): boolean {
  return getPanelSurface() === 'map-focus-search';
}

export function isSemanticDiveSurface(): boolean {
  return getPanelSurface() === 'semantic-dive';
}

export function matchMediaSafe(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

export function getLocation(): Location | null {
  return typeof window !== 'undefined' ? window.location : null;
}

export function getCurrentUrl(): string {
  return typeof window !== 'undefined' ? window.location.href : '';
}
