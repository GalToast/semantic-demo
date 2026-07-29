import { probeSemanticLane } from '@lib/orchestration/lifecycle'
import { silenceError } from '@lib/utils/error-handler'

export function handleSemanticLaneWindowFocus(): void {
    if (typeof probeSemanticLane !== 'function') return
    probeSemanticLane({ warm: true, reason: 'focus' }).catch(silenceError('semantic-lane-focus'))
}

export function handleSemanticLaneVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return
    if (typeof probeSemanticLane !== 'function') return
    probeSemanticLane({ warm: true, reason: 'visibility' }).catch(silenceError('semantic-lane-visibility'))
}
