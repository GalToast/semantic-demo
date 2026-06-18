import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import { createReadStream } from 'node:fs';
import { copyFile, cp, mkdir, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'url';
import { dirname, extname, normalize, resolve } from 'path';
import { defineConfig, type Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = __dirname;
const SRC_DIR = resolve(PROJECT_ROOT, 'src');
const SVELTE_OUT_DIR = resolve(PROJECT_ROOT, 'dist/svelte');

const ROOT_ASSETS = new Map<string, string>([
  ['/semantic-demo.css', 'semantic-demo.css'],
  ['/vector-explorer-pandora.css', 'vector-explorer-pandora.css'],
  ['/data.dat', 'data.dat'],
  ['/data.dat.gz', 'data.dat.gz'],
  ['/semantic_threads_ui.dat', 'semantic_threads_ui.dat'],
  ['/semantic_threads.dat', 'semantic_threads.dat'],
  ['/semantic_space_layout_manifest.json', 'semantic_space_layout_manifest.json'],
  ['/scripts/leadEnrichment.public.json', 'scripts/leadEnrichment.public.json'],
]);

const ROOT_ASSET_DIRS = ['css'];

type RootAssetMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => void | Promise<void>;

type RootAssetMiddlewareStack = {
  use: (middleware: RootAssetMiddleware) => void;
};

const LEGACY_CSS_LINKS = [
  '<link rel="stylesheet" href="semantic-demo.css">',
  '<link rel="stylesheet" href="vector-explorer-pandora.css">',
  '<link rel="stylesheet" href="css/mobile_premium__focus-dive.css">',
  '<link rel="stylesheet" href="css/mobile_premium__chrome.css">',
  '<link rel="stylesheet" href="css/mobile_premium__state.css">',
  '<link rel="stylesheet" href="css/mobile_premium__idle.css">',
  '<link rel="stylesheet" href="css/mobile_premium__map.css">',
  '<link rel="stylesheet" href="css/mobile_premium__surfaces.css">',
  '<link rel="stylesheet" href="css/mobile_premium__narrow.css">',
  '<link rel="stylesheet" href="css/modules/focus_stage.css">',
];

function legacyRootAssetPlugin(): Plugin {
  return {
    name: 'legacy-root-assets',
    configureServer(server) {
      serveRootAssets(server.middlewares);
    },
    configurePreviewServer(server) {
      serveRootAssets(server.middlewares);
    },
    transformIndexHtml(html) {
      // Inject legacy CSS <link> tags into the HTML. These files live at the
      // project root (outside Vite's src/ root), so they cannot be static
      // <link> tags in src/index.html — Vite would warn they don't exist.
      const legacyBlock = LEGACY_CSS_LINKS.join('\n  ');
      return html.replace(
        '<!--\n    Legacy CSS links (semantic-demo.css, vector-explorer-pandora.css,',
        `${legacyBlock}\n  <!--\n    Legacy CSS links (semantic-demo.css, vector-explorer-pandora.css,`,
      );
    },
  };
}

function copyRuntimeAssetsPlugin(): Plugin {
  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    async writeBundle() {
      await Promise.all([
        ...Array.from(ROOT_ASSETS.values()).map(async (relativePath) => {
          const sourcePath = normalize(resolve(PROJECT_ROOT, relativePath));
          const targetPath = normalize(resolve(SVELTE_OUT_DIR, relativePath));

          try {
            const fileStat = await stat(sourcePath);
            if (!fileStat.isFile()) {
              return;
            }
          } catch {
            return;
          }

          await mkdir(dirname(targetPath), { recursive: true });
          await copyFile(sourcePath, targetPath);
        }),
        ...ROOT_ASSET_DIRS.map(async (relativePath) => {
          const sourcePath = normalize(resolve(PROJECT_ROOT, relativePath));
          const targetPath = normalize(resolve(SVELTE_OUT_DIR, relativePath));

          try {
            const fileStat = await stat(sourcePath);
            if (!fileStat.isDirectory()) {
              return;
            }
          } catch {
            return;
          }

          await cp(sourcePath, targetPath, {
            recursive: true,
            force: true,
          });
        }),
      ]);
    },
  };
}

function serveRootAssets(middlewares: RootAssetMiddlewareStack): void {
  middlewares.use(async (req, res, next) => {
    const urlPath = req.url?.split('?')[0] ?? '';
    let relativePath = ROOT_ASSETS.get(urlPath) ?? null;

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
  base: './',
  plugins: [
    legacyRootAssetPlugin(),
    copyRuntimeAssetsPlugin(),
    svelte(),
    // Bundle analyzer — generates dist/svelte/stats.html with a treemap of
    // every module in the production bundle. Open in any browser to read.
    // Tree-shaking still applies (it's a build-time plugin), so the stats
    // reflect exactly what ships. Gated to `npm run build:svelte` (not dev).
    visualizer({
      filename: 'dist/svelte/stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ],
  resolve: {
    alias: {
      '@': SRC_DIR,
      '@lib': resolve(SRC_DIR, 'lib'),
      '@components': resolve(SRC_DIR, 'components'),
      // Three.js dedup (Win #2 from tmp/bundle-decomposition-2026-06-12.md)
      // is still pending deeper investigation. Initial attempts with
      // `resolve.alias['three/build/three.core.js']` and
      // `resolve.dedupe: ['three']` did not collapse the duplicate, even
      // with `optimizeDeps.exclude: ['three']`. The webgpu build in
      // node_modules/three/build/three.webgpu.js does
      // `import './three.core.js'`, which is the source of the dup, but
      // we don't use the webgpu build. Tracking this as follow-up work.
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
  build: {
    target: 'es2022',
    outDir: SVELTE_OUT_DIR,
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) {
            return 'three';
          }
        }
      }
    }
    // Vite auto-discovers index.html in the root directory (which is src/)
  }
});
