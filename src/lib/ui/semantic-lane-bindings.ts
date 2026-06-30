import { probeSemanticLane } from '@lib/orchestration/lifecycle'
import { loadSemanticThreads } from '@lib/engine/semantic-threads'
import { handleError, silenceError } from '@lib/utils/error-handler'

type RecordSemanticLaneSnapshot = (snapshot: { state: string; attempted_warm: boolean }) => void
type SetSemanticLaneUiState = (state: string, options: { label: string; title: string }) => void

export function bindSemanticLaneControls(
    recordSemanticLaneSnapshot: RecordSemanticLaneSnapshot,
    setSemanticLaneUiState: SetSemanticLaneUiState
): void {
    const retryBtn = document.getElementById('btn-semantic-lane-retry')
    if (retryBtn) {
        retryBtn.onclick = () => {
            recordSemanticLaneSnapshot({ state: 'reconnecting', attempted_warm: true })
            setSemanticLaneUiState('reconnecting', {
                label: 'Manual retry',
                title: 'Manual search retry is refreshing the background services.'
            })

            if (typeof loadSemanticThreads === 'function') {
                loadSemanticThreads({ reason: 'manual-retry' }).catch(
                    handleError({
                        context: 'semantic-lane-retry-threads',
                        onError: () => {
                            recordSemanticLaneSnapshot({ state: 'failed', attempted_warm: true })
                            setSemanticLaneUiState('failed', {
                                label: 'Retry failed',
                                title: 'Could not refresh search data. The background service may be unavailable.'
                            })
                        }
                    })
                )
            }

            if (typeof probeSemanticLane === 'function') {
                probeSemanticLane({ warm: true, reason: 'manual-retry' }).catch(
                    handleError({
                        context: 'semantic-lane-retry-probe',
                        onError: () => {
                            recordSemanticLaneSnapshot({ state: 'failed', attempted_warm: true })
                            setSemanticLaneUiState('failed', {
                                label: 'Retry failed',
                                title: 'Could not refresh search data. The background service may be unavailable.'
                            })
                        }
                    })
                )
            }
        }
    }
}

export function handleSemanticLaneWindowFocus(): void {
    if (typeof probeSemanticLane !== 'function') return
    probeSemanticLane({ warm: true, reason: 'focus' }).catch(silenceError('semantic-lane-focus'))
}

export function handleSemanticLaneVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return
    if (typeof probeSemanticLane !== 'function') return
    probeSemanticLane({ warm: true, reason: 'visibility' }).catch(silenceError('semantic-lane-visibility'))
}
