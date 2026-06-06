import { state } from '../../state.js';
import { _globalEventController } from './global-bindings.js';

let _onboardingIdleTimer = null;
let _onboardingIdleActive = false;
let _scheduleHintTimer = null;
let _scheduleDismissTimer = null;

function _clearOnboardingTimers() {
    if (_onboardingIdleTimer) { clearTimeout(_onboardingIdleTimer); _onboardingIdleTimer = null; }
    if (_scheduleHintTimer) { clearTimeout(_scheduleHintTimer); _scheduleHintTimer = null; }
    if (_scheduleDismissTimer) { clearTimeout(_scheduleDismissTimer); _scheduleDismissTimer = null; }
    _onboardingIdleActive = false;
    const onboarding = document.getElementById('onboarding-hint');
    if (onboarding?._autoHideTimer) { clearTimeout(onboarding._autoHideTimer); onboarding._autoHideTimer = null; }
}

/**
 * Clears onboarding idle + auto-hide timers. Exported so it can be wired
 * into a dispose path; cleanup also fires automatically when the global
 * AbortController signal aborts (see scheduleOnboardingHint).
 */
export function disposeOnboardingBindings() {
    _clearOnboardingTimers();
}

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
            _onboardingIdleActive = true;
            if (onboarding._autoHideTimer) clearTimeout(onboarding._autoHideTimer);
            onboarding._autoHideTimer = setTimeout(() => {
                onboarding.classList.remove('visible');
                onboarding.setAttribute('aria-hidden', 'true');
                onboarding._autoHideTimer = null;
                _onboardingIdleActive = false;
                resetOnboardingIdleTimer();
            }, 6000);
        }
        // Re-arm only when the hint is not currently displayed.
        // If it IS displayed, the auto-hide callback above will re-arm
        // once the hint dismisses.
        if (!_onboardingIdleActive) {
            resetOnboardingIdleTimer();
        }
    }, 120000);
}

export function scheduleOnboardingHint(signal = _globalEventController.signal) {
    const onboarding = document.getElementById('onboarding-hint');
    if (_scheduleHintTimer) clearTimeout(_scheduleHintTimer);
    _scheduleHintTimer = setTimeout(() => {
        if (onboarding && shouldShowOnboardingHint()) {
            onboarding.classList.add('visible');
            onboarding.setAttribute('aria-hidden', 'false');
        }
    }, 1500);
    if (_scheduleDismissTimer) clearTimeout(_scheduleDismissTimer);
    _scheduleDismissTimer = setTimeout(() => {
        if (onboarding) {
            onboarding.classList.remove('visible');
            onboarding.setAttribute('aria-hidden', 'true');
        }
    }, 7500);
    resetOnboardingIdleTimer();

    if (!state.registeredEvents.has('onboarding-interaction')) {
        state.registeredEvents.add('onboarding-interaction');
        ['mousemove', 'keydown', 'click'].forEach(evt => document.addEventListener(evt, resetOnboardingIdleTimer, { passive: true, signal }));
        // Wire timer cleanup to global dispose so orphaned timers are cleared on teardown.
        // disposeEventListeners() → signal.abort() triggers this, so no separate
        // disposeOnboardingBindings() wiring is needed in event-bindings.js.
        signal.addEventListener('abort', _clearOnboardingTimers, { once: true });
    }
}
