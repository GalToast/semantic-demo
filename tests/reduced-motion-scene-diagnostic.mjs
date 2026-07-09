/**
 * reduced-motion-scene-diagnostic.mjs
 *
 * Standalone diagnostic for reduced-motion white-scene washout.
 *
 * What it checks:
 *   - reduced-motion media query is emulated
 *   - page loads (no loading-overlay stuck)
 *   - canvas + renderer are present
 *   - graphics mode is 'webgl'
 *   - scene luminance is NOT all-white / blank
 *
 * Exit:
 *   - Prints "reduced-motion-scene-diagnostic passed"  → all checks pass
 *   - process.exit(1) with descriptive JSON on failure
 *
 * Output dir: tmp/css-seam-wave-20260520/
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const root = resolve(process.cwd());
const outDir = resolve(root, 'tmp', 'css-seam-wave-20260520');
// vector-explorer-polished.html is the deployed production shell, published from
// dist/svelte/index.html. Load that built file for the diagnostic.
const HTML_PAGE = resolve(root, 'dist/svelte/index.html');

const DEFAULT_URL = `file://${HTML_PAGE}`;
const PORT = 8815;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

function parsePngRgba(buffer) {
    const sig = buffer.subarray(0, 8).toString('hex');
    if (sig !== '89504e470d0a1a0a') throw new Error('invalid PNG signature');
    let offset = 8;
    let width = 0, height = 0;
    const idat = [];
    while (offset < buffer.length) {
        const len = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
        const data = buffer.subarray(offset + 8, offset + 8 + len);
        offset += 12 + len;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    const inflated = inflateSync(Buffer.concat(idat));
    const bpp = 3; // we convert to rgba below
    const stride = width * bpp;
    const rawRows = Buffer.alloc(width * height * bpp);
    let srcOff = 0;
    for (let y = 0; y < height; y++) {
        const filter = inflated[srcOff++];
        const rowStart = y * stride;
        const prevRowStart = rowStart - stride;
        for (let x = 0; x < stride; x++) {
            const raw = inflated[srcOff + x];
            const left  = x >= bpp ? rawRows[rowStart + x - bpp] : 0;
            const up    = y > 0 ? rawRows[prevRowStart + x] : 0;
            const upLeft = y > 0 && x >= bpp ? rawRows[prevRowStart + x - bpp] : 0;
            let val = raw;
            if (filter === 1) val = raw + left;
            else if (filter === 2) val = raw + up;
            else if (filter === 3) val = Math.floor((left + up) / 2);
            else if (filter === 4) val = raw + paethPredictor(left, up, upLeft);
            else if (filter !== 0) throw new Error(`unsupported PNG filter: ${filter}`);
            rawRows[rowStart + x] = val & 255;
        }
        srcOff += stride;
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const si = i * 3;
        const ti = i * 4;
        rgba[ti]   = rawRows[si];
        rgba[ti+1] = rawRows[si+1];
        rgba[ti+2] = rawRows[si+2];
        rgba[ti+3] = 255;
    }
    return { width, height, rgba };
}

function sampleRegion(rgba, width, height, region) {
    const { left, top, right, bottom } = region;
    const x0 = Math.max(0, Math.floor(width  * left));
    const y0 = Math.max(0, Math.floor(height * top));
    const x1 = Math.min(width,  Math.ceil(width  * right));
    const y1 = Math.min(height, Math.ceil(height * bottom));
    const samples = [];
    for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
            const i = (y * width + x) * 4;
            const luma = Math.round((rgba[i]*299 + rgba[i+1]*587 + rgba[i+2]*114) / 1000);
            samples.push(luma);
        }
    }
    samples.sort((a, b) => a - b);
    const count = samples.length || 1;
    const pct = (p) => {
        const idx = Math.min(samples.length - 1, Math.max(0, Math.floor((samples.length - 1) * p)));
        return samples[idx] || 0;
    };
    let bright = 0, white = 0;
    for (const l of samples) {
        if (l >= 210) bright++;
        if (l >= 236) white++;
    }
    return {
        samples: count,
        median: pct(0.5),
        p90: pct(0.9),
        p95: pct(0.95),
        p99: pct(0.99),
        brightRatio: Number((bright / count).toFixed(4)),
        whiteRatio:  Number((white  / count).toFixed(4)),
    };
}

async function waitForReady(page) {
    // Wait for domcontent
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    // Wait for WebGL renderer + points loaded
    await page.waitForFunction(() => {
        const body = document.body?.dataset;
        const canvas = document.querySelector('#canvas-container canvas');
        const ready =
            body?.graphicsMode === 'webgl' &&
            canvas &&
            window.__TEST_STATE__?.renderer &&
            window.__TEST_STATE__?.scene &&
            window.__TEST_STATE__?.camera &&
            window.__TEST_STATE__?.pointsMesh?.geometry?.attributes?.position?.count;
        return !!ready;
    }, { timeout: 12000 }).catch(() => {});
    // Give scene reveal transition time to settle
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});
}

async function startServer(port) {
    const http = await import('node:http');
    const fs = await import('node:fs');
    const path = await import('node:path');

    const mimeTypes = {
        '.html': 'text/html',
        '.css':  'text/css',
        '.ts':   'application/javascript',
        '.png':  'image/png',
        '.svg':  'image/svg+xml',
    };

    const server = http.createServer((req, res) => {
        // Strip leading slash and resolve to root
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/' || !urlPath.includes('.')) {
            urlPath = '/index.html';
        }
        const filePath = path.join(root, urlPath);
        try {
            const data = fs.readFileSync(filePath);
            const ext = path.extname(filePath);
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(data);
        } catch {
            // Try index.html
            try {
                const data = fs.readFileSync(path.join(root, 'index.html'));
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            } catch {
                res.writeHead(404);
                res.end('Not found');
            }
        }
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

async function run() {
    let server;
    try {
        server = await startServer(PORT);
    } catch (err) {
        console.error(JSON.stringify({ fatal: 'server-start-failed', port: PORT, error: String(err) }));
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
    let passed = false;
    let diagnosticOutput = null;

    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

        // Emulate reduced motion
        await page.emulateMedia({ reducedMotion: 'reduce' });

        const targetUrl = `${SERVER_URL}/index.html?nodemo=1`;
        await page.goto(targetUrl, { waitUntil: 'commit', timeout: 15000 });
        await waitForReady(page);

        // Collect diagnostic data
        const domState = await page.evaluate(() => {
            const body = document.body?.dataset || {};
            const loadingOverlay = document.querySelector('.loading-overlay');
            const loadingOverlayStyle = loadingOverlay ? getComputedStyle(loadingOverlay) : null;
            const loadingOverlayActive = loadingOverlay
                ? !loadingOverlay.hidden &&
                  loadingOverlay.getAttribute('aria-hidden') !== 'true' &&
                  !loadingOverlay.classList.contains('hidden') &&
                  loadingOverlay.dataset.loadingState !== 'hidden' &&
                  loadingOverlayStyle.display !== 'none' &&
                  loadingOverlayStyle.visibility !== 'hidden' &&
                  Number(loadingOverlayStyle.opacity || 1) > 0.01
                : false;
            const canvasContainer = document.querySelector('#canvas-container');
            const canvas = canvasContainer?.querySelector('canvas');
            return {
                graphicsMode:        body.graphicsMode,
                sceneReveal:          body.sceneReveal,
                reducedMotionActive: body.reducedMotion,
                sceneReady:           body.sceneReady,
                loadingOverlayState:  body.loadingOverlay,
                loadingOverlayActive,
                loadingOverlayHidden: loadingOverlay
                    ? loadingOverlay.hidden ||
                      loadingOverlay.getAttribute('aria-hidden') === 'true' ||
                      loadingOverlay.classList.contains('hidden') ||
                      loadingOverlay.dataset.loadingState === 'hidden' ||
                      loadingOverlayStyle.display === 'none' ||
                      loadingOverlayStyle.visibility === 'hidden' ||
                      Number(loadingOverlayStyle.opacity || 1) <= 0.01
                    : true,
                canvasPresent:  !!canvas,
                canvasWidth:    canvas?.width  || 0,
                canvasHeight:   canvas?.height || 0,
                canvasParentWidth:  canvasContainer?.getBoundingClientRect().width  || 0,
                canvasParentHeight: canvasContainer?.getBoundingClientRect().height || 0,
                stateRendererPresent: !!(window.__TEST_STATE__?.renderer),
                stateScenePresent:    !!(window.__TEST_STATE__?.scene),
                stateCameraPresent:   !!(window.__TEST_STATE__?.camera),
                statePointsMeshPresent: !!(window.__TEST_STATE__?.pointsMesh),
                pointsCount: window.__TEST_STATE__?.pointsMesh?.geometry?.attributes?.position?.count || 0,
            };
        });

        const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
        const { width, height, rgba } = parsePngRgba(screenshotBuffer);

        // Desktop scene region (non-UI area)
        const sceneRegion = { left: 0.18, top: 0.12, right: 0.82, bottom: 0.78 };
        const sceneMetrics = sampleRegion(rgba, width, height, sceneRegion);

        diagnosticOutput = {
            url:            targetUrl,
            emulatedMotion: 'reduce',
            viewport:       { width: 1440, height: 900 },
            domState,
            sceneRegion,
            screenshotSize: { width, height },
            sceneLuminance: sceneMetrics,
        };

        // Diagnostic criteria for washout
        const isSceneBlank =
            sceneMetrics.whiteRatio > 0.55 &&
            sceneMetrics.median >= 230;

        const isLoadingStuck = domState.loadingOverlayActive;

        const noCanvas =
            !domState.canvasPresent || domState.canvasWidth === 0;

        const noRenderer =
            !domState.stateRendererPresent;

        const wrongMode =
            domState.graphicsMode !== 'webgl';

        if (isLoadingStuck) {
            console.error(JSON.stringify({
                diagnostic: 'reduced-motion-scene-diagnostic',
                status: 'FAIL',
                reason: 'loading-overlay-stuck-in-reduced-motion',
                ...diagnosticOutput,
            }, null, 2));
            await browser.close();
            server.close();
            process.exit(1);
        }

        if (noCanvas) {
            console.error(JSON.stringify({
                diagnostic: 'reduced-motion-scene-diagnostic',
                status: 'FAIL',
                reason: 'canvas-missing',
                ...diagnosticOutput,
            }, null, 2));
            await browser.close();
            server.close();
            process.exit(1);
        }

        if (noRenderer) {
            console.error(JSON.stringify({
                diagnostic: 'reduced-motion-scene-diagnostic',
                status: 'FAIL',
                reason: 'renderer-not-initialized',
                ...diagnosticOutput,
            }, null, 2));
            await browser.close();
            server.close();
            process.exit(1);
        }

        if (wrongMode) {
            console.error(JSON.stringify({
                diagnostic: 'reduced-motion-scene-diagnostic',
                status: 'FAIL',
                reason: `graphics-mode-is-${domState.graphicsMode}-expected-webgl`,
                ...diagnosticOutput,
            }, null, 2));
            await browser.close();
            server.close();
            process.exit(1);
        }

        if (isSceneBlank) {
            console.error(JSON.stringify({
                diagnostic: 'reduced-motion-scene-diagnostic',
                status: 'FAIL',
                reason: 'scene-region-is-white-blank-washout-detected',
                sceneLuminance: sceneMetrics,
                domState,
                interpretation: {
                    whiteRatio_threshold: 0.55,
                    median_threshold: 230,
                    whiteRatio_actual: sceneMetrics.whiteRatio,
                    median_actual: sceneMetrics.median,
                    likelyCause: sceneMetrics.whiteRatio > 0.8
                        ? 'loading-overlay-never-cleared'
                        : sceneMetrics.median > 240
                            ? 'canvas-background-only-rendering'
                            : 'scene-geometry-not-rendered-in-reduced-motion',
                },
                ...diagnosticOutput,
            }, null, 2));
            await browser.close();
            server.close();
            process.exit(1);
        }

        // All checks passed
        passed = true;
        console.log('reduced-motion-scene-diagnostic passed');
        console.log(JSON.stringify({
            diagnostic: 'reduced-motion-scene-diagnostic',
            status: 'PASS',
            sceneLuminance: sceneMetrics,
            domState,
        }, null, 2));

    } catch (err) {
        console.error(JSON.stringify({
            diagnostic: 'reduced-motion-scene-diagnostic',
            status: 'ERROR',
            fatal: String(err),
            outputSoFar: diagnosticOutput,
        }, null, 2));
        await browser.close();
        server.close();
        process.exit(1);
    }

    await browser.close();
    server.close();

    if (!passed) process.exit(1);
}

run();
