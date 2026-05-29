import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const PORT = Number(process.env.SEMANTIC_SCENE_PLAYTEST_PORT || 8798);
const BASE_URL = `http://127.0.0.1:${PORT}/vector-explorer-polished.html`;
const outDir = path.resolve(
    process.cwd(),
    'tmp',
    'three-scene-playtest',
    new Date().toISOString().replace(/[:.]/g, '-')
);

function withParams(params = {}) {
    const url = new URL(BASE_URL);
    url.searchParams.set('nodemo', '1');
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
}

async function waitForServer(proc) {
    const deadline = Date.now() + 8000;
    let lastError = null;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error(`server exited early with code ${proc.exitCode}`);
        try {
            const response = await fetch(BASE_URL);
            if (response.ok) return;
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw lastError || new Error('server did not become ready');
}

async function waitForScene(page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => {
        const state = window.__TEST_STATE__;
        const canvas = document.querySelector('#canvas-container canvas');
        return Boolean(
            canvas
            && document.body.dataset.graphicsMode === 'webgl'
            && state?.renderer
            && state?.scene
            && state?.camera
            && state?.pointsMesh?.geometry?.attributes?.position?.count
        );
    }, { timeout: 10000 });
    await page.waitForTimeout(1200);
}

async function capture(page, name) {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
}

function parsePngRgba(buffer) {
    const signature = buffer.subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') throw new Error('invalid PNG signature');
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
    }
    const sourceBytesPerPixel = colorType === 6 ? 4 : 3;
    const inflated = inflateSync(Buffer.concat(idat));
    const rowBytes = width * sourceBytesPerPixel;
    const raw = Buffer.alloc(width * height * sourceBytesPerPixel);
    let input = 0;
    const paeth = (a, b, c) => {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        if (pa <= pb && pa <= pc) return a;
        return pb <= pc ? b : c;
    };
    for (let y = 0; y < height; y += 1) {
        const filter = inflated[input++];
        const row = y * rowBytes;
        const prev = row - rowBytes;
        for (let x = 0; x < rowBytes; x += 1) {
            const left = x >= sourceBytesPerPixel ? raw[row + x - sourceBytesPerPixel] : 0;
            const up = y > 0 ? raw[prev + x] : 0;
            const upLeft = y > 0 && x >= sourceBytesPerPixel ? raw[prev + x - sourceBytesPerPixel] : 0;
            const value = inflated[input + x];
            raw[row + x] = (filter === 0 ? value
                : filter === 1 ? value + left
                    : filter === 2 ? value + up
                        : filter === 3 ? value + Math.floor((left + up) / 2)
                            : value + paeth(left, up, upLeft)) & 255;
        }
        input += rowBytes;
    }
    return { width, height, raw, sourceBytesPerPixel };
}

async function sceneLuminance(file) {
    const buffer = await fs.readFile(file);
    const { width, height, raw, sourceBytesPerPixel } = parsePngRgba(buffer);
    const x0 = Math.floor(width * 0.08);
    const x1 = Math.ceil(width * 0.92);
    const y0 = Math.floor(height * 0.16);
    const y1 = Math.ceil(height * 0.62);
    const luminance = [];
    let white = 0;
    for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
            const index = (y * width + x) * sourceBytesPerPixel;
            const luma = Math.round((raw[index] * 299 + raw[index + 1] * 587 + raw[index + 2] * 114) / 1000);
            luminance.push(luma);
            if (luma >= 236) white += 1;
        }
    }
    luminance.sort((a, b) => a - b);
    const at = (p) => luminance[Math.min(luminance.length - 1, Math.max(0, Math.floor((luminance.length - 1) * p)))] || 0;
    return {
        median: at(0.5),
        p95: at(0.95),
        whiteRatio: Number((white / Math.max(1, luminance.length)).toFixed(4))
    };
}

