/**
 * @lib/demo/guards.ts — Eligibility guards for the micro-demo
 *
 * Reduced-motion guard + the `'demo-cancelled'` dispatch. The app-readiness,
 * lifetime, WebGL, URL-param, localStorage, and completion helpers
 * (`STORAGE_KEY`, `isAppReadyForDemo`, `guardNotSeen`, `guardWebGL`,
 * `guardUrlParam`, `recordCompletion`) were removed in the dead-code
 * round-2 sweep — 0 external consumers. `notifyDemoUnableToStart` is kept
 * despite having no importers because it is the sole dispatcher of the
 * `demo-cancelled` CustomEvent, which is listened for elsewhere.
 */
import { prefersReducedMotion } from '@lib/utils/environment'

export function guardReducedMotion(): boolean {
    const osPref = prefersReducedMotion()
    if (osPref) return false
    const devFlag = document.documentElement.dataset.reduceMotion === 'true'
    return !devFlag
}

export function notifyDemoUnableToStart(): void {
    document.dispatchEvent(new CustomEvent('demo-cancelled'))
}
