/**
 * semantic-lane-bindings.ts
 * Canonical location (ported from js/modules/bindings/semantic-lane-bindings.ts — W15).
 * Semantic lane retry, focus, and visibility controls.
 */

import { probeSemanticLane } from '../../../js/modules/lifecycle.ts';
import { loadSemanticThreads } from '../../../js/modules/semantic-threads.ts';

type RecordSemanticLaneSnapshot = (snapshot: { state: string; attempted_warm: boolean }) => void;
type SetSemanticLaneUiState = (state: string, options: { label: string; title: string }) => void;

export function bindSemanticLaneControls(recordSemanticLaneSnapshot: RecordSemanticLaneSnapshot, setSemanticLaneUiState: SetSemanticLaneUiState): void {
    const retryBtn = document.getElementById('btn-semantic-lane-retry');
    if (retryBtn) {
        retryBtn.onclick = () => {
            recordSemanticLaneSnapshot({ state: 'reconnecting', attempted_warm: true });
            setSemanticLaneUiState('reconnecting', { label: 'Manual retry', title: 'Manual search retry is refreshing the background services.' });
            if (typeof loadSemanticThreads === 'function') loadSemanticThreads({ reason: 'manual-retry' }).catch(() => {});
            if (typeof probeSemanticLane === 'function') probeSemanticLane({ warm: true, reason: 'manual-retry' }).catch(() => {});
        };
    }
}

export function handleSemanticLaneWindowFocus(): void {
    if (typeof probeSemanticLane !== 'function') return;
    probeSemanticLane({ warm: true, reason: 'focus' }).catch(() => {});
}

export function handleSemanticLaneVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    if (typeof probeSemanticLane !== 'function') return;
    probeSemanticLane({ warm: true, reason: 'visibility' }).catch(() => {});
}