async function inspectScene(page) {
    return page.evaluate(() => {
        const state = window.__TEST_STATE__;
        const canvas = document.querySelector('#canvas-container canvas');
        const rectFor = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                display: style.display,
                visibility: style.visibility,
                pointerEvents: style.pointerEvents,
                zIndex: style.zIndex
            };
        };
        const intersects = (a, b) => Boolean(a && b
            && a.left < b.right
            && a.right > b.left
            && a.top < b.bottom
            && a.bottom > b.top);
        const isVisibleBox = (box) => Boolean(box && box.display !== 'none' && box.visibility !== 'hidden' && box.width > 0 && box.height > 0);
        const continuitySample = (line) => {
            const values = Array.from(line?.geometry?.attributes?.position?.array || []);
            if (values.length < 30) return { checked: 0, matched: 0 };
            let checked = 0;
            let matched = 0;
            for (let edgeStart = 0; edgeStart + 29 < values.length && checked < 18; edgeStart += 30) {
                for (let vertex = 1; vertex < 9; vertex += 2) {
                    const a = edgeStart + vertex * 3;
                    const b = edgeStart + (vertex + 1) * 3;
                    checked += 1;
                    const equal = Math.abs(values[a] - values[b]) < 0.0001
                        && Math.abs(values[a + 1] - values[b + 1]) < 0.0001
                        && Math.abs(values[a + 2] - values[b + 2]) < 0.0001;
                    if (equal) matched += 1;
                }
            }
            return { checked, matched };
        };
        const alphaValues = Array.from(state?.semanticLensSpokes?.geometry?.attributes?.alpha?.array || []);
        const positionValues = Array.from(state?.semanticLensSpokes?.geometry?.attributes?.position?.array || []);
        return {
            graphicsMode: document.body.dataset.graphicsMode || '',
            activeView: document.body.dataset.activeView || '',
            panelSurface: document.body.dataset.panelSurface || '',
            graphContext: document.body.dataset.graphContext || '',
            focusedNode: state?.focusedNode ?? null,
            trailDepth: state?.trailDepth ?? null,
            canvas: canvas ? {
                width: canvas.getBoundingClientRect().width,
                height: canvas.getBoundingClientRect().height
            } : null,
            pointCount: state?.pointsMesh?.geometry?.attributes?.position?.count || 0,
            pointsMeshVisible: state?.pointsMesh?.visible ?? null,
            coreOpacity: state?.myceliumCoreLines?.material?.opacity ?? null,
            wispyOpacity: state?.myceliumWispyLines?.material?.opacity ?? null,
            bridgeOpacity: state?.myceliumBridgeLines?.material?.opacity ?? null,
            coreContinuity: continuitySample(state?.myceliumCoreLines),
            semanticLensVisible: Boolean(state?.semanticLensGroup?.visible),
            semanticLensGlowOpacity: state?.semanticLensGlow?.material?.uniforms?.uOpacity?.value ?? 0,
            semanticLensSpokeAlphaNonZero: alphaValues.filter((value) => value > 0).length,
            semanticLensSpokePositionNonZero: positionValues.filter((value) => Math.abs(value) > 0.0001).length,
            consoleGraphicMode: state?.scenePerformanceDiagnostics?.active ?? null,
            debug: {
                rendererClearAlpha: state?.renderer?.getClearAlpha?.() ?? null,
                rendererClearColor: (() => {
                    if (!state?.renderer?.getClearColor || !window.THREE) return null;
                    const color = new window.THREE.Color();
                    state.renderer.getClearColor(color);
                    return `#${color.getHexString()}`;
                })(),
                fogDensity: state?.scene?.fog?.density ?? null,
                hemiLight: state?.hemiLight?.intensity ?? null,
                dirLight: state?.dirLight?.intensity ?? null,
                semanticManifoldOpacity: state?.semanticManifold?.material?.uniforms ? null : state?.semanticManifold?.material?.opacity ?? null,
                focusHaloOpacity: state?.focusHalo?.material?.opacity ?? null,
                focusHaloScale: state?.focusHalo?.scale?.x ?? null,
                focusCoreOpacity: state?.focusCore?.material?.opacity ?? null,
                focusCoreScale: state?.focusCore?.scale?.x ?? null,
                focusLensOpacity: state?.focusLens?.material?.uniforms?.opacity?.value ?? null,
                focusLensScale: state?.focusLens?.scale?.x ?? null,
                focusFilamentOpacity: state?.focusFilaments?.material?.opacity ?? null,
                pointsMaterialOpacity: state?.pointsMaterial?.opacity ?? null,
                pointsMaterialSize: state?.pointsMaterial?.size ?? null,
                nodeSporeOpacity: state?.nodeSporeMaterial?.opacity ?? null,
                canvasFilter: canvas ? getComputedStyle(canvas).filter : null,
                containerFilter: getComputedStyle(document.querySelector('#canvas-container')).filter,
                bodyBackground: getComputedStyle(document.body).backgroundColor,
                htmlBackground: getComputedStyle(document.documentElement).backgroundColor
            },
            layout: {
                infoPanel: rectFor('#info-panel'),
                infoHeader: rectFor('#info-panel .info-header'),
                journeyCompass: rectFor('#journey-compass'),
                searchContainer: rectFor('.search-container'),
                controls: rectFor('.controls'),
                mapContainer: rectFor('#map-container'),
                mapAttribution: rectFor('#map-container .leaflet-control-attribution'),
                launchButton: rectFor('#btn-launch'),
                synthesizeTrigger: rectFor('#synthesize-trigger'),
                mapControlsPanelOverlap: intersects(rectFor('#info-panel'), rectFor('.controls')),
                mapControlsHeaderOverlap: intersects(rectFor('#info-panel .info-header'), rectFor('.controls')),
                mapControlsCompassOverlap: intersects(rectFor('#journey-compass'), rectFor('.controls')),
                mapSearchControlsOverlap: intersects(rectFor('.search-container'), rectFor('.controls'))
            },
            elementsAtSceneCenter: document.elementsFromPoint(window.innerWidth / 2, window.innerHeight * 0.46)
                .slice(0, 8)
                .map((element) => ({
                    tag: element.tagName,
                    id: element.id,
                    className: typeof element.className === 'string' ? element.className : '',
                    opacity: getComputedStyle(element).opacity,
                    background: getComputedStyle(element).backgroundColor,
                    zIndex: getComputedStyle(element).zIndex
                }))
        };
    });
}

