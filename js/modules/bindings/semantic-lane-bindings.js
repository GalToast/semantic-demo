import { probeSemanticLane } from '../lifecycle.js';
import { loadSemanticThreads } from '../semantic-threads.js';

export function bindSemanticLaneControls(recordSemanticLaneSnapshot, setSemanticLaneUiState) {
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

export function handleSemanticLaneWindowFocus() {
    if (typeof probeSemanticLane !== 'function') return;
    probeSemanticLane({ warm: true, reason: 'focus' }).catch(() => {});
}

export function handleSemanticLaneVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    if (typeof probeSemanticLane !== 'function') return;
    probeSemanticLane({ warm: true, reason: 'visibility' }).catch(() => {});
}
