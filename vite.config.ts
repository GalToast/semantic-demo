import { svelte } from '@sveltejs/vite-plugin-svelte'
import { visualizer } from 'rollup-plugin-visualizer'
import { createReadStream } from 'node:fs'
import { copyFile, cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { dirname, extname, join, normalize, resolve } from 'path'
import { promisify } from 'node:util'
import { brotliCompress, gzip, constants as zlibConstants } from 'node:zlib'
import { transform as lightningTransform } from 'lightningcss'
import { defineConfig, type Plugin } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROJECT_ROOT = __dirname
const SRC_DIR = resolve(PROJECT_ROOT, 'src')
const SVELTE_OUT_DIR = resolve(PROJECT_ROOT, 'dist/svelte')
const brotliCompressAsync = promisify(brotliCompress)
const gzipAsync = promisify(gzip)
const BROTLI_QUALITY = Number(process.env.VITE_BROTLI_QUALITY || 5)
const GZIP_LEVEL = Number(process.env.VITE_GZIP_LEVEL || 6)

// Stable per-build identifier used for cache-busting static data assets.
// Git hash is preferred so repeat builds with no code change share a cache key;
// fallback to a base36 timestamp when git is unavailable (e.g. shallow CI).
const BUILD_ID = (() => {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: __dirname, encoding: 'utf8' }).trim()
    } catch {
        return Date.now().toString(36)
    }
})()

// W44 Phase F: list of large runtime-data assets that benefit from precompression.
// Keep this allowlist explicit so we never accidentally compress chunk-manifest JSON.
const COMPRESSION_ALLOWLIST = new Set([
    'data.dat',
    'semantic_threads_ui.dat',
    'semantic_threads.dat',
    'semantic_space_layout_manifest.json',
    'leadEnrichment.public.json'
])

// W44 Quick Win: CSS files benefit hugely from brotli (~70% off) and gzip
// (~80% off). Total minified CSS payload is ~339KB; brotli cuts it to ~73KB.
// This applies to root-level CSS files (css/*.css, semantic-demo.css,
// vector-explorer-pandora.css) AND to hashed Svelte component CSS chunks in
// assets/*.css — all of them are text with high redundancy.
const COMPRESS_CSS = true

// Brotli/gzip frame headers are ~30-50 bytes; files smaller than this produce
// compressed output LARGER than the original. Skip them.
const COMPRESSION_MIN_BYTES = 100

const ROOT_ASSETS = new Map<string, string>([
    ['/semantic-demo.css', 'semantic-demo.css'],
    ['/vector-explorer-pandora.css', 'vector-explorer-pandora.css'],
    ['/case-study.html', 'case-study.html'],
    ['/data.dat', 'src/data.dat'],
    ['/data.dat.gz', 'src/data.dat.gz'],
    ['/semantic_threads_ui.dat', 'public/data/semantic_threads_ui.dat'],
    ['/semantic_threads.dat', 'public/data/semantic_threads.dat'],
    ['/semantic_space_layout_manifest.json', 'public/data/semantic_space_layout_manifest.json'],
    ['/scripts/leadEnrichment.public.json', 'public/data/leadEnrichment.public.json']
])

const ROOT_ASSET_DIRS = ['css']

type RootAssetMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>

type RootAssetMiddlewareStack = {
    use: (middleware: RootAssetMiddleware) => void
}

