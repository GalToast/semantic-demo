/**
 * No-op stub: the associated onboarding DOM element is never declared in
 * any template, so the original logic was a silent no-op. Retained as an
 * empty export so consumers (event-bindings.ts) don't need a coordinated
 * change.
 */
export function scheduleOnboardingHint(): void {
    // Intentionally empty — the element is never rendered.
}
