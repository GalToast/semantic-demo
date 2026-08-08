import { DisposableRegistry } from '@lib/utils/disposable-registry'

let registry = new DisposableRegistry({
    label: 'journey-focus-defer',
    warnAfterDispose: false
})

export function scheduleJourneyFocusTimer(ms: number, callback: () => void): ReturnType<typeof setTimeout> {
    return registry.schedule(ms, callback)
}

/** Cancel deferred focus work and make the owner reusable for the next mount. */
export function disposeJourneyFocusTimers(): void {
    registry.disposeAll()
    registry = new DisposableRegistry({
        label: 'journey-focus-defer',
        warnAfterDispose: false
    })
}
