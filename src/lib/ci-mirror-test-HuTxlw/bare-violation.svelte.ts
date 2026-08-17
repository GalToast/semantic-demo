
import { appState } from './state.svelte.ts';

export function doBadThing() {
  appState.navState.mode = 'focus';
  appState.navState.surface = 'focus-search';
}