const LEGACY_CSS_LINKS = [
    '<link rel="stylesheet" href="semantic-demo.css">',
    '<link rel="stylesheet" href="css/base.css">',
    '<link rel="stylesheet" href="css/loading.css">',
    '<link rel="stylesheet" href="css/shell.css">',
    '<link rel="stylesheet" href="css/time_weather.css">',
    '<link rel="stylesheet" href="css/synthesis.css">',
    '<link rel="stylesheet" href="css/controls.css">',
    '<link rel="stylesheet" href="css/layout_base.css">',
    '<link rel="stylesheet" href="css/search.css">',
    '<link rel="stylesheet" href="css/mobile_base.css">',
    '<link rel="stylesheet" href="css/journey_steps.css">',
    '<link rel="stylesheet" href="css/journey_active.css">',
    '<link rel="stylesheet" href="css/clusters.css">',
    '<link rel="stylesheet" href="css/progressive_disclosure.css">',
    '<link rel="stylesheet" href="css/strands.css">',
    '<link rel="stylesheet" href="css/animations.css">',
    '<link rel="stylesheet" href="vector-explorer-pandora.css">',
    '<link rel="stylesheet" href="css/mobile_premium__components.css">',
    '<link rel="stylesheet" href="css/mobile_premium__layout.css">',
    '<link rel="stylesheet" href="css/mobile_premium__state.css">',
    '<link rel="stylesheet" href="css/modules/focus_stage.css">'
]


function legacyRootAssetPlugin(): Plugin {
    return {
        name: 'legacy-root-assets',
        configureServer(server) {
            serveRootAssets(server.middlewares)
        },
        configurePreviewServer(server) {
            serveRootAssets(server.middlewares)
        },
        transformIndexHtml(html) {
            // Inject legacy CSS <link> tags into the HTML. These files live at the
            // project root (outside Vite's src/ root), so they cannot be static
            // <link> tags in src/index.html — Vite would warn they don't exist.
            const legacyBlock = LEGACY_CSS_LINKS.join('\n  ')
            return html.replace(
                '<!--\n    Legacy CSS links (semantic-demo.css, vector-explorer-pandora.css,',
                `${legacyBlock}\n  <!--\n    Legacy CSS links (semantic-demo.css, vector-explorer-pandora.css,`
            )
        }
    }
}

