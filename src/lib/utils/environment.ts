/**
 * @lib/utils/environment.ts — Shared viewport, pointer, DPR, and reduced-motion helpers
 *
 * Port of
 * Note: The viewport store in @lib/stores/viewport.ts is the canonical reactive
 * source for viewport state. These functions provide the same logic as imperative
 * helpers for use outside Svelte's reactive context (e.g. in engine bridge code).
 */

export function getViewportSize(): { width: number; height: number } {
  return {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  };
}

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 768;
}

export const isMobile = isMobileViewport;

export function isCompactFocusStage(): boolean {
  return isMobileViewport();
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  );
}

export function hasCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)')?.matches === true
  );
}

export function isCompactLandscape(): boolean {
  if (typeof window === 'undefined') return false;
  const { width, height } = getViewportSize();
  return width <= 768 && height <= 740;
}

export function isUltraCompactPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  const { width, height } = getViewportSize();
  return width <= 430 && height >= 741 && height <= 860;
}

export function getDevicePixelRatio(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio !== undefined
    ? window.devicePixelRatio
    : 1;
}

export function getPanelSurface(): string {
  if (typeof document === 'undefined') return '';
  return document.body?.dataset?.panelSurface ?? '';
}

export function isMapSummarySurface(): boolean {
  return getPanelSurface() === 'map-focus-search';
}

export function isSemanticDiveSurface(): boolean {
  return getPanelSurface() === 'semantic-dive';
}

export function matchMedia(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

export function getLocation(): Location | null {
  return typeof window !== 'undefined' ? window.location : null;
}

export function getCurrentUrl(): string {
  return typeof window !== 'undefined' ? window.location.href : '';
}

export function getComputedStyle(
  el: Element,
  pseudo?: string
): CSSStyleDeclaration | null {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return null;
  return pseudo !== undefined
    ? window.getComputedStyle(el, pseudo)
    : window.getComputedStyle(el);
}

export function requestAnimationFrame(callback: FrameRequestCallback): number {
  if (
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function'
  )
    return 0;
  return window.requestAnimationFrame(callback);
}

export function cancelAnimationFrame(id: number): void {
  if (
    typeof window === 'undefined' ||
    typeof window.cancelAnimationFrame !== 'function'
  )
    return;
  window.cancelAnimationFrame(id);
}