function assert(condition, message, failures) {
    if (!condition) failures.push(message);
}

function isVisibleLayoutBox(box) {
    return Boolean(box && box.display !== 'none' && box.visibility !== 'hidden' && box.width > 0 && box.height > 0);
}

// Console warning classification policy for scene-health QA:
// - 'webgl-lifecycle': expected headless-GPU artifacts — context loss triggered by
//   Playwright screenshot readback on the headless software renderer (no real GPU).
//   These do NOT fail the test; they are logged in webglLifecycleWarnings for visibility.
//   Pattern: CONTEXT_LOST_WEBGL, delete: object does not belong to this context,
//   deleteVertexArray: object does not belong to this context.
// - 'screenshot-readback': expected GPU stall on Playwright screenshot path (ReadPixels).
// - 'expected-demo-gate': demo mode blocking messages ([demo] blocked).
// - 'expected-static-dev-fallback': dev-server fallback signals (raw PHP response,
//   semantic lane probe timeout). These do NOT fail the test.
// - 'error', 'unexpected-warning': cause test failures — never allowlisted.
//
// To add a new allowed category: update classifyConsoleMessage() AND update this comment.
// To suppress a pattern silently (not recommended for WebGL): use 'webgl-lifecycle' branch.
function classifyConsoleMessage(message) {
    const text = message.text || '';
    if (message.type === 'error') return 'error';
    if (/CONTEXT_LOST_WEBGL|object does not belong to this context|deleteVertexArray/.test(text)) {
        return 'webgl-lifecycle';
    }
    if (/GPU stall due to ReadPixels/.test(text)) return 'screenshot-readback';
    if (/\[demo\] blocked/.test(text)) return 'expected-demo-gate';
    if (/Detected raw PHP response\. Assuming static dev server/.test(text)) return 'expected-static-dev-fallback';
    if (/Semantic lane probe timed out after 5s/.test(text)) return 'expected-static-dev-fallback';
    return 'unexpected-warning';
}

function summarizeConsoleMessages(consoleMessages) {
    const categories = {};
    const unexpected = [];
    consoleMessages.forEach((message) => {
        const category = classifyConsoleMessage(message);
        categories[category] = (categories[category] || 0) + 1;
        if (category === 'error' || category === 'unexpected-warning') unexpected.push({ ...message, category });
    });
    return {
        categories,
        webglLifecycleWarnings: consoleMessages
            .filter((message) => classifyConsoleMessage(message) === 'webgl-lifecycle')
            .map((message) => message.text),
        unexpected
    };
}

