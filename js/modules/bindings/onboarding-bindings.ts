/**
 * onboarding-bindings.ts
 * Typechecked sibling for onboarding-bindings.js
 * Onboarding hint scheduling and interaction tracking.
 */

import { state as _state } from '@lib/engine/state-bridge';
const state = _state as any;

let _onboardingIdleTimer: ReturnType<typeof setTimeout> | null = null;
let _scheduleHintTimer: ReturnType<typeof setTimeout> | null = null;
let _scheduleDismissTimer: ReturnType<typeof setTimeout> | null = null;
let _onboardingIdleActive = false;

function _clearOnboardingTimers(): void {
    if (_onboardingIdleTimer) {
        clearTimeout(_onboardingIdleTimer);
        _onboardingIdleTimer = null;
    }
    if (_scheduleHintTimer) {
        clearTimeout(_scheduleHintTimer);
        _scheduleHintTimer = null;
    }
    if (_scheduleDismissTimer) {
        clearTimeout(_scheduleDismissTimer);
        _scheduleDismissTimer = null;
    }

    _onboardingIdleActive = false;

    const onboarding = document.getElementById('onboarding-hint') as (HTMLElement & { _autoHideTimer?: ReturnType<typeof setTimeout> | null }) | null;
    if (onboarding?._autoHideTimer) {
        clearTimeout(onboarding._autoHideTimer);
        onboarding._autoHideTimer = null;
    }
}

export function disposeOnboardingBindings(): void {
    _clearOnboardingTimers();
}

export function shouldShowOnboardingHint(): boolean {
    const onboarding = document.getElementById('onboarding-hint') as (HTMLElement & { _dismissedThisSession?: boolean; _autoHideTimer?: ReturnType<typeof setTimeout> | null }) | null;
    if (!onboarding || onboarding._dismissedThisSession || state.currentView !== 'galaxy' || state.currentSearchSummary) return false;
    if (state.applyingUrlState || state._deferredUrlState || state.semanticDiveMode || state.restoringBrowserHistory) return false;
    if ((document.body as HTMLElement)?.dataset?.graphContext && (document.body as HTMLElement).dataset.graphContext !== 'idle') return false;
    return !(Number.isFinite(state.focusedNode) || Number.isFinite(state.navState?.focusedIndex));
}

export function resetOnboardingIdleTimer(): void {
    if (_onboardingIdleTimer) clearTimeout(_onboardingIdleTimer);
    _onboardingIdleTimer = setTimeout(() => {
        const onboarding = document.getElementById('onboarding-hint') as (HTMLElement & { _autoHideTimer?: ReturnType<typeof setTimeout> | null }) | null;
        if (onboarding && shouldShowOnboardingHint()) {
            onboarding.classList.add('visible');
            onboarding.setAttribute('aria-hidden', 'false');
            if (onboarding._autoHideTimer) clearTimeout(onboarding._autoHideTimer);
            onboarding._autoHideTimer = setTimeout(() => {
                onboarding.classList.remove('visible');
                onboarding.setAttribute('aria-hidden', 'true');
                onboarding._autoHideTimer = null;
            }, 6000);
        }
        resetOnboardingIdleTimer();
    }, 120000);
}

export function scheduleOnboardingHint(): void {
    const onboarding = document.getElementById('onboarding-hint');
    setTimeout(() => {
        if (onboarding && shouldShowOnboardingHint()) {
            onboarding.classList.add('visible');
            onboarding.setAttribute('aria-hidden', 'false');
        }
    }, 1500);
    setTimeout(() => {
        if (onboarding) {
            onboarding.classList.remove('visible');
            onboarding.setAttribute('aria-hidden', 'true');
        }
    }, 7500);
    resetOnboardingIdleTimer();

    if (!state.registeredEvents.has('onboarding-interaction')) {
        state.registeredEvents.add('onboarding-interaction');
        (['mousemove', 'keydown', 'click'] as const).forEach(evt => document.addEventListener(evt, resetOnboardingIdleTimer, { passive: true }));
    }
}
