/**
 * global-bindings.ts
 * Typechecked sibling for global-bindings.js
 * Global keyboard, focus, popstate, and visibility bindings.
 */

import { state as _state } from '../../state.ts';
const state = _state as any;
import { handleGalaxyKeydown } from '../keyboard-help.ts';
import { handleSemanticLaneWindowFocus, handleSemanticLaneVisibilityChange } from './semantic-lane-bindings.ts';
import { applyUrlState } from '../url-state.ts';

export let _globalEventController: AbortController = new AbortController();

export function disposeEventListeners(): void {
    _globalEventController.abort();
    _globalEventController = new AbortController();
    state.registeredEvents.clear();
    state.eventListenersInitialized = false;
}

export function bindGlobalEvents(): void {
    if (!state.registeredEvents.has('global-interaction')) {
        state.registeredEvents.add('global-interaction');
        const opts: AddEventListenerOptions = { signal: _globalEventController.signal };
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            const button = e.target instanceof HTMLButtonElement ? e.target : null;
            if (button && !button.disabled && (e.key === ' ' || e.code === 'Space')) {
                e.preventDefault();
                e.stopPropagation();
                button.click();
            }
        }, { capture: true, signal: _globalEventController.signal });
        window.addEventListener('keydown', (e: KeyboardEvent) => { handleGalaxyKeydown(e); }, opts);
        window.addEventListener('focus', () => { if (typeof handleSemanticLaneWindowFocus === 'function') handleSemanticLaneWindowFocus(); }, opts);
        window.addEventListener('popstate', (e: PopStateEvent) => {
            if (typeof applyUrlState === 'function') applyUrlState({ fromHistory: true, historyState: e.state }).catch(() => {});
        }, opts);
        document.addEventListener('visibilitychange', () => { if (typeof handleSemanticLaneVisibilityChange === 'function') handleSemanticLaneVisibilityChange(); }, opts);
    }
}