function copyRuntimeAssetsPlugin(): Plugin {
    return {
        name: 'copy-runtime-assets',
        apply: 'build',
        async writeBundle(bundle) {
            await Promise.all([
                ...Array.from(ROOT_ASSETS.values()).map(async (relativePath) => {
                    const sourcePath = normalize(resolve(PROJECT_ROOT, relativePath))
                    const distRelativePath = relativePath.replace(/^public\//, '').replace(/^src\//, '')
                    const targetPath = normalize(resolve(SVELTE_OUT_DIR, distRelativePath))
                    try {
                        const fileStat = await stat(sourcePath)
                        if (!fileStat.isFile()) return
                    } catch {
                        return
                    }
                    await mkdir(dirname(targetPath), { recursive: true })
                    // W44 Quick Win: minify root-level CSS files as they're copied
                    // into the build output. Svelte component CSS (in dist/svelte/assets/)
                    // is already minified by Vite's CSS pipeline. These root-level files
                    // (semantic-demo.css, vector-explorer-pandora.css, css/*.css) bypass
                    // Vite because they live outside src/, so they need explicit
                    // minification. Saves ~310KB unminified → ~241KB minified (56% off).
                    if (extname(targetPath) === '.css') {
                        const raw = await readFile(sourcePath)
                        const result = lightningTransform({
                            filename: relativePath,
                            code: raw,
                            minify: true
                        })
                        await writeFile(targetPath, result.code)
                    } else {
                        await copyFile(sourcePath, targetPath)
                    }
                }),
                ...ROOT_ASSET_DIRS.map(async (relativePath) => {
                    const sourcePath = normalize(resolve(PROJECT_ROOT, relativePath))
                    const targetPath = normalize(resolve(SVELTE_OUT_DIR, relativePath))
                    try {
                        const fileStat = await stat(sourcePath)
                        if (!fileStat.isDirectory()) return
                    } catch {
                        return
                    }
                    // W44 Quick Win: minify CSS files inside directory copies (the
                    // `css/` directory holds mobile_premium__*.css, focus_stage.css,
                    // etc.). Walk the source tree and minify each .css file in place.
                    if (relativePath === 'css') {
                        await cp(sourcePath, targetPath, {
                            recursive: true,
                            force: true,
                            filter: async (src) => {
                                const s = await stat(src)
                                if (!s.isFile()) return true
                                if (extname(src) !== '.css') return true
                                const raw = await readFile(src)
                                const result = lightningTransform({
                                    filename: src,
                                    code: raw,
                                    minify: true
                                })
                                // Compute the destination path relative to the source root
                                const dest = normalize(
                                    join(targetPath, src.slice(sourcePath.length + 1).replace(/\\/g, '/'))
                                )
                                await mkdir(dirname(dest), { recursive: true })
                                await writeFile(dest, result.code)
                                return false // tell cp to skip this file (we wrote it ourselves)
                            }
                        })
                    } else {
                        await cp(sourcePath, targetPath, {
                            recursive: true,
                            force: true
                        })
                    }
                })
            ])

            // Mirror the emitted hashed web-worker entry to a stable filename so
            // the runtime fallback URL (`./assets/data-worker.js`) resolves
            // correctly before the dynamic worker URL promise settles.
            try {
                const assetsDir = resolve(SVELTE_OUT_DIR, 'assets')
                const entries = await readdir(assetsDir)
                const workerFiles = entries.filter((name) => /^data-worker-[A-Za-z0-9_-]+\.js$/.test(name))
                let actualWorker = ''
                for (const name of workerFiles) {
                    const code = await readFile(resolve(assetsDir, name), 'utf8')
                    const match = code.match(/new URL\("(data-worker-[A-Za-z0-9_-]+\.js)",import\.meta\.url\)/)
                    if (match?.[1]) {
                        actualWorker = match[1]
                        break
                    }
                }
                if (actualWorker) {
                    await copyFile(resolve(assetsDir, actualWorker), resolve(assetsDir, 'data-worker.js'))
                }
            } catch {
                // Non-fatal: the dynamic worker URL is the primary path.
            }
        }
    }
}

function serveRootAssets(middlewares: RootAssetMiddlewareStack): void {
    middlewares.use(async (req, res, next) => {
        const urlPath = req.url?.split('?')[0] ?? ''
        let relativePath = ROOT_ASSETS.get(urlPath) ?? null
        if (!relativePath && urlPath.startsWith('/css/')) {
            relativePath = urlPath.slice(1)
        }
        if (!relativePath && urlPath.startsWith('/data/')) {
            relativePath = `public${urlPath}`
        }
        if (!relativePath) {
            next()
            return
        }

        const filePath = normalize(resolve(PROJECT_ROOT, relativePath))
        const normalizedRoot = normalize(PROJECT_ROOT)
        const isInsideRoot = filePath === normalizedRoot || filePath.startsWith(`${normalizedRoot}${normalize('/')}`)

        if (!isInsideRoot) {
            next()
            return
        }

        try {
            const fileStat = await stat(filePath)
            if (!fileStat.isFile()) {
                next()
                return
            }
        } catch {
            next()
            return
        }

        if (!res.getHeader('Cache-Control')) {
            res.setHeader('Cache-Control', 'no-cache')
        }
        res.setHeader('Content-Type', contentType(filePath))

        // W44 Quick Win: apply runtime gzip/brotli compression for text assets
        // served from project root (CSS, JS). Without this, Vite's compression
        // middleware doesn't run because serveRootAssets bypasses the static
        // handler. Browser sends Accept-Encoding; we honor it.
        const acceptEncoding = (req.headers['accept-encoding'] || '').toLowerCase()
        const isCompressible = /\.(css|js|mjs|json|html?|svg)$/.test(filePath)
        if (isCompressible && acceptEncoding) {
            try {
                const raw = await readFile(filePath)
                let body: Buffer = raw
                let encoding: 'br' | 'gzip' | null = null
                if (acceptEncoding.includes('br')) {
                    body = await brotliCompressAsync(raw, {
                        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY }
                    })
                    encoding = 'br'
                } else if (acceptEncoding.includes('gzip')) {
                    body = await gzipAsync(raw, { level: GZIP_LEVEL })
                    encoding = 'gzip'
                }
                if (encoding) {
                    res.setHeader('Content-Encoding', encoding)
                    res.setHeader('Vary', 'Accept-Encoding')
                    res.end(body)
                    return
                }
            } catch {
                // Fall through to raw stream on compression error
            }
        }

        createReadStream(filePath).pipe(res)
    })
}

