import './svelte-rune-shim.mjs';
import { appState } from '../../src/lib/state/app.svelte.ts';
import { withStateMutation } from '../../src/lib/state/with-state-mutation.ts';

export const state = appState;
export { appState, withStateMutation };
