import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteOptions} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true
  }
};

export default config;
