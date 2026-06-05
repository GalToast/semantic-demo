import { mount } from 'svelte';
import App from './components/App.svelte';

let appInstance = null;

export function initAppSvelteIsland() {
    const target = document.getElementById('app-root');
    if (!target) {
        console.warn('Svelte App target #app-root not found; skipping App rendering.');
        return null;
    }
    if (appInstance) return appInstance;
    target.innerHTML = '';
    appInstance = mount(App, { target });
    return appInstance;
}
