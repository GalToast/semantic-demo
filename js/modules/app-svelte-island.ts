/**
 * app-svelte-island.ts
 *
 * Typed sibling of app-svelte-island.js.
 * Mounts the root Svelte application component into the #app-root element.
 */

import { mount } from 'svelte';
import App from './components/App.svelte';
import { debugWarn } from './diagnostic-adapter.ts';

let appInstance: ReturnType<typeof mount> | null = null;

export function initAppSvelteIsland(): ReturnType<typeof mount> | null {
    const target = document.getElementById('app-root');
    if (!target) {
        debugWarn('Svelte App target #app-root not found; skipping App rendering.');
        return null;
    }
    if (appInstance) return appInstance;
    target.innerHTML = '';
    appInstance = mount(App, { target });
    return appInstance;
}
