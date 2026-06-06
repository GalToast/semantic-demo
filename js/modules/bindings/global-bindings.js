import { state } from '../../state.js';
import { handleGalaxyKeydown } from '../keyboard-help.js';
import { handleSemanticLaneWindowFocus, handleSemanticLaneVisibilityChange } from './semantic-lane-bindings.js';
import { applyUrlState } from '../url-state.js';
import { disposeFocusTrapBindings } from './focus-trap-bindings.js';

export let _globalEventController = new AbortController();

export function disposeEventListeners() {
    _globalEventController.abort();
    _globalEventController = new AbortController();
    state.registeredEvents.clear();
    state.eventListenersInitialized = false;
    if (document.body) delete document.body.dataset.journeyCompassStepDelegated;
    disposeFocusTrapBindings();
}

export function bindGlobalEvents() {
    if (!state.registeredEvents.has('global-interaction')) {
        state.registeredEvents.add('global-interaction');
        const opts = { signal: _globalEventController.signal };
        document.addEventListener('keydown', (e) => {
            const button = e.target instanceof HTMLButtonElement ? e.target : null;
            if (button && !button.disabled && (e.key === ' ' || e.code === 'Space')) {
                e.preventDefault();
                e.stopPropagation();
                button.click();
            }
        }, { capture: true, signal: _globalEventController.signal });
        window.addEventListener('keydown', (e) => { handleGalaxyKeydown(e); }, opts);
        window.addEventListener('focus', () => { if (typeof handleSemanticLaneWindowFocus === 'function') handleSemanticLaneWindowFocus(); }, opts);
        window.addEventListener('popstate', (e) => {
            if (typeof applyUrlState === 'function') applyUrlState({ fromHistory: true, historyState: e.state }).catch(() => {});
        }, opts);
        document.addEventListener('visibilitychange', () => { if (typeof handleSemanticLaneVisibilityChange === 'function') handleSemanticLaneVisibilityChange(); }, opts);
    }
}
