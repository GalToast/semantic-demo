import { DisposableRegistry } from '@lib/utils/disposable-registry'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state

const _registry = new DisposableRegistry({ label: 'onboarding' })
let _onboardingAbortController: AbortController | null = null

export function disposeOnboardingBindings(): void {
    _registry.disposeAll()
    _onboardingAbortController?.abort()
    _onboardingAbortController = null
}

export function shouldShowOnboardingHint(): boolean {
    const onboarding = document.getElementById('onboarding-hint') as
        | (HTMLElement & {
              _dismissedThisSession?: boolean
              _autoHideTimer?: ReturnType<typeof setTimeout> | null
          })
        | null
    if (!onboarding || onboarding._dismissedThisSession || state.currentView !== 'galaxy' || state.currentSearchSummary)
        return false
    if (state.applyingUrlState || state._deferredUrlState || state.semanticDiveMode || state.restoringBrowserHistory)
        return false
    if (
        (document.body as HTMLElement)?.dataset?.graphContext &&
        (document.body as HTMLElement).dataset.graphContext !== 'idle'
    )
        return false
    return !(Number.isFinite(state.focusedNode) || Number.isFinite(state.navState?.focusedIndex))
}

export function resetOnboardingIdleTimer(): void {
    _registry.disposeAll()
    _registry.timer(
        setTimeout(() => {
            const onboarding = document.getElementById('onboarding-hint') as
                | (HTMLElement & {
                      _autoHideTimer?: ReturnType<typeof setTimeout> | null
                  })
                | null
            if (onboarding && shouldShowOnboardingHint()) {
                onboarding.classList.add('visible')
                onboarding.setAttribute('aria-hidden', 'false')
                if (onboarding._autoHideTimer) clearTimeout(onboarding._autoHideTimer)
                onboarding._autoHideTimer = setTimeout(() => {
                    onboarding.classList.remove('visible')
                    onboarding.setAttribute('aria-hidden', 'true')
                    onboarding._autoHideTimer = null
                }, 6000)
            }
            resetOnboardingIdleTimer()
        }, 120000)
    )
}

export function scheduleOnboardingHint(): void {
    const onboarding = document.getElementById('onboarding-hint')
    _registry.disposeAll()
    _registry.timer(
        setTimeout(() => {
            if (onboarding && shouldShowOnboardingHint()) {
                onboarding.classList.add('visible')
                onboarding.setAttribute('aria-hidden', 'false')
            }
        }, 1500)
    )
    _registry.timer(
        setTimeout(() => {
            if (onboarding) {
                onboarding.classList.remove('visible')
                onboarding.setAttribute('aria-hidden', 'true')
            }
        }, 7500)
    )
    resetOnboardingIdleTimer()

    if (!state.registeredEvents.has('onboarding-interaction')) {
        state.registeredEvents.add('onboarding-interaction')
        _onboardingAbortController = new AbortController()
        ;(['mousemove', 'keydown', 'click'] as const).forEach((evt) =>
            document.addEventListener(evt, resetOnboardingIdleTimer, {
                passive: true,
                signal: _onboardingAbortController!.signal
            })
        )
    }
}
