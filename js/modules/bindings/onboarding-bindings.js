import { state } from '../../state.js';

let _onboardingIdleTimer = null;

export function shouldShowOnboardingHint() {
    const onboarding = document.getElementById('onboarding-hint');
    if (!onboarding || onboarding._dismissedThisSession || state.currentView !== 'galaxy' || state.currentSearchSummary) return false;
    if (state.applyingUrlState || state._deferredUrlState || state.semanticDiveMode || state.restoringBrowserHistory) return false;
    if (document.body?.dataset?.graphContext && document.body.dataset.graphContext !== 'idle') return false;
    return !(Number.isFinite(state.focusedNode) || Number.isFinite(state.navState?.focusedIndex));
}

export function resetOnboardingIdleTimer() {
    if (_onboardingIdleTimer) clearTimeout(_onboardingIdleTimer);
    _onboardingIdleTimer = setTimeout(() => {
        const onboarding = document.getElementById('onboarding-hint');
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

export function scheduleOnboardingHint() {
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
    ['mousemove', 'keydown', 'click'].forEach(evt => document.addEventListener(evt, resetOnboardingIdleTimer, { passive: true }));
}