function contentType(filePath: string): string {
    switch (extname(filePath)) {
        case '.css':
            return 'text/css; charset=utf-8'
        case '.js':
        case '.mjs':
            return 'text/javascript; charset=utf-8'
        case '.json':
            return 'application/json; charset=utf-8'
        case '.dat':
        case '.dat.gz':
            return 'application/octet-stream'
        default:
            return 'application/octet-stream'
    }
}

/* W44 Phase F — brotli/gzip precompression of large runtime-data assets during build.
 * The `apply: 'build'` gate ensures dev work never pays the cost.
 */
function w44AssetCompressionPlugin(): Plugin {
    return {
        name: 'w44-asset-compression',
        apply: 'build',
        async closeBundle() {
            const entries = await readdir(SVELTE_OUT_DIR, { recursive: true, withFileTypes: true })
            // First pass: stat each candidate to filter by size threshold.
            // Files smaller than COMPRESSION_MIN_BYTES produce compressed output
            // LARGER than the original (frame headers exceed the content).
            const candidates: Array<{ filePath: string; parentPath: string }> = []
            await Promise.all(
                entries.map(async (entry) => {
                    if (!entry.isFile()) return
                    const isAllowlisted = COMPRESSION_ALLOWLIST.has(entry.name)
                    const isCss = COMPRESS_CSS && entry.name.endsWith('.css')
                    if (!isAllowlisted && !isCss) return
                    const filePath = join(entry.parentPath, entry.name)
                    const fileSize = (await stat(filePath)).size
                    if (fileSize < COMPRESSION_MIN_BYTES) return
                    candidates.push({ filePath, parentPath: entry.parentPath })
                })
            )
            const tasks: Promise<unknown>[] = candidates.map(({ filePath, parentPath }) =>
                readFile(filePath).then(async (buf) => {
                    // Quality 11 blocks local builds for minutes on large data assets.
                    // Defaults favor fast repeat builds; CI/release can override via env.
                    const br = await brotliCompressAsync(buf, {
                        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY }
                    })
                    const gz = await gzipAsync(buf, { level: GZIP_LEVEL })
                    await mkdir(parentPath, { recursive: true })
                    await Promise.all([writeFile(`${filePath}.br`, br), writeFile(`${filePath}.gz`, gz)])
                })
            )
            await Promise.all(tasks)
        }
    }
}

/* W44 Phase F — preview-server cache headers that win over Vite's internal
 * `Cache-Control: no-cache`. We install a middleware at the front of the connect
 * stack (index 0) so the response object's `setHeader`, `writeHead`, and
 * `removeHeader` are patched before Vite's serveStatic handler touches them.
 */
