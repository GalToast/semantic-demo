/**
 * @lib/stores/viewport.ts — Viewport dimensions, DPR, reduced-motion, and breakpoints
 */
import { writable, derived } from 'svelte/store';
import type { ViewportState } from '@lib/types/state';

// ── Initial state (SSR-safe defaults) ─────────────────────────────────────────

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
    dpr: Math.min(window.devicePixelRatio || 1, 3),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isCompact: window.innerWidth <= 768,
    isMobile: window.innerWidth <= 768,
    isLandscape: window.innerWidth > window.innerHeight
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const viewport = writable<ViewportState>(getInitialViewport());

// ── Derived ───────────────────────────────────────────────────────────────────

export const viewportWidth = derived(viewport, ($v) => $v.width);
export const viewportHeight = derived(viewport, ($v) => $v.height);
export const dpr = derived(viewport, ($v) => $v.dpr);
export const reducedMotion = derived(viewport, ($v) => $v.reducedMotion);
export const isCompact = derived(viewport, ($v) => $v.isCompact);
export const isMobile = derived(viewport, ($v) => $v.isMobile);
export const isLandscape = derived(viewport, ($v) => $v.isLandscape);

// ── Actions ───────────────────────────────────────────────────────────────────

export function syncViewport(): void {
  if (typeof window === 'undefined') return;

  viewport.set({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 3),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isCompact: window.innerWidth <= 768,
    isMobile: window.innerWidth <= 768,
    isLandscape: window.innerWidth > window.innerHeight
  });
}

/**
 * Initialize viewport listeners. Call once on mount.
 * Returns a cleanup function.
 */
export function initViewportListeners(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onResize = () => syncViewport();
  const onMotionChange = (e: MediaQueryListEvent) => {
    viewport.update((v) => ({ ...v, reducedMotion: e.matches }));
  };

  window.addEventListener('resize', onResize, { passive: true });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', onMotionChange);

  // Initial sync
  syncViewport();

  return () => {
    window.removeEventListener('resize', onResize);
    motionQuery.removeEventListener('change', onMotionChange);
  };
}
