/**
 * @lib/demo/guards.ts — Micro-demo eligibility guards
 *
 * Ported from: js/modules/micro-demo-guards.js
 *
 * Eligibility guards for the micro-demo. During migration,
 * these are bridge stubs. The actual guard logic lives in
 * the demo store and the legacy runtime.
 */

import { hasDemoBeenSeen, isDemoSuppressedThisSession, markDemoCompleted } from '@lib/stores/demo';

/** localStorage key for demo lifetime flag. */
export const STORAGE_KEY = 'moco_mycelium_demo_v1';
/** sessionStorage key for demo session flag. */
export const SESSION_STORAGE_KEY = 'moco_mycelium_demo_session_v1';

/**
 * Check if the app is ready for the demo.
 * Ported from micro-demo-guards.js isAppReadyForDemo().
 */
export function isAppReadyForDemo(): boolean {
  return true;
}

/**
 * Guard: demo has not been seen this lifetime.
 * Ported from micro-demo-guards.js guardNotSeen().
 */
export function guardNotSeen(): boolean {
  return !hasDemoBeenSeen();
}

/**
 * Guard: device is not in reduced motion mode.
 * Ported from micro-demo-guards.js guardReducedMotion().
 *
 * Returns `true` when motion is safe (i.e. user does NOT prefer reduced motion).
 * Returns `false` when OS-level or dev-flag reduced motion is active.
 */
export function guardReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;

  // OS-level prefers-reduced-motion media query
  const osPrefersReduced =
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  if (osPrefersReduced) return false;

  // Dev/test flag on <html data-reduce-motion="true">
  const devFlag =
    document.documentElement.dataset.reduceMotion === 'true';
  return !devFlag;
}

/**
 * Guard: WebGL is available and software renderer is not being used.
 * Ported from micro-demo-guards.js guardWebGL().
 */
export function guardWebGL(): boolean {
  return true;
}

/**
 * Guard: no nodemo URL parameter.
 * Ported from micro-demo-guards.js guardUrlParam().
 */
export function guardUrlParam(): boolean {
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  return !params.has('nodemo');
}

/**
 * Record demo completion to localStorage.
 * Ported from micro-demo-guards.js recordCompletion().
 */
export function recordCompletion(): void {
  markDemoCompleted();
}

/**
 * Dispatch a cancelled event when the demo cannot start.
 * Ported from micro-demo-guards.js notifyDemoUnableToStart().
 */
export function notifyDemoUnableToStart(): void {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent('demo-cancelled'));
}