function w44PreviewCacheHeadersPlugin(): Plugin {
    return {
        name: 'w44-preview-cache-headers',
        async configurePreviewServer(server) {
            const middlewares = server.middlewares as unknown as {
                stack: Array<{ route?: string; handle: (req: any, res: any, next: (err?: unknown) => void) => void }>
            }
            // Insert a properly-shaped connect Layer at index 0 (Vite's dispatcher reads
            // `route`/`handle` directly; passing a bare function crashes its internal
            // stack walk).
            middlewares.stack.unshift({
                route: '',
                handle: (req, res, next) => {
                    const rawUrl = req.url
                    if (!rawUrl) return next()
                    const url = rawUrl.split('?')[0] ?? ''
                    // Vite names hashed assets as `<name>-<8charhash><.ext>`. The previous
                    // regex required a literal `.` before the hash and missed names like
                    // `index-BJLe-Toy.js`. Use `-` as separator to cover Vite's convention.
                    const hashed =
                        /[-][A-Za-z0-9_-]{8,}\.(js|css|svg|woff2?|png|jpg|jpeg|webp|dat|json|wasm)(\.gz|\.br)?$/.test(
                            url
                        )
                    const dataAsset = /\.(dat|json)(\.gz|\.br)?$/.test(url)

                    const writeHead = res.writeHead.bind(res)
                    const setHeader = res.setHeader.bind(res)
                    const removeHeader = res.removeHeader.bind(res)
                    let patched = false

                    const applyPolicy = () => {
                        setHeader('Vary', 'Accept-Encoding')
                        if (hashed) {
                            setHeader('Cache-Control', 'public, max-age=31536000, immutable')
                        } else if (dataAsset) {
                            setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
                        }
                        if (url.endsWith('.br')) setHeader('Content-Encoding', 'br')
                        else if (url.endsWith('.gz')) setHeader('Content-Encoding', 'gzip')
                    }

                    res.writeHead = function patchedWriteHead(status: number, a?: any, b?: any) {
                        if (!patched) {
                            patched = true
                            applyPolicy()
                        }
                        // Vite's static middleware may pass a headers object containing
                        // `Cache-Control: no-cache`; strip our policy keys before delegating
                        // so we win the final header merge.
                        let headersObj: any
                        if (typeof a === 'string' || a === undefined) {
                            headersObj = b
                        } else {
                            headersObj = a
                        }
                        if (headersObj && typeof headersObj === 'object') {
                            delete headersObj['Cache-Control']
                            delete headersObj['Vary']
                            // Only strip Content-Encoding for our precompressed assets
                            // (.br/.gz served from disk by legacyRootAssetPlugin). For
                            // runtime-compressed HTML/JS, preserve Vite's Content-Encoding
                            // so the browser knows the body is compressed.
                            if (url.endsWith('.br') || url.endsWith('.gz')) {
                                delete headersObj['Content-Encoding']
                            }
                        }
                        if (typeof a === 'string' || a === undefined) {
                            return writeHead(status as any, a as any, headersObj)
                        }
                        return writeHead(status, headersObj)
                    } as typeof res.writeHead

                    // Only intercept Vite's auto-compression headers for compressed
                    // precompressed asset URLs we serve ourselves (.br/.gz). For
                    // runtime-compressed HTML/JS, let Vite's compression middleware
                    // set Content-Encoding normally — without the header, the
                    // browser displays compressed bytes as raw text.
                    res.setHeader = function patchedSetHeader(name: string, value: any) {
                        if (name === 'Cache-Control' || name === 'Vary') return
                        if (name === 'Content-Encoding' && !url.endsWith('.br') && !url.endsWith('.gz')) {
                            // Let Vite's compression middleware set it for runtime-encoded responses.
                            return setHeader(name as any, value as any)
                        }
                        if (name === 'Content-Encoding') return
                        return setHeader(name as any, value as any)
                    } as typeof res.setHeader

                    res.removeHeader = function patchedRemoveHeader(name: string) {
                        if (name === 'Cache-Control' || name === 'Vary') return
                        if (name === 'Content-Encoding' && !url.endsWith('.br') && !url.endsWith('.gz')) {
                            return removeHeader(name as any)
                        }
                        if (name === 'Content-Encoding') return
                        return removeHeader(name as any)
                    } as typeof res.removeHeader

                    next()
                }
            })
        }
    }
}

function chunkGraphAnalyzerPlugin(): Plugin {
    return {
        name: 'chunk-graph-analyzer',
        apply: 'build',
        async generateBundle(_, bundle) {
            const graph: Record<string, any> = {}
            for (const [name, chunk] of Object.entries(bundle)) {
                if (chunk.type === 'chunk') {
                    graph[name] = {
                        isEntry: chunk.isEntry,
                        imports: chunk.imports,
                        dynamicImports: chunk.dynamicImports,
                        modules: Object.keys(chunk.modules)
                    }
                }
            }
            // Write outside project dir so parallel-session builds can't overwrite it.
            await writeFile('C:/Users/HP/chunk-graph-latest.json', JSON.stringify(graph, null, 2))
        }
    }
}

