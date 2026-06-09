import { svelte } from '@sveltejs/vite-plugin-svelte';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'url';
import { dirname, extname, normalize, resolve } from 'path';
import { defineConfig, type Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = __dirname;
const SRC_DIR = resolve(PROJECT_ROOT, 'src');

const ROOT_CSS_ASSETS = new Map<string, string>([
  ['/semantic-demo.css', 'semantic-demo.css'],
  ['/vector-explorer-pandora.css', 'vector-explorer-pandora.css'],
]);

type RootAssetMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => void | Promise<void>;

type RootAssetMiddlewareStack = {
  use: (middleware: RootAssetMiddleware) => void;
};

function legacyRootAssetPlugin(): Plugin {
  return {
    name: 'legacy-root-assets',
    configureServer(server) {
      serveRootAssets(server.middlewares);
    },
    configurePreviewServer(server) {
      serveRootAssets(server.middlewares);
    },
  };
}

function serveRootAssets(middlewares: RootAssetMiddlewareStack): void {
  middlewares.use(async (req, res, next) => {
    const urlPath = req.url?.split('?')[0] ?? '';
    let relativePath = ROOT_CSS_ASSETS.get(urlPath) ?? null;

    if (!relativePath && urlPath.startsWith('/css/')) {
      relativePath = urlPath.slice(1);
    }

    if (!relativePath) {
      next();
      return;
    }

    const filePath = normalize(resolve(PROJECT_ROOT, relativePath));
    const normalizedRoot = normalize(PROJECT_ROOT);
    const isInsideRoot = filePath === normalizedRoot || filePath.startsWith(`${normalizedRoot}${normalize('/')}`);

    if (!isInsideRoot) {
      next();
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        next();
        return;
      }
    } catch {
      next();
      return;
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', contentType(filePath));
    createReadStream(filePath).pipe(res);
  });
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.dat':
    case '.dat.gz':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

// https://vite.dev/config/
export default defineConfig({
  root: SRC_DIR,
  plugins: [
    legacyRootAssetPlugin(),
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
        resolve(__dirname, 'css'),
        resolve(__dirname, 'semantic-demo.css'),
        resolve(__dirname, 'vector-explorer-pandora.css'),
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
