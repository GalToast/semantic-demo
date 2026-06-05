// js/state/selectors/url-state.js
// Read-only selectors for URL state, app state sync.
import { state } from '../../state.js';

export const getApplyingUrlState = () => state.applyingUrlState;
export const getRestoringBrowserHistory = () => state.restoringBrowserHistory;
export const getUrlStateRestoreToken = () => state.urlStateRestoreToken;
export const getEventListenersInitialized = () => state.eventListenersInitialized;
export const getDeferredUrlStateHandler = () => state._deferredUrlStateHandler;
export const getDeferredHydrationStarted = () => state.deferredHydrationStarted;
export const getLoadingOverlayStartedAt = () => state.loadingOverlayStartedAt;
export const getLoadingPhaseKey = () => state.loadingPhaseKey;