// https://vite.dev/config/
export default defineConfig({
    root: SRC_DIR,
    base: './',
    define: {
        // Expose a per-build identifier so data assets can be cache-busted by
        // deployment rather than by the wall clock (which defeats browser caches).
        'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID)
    },
    plugins: [
        chunkGraphAnalyzerPlugin(),
        legacyRootAssetPlugin(),
        copyRuntimeAssetsPlugin(),
        w44AssetCompressionPlugin(),
        w44PreviewCacheHeadersPlugin(),
        svelte(),
        // Bundle analyzer — generates dist/svelte/stats.html with a treemap of
        // every module in the production bundle. Open in any browser to read.
        // Tree-shaking still applies (it's a build-time plugin), so the stats
        // reflect exactly what ships. Gated to `npm run build:svelte` (not dev).
        visualizer({
            filename: 'dist/svelte/stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap'
        })
    ],
    resolve: {
        alias: {
            '@': SRC_DIR,
            '@lib': resolve(SRC_DIR, 'lib'),
            '@components': resolve(SRC_DIR, 'components')
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
                resolve(__dirname, 'src/data.dat'),
                resolve(__dirname, 'src/data.dat.gz'),
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
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ['console.debug', 'console.trace'],
                passes: 2
            },
            mangle: {
                safari10: true
            },
            format: {
                comments: false
            }
        },
        modulePreload: {
            resolveDependencies: (_filename, deps) => {
                return deps.filter((dep) => {
                    if (dep.includes('three-')) return false
                    // W44: Exclude non-critical chunks from eager preload to improve LCP
                    if (dep.includes('demo.svelte-')) return false
                    if (dep.includes('weather.svelte-')) return false
                    if (dep.includes('camera.svelte-')) return false
                    return true
                })
            }
        },
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // (a) Three.js engine → isolated chunk. It is loaded eagerly by the
                    // WebGL scene path, but we keep it as its own named chunk and exclude
                    // it from module preload (see modulePreload.resolveDependencies) so the
                    // bytes are not inlined into the entry and are fetched on a dedicated
                    // request rather than bloating the initial parse.
                    if (id.includes('node_modules/three/')) {
                        return 'three'
                    }
                    // (b) Heavy mode-transition transitive deps → isolated chunk. The
                    // mode-transitions dispatcher itself is tiny (~10KB src), but it
                    // statically pulls in the entire navigation/orchestration/journey/search
                    // cluster (the 212KB `mode-transitions.svelte-*.js` balloon). Route that
                    // transitive closure into its own chunk so the dispatcher stays lean and
                    // the heavy deps live in a clearly separated, cacheable artifact.
                    if (
                        id.includes('/src/lib/stores/navigation.svelte.ts') ||
                        id.includes('/src/lib/stores/navigation/') ||
                        id.includes('/src/lib/stores/search.svelte') ||
                        id.includes('/src/lib/stores/focus.svelte') ||
                        id.includes('/src/lib/stores/journey.svelte') ||
                        id.includes('/src/lib/orchestration/') ||
                        id.includes('/src/lib/journey/') ||
                        id.includes('/src/lib/search/') ||
                        id.includes('/src/lib/navigation-actions')
                    ) {
                        return 'mode-transition-deps'
                    }
                    // (c) Svelte runtime → isolated vendor chunk so it is not inlined into
                    // the entry chunk. This keeps the entry `index-*.js` file smaller while
                    // every Svelte component still shares one runtime chunk.
                    if (id.includes('node_modules/svelte/')) {
                        return 'svelte-vendor'
                    }
                }
            }
        }
        // Vite auto-discovers index.html in the root directory (which is src/)
    }
})