async function main() {
    await fs.mkdir(outDir, { recursive: true });
    const server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
        cwd: process.cwd(),
        stdio: 'ignore'
    });
    const consoleMessages = [];
    const failures = [];
    let browser;
    try {
        await waitForServer(server);
        browser = await chromium.launch({ headless: true });
        const runFreshPage = async (name, params, setup = null) => {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
            const page = await context.newPage();
            page.on('console', (msg) => {
                if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ state: name, type: msg.type(), text: msg.text() });
            });
            await page.goto(withParams(params), { waitUntil: 'commit' });
            await waitForScene(page);
            await page.waitForFunction(() => Boolean(window.__TEST_STATE__?.myceliumCoreLines?.geometry?.attributes?.position?.array?.length), { timeout: 5000 }).catch(() => {});
            if (setup) await setup(page);
            if (process.env.SEMANTIC_SCENE_DIAG_HIDE) {
                await page.evaluate((hideList) => {
                    const names = new Set(String(hideList).split(',').map((item) => item.trim()).filter(Boolean));
                    if (names.has('spores') && window.__TEST_STATE__?.nodeSporeMesh) (window.__APP_STATE__ ?? window.__TEST_STATE__).nodeSporeMesh.visible = false;
                    if (names.has('points') && window.__TEST_STATE__?.pointsMesh) (window.__APP_STATE__ ?? window.__TEST_STATE__).pointsMesh.visible = false;
                    if (names.has('manifold') && window.__TEST_STATE__?.semanticManifold) (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticManifold.visible = false;
                    if (names.has('focus')) {
                        ['focusHalo', 'focusCore', 'focusLens', 'focusFilaments', 'semanticLensGroup'].forEach((key) => {
                            if (window.__TEST_STATE__?.[key]) window.__TEST_STATE__[key].visible = false;
                        });
                    }
                }, process.env.SEMANTIC_SCENE_DIAG_HIDE);
                await page.waitForTimeout(300);
            }
            const screenshot = await capture(page, name);
            const inspection = await inspectScene(page);
            const luminance = await sceneLuminance(screenshot);
            await context.close();
            return { inspection, luminance };
        };

        const idleResult = await runFreshPage('01-mobile-idle-galaxy', { view: 'galaxy' });
        const focusSetup = async (page) => {
            await page.evaluate(() => {
                const preferred = window.__TEST_STATE__?.pointIndexByLeadId?.get('519');
                let targetIndex = Number.isFinite(preferred) ? preferred : null;
                if (targetIndex === null) {
                    for (const [leadId, threadNode] of window.__TEST_STATE__?.semanticNeighborMapByLeadId || []) {
                        if (!threadNode?.neighbors?.length) continue;
                        const candidateIndex = window.__TEST_STATE__?.pointIndexByLeadId?.get(String(leadId));
                        if (Number.isFinite(candidateIndex)) {
                            targetIndex = candidateIndex;
                            break;
                        }
                    }
                }
                if (targetIndex === null) targetIndex = 0;
                window.__APP_ACTIONS__?.focusOnNode?.(targetIndex, { fromSearchResult: true, skipUrlSync: true });
                window.__APP_ACTIONS__?.setTrailDepth?.(1, { skipUrlSync: true });
            });
            await page.waitForTimeout(1600);
        };
        const focusedResult = await runFreshPage('02-mobile-focused-node', { view: 'galaxy', q: 'coffee', anchor: '519' }, focusSetup);
        const insideResult = await runFreshPage('03-mobile-step-inside', { view: 'galaxy', q: 'coffee', anchor: '519' }, async (page) => {
            await focusSetup(page);
            await page.evaluate(() => window.__APP_ACTIONS__?.setTrailDepth?.(2, { fromUserGesture: true }));
            await page.waitForTimeout(1200);
        });
        const mapResult = await runFreshPage('04-mobile-map', { view: 'map', q: 'coffee', anchor: '519' });

        const mapSearchResult = await runFreshPage('05-mobile-map-search-active', { view: 'map', q: 'coffee', anchor: '519' }, async (page) => {
            await page.waitForTimeout(1200);
        });

        const idle = idleResult.inspection;
        const focused = focusedResult.inspection;
        const inside = insideResult.inspection;
        const map = mapResult.inspection;
        const mapSearch = mapSearchResult.inspection;

        assert(idle.graphicsMode === 'webgl', 'idle scene should use webgl graphics mode', failures);
        assert(idle.canvas?.width > 300 && idle.canvas?.height > 500, 'idle canvas should fill the mobile scene area', failures);
        assert(idle.pointCount > 100, 'idle scene should render a meaningful node set', failures);
        assert(idle.coreOpacity >= 0.04, `overview core thread opacity too low: ${idle.coreOpacity}`, failures);
        // Keep this ceiling paired with the overview mycelium presentation profile in js/modules/three-engine.js.
        assert(idleResult.luminance.p95 <= 220, `idle scene p95 luminance is over-threaded: ${idleResult.luminance.p95}`, failures);
        assert(idleResult.luminance.whiteRatio <= 0.08, `idle scene white pixel ratio is too high: ${idleResult.luminance.whiteRatio}`, failures);
        assert(idle.coreContinuity.checked > 0 && idle.coreContinuity.matched === idle.coreContinuity.checked, 'mycelium core thread segments should be continuous paired vertices', failures);
        assert(focused.focusedNode !== null && focused.focusedNode >= 0, 'focused playtest should establish a focused node', failures);
        assert(focused.pointsMeshVisible === false, 'focused playtest should suppress the global point cloud so the pocket owns the scene', failures);
        assert(focused.semanticLensVisible, 'semantic lens should become visible on focused node', failures);
        assert(focused.semanticLensGlowOpacity > 0.01, `semantic lens glow opacity too low: ${focused.semanticLensGlowOpacity}`, failures);
        assert(focused.semanticLensSpokeAlphaNonZero === 0, 'focused mode should keep semantic lens spokes hidden so pocket threads own relationship cues', failures);
        assert(focusedResult.luminance.p95 <= 205, `focused scene p95 luminance is washed out: ${focusedResult.luminance.p95}`, failures);
        assert(focusedResult.luminance.whiteRatio <= 0.018, `focused scene white pixel ratio is too high: ${focusedResult.luminance.whiteRatio}`, failures);
        assert(inside.trailDepth === 2, 'step-inside playtest should enter trail depth 2', failures);
        assert(inside.semanticLensSpokeAlphaNonZero >= 2, 'inside mode should publish visible spoke alpha values', failures);
        assert(inside.semanticLensSpokePositionNonZero >= 3, 'inside mode should publish non-zero spoke geometry', failures);
        assert(insideResult.luminance.p95 <= 205, `inside scene p95 luminance is washed out: ${insideResult.luminance.p95}`, failures);
        assert(insideResult.luminance.whiteRatio <= 0.018, `inside scene white pixel ratio is too high: ${insideResult.luminance.whiteRatio}`, failures);
        assert(map.activeView === 'map' || map.graphContext === 'map', 'map playtest should enter map context', failures);
        assert(map.layout?.mapSearchControlsOverlap === false, 'map controls should not overlap the mobile map search surface', failures);
        assert(map.layout?.mapControlsPanelOverlap === false, 'map controls should not overlap the map info panel chrome', failures);
        assert(map.layout?.mapControlsHeaderOverlap === false, 'map controls should not overlap the map info panel header', failures);
        assert(map.layout?.mapControlsCompassOverlap === false, 'map controls should not overlap the upper map compass/actions', failures);
        assert(map.layout?.searchContainer?.right >= 360, `map search surface should use the mobile width instead of reserving a rail gutter: right=${map.layout?.searchContainer?.right}`, failures);
        assert(map.layout?.controls?.top >= 164 && map.layout?.controls?.top <= 206, `map controls should sit in the open map band above the panel: top=${map.layout?.controls?.top}`, failures);
        assert(map.layout?.controls?.height <= 58, `map controls should be a compact horizontal dock, not a vertical rail: height=${map.layout?.controls?.height}`, failures);
        assert(map.layout?.controls?.width <= 260, `map controls dock should stay compact: width=${map.layout?.controls?.width}`, failures);
        assert(!map.layout?.controls || !map.layout?.journeyCompass || !isVisibleLayoutBox(map.layout.journeyCompass) || map.layout.controls.top >= map.layout.journeyCompass.bottom + 8, `map controls should clear the upper map compass/actions: controls.top=${map.layout?.controls?.top} vs journeyCompass.bottom=${map.layout?.journeyCompass?.bottom}`, failures);
        assert(!map.layout?.controls || !map.layout?.infoPanel || map.layout.controls.bottom <= map.layout.infoPanel.top - 8, `map controls should clear the lower panel chrome: controls.bottom=${map.layout?.controls?.bottom} vs infoPanel.top=${map.layout?.infoPanel?.top}`, failures);
        assert(!map.layout?.controls || !map.layout?.searchContainer || map.layout.controls.bottom <= map.layout.searchContainer.top - 8, 'map controls should not cover lower panel content', failures);
        assert(!map.layout?.launchButton || map.layout.launchButton.display === 'none', 'map-search should suppress the bulky Surprise Me CTA', failures);
        assert(!map.layout?.synthesizeTrigger || map.layout.synthesizeTrigger.display === 'none' || !isVisibleLayoutBox(map.layout.synthesizeTrigger), 'map-search should suppress the bulky summarize CTA', failures);

        // --- map-search surface assertions ---
        // map-search is the variant where search has an active query and results are open
        // on the map surface. We validate the controls/results/accordion stacking order.
        assert(mapSearch.layout?.searchContainer?.right >= 360, `map-search surface should use full mobile width: right=${mapSearch.layout?.searchContainer?.right}`, failures);
        assert(mapSearch.layout?.mapSearchControlsOverlap === false, 'map-search controls must not overlap search/results surface', failures);
        assert(mapSearch.layout?.mapControlsPanelOverlap === false, 'map-search controls must not overlap map info panel chrome', failures);
        assert(mapSearch.layout?.mapControlsHeaderOverlap === false, 'map-search controls must not overlap map info panel header', failures);
        assert(mapSearch.layout?.mapControlsCompassOverlap === false, 'map-search controls must not overlap upper map compass/actions', failures);
        assert(!mapSearch.layout?.journeyCompass || !isVisibleLayoutBox(mapSearch.layout.journeyCompass) || mapSearch.layout?.controls?.top >= mapSearch.layout.journeyCompass.bottom + 8, `map-search controls should clear upper map compass/actions: controls.top=${mapSearch.layout?.controls?.top} vs journeyCompass.bottom=${mapSearch.layout?.journeyCompass?.bottom}`, failures);
        assert(mapSearch.layout?.controls?.bottom <= (mapSearch.layout?.infoPanel?.top ?? Infinity) - 8, `map-search controls should clear lower panel chrome: controls.bottom=${mapSearch.layout?.controls?.bottom} vs infoPanel.top=${mapSearch.layout?.infoPanel?.top}`, failures);
        assert(mapSearch.layout?.controls?.bottom <= (mapSearch.layout?.searchContainer?.top ?? Infinity) - 8, `map-search controls should be above the search surface: controls.bottom=${mapSearch.layout?.controls?.bottom} vs searchContainer.top=${mapSearch.layout?.searchContainer?.top}`, failures);
        assert(mapSearch.layout?.controls?.height <= 58, `map-search controls should be a compact horizontal dock: height=${mapSearch.layout?.controls?.height}`, failures);
        assert(mapSearch.layout?.controls?.width <= 260, `map-search controls dock should stay compact: width=${mapSearch.layout?.controls?.width}`, failures);
        // search results should not clip below the lower accordion band
        assert(!mapSearch.layout?.searchContainer || mapSearch.layout.searchContainer.display !== 'none', 'map-search search container must be visible', failures);
        assert(mapSearch.layout?.searchContainer?.top >= 40, `map-search search container should sit below controls: top=${mapSearch.layout?.searchContainer?.top}`, failures);

        const consoleSummary = summarizeConsoleMessages(consoleMessages);
        assert(consoleSummary.unexpected.length === 0, `unexpected console messages: ${JSON.stringify(consoleSummary.unexpected.slice(0, 5))}`, failures);

        const summary = {
            outDir,
            screenshots: [
                '01-mobile-idle-galaxy.png',
                '02-mobile-focused-node.png',
                '03-mobile-step-inside.png',
                '04-mobile-map.png',
                '05-mobile-map-search-active.png'
            ],
            inspections: { idle, focused, inside, map, mapSearch },
            luminance: {
                idle: idleResult.luminance,
                focused: focusedResult.luminance,
                inside: insideResult.luminance,
                map: mapResult.luminance,
                mapSearch: mapSearchResult.luminance
            },
            consoleMessages,
            consoleSummary,
            failures
        };
        await fs.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
        console.log(JSON.stringify(summary, null, 2));
        if (failures.length) process.exitCode = 1;
    } finally {
        if (browser) await browser.close().catch(() => {});
        server.kill();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
