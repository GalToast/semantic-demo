import { svelte } from '@sveltejs/vite-plugin-svelte';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_DIR = resolve(__dirname, 'src');

// https://vite.dev/config/
export default defineConfig({
  root: SRC_DIR,
  plugins: [
    svelte(),
  ],
  resolve: {
    alias: {
      '@': SRC_DIR,
      '@lib': resolve(SRC_DIR, 'lib'),
      '@components': resolve(SRC_DIR, 'components'),
      '@legacy': resolve(__dirname, 'js')
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    // Allow serving source files and node_modules (resolved from project root)
    fs: {
      allow: [
        SRC_DIR,
        resolve(__dirname, 'node_modules'),
        resolve(__dirname, 'data.dat'),
        resolve(__dirname, 'data.dat.gz'),
        resolve(__dirname, 'js'),
        resolve(__dirname, 'semantic_threads_ui.dat'),
        resolve(__dirname, 'semantic_threads.dat'),
        resolve(__dirname, 'semantic_space_layout_manifest.json')
      ]
    },
    // Proxy the PHP backend at 127.0.0.1:8795 during coexistence
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8795',
        changeOrigin: true
      }
    }
  },
  css: {
    devSourcemap: true
  },
  // TypeScript strict mode is enforced via tsconfig.json
  esbuild: {
    target: 'es2022'
  },
  build: {
    target: 'es2022',
    outDir: resolve(__dirname, 'dist/svelte'),
    emptyOutDir: true,
    // Vite auto-discovers index.html in the root directory (which is src/)
  }
});
