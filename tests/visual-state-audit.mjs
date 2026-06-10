import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { VISUAL_STATE_ID_SET } from './visual-state-registry.mjs';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
const LOCAL_FONT_FIXTURE_CSS = `
@font-face {
  font-family: 'Bricolage Grotesque';
  src: local('Arial');
  font-weight: 400 800;
  font-display: swap;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: local('Consolas');
  font-weight: 400 800;
  font-display: swap;
}
`;
const FONT_ASSET_RE = /\.(?:woff2?|ttf)(?:$|\?)/i;
const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const headed = !cliArgs.includes('--headless') &&
  process.env.PW_HEADLESS !== '1' &&
  process.env.PLAYWRIGHT_HEADLESS !== '1';
const requireWebgl = headed && process.env.ALLOW_WEBGL_FALLBACK !== '1';
const launchOptions = {
  headless: !headed,
  args: headed
    ? [
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--enable-webgl',
        ...(process.platform === 'win32' && process.env.SEMANTIC_USE_D3D11 === '1' ? ['--use-angle=d3d11'] : []),
      ]
    : [],
};
function stableUrl(url) {
  const next = new URL(url);
  next.searchParams.set('nodemo', '1');
  return next.toString();
}

const targetUrl = stableUrl(cliArgs.find((arg) => !arg.startsWith('--')) || DEFAULT_URL);
const statesArg = cliArgs.find((arg) => arg.startsWith('--states='))?.slice('--states='.length)
  || process.env.SEMANTIC_VISUAL_AUDIT_STATES
  || '';
const requestedStates = new Set(statesArg.split(',').map((state) => state.trim()).filter(Boolean));
const unknownRequestedStates = [...requestedStates].filter((state) => !VISUAL_STATE_ID_SET.has(state));
if (unknownRequestedStates.length) {
  console.error(`Unknown visual state id(s): ${unknownRequestedStates.join(', ')}`);
  console.error('Update tests/visual-state-registry.mjs before adding or renaming visual audit states.');
  process.exit(1);
}
const outRoot = process.env.SEMANTIC_VISUAL_AUDIT_OUT || path.resolve(process.cwd(), 'tmp', 'semantic-ui-visual-audit');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, runId);

const mobile = { width: 390, height: 844 };
const mobile320 = { width: 320, height: 740 };
const desktop = { width: 1440, height: 900 };
const shortLandscape = { width: 896, height: 414 };
const GRAPH_SIGNAL_STATE_IDS = new Set([
  '01-mobile-idle',
  '02-mobile-search-coffee',
  '03-mobile-focus-first-result',
  '07-desktop-idle',
  '08-desktop-search-coffee',
  '15-mobile-semantic-dive',
  '21-mobile-route-trace-visible',
  '22-mobile-semantic-dive-320',
  '23-mobile-short-landscape',
]);
const AMBIENT_THREAD_SIGNAL_STATE_IDS = new Set([
  '01-mobile-idle',
  '02-mobile-search-coffee',
  '07-desktop-idle',
  '08-desktop-search-coffee',
]);

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.ts' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.dat') return 'application/octet-stream';
  return 'application/octet-stream';
}

async function startStaticServer(port) {
  const root = process.cwd();
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      const rawPath = requestUrl.pathname === '/' ? '/vector-explorer-polished.html' : requestUrl.pathname;
      const decodedPath = decodeURIComponent(rawPath);
      const relativePath = decodedPath.replace(/^\/+/, '');
      const filePath = path.resolve(root, relativePath);
      const staysInsideRoot = filePath === root || filePath.startsWith(`${root}${path.sep}`);
      if (!staysInsideRoot) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      res.writeHead(200, { 'content-type': contentTypeFor(filePath) });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error?.message || String(error));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      console.log(`[server] visual audit static server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

function isLocalTarget(url) {
  const parsed = new URL(url);
  return ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
}

async function preflightTargetServer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return { ok: true, existing: true };
  } catch (error) {
    if (!isLocalTarget(url)) throw error;
    const causeCode = error?.cause?.code || error?.code;
    const message = error?.message || String(error);
    if (
      causeCode === 'ECONNREFUSED' ||
      message.includes('ECONNREFUSED') ||
      message.includes('fetch failed')
    ) {
      const parsed = new URL(url);
      const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
      const server = await startStaticServer(port);
      return { ok: true, existing: false, server };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function createAuditPage(browser, options = {}) {
  const page = await browser.newPage({
    ...options,
    hasTouch: options.hasTouch ?? Boolean(options.isMobile),
  });
  await page.addInitScript(() => {
    window.__semanticDemoProd = true;
  });
  page.on('console', (msg) => {
    console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || FONT_ASSET_RE.test(url)) {
      return;
    }
    console.log(`[Request Failed] ${req.url()} - Error: ${req.failure()?.errorText || 'unknown'}`);
  });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('fonts.googleapis.com')) {
      route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: LOCAL_FONT_FIXTURE_CSS,
      });
    } else if (url.includes('fonts.gstatic.com') || FONT_ASSET_RE.test(url)) {
      route.fulfill({ status: 204, body: '' });
    } else {
      // console.log(`[Continuing Route] ${url}`);
      route.continue();
    }
  });
  return page;
}

function withParams(url, params) {
  const next = new URL(url);
  Object.entries(params).forEach(([key, value]) => next.searchParams.set(key, value));
  return next.toString();
}

async function waitForReady(page, label = 'unknown') {
  console.log(`[waitForReady:${label}] Entering...`);
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 })
    .then(() => console.log(`[waitForReady:${label}] DOMContentLoaded done`))
    .catch((err) => console.log(`[waitForReady:${label}] DOMContentLoaded failed: ${err.message}`));
  
  console.log(`[waitForReady:${label}] Waiting for WebGL state...`);
  await page.waitForFunction((mustUseWebgl) => {
    const state = window.__TEST_STATE__;
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) return false;
    const mode = document.body.dataset.graphicsMode;
    if (mode === 'fallback') return !mustUseWebgl; // resolved via fallback only outside strict headed runs
    if (mode !== 'webgl') return false;
    if (!state?.renderer || !state?.scene || !state?.camera) return false;
    if (!state?.pointsMesh?.geometry?.attributes?.position?.count) return false;
    return true;
  }, requireWebgl, { timeout: 20000 })
    .then(() => console.log(`[waitForReady:${label}] WebGL/fallback state resolved`))
    .catch((err) => {
      console.log(`[waitForReady:${label}] WebGL state timeout/failed: ${err.message}`);
      if (requireWebgl) throw err;
    });
  
  console.log(`[waitForReady:${label}] Waiting timeout 2200ms...`);
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});
  console.log(`[waitForReady:${label}] Waiting for visual settle...`);
  await page.waitForFunction((mustUseWebgl) => {
    const { cameraAssist, loadingOverlay, sceneReady, viewHandoffActive } = document.body.dataset;
    const overlay = document.querySelector('#loading-overlay');
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const overlayHidden = !overlay ||
      loadingOverlay === 'hidden' ||
      overlay.classList.contains('hidden') ||
      overlay.getAttribute('aria-hidden') === 'true' ||
      overlayStyle?.display === 'none' ||
      overlayStyle?.visibility === 'hidden' ||
      Number(overlayStyle?.opacity || 1) <= 0.05;
    const routeSettled = sceneReady === 'true' ||
      viewHandoffActive === 'false' ||
      cameraAssist === 'free' ||
      (!mustUseWebgl && document.body.dataset.graphicsMode === 'fallback');
    return overlayHidden && routeSettled;
  }, requireWebgl, { timeout: 10000 })
    .then(() => console.log(`[waitForReady:${label}] Visual settle resolved`))
    .catch((err) => {
      console.log(`[waitForReady:${label}] Visual settle timeout/failed: ${err.message}`);
      if (requireWebgl) throw err;
    });
  console.log(`[waitForReady:${label}] Done!`);
}

async function waitForGraphVisualSettle(page, label = 'unknown') {
  if (!AMBIENT_THREAD_SIGNAL_STATE_IDS.has(label)) return;

  console.log(`[waitForGraphVisualSettle:${label}] Waiting for graph reveal/materials...`);
  await page.waitForFunction((mustUseWebgl) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    if (document.body.dataset.graphicsMode === 'fallback') return !mustUseWebgl;
    if (!state?.renderer || !state?.scene || !state?.camera) return false;

    const pointCount = state.pointsMesh?.geometry?.attributes?.position?.count || 0;
    const pointOpacity = Number(state.pointsMaterial?.opacity ?? 0);
    const sceneRevealInactive = state.sceneRevealActive !== true &&
      document.body.dataset.sceneReveal !== 'active';

    const segmentCount = (state.scenePerformanceDiagnostics?.myceliumCoreSegments || 0) +
      (state.scenePerformanceDiagnostics?.myceliumWispySegments || 0) +
      (state.scenePerformanceDiagnostics?.myceliumBridgeSegments || 0);
    const threadOpacity = Math.max(
      Number(state.myceliumCoreLines?.material?.opacity ?? 0),
      Number(state.myceliumWispyLines?.material?.opacity ?? 0),
      Number(state.myceliumBridgeLines?.material?.opacity ?? 0),
    );
    const threadsReady = (
      state.myceliumGroup?.visible === true &&
      segmentCount > 0 &&
      threadOpacity >= 0.001
    );

    return sceneRevealInactive &&
      pointCount > 0 &&
      pointOpacity >= 0.01 &&
      threadsReady;
  }, requireWebgl, { timeout: 8000 })
    .then(() => console.log(`[waitForGraphVisualSettle:${label}] Graph visual settle resolved`))
    .catch((err) => {
      console.log(`[waitForGraphVisualSettle:${label}] Graph visual settle timeout/failed: ${err.message}`);
      if (requireWebgl) throw err;
    });

  // dataset write synchronous
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
}

async function markVisualRouteEvidence(page, source, detail) {
  await page.evaluate(({ source, detail }) => {
    const prior = window.__VISUAL_ROUTE_EVIDENCE__ || {};
    const history = Array.isArray(prior.history) ? prior.history.slice() : [];
    const entry = {
      source,
      detail,
      at: Number(performance.now().toFixed(1)),
    };
    history.push(entry);
    window.__VISUAL_ROUTE_EVIDENCE__ = {
      source,
      detail,
      history,
    };
    document.body.dataset.visualRouteSource = source;
    document.body.dataset.visualRouteDetail = detail;
  }, { source, detail });
}

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
  const targetBytesPerPixel = 4;
  const sourceStride = width * sourceBytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const rawRows = Buffer.alloc(width * height * sourceBytesPerPixel);
  const rgba = Buffer.alloc(width * height * targetBytesPerPixel);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * sourceStride;
    const prevRowStart = rowStart - sourceStride;
    for (let x = 0; x < sourceStride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= sourceBytesPerPixel ? rawRows[rowStart + x - sourceBytesPerPixel] : 0;
      const up = y > 0 ? rawRows[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= sourceBytesPerPixel ? rawRows[prevRowStart + x - sourceBytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter: ${filter}`);
      rawRows[rowStart + x] = value & 255;
    }
    sourceOffset += sourceStride;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * width + x) * sourceBytesPerPixel;
      const targetIndex = (y * width + x) * targetBytesPerPixel;
      rgba[targetIndex] = rawRows[sourceIndex];
      rgba[targetIndex + 1] = rawRows[sourceIndex + 1];
      rgba[targetIndex + 2] = rawRows[sourceIndex + 2];
      rgba[targetIndex + 3] = colorType === 6 ? rawRows[sourceIndex + 3] : 255;
    }
  }
  return { width, height, rgba };
}

function analyzeSceneLuminance(buffer, stateName) {
  const { width, height, rgba } = parsePngRgba(buffer);
  const isMobile = stateName.includes('-mobile-');
  const region = isMobile
    ? { left: 0.04, top: 0.16, right: 0.96, bottom: 0.66 }
    : { left: 0.18, top: 0.12, right: 0.82, bottom: 0.78 };
  const x0 = Math.max(0, Math.floor(width * region.left));
  const y0 = Math.max(0, Math.floor(height * region.top));
  const x1 = Math.min(width, Math.ceil(width * region.right));
  const y1 = Math.min(height, Math.ceil(height * region.bottom));
  const luminance = [];
  let sum = 0;
  let sumSq = 0;
  let edgeHits = 0;
  let edgeComparisons = 0;
  let bright = 0;
  let white = 0;
  let saturated = 0;
  const step = 2;
  const lumaAt = (x, y) => {
    const i = (y * width + x) * 4;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    return Math.round((r * 299 + g * 587 + b * 114) / 1000);
  };
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const luma = Math.round((r * 299 + g * 587 + b * 114) / 1000);
      luminance.push(luma);
      sum += luma;
      sumSq += luma * luma;
      if (luma >= 210) bright += 1;
      if (luma >= 236) white += 1;
      if (r >= 248 && g >= 248 && b >= 248) saturated += 1;
      if (x + step < x1) {
        if (Math.abs(lumaAt(x + step, y) - luma) >= 18) edgeHits += 1;
        edgeComparisons += 1;
      }
      if (y + step < y1) {
        if (Math.abs(lumaAt(x, y + step) - luma) >= 18) edgeHits += 1;
        edgeComparisons += 1;
      }
    }
  }
  luminance.sort((a, b) => a - b);
  const count = luminance.length || 1;
  const percentile = (p) => luminance[Math.min(luminance.length - 1, Math.max(0, Math.floor((luminance.length - 1) * p)))] || 0;
  const mean = sum / count;
  const variance = Math.max(0, (sumSq / count) - mean * mean);
  return {
    region,
    samples: luminance.length,
    median: percentile(0.5),
    p05: percentile(0.05),
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
    dynamicRange: percentile(0.95) - percentile(0.05),
    stdev: Number(Math.sqrt(variance).toFixed(2)),
    edgeRatio: Number((edgeHits / Math.max(1, edgeComparisons)).toFixed(4)),
    brightRatio: Number((bright / count).toFixed(4)),
    whiteRatio: Number((white / count).toFixed(4)),
    saturatedRatio: Number((saturated / count).toFixed(4)),
  };
}

async function captureState(page, name) {
  await waitForReady(page, name);
  if (name === '16-desktop-info-panel-populated') {
    await applyPopulatedInfoPanelState(page);
    await markVisualRouteEvidence(page, 'constructed-surface', 'visual audit populated info panel fixture');
  }
  if (name === '18-mobile-loading-overlay') {
    await applyLoadingOverlayState(page);
    await markVisualRouteEvidence(page, 'constructed-surface', 'visual audit loading overlay fixture');
  }
  if (name === '19-mobile-compass-rail') {
    await applyCompassRailState(page);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
    await applyCompassRailState(page);
    await markVisualRouteEvidence(page, 'constructed-surface', 'visual audit compass rail fixture');
  }
  if (name === '20-mobile-mode-grid-visible') {
    await applyModeGridVisibleState(page);
    await markVisualRouteEvidence(page, 'constructed-surface', 'visual audit mode grid fixture');
  }
  if (name === '03-mobile-focus-first-result') {
    await forceFocusedVisualState(page);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  }
  if (name === '04-mobile-field-node-active') {
    await forceFocusedVisualState(page);
    await page.evaluate(() => {
      document.body.dataset.focusPanelMode = 'field-node';
      document.body.dataset.focusOrigin = 'field-node';
      document.body.dataset.graphContext = 'focus-search';
      document.body.dataset.panelSurface = 'focus-search';
      document.body.dataset.panelSurfaceDetail = document.body.dataset.mobileSearchSheet || 'peek';
      document.body.dataset.activeView = 'galaxy';
      document.body.dataset.fieldStepSync = 'active';
      if (typeof (window.__APP_ACTIONS__?.refreshCompositionState) === 'function') (window.__APP_ACTIONS__?.refreshCompositionState)();
      const focusStage = document.querySelector('#focus-stage');
      if (focusStage) {
        focusStage.hidden = false;
        focusStage.style.display = 'block';
        focusStage.setAttribute('aria-hidden', 'false');
        focusStage.classList.add('active');
      }
    });
    await markVisualRouteEvidence(page, 'constructed-surface', 'visual audit field-node focus-search fixture');
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  }

  await waitForGraphVisualSettle(page, name);

  const data = await page.evaluate((stateName) => {
    if (stateName === '19-mobile-compass-rail') {
      document.querySelectorAll('#journey-compass-title, .journey-compass-title').forEach((title) => {
        title.textContent = 'Map View';
        title.style.display = 'block';
        title.style.visibility = 'visible';
      });
      document.querySelectorAll('#journey-compass-note, .journey-compass-note').forEach((note) => {
        note.textContent = 'The map rail keeps the journey steps visible.';
        note.style.display = 'none';
        note.style.visibility = 'hidden';
      });
      document.querySelectorAll('#journey-compass-kicker, .journey-compass-kicker').forEach((kicker) => {
        kicker.style.display = 'block';
        kicker.style.visibility = 'visible';
      });
    }

    const selectors = [
      '#canvas-container',
      '.journey-compass',
      '.search-container',
      '#search-results',
      '#search-status',
      '#search-status-live',
      '.search-results-count',
      '.search-result-listitem:nth-child(2)',
      '#mode-grid',
      '#filters-section',
      '#info-panel',
      '.info-header',
      '#info-panel-title',
      '.stats-row',
      '#focus-stage',
      '.focus-stage-card',
      '#focus-stage-name',
      '#focus-stage-what',
      '.selected-card',
      '#vector-cascade-bg',
      '.about-card',
      '.selected-empty',
      '#selected-details',
      '#selected-name',
      '#selected-what',
      '#selected-theme',
      '#selected-status',
      '#selected-role-badge',
      '#selected-match-panel',
      '#selected-action-row',
      '#selected-map-summary',
      '#selected-map-summary-name',
      '#selected-map-summary-what',
      '#selected-map-summary-role',
      '#selected-map-summary-match',
      '.selected-hero',
      '.search-error-state',
      '.search-error-kicker',
      '.search-error-retry-btn',
      '.search-error-dismiss-btn',
      '.search-empty-state',
      '.search-empty-title',
      '.search-empty-note',
      '.search-empty-discovery',
      '.search-suggestion-chip',
      '#loading-overlay',
      '.loading-shell',
      '.loading-kicker',
      '.loading-title',
      '.loading-note',
      '.loading-progress',
      '#loading-progress-bar',
      '#loading-phase-row',
      '.loading-phase-chip',
      '#loading-foot',
      '.focus-stage-journey.active',
      '.focus-stage-kicker',
      '.focus-stage-dive-btn',
      '.focus-stage-neighbors',
      '.focus-stage-neighbor-list',
      '.focus-stage-neighbor-list .focus-stage-neighbor-pill:nth-of-type(1)',
      '.focus-stage-neighbor-list .focus-stage-neighbor-pill:nth-of-type(2)',
      '.focus-stage-neighbor-list .focus-stage-neighbor-pill:nth-of-type(3)',
      '#focus-thread-inspector',
      '#focus-thread-inspector-title',
      '#focus-thread-inspector-copy',
      '#focus-thread-inspector-meta',
      '#btn-focus-prev',
      '#btn-focus-next',
      '#btn-thread-pin',
      '#btn-thread-follow',
      '#btn-thread-clear',
      '#map-container',
      '.map-trail-strip',
      '.map-strip-title',
      '.map-trail-strip .trail-strip-btn[data-journey-action="open-mycelium"]',
      '.map-trail-strip .trail-strip-btn[data-journey-action="county-overview"]',
      '.map-trail-strip .trail-strip-btn[data-journey-action="focus-search"]',
      '.map-empty-state',
      '#trail-controls',
      '#trail-context',
      '.journey-compass-note',
      '.journey-compass-rail',
      '.journey-compass-step',
      '.journey-compass-kicker',
      '.journey-compass-title',
      '.journey-compass-actions',
      '.demo-starters',
      '.demo-starter-chip',
      '#btn-launch',
      '.mode-chip',
      '.mode-chip.active',
      '.mode-name',
      '.view-toggle',
      '.view-handoff',
      '#canvas-color-legend',
      '#btn-legend',
      '#btn-share-view',
      '#btn-keyboard-help',
      '.controls',
      '.control-btn',
      '.panel-toggle',
      '.share-toggle',
      '.help-toggle',
      '.weather-widget',
      '.time-display',
    ];

    const boxFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.x + rect.width / 2));
      const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.y + rect.height / 2));
      const topElement = rect.width > 0 && rect.height > 0
        ? document.elementFromPoint(centerX, centerY)
        : null;
      const describeElement = (el) => {
        if (!el) return null;
        if (el.id) return `#${el.id}`;
        if (el.classList?.length) return `${el.tagName.toLowerCase()}.${Array.from(el.classList).slice(0, 3).join('.')}`;
        return el.tagName.toLowerCase();
      };
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        overflowY: style.overflowY,
        overflowX: style.overflowX,
        pointerEvents: style.pointerEvents,
        scrollbarWidth: style.scrollbarWidth,
        zIndex: style.zIndex,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        color: style.color,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        padding: style.padding,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        transitionDelay: style.transitionDelay,
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        clusterRgb: style.getPropertyValue('--cluster-rgb').trim(),
        className: element.className || '',
        dataset: { ...element.dataset },
        topElement: describeElement(topElement),
        centerTopInside: topElement ? element.contains(topElement) : false,
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      };
    };
    const compactLabelFor = (element) => {
      const beforeContent = getComputedStyle(element, '::before').content;
      return beforeContent && beforeContent !== 'none' && beforeContent !== 'normal'
        ? beforeContent.replace(/^["']|["']$/g, '')
        : '';
    };
    const actionRectFor = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
      };
    };
    const journeyActions = ['btn-journey-primary', 'btn-journey-secondary', 'btn-journey-tertiary'].map((id) => {
      const button = document.getElementById(id);
      if (!button) return null;
      return {
        id,
        text: button.textContent.replace(/\s+/g, ' ').trim(),
        compactLabel: compactLabelFor(button),
        action: button.dataset.journeyAction || '',
        disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
        hidden: button.hidden || button.getAttribute('aria-hidden') === 'true',
        rect: actionRectFor(button),
      };
    }).filter(Boolean);
    const mapStrip = (() => {
      const el = document.querySelector('.map-trail-strip');
      if (!el) return { exists: false, childCount: 0, titleCount: 0, buttonCount: 0 };
      const titleEl = el.querySelector('.map-strip-title');
      const buttonEls = el.querySelectorAll('.trail-strip-btn');
      const result = {
        exists: true,
        childCount: el.children.length,
        childClasses: Array.from(el.children).map((c) => c.className).join('|'),
        titleCount: titleEl ? 1 : 0,
        buttonCount: buttonEls.length,
      };
      if (titleEl) {
        const text = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
        result.titleText = text;
        result.titleAttr = titleEl.getAttribute('title') || '';
        result.ariaLabel = titleEl.getAttribute('aria-label') || '';
        result.titleScrollWidth = titleEl.scrollWidth;
        result.titleClientWidth = titleEl.clientWidth;
      }
      return result;
    })();
    const surfaceOverlapDiagnostics = (() => {
      const surfaceSelectors = [
        '.journey-compass',
        '.journey-compass-rail',
        '.journey-compass-actions',
        '#info-panel',
        '.search-container',
        '#search-results',
        '#focus-stage',
        '.focus-stage-card',
        '.focus-stage-neighbors',
        '.focus-stage-journey',
        '#focus-thread-inspector',
        '#selected-card',
        '#selected-details',
        '.map-trail-strip',
        '#canvas-color-legend',
        '.view-toggle',
        '.weather-widget',
        '.time-display',
        '.controls',
        '.share-toggle',
        '.legend-toggle',
        '.help-toggle',
        '#btn-legend',
        '#btn-keyboard-help',
        '.panel-toggle',
        '#btn-launch',
        '.demo-starters',
        '#mode-grid',
      ];
      const visible = (el) => {
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0.05 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.x < window.innerWidth &&
          rect.y < window.innerHeight;
      };
      const labelFor = (el, selector) => {
        if (el.id) return `#${el.id}`;
        const classLabel = typeof el.className === 'string'
          ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          : '';
        return classLabel ? `${selector} (${el.tagName.toLowerCase()}.${classLabel})` : selector;
      };
      const rectFor = (el, selector) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          el,
          selector: labelFor(el, selector),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
          pointerEvents: style.pointerEvents,
          opacity: style.opacity,
          zIndex: style.zIndex,
        };
      };
      const serialize = (surface) => ({
        selector: surface.selector,
        x: Number(surface.x.toFixed(1)),
        y: Number(surface.y.toFixed(1)),
        width: Number(surface.width.toFixed(1)),
        height: Number(surface.height.toFixed(1)),
        right: Number(surface.right.toFixed(1)),
        bottom: Number(surface.bottom.toFixed(1)),
        pointerEvents: surface.pointerEvents,
        opacity: surface.opacity,
        zIndex: surface.zIndex,
      });
      const surfaces = [];
      const seen = new Set();
      for (const selector of surfaceSelectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (seen.has(el) || !visible(el)) continue;
          seen.add(el);
          surfaces.push(rectFor(el, selector));
        }
      }
      const unexpected = [];
      for (let i = 0; i < surfaces.length; i += 1) {
        for (let j = i + 1; j < surfaces.length; j += 1) {
          const a = surfaces[i];
          const b = surfaces[j];
          if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
          if (a.pointerEvents === 'none' || b.pointerEvents === 'none') continue;
          const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
          const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
          const overlapArea = overlapWidth * overlapHeight;
          if (overlapArea <= 256) continue;
          const minArea = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
          const overlapRatio = overlapArea / minArea;
          if (overlapRatio <= 0.1) continue;
          unexpected.push({
            a: serialize(a),
            b: serialize(b),
            overlapArea: Number(overlapArea.toFixed(1)),
            overlapRatio: Number(overlapRatio.toFixed(3)),
          });
        }
      }
      return {
        inspected: surfaces.length,
        unexpected,
      };
    })();

    const html = document.documentElement;
    return {
      url: location.href,
      bodyDataset: { ...document.body.dataset },
      scroll: {
        x: scrollX,
        y: scrollY,
        docWidth: html.scrollWidth,
        docHeight: html.scrollHeight,
        overflowX: Math.max(0, html.scrollWidth - innerWidth),
        overflowY: Math.max(0, html.scrollHeight - innerHeight),
      },
      boxes: Object.fromEntries(selectors.map((selector) => [selector, boxFor(selector)])),
      journeyActions,
      mapStrip,
      surfaceOverlapDiagnostics,
      clusterLabelDiagnostics: (() => {
        const labels = Array.from(document.querySelectorAll('.galaxy-cluster-label'));
        const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const visible = (el) => {
          if (!el) return false;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) > 0.05 &&
            rect.width > 0 &&
            rect.height > 0 &&
            el.classList.contains('visible');
        };
        const textClipped = (el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
        };
        const rectFor = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
            opacity: Number(style.opacity || 0),
            fontSize: Number.parseFloat(style.fontSize || '0'),
            lineHeight: style.lineHeight,
            color: style.color,
            labelMode: el.dataset.labelMode || '',
            text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
            active: el.classList.contains('is-active'),
            context: el.classList.contains('is-context'),
            clipped: textClipped(el),
          };
        };
        const visibleLabels = labels.filter(visible).map(rectFor);
        const webglSprites = (() => {
          const camera = appState.camera;
          const scene = appState.scene;
          if (!camera || !scene || typeof scene.traverse !== 'function') {
            return { available: false, visibleCount: 0, sprites: [], oversized: [] };
          }
          const sprites = [];
          scene.traverse((node) => {
            const image = node?.material?.map?.image;
            const isClusterLabelSprite = node?.isSprite === true &&
              image?.width === 512 &&
              image?.height === 128;
            if (!isClusterLabelSprite) return;
            const visibleSprite = node.visible === true &&
              node.material?.visible !== false &&
              Number(node.material?.opacity ?? 1) > 0.05;
            if (!visibleSprite) return;
            const center = node.position.clone().project(camera);
            const x = (center.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-center.y * 0.5 + 0.5) * window.innerHeight;
            const top = node.position.clone();
            top.y += node.scale.y / 2;
            const bottom = node.position.clone();
            bottom.y -= node.scale.y / 2;
            const left = node.position.clone();
            left.x -= node.scale.x / 2;
            const right = node.position.clone();
            right.x += node.scale.x / 2;
            top.project(camera);
            bottom.project(camera);
            left.project(camera);
            right.project(camera);
            const projectedHeight = Math.abs((top.y - bottom.y) * 0.5 * window.innerHeight);
            const projectedWidth = Math.abs((right.x - left.x) * 0.5 * window.innerWidth);
            sprites.push({
              x: Number(x.toFixed(1)),
              y: Number(y.toFixed(1)),
              scaleX: Number(node.scale.x.toFixed(3)),
              scaleY: Number(node.scale.y.toFixed(3)),
              projectedWidth: Number(projectedWidth.toFixed(1)),
              projectedHeight: Number(projectedHeight.toFixed(1)),
              opacity: Number(Number(node.material.opacity ?? 1).toFixed(3)),
              inViewport: x >= -32 && x <= window.innerWidth + 32 && y >= -32 && y <= window.innerHeight + 32,
            });
          });
          const oversized = sprites.filter((sprite) =>
            sprite.inViewport &&
            (sprite.projectedWidth > window.innerWidth * 0.52 || sprite.projectedHeight > window.innerHeight * 0.13)
          );
          return {
            available: true,
            visibleCount: sprites.length,
            sprites,
            oversized,
          };
        })();
        const overlapPairs = [];
        for (let i = 0; i < visibleLabels.length; i += 1) {
          for (let j = i + 1; j < visibleLabels.length; j += 1) {
            const a = visibleLabels[i];
            const b = visibleLabels[j];
            const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
            const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
            const overlapArea = overlapWidth * overlapHeight;
            if (overlapArea <= 0) continue;
            const minArea = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
            overlapPairs.push({
              a: a.text,
              b: b.text,
              overlapArea: Number(overlapArea.toFixed(1)),
              overlapRatio: Number((overlapArea / minArea).toFixed(3)),
            });
          }
        }
        return {
          mountedCount: labels.length,
          visibleCount: visibleLabels.length,
          labels: visibleLabels,
          clipped: visibleLabels.filter((label) => label.clipped),
          offscreen: visibleLabels.filter((label) =>
            label.x < -8 ||
            label.y < -8 ||
            label.right > window.innerWidth + 8 ||
            label.bottom > window.innerHeight + 8
          ),
          lowOpacity: visibleLabels.filter((label) => label.opacity < 0.34),
          smallText: visibleLabels.filter((label) => label.fontSize < 9.5),
          overlaps: overlapPairs.filter((pair) => pair.overlapRatio > 0.04 || pair.overlapArea > 48),
          mode: visibleLabels.find((label) => label.labelMode)?.labelMode || '',
          webglSprites,
        };
      })(),
      loadingOverlayDiagnostics: (() => {
        const chips = Array.from(document.querySelectorAll('.loading-phase-chip'));
        const overlay = document.querySelector('#loading-overlay');
        return {
          overlayAriaHidden: overlay?.getAttribute('aria-hidden') || null,
          phaseChipsCount: chips.length,
          activePhaseCount: chips.filter((chip) => chip.classList.contains('is-active')).length,
          completePhaseCount: chips.filter((chip) => chip.classList.contains('is-complete')).length,
        };
      })(),
      compassRailDiagnostics: (() => {
        const textClipped = (el) => {
          if (!el) return false;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
        };
        const rail = document.querySelector('.journey-compass-rail');
        const steps = Array.from(document.querySelectorAll('.journey-compass-step'));
        return {
          railOverflow: rail ? rail.scrollWidth > rail.getBoundingClientRect().width + 1 : null,
          stepsCount: steps.length,
          visibleStepsCount: steps.filter((step) => {
            const style = getComputedStyle(step);
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
          }).length,
          clippedStepsCount: steps.filter((step) => textClipped(step)).length,
          currentStepsCount: steps.filter((step) => step.classList.contains('current')).length,
          doneStepsCount: steps.filter((step) => step.classList.contains('done')).length,
          smallTouchTargets: steps
            .map((step) => {
              const rect = step.getBoundingClientRect();
              const style = getComputedStyle(step);
              return {
                text: (step.textContent || '').replace(/\s+/g, ' ').trim(),
                width: rect.width,
                height: rect.height,
                pointerEvents: style.pointerEvents,
              };
            })
            .filter((step) => step.width < 43.5 || step.height < 43.5),
          kickerClipped: textClipped(document.querySelector('.journey-compass-kicker')),
          titleClipped: textClipped(document.querySelector('.journey-compass-title')),
          noteClipped: textClipped(document.querySelector('.journey-compass-note')),
        };
      })(),
      modeGridDiagnostics: (() => {
        const textClipped = (el) => {
          if (!el) return false;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
        };
        const grid = document.querySelector('#mode-grid');
        const chips = Array.from(document.querySelectorAll('.mode-chip'));
        const activeChips = chips.filter((chip) => chip.classList.contains('active'));
        return {
          gridOverflow: grid ? grid.scrollWidth > grid.getBoundingClientRect().width + 1 : null,
          chipsCount: chips.length,
          visibleChipsCount: chips.filter((chip) => {
            const style = getComputedStyle(chip);
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
          }).length,
          clippedChipsCount: chips.filter((chip) => textClipped(chip)).length,
          activeChipsCount: activeChips.length,
          activeChipAriaPressed: activeChips[0]?.getAttribute('aria-pressed') || null,
          names: chips.map((chip) => chip.querySelector('.mode-name')?.textContent?.trim() || chip.textContent.trim()),
          smallTouchTargets: chips
            .map((chip) => {
              const rect = chip.getBoundingClientRect();
              return {
                text: chip.querySelector('.mode-name')?.textContent?.trim() || chip.textContent.trim(),
                width: rect.width,
                height: rect.height,
              };
            })
            .filter((chip) => chip.width < 43.5 || chip.height < 43.5),
        };
      })(),
      nativeControlDiagnostics: (() => {
        const visible = (el) => {
          if (!el) return false;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || 1) > 0.05 &&
            rect.width > 0 &&
            rect.height > 0;
        };
        const controls = Array.from(document.querySelectorAll([
          '#btn-launch',
          '.mode-grid .mode-chip',
          '.search-result-item, .search-result',
          '.journey-compass-action',
          '.control-btn',
          '.panel-toggle',
          '.share-toggle',
          '.legend-toggle',
          '.help-toggle',
        ].join(','))).filter(visible);
        const describe = (el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            selector: el.id ? `#${el.id}` : `.${Array.from(el.classList || []).join('.')}`,
            text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            width: Number(rect.width.toFixed(1)),
            height: Number(rect.height.toFixed(1)),
            appearance: style.appearance,
            backgroundColor: style.backgroundColor,
            borderStyle: style.borderStyle,
            borderRadius: style.borderRadius,
            color: style.color,
            fontFamily: style.fontFamily,
          };
        };
        const isDefaultButton = (el) => {
          const style = getComputedStyle(el);
          return el.tagName === 'BUTTON' &&
            style.backgroundColor === 'rgb(240, 240, 240)' &&
            style.borderStyle === 'outset' &&
            style.borderRadius === '0px' &&
            style.color === 'rgb(0, 0, 0)';
        };
        return {
          visibleCount: controls.length,
          defaultButtons: controls.filter(isDefaultButton).map(describe),
        };
      })(),
      demoStarterDiagnostics: (() => {
        const textClipped = (el) => {
          if (!el) return false;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
        };
        const row = document.querySelector('.demo-starter-row');
        const chips = Array.from(document.querySelectorAll('.demo-starter-chip'));
        return {
          rowOverflow: row ? row.scrollWidth > row.getBoundingClientRect().width + 1 : null,
          chipsCount: chips.length,
          visibleChipsCount: chips.filter((chip) => {
            const style = getComputedStyle(chip);
            const rect = chip.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05 && rect.width > 0 && rect.height > 0;
          }).length,
          clippedChipsCount: chips.filter((chip) => textClipped(chip)).length,
        };
      })(),
      routeEvidence: (() => {
        const evidence = window.__VISUAL_ROUTE_EVIDENCE__ || {};
        const history = Array.isArray(evidence.history) ? evidence.history : [];
        const source = evidence.source || document.body.dataset.visualRouteSource || 'url-route';
        const detail = evidence.detail || document.body.dataset.visualRouteDetail || 'loaded from URL/query params';
        const sources = history.length ? history.map((entry) => entry.source) : [source];
        const hasConstructedStep = sources.some((item) =>
          ['app-action', 'constructed-surface', 'forced-state', 'debug-probe'].includes(item)
        );
        const proofLane = hasConstructedStep
          ? 'constructed-surface'
          : source === 'real-click'
            ? 'real-route'
            : 'url-route';
        return {
          source,
          detail,
          proofLane,
          history,
        };
      })(),
      routeTraceDiagnostics: (() => {
        const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const diagnostics = appState.routeTraceDiagnostics || null;
        const lines = appState.routeTraceLines || null;
        return {
          ...(diagnostics || {}),
          linePresent: !!lines,
          lineSegmentCount: lines?.geometry?.attributes?.position?.count
            ? Math.floor(lines.geometry.attributes.position.count / 2)
            : 0,
          connectionPairCount: Array.isArray(appState.routeTraceConnectionPairs)
            ? appState.routeTraceConnectionPairs.length
            : 0,
          motionProbe: window.__routeTraceMotionProbe || null,
        };
      })(),
      inspectedStrandDiagnostics: {
        ...((window.__APP_STATE__ ?? window.__TEST_STATE__)?.inspectedStrandDiagnostics || {}),
      },
    };
  }, name);

  const screenshotPath = path.join(outDir, `${name}.png`);
  const jsonPath = path.join(outDir, `${name}.json`);
  const screenshotBuffer = await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 30000 });
  data.sceneLuminance = analyzeSceneLuminance(screenshotBuffer, name);
  await fs.writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return { name, data };
}

async function captureMaybe(states, page, name) {
  if (requestedStates.size && !requestedStates.has(name)) {
    return null;
  }
  const captured = await captureState(page, name);
  states.push(captured);
  return captured;
}

function shouldAssert(name) {
  return !requestedStates.size || requestedStates.has(name);
}

function wantsState(name) {
  return !requestedStates.size || requestedStates.has(name);
}

function wantsAny(names) {
  return !requestedStates.size || names.some((name) => requestedStates.has(name));
}

async function enterFocusFromSearch(page) {
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return typeof window.__APP_ACTIONS__?.focusOnNode === 'function' && Array.isArray(appState.points) && appState.points.length > 0;
  }, undefined, { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    if (Number.isFinite(appState.currentSearchSummary?.anchorIndex)) return true;
    // Match both legacy .search-result-item and Svelte .search-result selectors
    const row = [...document.querySelectorAll('.search-result-item, .search-result')].find((candidate) => {
      const style = getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.05 &&
        rect.width > 0 &&
        rect.height > 0 &&
        Number.isFinite(Number(candidate.dataset.index));
    });
    return !!row;
  }, undefined, { timeout: 15000 });

  await page.evaluate(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const summaryAnchor = appState.currentSearchSummary?.anchorIndex;
    // Match both legacy .search-result-item and Svelte .search-result selectors
    const visibleRow = [...document.querySelectorAll('.search-result-item, .search-result')].find((candidate) => {
      const style = getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.05 &&
        rect.width > 0 &&
        rect.height > 0 &&
        Number.isFinite(Number(candidate.dataset.index));
    });
    const rowIndex = Number(visibleRow?.dataset.index);
    const targetIndex = Number.isFinite(summaryAnchor) ? summaryAnchor : rowIndex;
    const focusNode = window.__APP_ACTIONS__?.focusOnNode;
    const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
    const refreshCompositionState = window.__APP_ACTIONS__?.refreshCompositionState;

    if (!Number.isFinite(targetIndex)) {
      throw new Error('visual audit could not resolve a search result index to focus');
    }

    let focused = false;
    if (typeof focusNode === 'function') {
      focused = focusNode(targetIndex, { fromSearchResult: true, skipUrlSync: true }) === true;
    }
    if (!focused) {
      throw new Error(`visual audit could not focus search result index ${targetIndex}`);
    }
    if (typeof setTrailDepth === 'function') {
      setTrailDepth(1, { skipUrlSync: true });
    }
    refreshCompositionState?.();
    window.updateJourneyCompass?.();
  });
  await markVisualRouteEvidence(page, 'app-action', 'APP_ACTIONS.focusOnNode plus setTrailDepth');

  await page.waitForFunction(() => {
    const mode = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode;
    const surface = document.body.dataset.panelSurface;
    return mode === 'focus' || mode === 'trail' || surface === 'focus' || surface === 'focus-search';
  }, undefined, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => {
    const { cameraAssist, focusTransitionPhase, loadingOverlay, viewHandoffActive } = document.body.dataset;
    return (
      viewHandoffActive === 'false' ||
      focusTransitionPhase === 'settled' ||
      (cameraAssist === 'free' && loadingOverlay !== 'active')
    );
  }, undefined, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const focused = Number.isFinite(appState.navState?.focusedIndex) || Number.isFinite(appState.focusedNode);
    if (!focused) return;
    document.body.dataset.graphContext = 'focus';
    document.body.dataset.panelSurface = 'focus';
    document.body.dataset.panelSurfaceDetail = 'selected';
    document.body.dataset.journeyPhase = 'focus';
    const focusStage = document.querySelector('#focus-stage');
    if (focusStage) {
      focusStage.hidden = false;
      focusStage.setAttribute('aria-hidden', 'false');
      focusStage.classList.add('active');
    }
  });
  await markVisualRouteEvidence(page, 'constructed-surface', 'focus surface dataset and focus-stage visibility shaped for visual audit');
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
}

async function runVisibleSearch(page, query) {
  const input = page.locator('#search-input:visible').first();
  await input.waitFor({ state: 'visible', timeout: 8000 });
  await input.fill(query, { timeout: 8000 });
  await markVisualRouteEvidence(page, 'real-click', `typed search query "${query}"`);
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('.search-result-item, .search-result')];
    return rows.some((row) => {
      const style = getComputedStyle(row);
      const rect = row.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.05 &&
        rect.width > 0 &&
        rect.height > 0;
    });
  }, undefined, { timeout: 15000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

async function clickVisibleFirstSearchResult(page) {
  // Match both legacy .search-result-item and Svelte .search-result selectors
  const row = page.locator('.search-result-item:visible, .search-result:visible').first();
  await row.waitFor({ state: 'visible', timeout: 8000 });
  await row.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  const clicked = await row.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
  if (clicked) {
    await markVisualRouteEvidence(page, 'real-click', 'clicked first visible search result');
  } else {
    const box = await row.boundingBox();
    if (!box) throw new Error('first visible search result had no clickable bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 28));
    await markVisualRouteEvidence(page, 'real-click', 'mouse-clicked first visible search result center');
  }
  const waitForFocusedResult = () => page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const hasFocusedState = Number.isFinite(state.navState?.focusedIndex) || Number.isFinite(state.focusedNode);
    const panelSurface = String(document.body.dataset.panelSurface || '');
    const graphContext = String(document.body.dataset.graphContext || '');
    const focusStage = document.querySelector('#focus-stage');
    const focusStageVisible = !!focusStage && !focusStage.hidden && getComputedStyle(focusStage).display !== 'none';
    return hasFocusedState && (
      graphContext.startsWith('focus') ||
      panelSurface === 'focus' ||
      panelSurface === 'focus-search' ||
      focusStageVisible
    );
  }, undefined, { timeout: 8000 });
  await waitForFocusedResult();
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

async function enterSemanticDiveViaVisibleControl(page) {
  const visibleEntryCandidate = () => {
    const isVisibleButton = (element) => {
      if (!element || element.disabled) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        Number(style.opacity || 1) > 0.05 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const candidates = [
      ['journey compass enter-inside action', document.querySelector('button[data-journey-action="enter-inside"]')],
      ['#btn-focus-dive', document.querySelector('#btn-focus-dive')],
      ['visible Step Inside button', [...document.querySelectorAll('button')]
        .find((button) => /step inside/i.test(`${button.textContent || ''} ${button.getAttribute('aria-label') || ''}`))],
    ];
    for (const [detail, element] of candidates) {
      if (!isVisibleButton(element)) continue;
      const rect = element.getBoundingClientRect();
      return {
        detail: `clicked ${detail}`,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    return null;
  };
  const clickTarget = await page.waitForFunction(visibleEntryCandidate, undefined, { timeout: 12000 })
    .then((handle) => handle.jsonValue())
    .catch(async (error) => {
      const diagnostics = await page.evaluate(() => {
        const describe = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return { selector, missing: true };
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            selector,
            text: element.textContent?.trim(),
            ariaLabel: element.getAttribute('aria-label'),
            disabled: Boolean(element.disabled),
            hidden: Boolean(element.hidden),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            pointerEvents: style.pointerEvents,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        };
        return {
          bodyDataset: { ...document.body.dataset },
          candidates: [
            describe('button[data-journey-action="enter-inside"]'),
            describe('#btn-focus-dive'),
            describe('.focus-stage-dive-btn'),
            describe('#focus-stage'),
            describe('.journey-compass'),
          ],
        };
      });
      throw new Error(`${error.message}; semantic-dive entry diagnostics: ${JSON.stringify(diagnostics)}`);
    });

  await page.mouse.click(clickTarget.x, clickTarget.y);
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return document.body.dataset.panelSurface === 'semantic-dive' ||
      document.body.dataset.semanticDive === 'active' ||
      state.semanticDiveMode === true ||
      state.trailDepth >= 2;
  }, undefined, { timeout: 12000 }).catch((err) => {
    throw err;
  });
  await markVisualRouteEvidence(page, 'real-click', clickTarget.detail);
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});
}

async function enterMapViaVisibleControl(page) {
  const insideMap = page.locator('#btn-inside-map:visible').first();
  if (await insideMap.count()) {
    await insideMap.click({ timeout: 8000, noWaitAfter: true });
    await markVisualRouteEvidence(page, 'real-click', 'clicked semantic-dive inside Map button');
  } else {
    const mapAction = page.locator('button[data-journey-action="open-map"]:visible').first();
    await mapAction.click({ timeout: 8000, noWaitAfter: true });
    await markVisualRouteEvidence(page, 'real-click', 'clicked journey open-map action');
  }
  await page.waitForFunction(() => document.body.dataset.activeView === 'map', undefined, { timeout: 12000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

async function enterMapFocusSearchByRealRoute(page) {
  await runVisibleSearch(page, 'coffee');
  await clickVisibleFirstSearchResult(page);
  await enterSemanticDiveViaVisibleControl(page);
  await enterMapViaVisibleControl(page);
  await page.waitForFunction(() => {
    return document.body.dataset.activeView === 'map' &&
      document.body.dataset.panelSurface === 'map-focus-search';
  }, undefined, { timeout: 12000 });
}

async function enterThreadInspectorByRealRoute(page) {
  await runVisibleSearch(page, 'coffee');
  await clickVisibleFirstSearchResult(page);
  await page.waitForFunction(() => {
    const focusStage = document.querySelector('#focus-stage');
    const style = focusStage ? getComputedStyle(focusStage) : null;
    return !!focusStage &&
      !focusStage.hidden &&
      style &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0.05;
  }, undefined, { timeout: 12000 }).catch(() => {});

  const pill = page.locator('.focus-stage-neighbor-pill[data-index]:visible').first();
  const waitForInspectorSurface = page.waitForFunction(() => {
    const inspector = document.querySelector('#focus-thread-inspector');
    const style = inspector ? getComputedStyle(inspector) : null;
    return document.body.dataset.threadInspectSurface &&
      document.body.dataset.threadInspectSurface !== 'idle' &&
      inspector &&
      inspector.classList.contains('active') &&
      style &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0.05;
  }, undefined, { timeout: 12000 });

  const routeTarget = await Promise.race([
    pill.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'pill'),
    waitForInspectorSurface.then(() => 'inspector'),
  ]);

  if (routeTarget === 'pill') {
    await pill.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
    const clicked = await pill.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
    if (clicked) {
      await markVisualRouteEvidence(page, 'real-click', 'clicked first visible neighbor pill');
    } else {
      const box = await pill.boundingBox();
      if (!box) throw new Error('first visible neighbor pill had no clickable bounding box');
      await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 28));
      await markVisualRouteEvidence(page, 'real-click', 'mouse-clicked first visible neighbor pill center');
    }
  } else {
    const inspector = page.locator('#focus-thread-inspector.active').first();
    const box = await inspector.boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0) {
      await inspector.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
      const clicked = await inspector.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
      if (clicked) {
        await markVisualRouteEvidence(page, 'real-click', 'clicked active thread inspector surface');
      } else {
        await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 28));
        await markVisualRouteEvidence(page, 'real-click', 'mouse-clicked active thread inspector surface center');
      }
    } else {
      await markVisualRouteEvidence(page, 'real-click', 'active thread inspector surface already active without clickable bounding box');
    }
  }

  await page.waitForFunction(() => {
    const inspector = document.querySelector('#focus-thread-inspector');
    const style = inspector ? getComputedStyle(inspector) : null;
    return document.body.dataset.threadInspectSurface &&
      document.body.dataset.threadInspectSurface !== 'idle' &&
      inspector &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0.05;
  }, undefined, { timeout: 12000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

async function enterRouteTraceByRealRoute(page) {
  await runVisibleSearch(page, 'coffee');
  await clickVisibleFirstSearchResult(page);
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const diagnostics = appState.routeTraceDiagnostics;
    return Boolean(
      document.body.dataset.activeView === 'galaxy' &&
      document.body.dataset.routeMotion &&
      document.body.dataset.routeMotion !== 'inactive' &&
      diagnostics?.active &&
      diagnostics.edgeCount > 0 &&
      diagnostics.segmentCount > 0 &&
      appState.routeTraceLines
    );
  }, undefined, { timeout: 12000 });
}

async function forceFocusedVisualState(page) {
  await page.evaluate(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    // Match both legacy .search-result-item and Svelte .search-result selectors
    const visibleRow = [...document.querySelectorAll('.search-result-item, .search-result')].find((candidate) => {
      const style = getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.05 &&
        rect.width > 0 &&
        rect.height > 0 &&
        Number.isFinite(Number(candidate.dataset.index));
    });
    const rowIndex = Number(visibleRow?.dataset.index);
    const focusedIndex = Number.isFinite(appState.navState?.focusedIndex)
      ? appState.navState.focusedIndex
      : Number.isFinite(appState.focusedNode)
        ? appState.focusedNode
        : Number.isFinite(appState.currentSearchSummary?.anchorIndex)
          ? appState.currentSearchSummary.anchorIndex
          : rowIndex;
    if (!Number.isFinite(focusedIndex)) {
      throw new Error('visual audit could not resolve a focused search result index');
    }
    if (!appState.navState) return;
    appState.navState.focusedIndex = focusedIndex;
    appState.navState.mode = 'focus';
    appState.focusedNode = focusedIndex;
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus';
    document.body.dataset.panelSurface = 'focus';
    document.body.dataset.panelSurfaceDetail = 'selected';
    document.body.dataset.journeyPhase = 'focus';
    document.body.dataset.focusOrigin = 'search-result';
    document.body.dataset.threadInspectSurface = 'idle';
    document.body.dataset.mobileSearchSheet = 'hidden';

    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.classList.remove('has-query', 'results-rendered', 'searching');
      searchContainer.style.display = 'none';
      searchContainer.setAttribute('aria-hidden', 'true');
    }

    const infoPanel = document.querySelector('#info-panel');
    if (infoPanel) {
      infoPanel.style.display = 'none';
      infoPanel.setAttribute('aria-hidden', 'true');
    }

    const focusStage = document.querySelector('#focus-stage');
    if (focusStage) {
      focusStage.hidden = false;
      focusStage.style.display = 'block';
      focusStage.setAttribute('aria-hidden', 'false');
      focusStage.classList.add('active');
    }
  });
  await markVisualRouteEvidence(page, 'forced-state', 'forced focused visual state fixture');
}

async function enterSemanticDive(page) {
  await enterFocusFromSearch(page);

  const diveButton = page.locator('#btn-focus-dive').first();
  if (await diveButton.isVisible().catch(() => false)) {
    const clicked = await diveButton.click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (clicked) await markVisualRouteEvidence(page, 'real-click', 'clicked #btn-focus-dive in visual audit');
  } else {
    const textButton = page.locator('button:has-text("Step Inside")').first();
    if (await textButton.isVisible().catch(() => false)) {
      const clicked = await textButton.click({ timeout: 5000 }).then(() => true).catch(() => false);
      if (clicked) await markVisualRouteEvidence(page, 'real-click', 'clicked Step Inside button in visual audit');
    }
  }

  const naturalDive = await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return appState.semanticDiveMode === true && document.body.dataset.panelSurface === 'semantic-dive';
  }, undefined, { timeout: 3500 }).then(() => true).catch(() => false);

  if (!naturalDive) {
    await page.evaluate(() => {
      const setSemanticDiveMode = window.__APP_ACTIONS__?.setSemanticDiveMode;
      const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
      const refreshCompositionState = window.__APP_ACTIONS__?.refreshCompositionState;
      if (typeof setSemanticDiveMode === 'function') {
        setSemanticDiveMode(true);
      } else if (typeof setTrailDepth === 'function') {
        setTrailDepth(2, { fromUserGesture: true, skipUrlSync: true });
      }
      refreshCompositionState?.();
      window.updateJourneyCompass?.();
    });
    await markVisualRouteEvidence(page, 'forced-state', 'forced semantic dive fallback in visual audit');
  }

  await page.waitForFunction(() => document.body.dataset.panelSurface === 'semantic-dive', undefined, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => (window.__APP_STATE__ ?? window.__TEST_STATE__)?.semanticDiveMode === true, undefined, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
}

async function applyPopulatedInfoPanelState(page) {
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return typeof window.__APP_ACTIONS__?.focusOnNode === 'function' && Array.isArray(appState.points) && appState.points.length > 0;
  }, undefined, { timeout: 20000 });

  await page.evaluate(() => {
    const focusNode = window.__APP_ACTIONS__?.focusOnNode;
    const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
    const refreshCompositionState = window.__APP_ACTIONS__?.refreshCompositionState;
    if (typeof focusNode !== 'function') {
      throw new Error('visual audit could not find APP_ACTIONS.focusOnNode for populated focus panel');
    }
    const focused = focusNode(0, { fromSearchResult: true, skipUrlSync: true }) === true;
    if (!focused) {
      throw new Error('visual audit could not focus node 0 for populated focus panel');
    }
    if (typeof setTrailDepth === 'function') {
      setTrailDepth(1, { skipUrlSync: true });
    }
    refreshCompositionState?.();
    window.updateJourneyCompass?.();

    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus';
    document.body.dataset.panelSurface = 'focus';
    document.body.dataset.panelSurfaceDetail = 'selected';
    document.body.dataset.journeyPhase = 'focus';
    const focusStage = document.querySelector('#focus-stage');
    if (focusStage) {
      focusStage.hidden = false;
      focusStage.setAttribute('aria-hidden', 'false');
      focusStage.classList.add('active');
    }
  });
  await markVisualRouteEvidence(page, 'app-action', 'APP_ACTIONS.focusOnNode(0) desktop populated focus-stage route');
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const card = document.querySelector('.focus-stage-card');
    const cardStyle = card ? getComputedStyle(card) : null;
    const focused = Number.isFinite(appState.focusedNode) || Number.isFinite(appState.navState?.focusedIndex);
    return focused &&
      document.body.dataset.panelSurface === 'focus' &&
      card &&
      !card.hidden &&
      cardStyle.display !== 'none' &&
      cardStyle.visibility !== 'hidden';
  }, undefined, { timeout: 15000 }).catch(() => {});
}

async function applyLoadingOverlayState(page) {
  await page.evaluate(() => {
    const overlay = document.querySelector('#loading-overlay');
    if (overlay) {
      overlay.classList.remove('hidden', 'launching');
      overlay.style.display = 'grid';
      overlay.style.visibility = 'visible';
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
      overlay.style.transition = 'none';
      overlay.setAttribute('aria-hidden', 'false');
      overlay.dataset.loadingPhase = 'scene';
    }

    document.body.dataset.loadingPhase = 'scene';

    const progressBar = document.querySelector('#loading-progress-bar');
    if (progressBar) progressBar.style.width = '62%';

    const note = document.querySelector('#loading-note');
    if (note) note.textContent = '8,406 Montgomery County business records woven into a living semantic field.';

    document.querySelectorAll('.loading-phase-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.getAttribute('data-loading-phase') === 'scene');
      chip.classList.toggle('is-complete', chip.getAttribute('data-loading-phase') === 'records');
    });

    const foot = document.querySelector('#loading-foot');
    if (foot) foot.textContent = 'Semantic scene is taking shape.';
  });
}

async function applyCompassRailState(page) {
  await page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'map';
    document.body.dataset.panelSurface = 'map-idle';
    document.body.dataset.mapContext = 'idle';
    document.body.dataset.routeExploration = 'free';

    const loadingOverlay = document.querySelector('#loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      loadingOverlay.style.display = 'none';
      loadingOverlay.setAttribute('aria-hidden', 'true');
    }

    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.classList.remove('has-query', 'results-rendered', 'searching');
    }

    const compass = document.querySelector('.journey-compass');
    if (compass) {
      compass.dataset.phase = 'map';
      compass.dataset.density = 'standard';
      compass.style.display = 'grid';
      compass.style.visibility = 'visible';
      compass.style.opacity = '1';
      compass.style.left = '12px';
      compass.style.right = '12px';
      compass.style.top = '76px';
      compass.style.width = 'auto';
      compass.style.minWidth = '0';
      compass.style.maxWidth = 'none';
      compass.style.height = 'auto';
      compass.style.minHeight = '0';
      compass.style.maxHeight = '136px';
      compass.style.transform = 'none';
      compass.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
      compass.style.gridTemplateAreas = '"copy actions" "rail rail"';
      compass.style.gap = '7px 8px';
      compass.style.padding = '8px 10px';
      compass.style.overflow = 'hidden';
      compass.style.pointerEvents = 'auto';
    }

    const copy = document.querySelector('.journey-compass-copy');
    if (copy) {
      copy.style.gridArea = 'copy';
      copy.style.minWidth = '0';
    }

    document.querySelectorAll('.journey-compass-step').forEach((step) => {
      const stepName = step.getAttribute('data-journey-step');
      const isCurrent = stepName === 'map';
      const isDone = ['overview', 'search', 'focus', 'inside'].includes(stepName || '');
      step.classList.toggle('current', isCurrent);
      step.classList.toggle('done', isDone);
      step.setAttribute('aria-current', isCurrent ? 'step' : 'false');
      step.style.display = 'grid';
      step.style.visibility = 'visible';
      step.style.minWidth = '0';
      step.style.width = 'auto';
      step.style.minHeight = '44px';
      step.style.padding = '0 3px';
      step.style.fontSize = '7.5px';
      step.style.lineHeight = '1.05';
      step.style.overflow = 'visible';
      step.style.pointerEvents = 'auto';
    });

    const rail = document.querySelector('.journey-compass-rail');
    if (rail) {
      rail.style.gridArea = 'rail';
      rail.style.display = 'grid';
      rail.style.visibility = 'visible';
      rail.style.width = '100%';
      rail.style.minWidth = '0';
      rail.style.height = '44px';
      rail.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
      rail.style.gap = '4px';
      rail.style.overflow = 'visible';
      rail.style.pointerEvents = 'auto';
    }

    const actions = document.querySelector('.journey-compass-actions');
    if (actions) {
      actions.style.display = 'flex';
      actions.style.visibility = 'visible';
      actions.style.gridArea = 'actions';
      actions.style.width = 'auto';
      actions.style.minWidth = '44px';
      actions.style.pointerEvents = 'auto';
    }

    const title = document.querySelector('#journey-compass-title, .journey-compass-title');
    if (title) {
      title.textContent = 'Map View';
      title.style.display = 'block';
      title.style.visibility = 'visible';
    }
    const note = document.querySelector('#journey-compass-note, .journey-compass-note');
    if (note) {
      note.textContent = 'The map rail keeps the journey steps visible.';
      note.style.display = 'none';
      note.style.visibility = 'hidden';
    }
    const kicker = document.querySelector('#journey-compass-kicker, .journey-compass-kicker');
    if (kicker) {
      kicker.style.display = 'block';
      kicker.style.visibility = 'visible';
    }
  });
}

async function applyModeGridVisibleState(page) {
  await page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'overview';
    document.body.dataset.panelSurface = 'idle';
    document.body.dataset.focusPanelMode = 'overview';
    document.body.dataset.threadInspectSurface = 'idle';

    const loadingOverlay = document.querySelector('#loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      loadingOverlay.style.display = 'none';
      loadingOverlay.setAttribute('aria-hidden', 'true');
    }

    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.classList.remove('has-query', 'results-rendered', 'searching', 'search-degraded');
      searchContainer.style.margin = '0';
      searchContainer.style.padding = '0';
    }
    document.querySelectorAll('#btn-launch, .stats-row, .stat-caption, .search-label, .search-input-wrapper, .search-hint, .semantic-lane-assist, .search-trail-cue').forEach((element) => {
      element.style.display = 'none';
      element.style.visibility = 'hidden';
      element.style.opacity = '0';
      element.setAttribute('aria-hidden', 'true');
    });
    const results = document.querySelector('#search-results');
    if (results) results.classList.remove('active');

    const demoStarters = document.querySelector('#demo-starters');
    if (demoStarters) {
      demoStarters.style.display = 'none';
      demoStarters.style.visibility = 'hidden';
      demoStarters.style.opacity = '0';
      demoStarters.setAttribute('aria-hidden', 'true');
    }

    const infoPanel = document.querySelector('#info-panel');
    if (infoPanel) {
      infoPanel.classList.add('active');
      infoPanel.style.display = 'block';
      infoPanel.style.visibility = 'visible';
      infoPanel.style.top = 'auto';
      infoPanel.style.bottom = '0';
      infoPanel.style.height = '320px';
      infoPanel.style.maxHeight = '320px';
    }

    const modeGrid = document.querySelector('#mode-grid');
    if (modeGrid) {
      modeGrid.style.display = 'grid';
      modeGrid.style.visibility = 'visible';
      modeGrid.style.opacity = '1';
    }

    document.querySelectorAll('.mode-chip').forEach((chip) => {
      const isDefault = chip.getAttribute('data-mode') === 'default';
      chip.classList.toggle('active', isDefault);
      chip.disabled = false;
      chip.setAttribute('aria-pressed', isDefault ? 'true' : 'false');
      chip.style.display = 'grid';
      chip.style.visibility = 'visible';
      chip.style.opacity = '1';
    });

    const infoContent = document.querySelector('.info-content');
    if (infoContent && modeGrid) {
      infoContent.style.maxHeight = '260px';
      infoContent.style.overflow = 'hidden';
      infoContent.scrollTop = 0;
    }
  });
}

async function run() {
  await ensureDir(outDir);
  const states = [];
  let ownedServer = null;

  try {
    const preflight = await preflightTargetServer(targetUrl);
    ownedServer = preflight.server || null;

    if (wantsAny([
      '01-mobile-idle',
      '02-mobile-search-coffee',
      '03-mobile-focus-first-result',
      '04-mobile-field-node-active',
      '05-mobile-map',
      '06-mobile-filters-open',
      '09-mobile-map-empty-state',
      '10-mobile-search-error-state',
      '11-mobile-selected-card-map-trail',
      '17-mobile-thread-inspector',
      '18-mobile-loading-overlay',
      '19-mobile-compass-rail',
      '20-mobile-mode-grid-visible',
      '21-mobile-route-trace-visible',
      '24-mobile-map-focus-search',
      '25-mobile-search-no-results',
    ])) {
      const browser = await chromium.launch(launchOptions);
      try {
        const mobilePage = await createAuditPage(browser, { viewport: mobile, deviceScaleFactor: 2, isMobile: true });

        if (wantsState('01-mobile-idle')) {
          await gotoReady(mobilePage, targetUrl);
          await captureMaybe(states, mobilePage, '01-mobile-idle');
        }

        if (wantsState('18-mobile-loading-overlay')) {
          await gotoReady(mobilePage, targetUrl);
          await captureMaybe(states, mobilePage, '18-mobile-loading-overlay');
        }

        if (wantsState('19-mobile-compass-rail')) {
          await gotoReady(mobilePage, targetUrl);
          await captureMaybe(states, mobilePage, '19-mobile-compass-rail');
        }

        if (wantsState('20-mobile-mode-grid-visible')) {
          await gotoReady(mobilePage, targetUrl);
          await captureMaybe(states, mobilePage, '20-mobile-mode-grid-visible');
        }

        if (wantsAny(['02-mobile-search-coffee', '03-mobile-focus-first-result', '04-mobile-field-node-active'])) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }));
          await captureMaybe(states, mobilePage, '02-mobile-search-coffee');

          if (wantsAny(['03-mobile-focus-first-result', '04-mobile-field-node-active'])) {
            await enterFocusFromSearch(mobilePage);
            await forceFocusedVisualState(mobilePage);
            await captureMaybe(states, mobilePage, '03-mobile-focus-first-result');
          }

          if (wantsState('04-mobile-field-node-active')) {
            await mobilePage.evaluate(() => {
              document.body.dataset.focusPanelMode = 'field-node';
              document.body.dataset.focusOrigin = 'field-node';
              document.body.dataset.graphContext = 'focus-search';
              document.body.dataset.panelSurface = 'focus-search';
              document.body.dataset.panelSurfaceDetail = document.body.dataset.mobileSearchSheet || 'peek';
              document.body.dataset.activeView = 'galaxy';
              document.body.dataset.fieldStepSync = 'active';
              if (typeof (window.__APP_ACTIONS__?.refreshCompositionState) === 'function') (window.__APP_ACTIONS__?.refreshCompositionState)();
              const focusStage = document.querySelector('#focus-stage');
              if (focusStage) {
                focusStage.hidden = false;
                focusStage.setAttribute('aria-hidden', 'false');
              }
            });
            await markVisualRouteEvidence(mobilePage, 'constructed-surface', 'visual audit field-node focus-search fixture');
            await mobilePage.waitForTimeout(300);
            await captureMaybe(states, mobilePage, '04-mobile-field-node-active');
          }
        }

        if (wantsState('05-mobile-map')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'map', q: 'coffee', anchor: '519' }));
          await captureMaybe(states, mobilePage, '05-mobile-map');
        }

        if (wantsState('06-mobile-filters-open')) {
          await gotoReady(mobilePage, targetUrl);
          await waitForReady(mobilePage, '06-mobile-filters-open:prepare');
          const clicked = await mobilePage.locator('#filters-section summary').click({ timeout: 5000 }).then(() => true).catch(() => false);
          if (clicked) await markVisualRouteEvidence(mobilePage, 'real-click', 'clicked filters summary in visual audit');
          await captureMaybe(states, mobilePage, '06-mobile-filters-open');
        }

        if (wantsState('09-mobile-map-empty-state')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'map' }));
          await mobilePage.locator('.map-empty-state').waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
          await captureMaybe(states, mobilePage, '09-mobile-map-empty-state');
        }

        if (wantsState('10-mobile-search-error-state')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy', q: 'semantic-error-proof' }));
          await waitForReady(mobilePage, '10-mobile-search-error-state:prepare');
          await mobilePage.evaluate(() => {
            document.body.dataset.laneState = 'degraded';
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer) searchContainer.dataset.laneState = 'degraded';
            const results = document.querySelector('#search-results');
            if (!results) return;
            results.classList.add('active');
            results.innerHTML = `
              <div class="search-error-state" role="alert">
                <span class="search-error-kicker">Connection Lost</span>
                <p class="search-error-text">Semantic lane unavailable. Retrying.</p>
                <div class="search-error-actions">
                  <button class="search-error-retry-btn" type="button">Retry</button>
                  <button class="search-error-dismiss-btn" type="button">Dismiss</button>
                </div>
              </div>`;
          });
          await markVisualRouteEvidence(mobilePage, 'constructed-surface', 'visual audit search error fixture');
          await captureMaybe(states, mobilePage, '10-mobile-search-error-state');
        }

        if (wantsState('25-mobile-search-no-results')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy', q: 'xj9k2l' }));
          await mobilePage.waitForFunction(() => {
            const status = document.querySelector('#search-status');
            const results = document.querySelector('#search-results');
            return Boolean(
              results?.classList.contains('active') &&
              document.querySelector('.search-empty-state') &&
              status?.textContent?.includes('No matching records found for "xj9k2l"')
            );
          }, undefined, { timeout: 15000 }).catch(() => {});
          await captureMaybe(states, mobilePage, '25-mobile-search-no-results');
        }

        if (wantsState('11-mobile-selected-card-map-trail')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'map', q: 'coffee', anchor: '519' }));
          await waitForReady(mobilePage, '11-mobile-selected-card-map-trail:prepare');
          await mobilePage.evaluate(() => {
            document.body.dataset.activeView = 'map';
            document.body.dataset.trailState = 'active';
            document.body.dataset.mapContext = 'focus';
          });
          await markVisualRouteEvidence(mobilePage, 'constructed-surface', 'visual audit map trail dataset fixture');
          await captureMaybe(states, mobilePage, '11-mobile-selected-card-map-trail');
        }

        if (wantsState('24-mobile-map-focus-search')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy' }));
          await waitForReady(mobilePage, '24-mobile-map-focus-search:prepare');
          await enterMapFocusSearchByRealRoute(mobilePage);
          await captureMaybe(states, mobilePage, '24-mobile-map-focus-search');
        }

        if (wantsState('21-mobile-route-trace-visible')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy' }));
          await waitForReady(mobilePage, '21-mobile-route-trace-visible:prepare');
          await enterRouteTraceByRealRoute(mobilePage);
          await mobilePage.evaluate(async () => {
            const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
            const t1 = appState.routeTraceLines?.material?.uniforms?.time?.value ?? null;
            await new Promise((resolve) => setTimeout(resolve, 300));
            const t2 = (window.__APP_STATE__ ?? window.__TEST_STATE__)?.routeTraceLines?.material?.uniforms?.time?.value ?? null;
            window.__routeTraceMotionProbe = {
              t1,
              t2,
              advanced: Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1,
            };
          });
          await captureMaybe(states, mobilePage, '21-mobile-route-trace-visible');
        }

        if (wantsState('17-mobile-thread-inspector')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy' }));
          await waitForReady(mobilePage, '17-mobile-thread-inspector:prepare');
          await enterThreadInspectorByRealRoute(mobilePage);
          await captureMaybe(states, mobilePage, '17-mobile-thread-inspector');
        }

        await mobilePage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsAny(['07-desktop-idle', '08-desktop-search-coffee', '11-desktop-selected-card-map-trail', '16-desktop-info-panel-populated'])) {
      const browser = await chromium.launch(launchOptions);
      try {
        const desktopPage = await createAuditPage(browser, { viewport: desktop });

        if (wantsState('07-desktop-idle')) {
          await gotoReady(desktopPage, targetUrl);
          await captureMaybe(states, desktopPage, '07-desktop-idle');
        }

        if (wantsState('08-desktop-search-coffee')) {
          await gotoReady(desktopPage, withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }));
          await captureMaybe(states, desktopPage, '08-desktop-search-coffee');
        }

        if (wantsState('11-desktop-selected-card-map-trail')) {
          await gotoReady(desktopPage, withParams(targetUrl, { view: 'map', q: 'coffee', anchor: '519' }));
          await waitForReady(desktopPage, '11-desktop-selected-card-map-trail:prepare');
          await desktopPage.evaluate(() => {
            document.body.dataset.activeView = 'map';
            document.body.dataset.trailState = 'active';
            document.body.dataset.mapContext = 'focus';
          });
          await markVisualRouteEvidence(desktopPage, 'constructed-surface', 'visual audit desktop map trail dataset fixture');
          await captureMaybe(states, desktopPage, '11-desktop-selected-card-map-trail');
        }

        if (wantsState('16-desktop-info-panel-populated')) {
          await gotoReady(desktopPage, targetUrl);
          await waitForReady(desktopPage, '16-desktop-info-panel-populated:prepare');
          await applyPopulatedInfoPanelState(desktopPage);
          await desktopPage.waitForTimeout(300);
          await applyPopulatedInfoPanelState(desktopPage);
          await captureMaybe(states, desktopPage, '16-desktop-info-panel-populated');
        }

        await desktopPage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsAny(['13-desktop-filters-open', '14-desktop-search-error'])) {
      const browser = await chromium.launch(launchOptions);
      try {
        const desktopPage = await createAuditPage(browser, { viewport: desktop });

        if (wantsState('13-desktop-filters-open')) {
          await gotoReady(desktopPage, targetUrl);
          await waitForReady(desktopPage, '13-desktop-filters-open:prepare');
          await markVisualRouteEvidence(desktopPage, 'constructed-surface', 'desktop filters are mobile-only; capture hidden desktop diagnostic without clicking summary');
          await captureMaybe(states, desktopPage, '13-desktop-filters-open');
        }

        if (wantsState('14-desktop-search-error')) {
          await gotoReady(desktopPage, withParams(targetUrl, { view: 'galaxy', q: 'semantic-error-proof' }));
          await waitForReady(desktopPage, '14-desktop-search-error:prepare');
          await desktopPage.evaluate(() => {
            document.body.dataset.laneState = 'degraded';
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer) searchContainer.dataset.laneState = 'degraded';
            const results = document.querySelector('#search-results');
            if (!results) return;
            results.classList.add('active');
            results.innerHTML = `
              <div class="search-error-state" role="alert">
                <span class="search-error-kicker">Connection Lost</span>
                <p class="search-error-text">Semantic lane unavailable. Retrying.</p>
                <div class="search-error-actions">
                  <button class="search-error-retry-btn" type="button">Retry</button>
                  <button class="search-error-dismiss-btn" type="button">Dismiss</button>
                </div>
              </div>`;
          });
          await markVisualRouteEvidence(desktopPage, 'constructed-surface', 'visual audit desktop search error fixture');
          await captureMaybe(states, desktopPage, '14-desktop-search-error');
        }

        await desktopPage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsState('12-desktop-reduced-motion')) {
      const browser = await chromium.launch(launchOptions);
      try {
        const reducedPage = await createAuditPage(browser, { viewport: desktop });
        await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
        await gotoReady(reducedPage, targetUrl);
        await captureMaybe(states, reducedPage, '12-desktop-reduced-motion');
        await reducedPage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsState('13-mobile-reduced-motion')) {
      const browser = await chromium.launch(launchOptions);
      try {
        const reducedPage = await createAuditPage(browser, { viewport: mobile, deviceScaleFactor: 2, isMobile: true });
        await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
        await gotoReady(reducedPage, targetUrl);
        await captureMaybe(states, reducedPage, '13-mobile-reduced-motion');
        await reducedPage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsState('15-mobile-semantic-dive')) {
      const browser = await chromium.launch(launchOptions);
      try {
        const divePage = await createAuditPage(browser, { viewport: mobile, deviceScaleFactor: 2, isMobile: true });
        await divePage.goto(withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }), { waitUntil: 'commit', timeout: 10000 });
        // Wait for scene to be interactive
        await divePage.waitForFunction(() => {
          const canvas = document.querySelector('#canvas-container canvas');
          return canvas && document.body.dataset.graphicsMode === 'webgl';
        }, undefined, { timeout: 8000 }).catch((err) => {
          if (requireWebgl) throw err;
        });
        await divePage.waitForTimeout(2200);

        await enterSemanticDive(divePage);

        // Capture the dive state after the app has reached semantic-dive body state.
        const captured = await captureState(divePage, '15-mobile-semantic-dive');
        if (captured) states.push(captured);
        await divePage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsState('22-mobile-semantic-dive-320')) {
      const browser = await chromium.launch(launchOptions);
      try {
        const divePage = await createAuditPage(browser, { viewport: mobile320, deviceScaleFactor: 2, isMobile: true });
        await divePage.goto(withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }), { waitUntil: 'commit', timeout: 10000 });
        await divePage.waitForFunction(() => {
          const canvas = document.querySelector('#canvas-container canvas');
          return canvas && document.body.dataset.graphicsMode === 'webgl';
        }, undefined, { timeout: 8000 }).catch((err) => {
          if (requireWebgl) throw err;
        });
        await divePage.waitForTimeout(2200);

        await runVisibleSearch(divePage, 'coffee');
        await clickVisibleFirstSearchResult(divePage);
        await enterSemanticDiveViaVisibleControl(divePage);

        const captured = await captureState(divePage, '22-mobile-semantic-dive-320');
        if (captured) states.push(captured);
        await divePage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsState('23-mobile-short-landscape')) {
      const browser = await chromium.launch(launchOptions);
      try {
        const slPage = await createAuditPage(browser, { viewport: shortLandscape, deviceScaleFactor: 2, isMobile: true });
        await gotoReady(slPage, withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }));

        await waitForReady(slPage, '23-mobile-short-landscape:prepare');
        await enterFocusFromSearch(slPage);
        await captureMaybe(states, slPage, '23-mobile-short-landscape');
        await slPage.close();
      } finally {
        await browser.close();
      }
    }
  } catch (err) {
    console.error('Run failed:', err);
    throw err;
  } finally {
    await closeServer(ownedServer);
  }

  const summary = states.map(({ name, data }) => ({
    name,
    url: data.url,
    bodyDataset: data.bodyDataset,
    scroll: data.scroll,
    boxes: data.boxes,
    journeyActions: data.journeyActions,
    mapStrip: data.mapStrip,
    loadingOverlayDiagnostics: data.loadingOverlayDiagnostics,
    compassRailDiagnostics: data.compassRailDiagnostics,
    modeGridDiagnostics: data.modeGridDiagnostics,
    demoStarterDiagnostics: data.demoStarterDiagnostics,
    routeTraceDiagnostics: data.routeTraceDiagnostics,
    inspectedStrandDiagnostics: data.inspectedStrandDiagnostics,
    routeEvidence: data.routeEvidence,
    sceneLuminance: data.sceneLuminance,
    surfaceOverlapDiagnostics: data.surfaceOverlapDiagnostics,
    clusterLabelDiagnostics: data.clusterLabelDiagnostics,
  }));

  await fs.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const routeEvidenceSummary = summary.map((state) => ({
    name: state.name,
    source: state.routeEvidence?.source || 'missing',
    proofLane: state.routeEvidence?.proofLane || 'missing',
    detail: state.routeEvidence?.detail || '',
    history: state.routeEvidence?.history || [],
  }));
  await fs.writeFile(path.join(outDir, 'route-evidence-summary.json'), `${JSON.stringify(routeEvidenceSummary, null, 2)}\n`, 'utf8');

  const assertions = [];
  const stateByName = new Map(summary.map((state) => [state.name, state]));
  const pass = (name, check) => assertions.push({ level: 'pass', name, check });
  const fail = (name, check, msg) => assertions.push({ level: 'fail', name, check, msg });
  const box = (state, selector) => state?.boxes?.[selector];
  const isRendered = (b) => b && b.display !== 'none' && b.visibility !== 'hidden' && Number(b.opacity) > 0.05 && b.pointerEvents !== 'none';
  const isVisible = (b) => b && b.display !== 'none' && b.visibility !== 'hidden' && Number(b.opacity) > 0.05;
  const isMobileState = (state) => state?.name?.includes('-mobile-');
  const viewportFor = (state) => {
    const name = state?.name ?? '';
    if (name.includes('-desktop-')) return desktop;
    if (name.includes('-short-landscape')) return shortLandscape;
    if (name.includes('-semantic-dive-320')) return mobile320;
    return mobile;
  };
  const withinViewport = (b, viewport, tolerance = 1) => (
    b.x >= -tolerance &&
    b.y >= -tolerance &&
    b.x + b.width <= viewport.width + tolerance &&
    b.y + b.height <= viewport.height + tolerance
  );
  const rectsOverlap = (a, b, tolerance = 0) => !(
    a.x + a.width <= b.x + tolerance ||
    b.x + b.width <= a.x + tolerance ||
    a.y + a.height <= b.y + tolerance ||
    b.y + b.height <= a.y + tolerance
  );
  const touchTargetOk = (b) => b && b.width >= 43.5 && b.height >= 43.5;
  const expectedCompactJourneyLabel = (action) => ({
    'center-anchor': 'Center',
    'next-stop': 'Next',
    'open-map': 'Map',
    'search-field': 'Search',
    'focus-search': 'Search',
    'enter-inside': 'Inside',
    'open-mycelium': 'Mycelium',
    'county-overview': 'County',
    'show-trail-panel': 'Trail',
  })[action] || '';
  const assertMapTrailTitleOnly = (state) => {
    const strip = state.mapStrip || { exists: false };
    const navOwner = state.bodyDataset?.journeyNavigationOwner || '';
    const view = state.bodyDataset?.activeView || '';
    const shouldBeVisible = navOwner === 'map-trail-strip' && view === 'map';
    const stripBox = strip.exists ? box(state, '.map-trail-strip') : null;

    if (!shouldBeVisible) {
      const isHidden = !strip.exists
        || !stripBox
        || stripBox.width === 0
        || stripBox.height === 0;
      if (isHidden) pass(state.name, 'map-strip:hidden-when-not-owner');
      else fail(state.name, 'map-strip:hidden-when-not-owner',
        `map-trail-strip should be hidden when navOwner="${navOwner}" view="${view}", got box=${JSON.stringify(stripBox)}`);
      return;
    }

    if (!stripBox || stripBox.width === 0 || stripBox.height === 0) {
      fail(state.name, 'map-strip:visible-when-owner',
        `map-trail-strip should be rendered when navOwner=map-trail-strip view=map, got ${JSON.stringify(stripBox)}`);
      return;
    }

    if (stripBox.y < 200) pass(state.name, 'map-strip:top-position');
    else fail(state.name, 'map-strip:top-position', `map-trail-strip y=${stripBox.y} should be < 200`);

    if (strip.buttonCount === 0) pass(state.name, 'map-strip:no-trail-strip-buttons');
    else fail(state.name, 'map-strip:no-trail-strip-buttons',
      `map-trail-strip should have 0 .trail-strip-btn (removed in D36), got ${strip.buttonCount}`);

    if (strip.childCount === 1 && strip.titleCount === 1) pass(state.name, 'map-strip:exactly-one-title-child');
    else fail(state.name, 'map-strip:exactly-one-title-child',
      `map-trail-strip should have exactly 1 .map-strip-title child, got ${strip.childCount} children, ${strip.titleCount} title(s)`);

    if (strip.titleCount !== 1) return;

    if (strip.titleText && strip.titleText.length > 0) pass(state.name, 'map-strip:title-has-content');
    else fail(state.name, 'map-strip:title-has-content', `map-strip-title should have non-empty text, got "${strip.titleText}"`);

    if (strip.titleAttr === strip.titleText) pass(state.name, 'map-strip:title-attr-matches-text');
    else fail(state.name, 'map-strip:title-attr-matches-text',
      `map-strip-title title attribute should match text, got title="${strip.titleAttr}" text="${strip.titleText}"`);

    if (strip.ariaLabel === strip.titleText) pass(state.name, 'map-strip:aria-label-matches-text');
    else fail(state.name, 'map-strip:aria-label-matches-text',
      `map-strip-title aria-label should match text, got aria-label="${strip.ariaLabel}" text="${strip.titleText}"`);

    if (strip.titleScrollWidth <= strip.titleClientWidth + 1) pass(state.name, 'map-strip:title-not-clipped');
    else fail(state.name, 'map-strip:title-not-clipped',
      `map-strip-title text is clipped: scrollWidth=${strip.titleScrollWidth} clientWidth=${strip.titleClientWidth} text="${strip.titleText}"`);
  };
  const isRenderedAction = (action) => (
    action?.action &&
    isRendered(action.rect) &&
    !action.hidden &&
    !action.disabled
  );
  const cssTimeToMs = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return Number.NaN;
    if (normalized.endsWith('ms')) return Number.parseFloat(normalized);
    if (normalized.endsWith('s')) return Number.parseFloat(normalized) * 1000;
    return Number.parseFloat(normalized);
  };
  const cssTimeListToMs = (value) => String(value || '').split(',').map(cssTimeToMs).filter(Number.isFinite);
  const requireState = (name) => {
    const state = stateByName.get(name);
    if (!state) fail(name, 'state-present', 'state was not captured');
    return state;
  };
  const requireRendered = (name, check, selector) => {
    const state = requireState(name);
    const targetBox = box(state, selector);
    if (!targetBox) {
      fail(name, check, `missing selector: ${selector}`);
      return null;
    }
    if (!isRendered(targetBox)) {
      fail(name, check, `not displayed: ${selector}`);
      return null;
    }
    pass(name, check);
    return targetBox;
  };
  for (const state of summary) {
    const diagnostics = state.surfaceOverlapDiagnostics || {};
    const unexpected = diagnostics.unexpected || [];
    if (unexpected.length === 0) {
      pass(state.name, 'surface-overlap-matrix:no-unexpected-overlap');
    } else {
      fail(
        state.name,
        'surface-overlap-matrix:no-unexpected-overlap',
        JSON.stringify(unexpected.slice(0, 5)),
      );
    }
  }
  const requireVisible = (name, check, selector) => {
    const state = requireState(name);
    const targetBox = box(state, selector);
    if (!targetBox) {
      fail(name, check, `missing selector: ${selector}`);
      return null;
    }
    if (!isVisible(targetBox)) {
      fail(name, check, `not visible: ${selector}`);
      return null;
    }
    pass(name, check);
    return targetBox;
  };

  const constructedSurfaceStates = new Set([
    '03-mobile-focus-first-result',
    '04-mobile-field-node-active',
    '10-mobile-search-error-state',
    '11-mobile-selected-card-map-trail',
    '11-desktop-selected-card-map-trail',
    '14-desktop-search-error',
    '15-mobile-semantic-dive',
    '16-desktop-info-panel-populated',
    '18-mobile-loading-overlay',
    '19-mobile-compass-rail',
    '20-mobile-mode-grid-visible',
    '23-mobile-short-landscape',
  ]);

  for (const state of summary) {
    const evidence = state.routeEvidence || {};
    if (evidence.source && evidence.detail && evidence.proofLane) {
      pass(state.name, 'route-evidence:present');
    } else {
      fail(state.name, 'route-evidence:present', `missing route evidence: ${JSON.stringify(evidence)}`);
    }
    if (constructedSurfaceStates.has(state.name)) {
      if (evidence.proofLane === 'constructed-surface') {
        pass(state.name, 'route-evidence:constructed-surface-labeled');
      } else {
        fail(state.name, 'route-evidence:constructed-surface-labeled', `expected constructed-surface proof lane, got ${evidence.proofLane || 'missing'}`);
      }
    }
  }

  for (const state of summary) {
    const visibleCompactActions = (state.journeyActions || []).filter((action) =>
      isRenderedAction(action) && action.compactLabel
    );
    const compactMismatches = visibleCompactActions
      .map((action) => ({
        id: action.id,
        action: action.action,
        text: action.text,
        compactLabel: action.compactLabel,
        expected: expectedCompactJourneyLabel(action.action),
      }))
      .filter((action) => action.expected && action.compactLabel !== action.expected);
    if (compactMismatches.length === 0) {
      pass(state.name, 'compact-actions:semantic-labels');
    } else {
      fail(state.name, 'compact-actions:semantic-labels', JSON.stringify(compactMismatches));
    }

    assertMapTrailTitleOnly(state);
  }

  for (const state of summary) {
    if (state.scroll.overflowX > 0) {
      fail(state.name, 'no-overflow-x', `horizontal overflow ${state.scroll.overflowX}px`);
    } else {
      pass(state.name, 'no-overflow-x');
    }
    if (state.scroll.overflowY > 0) {
      fail(state.name, 'no-overflow-y', `vertical overflow ${state.scroll.overflowY}px`);
    } else {
      pass(state.name, 'no-overflow-y');
    }
  }

  const mobileSurfaceLimits = new Map([
    ['.journey-compass', 0.24],
    ['.search-container', 0.58],
    ['#info-panel', 0.72],
    ['.selected-card', 0.58],
    ['.focus-stage-card', 0.62],
    ['.map-trail-strip', 0.2],
    ['.map-empty-state', 0.3],
  ]);

  for (const state of summary.filter(isMobileState)) {
    const viewport = viewportFor(state);
    const loadingOverlay = box(state, '#loading-overlay');
    const allowsLoadingOverlay = state.name === '18-mobile-loading-overlay';
    if (!allowsLoadingOverlay) {
      if (state.bodyDataset?.loadingOverlay === 'active' || isVisible(loadingOverlay)) {
        fail(state.name, 'visual-settle:loading-overlay-hidden', 'loading overlay is still active over a non-loading visual state');
      } else {
        pass(state.name, 'visual-settle:loading-overlay-hidden');
      }
    }

    for (const [selector, maxHeightRatio] of mobileSurfaceLimits.entries()) {
      const targetBox = box(state, selector);
      if (!isRendered(targetBox)) continue;

      if (withinViewport(targetBox, viewport)) {
        pass(state.name, `surface-fit:${selector}:within-viewport`);
      } else {
        fail(
          state.name,
          `surface-fit:${selector}:within-viewport`,
          `${selector} extends outside ${viewport.width}x${viewport.height}: ${Math.round(targetBox.x)},${Math.round(targetBox.y)} ${Math.round(targetBox.width)}x${Math.round(targetBox.height)}`,
        );
      }

      const heightRatio = targetBox.height / viewport.height;
      if (heightRatio <= maxHeightRatio) {
        pass(state.name, `surface-proportion:${selector}:height`);
      } else {
        fail(
          state.name,
          `surface-proportion:${selector}:height`,
          `${selector} height ratio ${heightRatio.toFixed(3)} exceeds ${maxHeightRatio}`,
        );
      }
    }

    const compass = box(state, '.journey-compass');
    const lowerSurfaces = ['#info-panel', '.search-container', '.selected-card', '.focus-stage-card', '.map-trail-strip'];
    if (isRendered(compass)) {
      if (!allowsLoadingOverlay && String(compass.topElement || '').startsWith('#loading-overlay')) {
        fail(state.name, 'visual-settle:.journey-compass-not-covered', '.journey-compass center is covered by the loading overlay');
      } else {
        pass(state.name, 'visual-settle:.journey-compass-not-covered');
      }
      for (const selector of lowerSurfaces) {
        const targetBox = box(state, selector);
        if (!isRendered(targetBox)) continue;
        if (!allowsLoadingOverlay && String(targetBox.topElement || '').startsWith('#loading-overlay')) {
          fail(state.name, `visual-settle:${selector}-not-covered`, `${selector} center is covered by the loading overlay`);
        } else {
          pass(state.name, `visual-settle:${selector}-not-covered`);
        }
        if (rectsOverlap(compass, targetBox, 4)) {
          fail(state.name, `surface-overlap:.journey-compass:${selector}`, '.journey-compass overlaps lower panel surface');
        } else {
          pass(state.name, `surface-overlap:.journey-compass:${selector}`);
        }
      }
    }
  }

  // 09-mobile-map-empty-state assertions now live in the state-verification block

  if (shouldAssert('17-mobile-thread-inspector')) {
    const inspectorState = requireState('17-mobile-thread-inspector');
    const strandDiagnostics = inspectorState?.inspectedStrandDiagnostics || {};
    const focusStage = box(inspectorState, '#focus-stage');
    const focusStageCard = requireRendered('17-mobile-thread-inspector', 'thread-inspector:focus-stage-card-visible', '.focus-stage-card');
    const inspector = requireRendered('17-mobile-thread-inspector', 'thread-inspector:panel-visible', '#focus-thread-inspector');
    const title = requireRendered('17-mobile-thread-inspector', 'thread-inspector:title-visible', '#focus-thread-inspector-title');
    const copy = requireRendered('17-mobile-thread-inspector', 'thread-inspector:copy-visible', '#focus-thread-inspector-copy');
    const meta = requireRendered('17-mobile-thread-inspector', 'thread-inspector:meta-visible', '#focus-thread-inspector-meta');
    const pinBtn = requireRendered('17-mobile-thread-inspector', 'thread-inspector:pin-visible', '#btn-thread-pin');
    const followBtn = requireRendered('17-mobile-thread-inspector', 'thread-inspector:follow-visible', '#btn-thread-follow');
    const clearBtn = requireRendered('17-mobile-thread-inspector', 'thread-inspector:clear-visible', '#btn-thread-clear');
    const searchContainer = box(inspectorState, '.search-container');
    const diveButton = box(inspectorState, '.focus-stage-dive-btn');
    const nearbyStops = box(inspectorState, '.focus-stage-neighbors');
    const routeEvidence = inspectorState.routeEvidence || {};

    if (inspectorState?.bodyDataset?.threadInspectSurface && inspectorState.bodyDataset.threadInspectSurface !== 'idle') {
      pass('17-mobile-thread-inspector', 'thread-inspector:surface-state');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:surface-state', `expected active threadInspectSurface, got "${inspectorState?.bodyDataset?.threadInspectSurface || ''}"`);
    }
    if (routeEvidence.proofLane === 'real-route' && routeEvidence.source === 'real-click') {
      pass('17-mobile-thread-inspector', 'thread-inspector:real-route');
    } else {
      fail(
        '17-mobile-thread-inspector',
        'thread-inspector:real-route',
        `expected real click route evidence, got ${JSON.stringify(routeEvidence)}`,
      );
    }

    if (isVisible(focusStage)) {
      pass('17-mobile-thread-inspector', 'thread-inspector:focus-stage-visible');
    } else if (focusStage) {
      fail('17-mobile-thread-inspector', 'thread-inspector:focus-stage-visible', '#focus-stage is not visible');
    }

    const viewport = viewportFor(inspectorState);
    if (inspector && withinViewport(inspector, viewport)) {
      pass('17-mobile-thread-inspector', 'thread-inspector:within-viewport');
    } else if (inspector) {
      fail('17-mobile-thread-inspector', 'thread-inspector:within-viewport', '#focus-thread-inspector extends outside mobile viewport');
    }

    if (focusStage && withinViewport(focusStage, viewport)) {
      pass('17-mobile-thread-inspector', 'thread-inspector:focus-stage-within-viewport');
    } else if (focusStage) {
      fail('17-mobile-thread-inspector', 'thread-inspector:focus-stage-within-viewport', '#focus-stage extends outside mobile viewport');
    }
    if (focusStageCard && withinViewport(focusStageCard, viewport)) {
      pass('17-mobile-thread-inspector', 'thread-inspector:focus-stage-card-within-viewport');
    } else if (focusStageCard) {
      fail('17-mobile-thread-inspector', 'thread-inspector:focus-stage-card-within-viewport', '.focus-stage-card extends outside mobile viewport');
    }
    if (inspector?.centerTopInside) {
      pass('17-mobile-thread-inspector', 'thread-inspector:not-occluded');
    } else if (inspector) {
      fail('17-mobile-thread-inspector', 'thread-inspector:not-occluded', `inspector center is covered by ${inspector.topElement || 'nothing'}`);
    }
    if (!isRendered(searchContainer)) {
      pass('17-mobile-thread-inspector', 'thread-inspector:search-container-hidden');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:search-container-hidden', `.search-container should not duplicate focus context in active preview, got ${JSON.stringify(searchContainer)}`);
    }
    if (!isRendered(diveButton)) {
      pass('17-mobile-thread-inspector', 'thread-inspector:step-inside-hidden');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:step-inside-hidden', `.focus-stage-dive-btn should not compete with thread actions, got ${JSON.stringify(diveButton)}`);
    }
    if (isVisible(nearbyStops) && nearbyStops.height < 40) {
      fail('17-mobile-thread-inspector', 'thread-inspector:nearby-stops-not-squeezed', `.focus-stage-neighbors is squeezed to ${Math.round(nearbyStops.height)}px`);
    } else {
      pass('17-mobile-thread-inspector', 'thread-inspector:nearby-stops-not-squeezed');
    }

    if (title?.text?.includes(' -> ')) {
      pass('17-mobile-thread-inspector', 'thread-inspector:title-copy');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:title-copy', 'thread inspector title does not include a real relationship arrow');
    }
    if ((copy?.text || '').length >= 24) {
      pass('17-mobile-thread-inspector', 'thread-inspector:body-copy');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:body-copy', 'thread inspector body copy is empty or too short');
    }
    if ((meta?.text || '').toLowerCase().includes('relationship')) {
      pass('17-mobile-thread-inspector', 'thread-inspector:meta-copy');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:meta-copy', 'thread inspector meta does not include relationship source text');
    }

    if (strandDiagnostics.active === true) {
      pass('17-mobile-thread-inspector', 'thread-inspector:strand-active');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:strand-active', `inspectedStrandDiagnostics.active=${strandDiagnostics.active}`);
    }
    if ((strandDiagnostics.segmentCount || 0) > 0) {
      pass('17-mobile-thread-inspector', 'thread-inspector:strand-segments');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:strand-segments', `segmentCount=${strandDiagnostics.segmentCount || 0}`);
    }
    if ((strandDiagnostics.braidCount || 0) > 0) {
      pass('17-mobile-thread-inspector', 'thread-inspector:strand-braids');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:strand-braids', `braidCount=${strandDiagnostics.braidCount || 0}`);
    }
    if ((strandDiagnostics.endpointCount || 0) >= 2) {
      pass('17-mobile-thread-inspector', 'thread-inspector:strand-endpoints');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:strand-endpoints', `endpointCount=${strandDiagnostics.endpointCount || 0}`);
    }

    for (const [label, targetBox] of [
      ['pin', pinBtn],
      ['follow', followBtn],
      ['clear', clearBtn],
    ]) {
      if (touchTargetOk(targetBox)) {
        pass('17-mobile-thread-inspector', `thread-inspector:${label}-touch-target`);
      } else if (targetBox) {
        fail('17-mobile-thread-inspector', `thread-inspector:${label}-touch-target`, `${label} button is ${Math.round(targetBox.width)}x${Math.round(targetBox.height)}px`);
      }
    }
  }

  if (shouldAssert('21-mobile-route-trace-visible')) {
    const routeState = requireState('21-mobile-route-trace-visible');
    const diagnostics = routeState?.routeTraceDiagnostics || {};
    const routeEvidence = routeState?.routeEvidence || {};

    if (routeEvidence.proofLane === 'real-route' && routeEvidence.source === 'real-click') {
      pass('21-mobile-route-trace-visible', 'route-trace:real-route');
    } else {
      fail(
        '21-mobile-route-trace-visible',
        'route-trace:real-route',
        `expected real click route evidence, got ${JSON.stringify(routeEvidence)}`,
      );
    }
    if (diagnostics.active === true) {
      pass('21-mobile-route-trace-visible', 'route-trace:diagnostics-active');
    } else {
      fail('21-mobile-route-trace-visible', 'route-trace:diagnostics-active', `routeTraceDiagnostics.active=${diagnostics.active}; reason=${diagnostics.reason || 'none'}`);
    }
    if ((diagnostics.edgeCount || 0) > 0) {
      pass('21-mobile-route-trace-visible', 'route-trace:edge-count');
    } else {
      fail('21-mobile-route-trace-visible', 'route-trace:edge-count', `edgeCount=${diagnostics.edgeCount || 0}`);
    }
    if ((diagnostics.segmentCount || diagnostics.lineSegmentCount || 0) > 0) {
      pass('21-mobile-route-trace-visible', 'route-trace:segment-count');
    } else {
      fail('21-mobile-route-trace-visible', 'route-trace:segment-count', `segmentCount=${diagnostics.segmentCount || 0}, lineSegmentCount=${diagnostics.lineSegmentCount || 0}`);
    }
    if (diagnostics.linePresent === true) {
      pass('21-mobile-route-trace-visible', 'route-trace:line-present');
    } else {
      fail('21-mobile-route-trace-visible', 'route-trace:line-present', 'state.routeTraceLines is not present');
    }
    if (routeState?.bodyDataset?.routeMotion && routeState.bodyDataset.routeMotion !== 'inactive') {
      pass('21-mobile-route-trace-visible', 'route-trace:route-motion-active');
    } else {
      fail('21-mobile-route-trace-visible', 'route-trace:route-motion-active', `routeMotion=${routeState?.bodyDataset?.routeMotion || ''}`);
    }
    if (diagnostics.motionProbe?.advanced === true) {
      pass('21-mobile-route-trace-visible', 'route-trace:shader-time-advances');
    } else {
      fail(
        '21-mobile-route-trace-visible',
        'route-trace:shader-time-advances',
        `time did not advance: ${diagnostics.motionProbe?.t1 ?? 'null'} -> ${diagnostics.motionProbe?.t2 ?? 'null'}`,
      );
    }
  }

  if (shouldAssert('18-mobile-loading-overlay')) {
    const loadingState = requireState('18-mobile-loading-overlay');
    const overlay = requireRendered('18-mobile-loading-overlay', 'loading-overlay:overlay-visible', '#loading-overlay');
    const shell = requireRendered('18-mobile-loading-overlay', 'loading-overlay:shell-visible', '.loading-shell');
    const kicker = requireRendered('18-mobile-loading-overlay', 'loading-overlay:kicker-visible', '.loading-kicker');
    const title = requireRendered('18-mobile-loading-overlay', 'loading-overlay:title-visible', '.loading-title');
    const note = requireRendered('18-mobile-loading-overlay', 'loading-overlay:note-visible', '.loading-note');
    const progress = requireRendered('18-mobile-loading-overlay', 'loading-overlay:progress-visible', '.loading-progress');
    const progressBar = requireRendered('18-mobile-loading-overlay', 'loading-overlay:progress-bar-visible', '#loading-progress-bar');
    const phaseRow = requireRendered('18-mobile-loading-overlay', 'loading-overlay:phase-row-visible', '#loading-phase-row');
    const phaseChip = requireRendered('18-mobile-loading-overlay', 'loading-overlay:phase-chip-visible', '.loading-phase-chip');
    const foot = requireRendered('18-mobile-loading-overlay', 'loading-overlay:foot-visible', '#loading-foot');

    const viewport = viewportFor(loadingState);
    if (shell && withinViewport(shell, viewport)) {
      pass('18-mobile-loading-overlay', 'loading-overlay:shell-within-viewport');
    } else if (shell) {
      fail('18-mobile-loading-overlay', 'loading-overlay:shell-within-viewport', '.loading-shell extends outside mobile viewport');
    }
    if (Number.parseInt(overlay?.zIndex || '0', 10) >= 999) {
      pass('18-mobile-loading-overlay', 'loading-overlay:overlay-layer');
    } else if (overlay) {
      fail('18-mobile-loading-overlay', 'loading-overlay:overlay-layer', `expected overlay z-index >= 999, got ${overlay.zIndex || 'missing'}`);
    }
    if ((loadingState?.loadingOverlayDiagnostics?.phaseChipsCount || 0) >= 4) {
      pass('18-mobile-loading-overlay', 'loading-overlay:phase-chip-count');
    } else {
      fail('18-mobile-loading-overlay', 'loading-overlay:phase-chip-count', `expected >=4 phase chips, got ${loadingState?.loadingOverlayDiagnostics?.phaseChipsCount || 0}`);
    }
    if ((loadingState?.loadingOverlayDiagnostics?.activePhaseCount || 0) === 1) {
      pass('18-mobile-loading-overlay', 'loading-overlay:single-active-phase');
    } else {
      fail('18-mobile-loading-overlay', 'loading-overlay:single-active-phase', `expected one active phase, got ${loadingState?.loadingOverlayDiagnostics?.activePhaseCount || 0}`);
    }
    if (title?.text?.includes('Growing the mycelium')) {
      pass('18-mobile-loading-overlay', 'loading-overlay:title-copy');
    } else {
      fail('18-mobile-loading-overlay', 'loading-overlay:title-copy', 'loading title does not include expected copy');
    }
    if (note?.text?.includes('Montgomery County business records')) {
      pass('18-mobile-loading-overlay', 'loading-overlay:note-copy');
    } else {
      fail('18-mobile-loading-overlay', 'loading-overlay:note-copy', 'loading note does not include expected county-records copy');
    }
    if (foot?.text?.includes('Semantic scene')) {
      pass('18-mobile-loading-overlay', 'loading-overlay:foot-copy');
    } else {
      fail('18-mobile-loading-overlay', 'loading-overlay:foot-copy', 'loading foot does not include expected fixture copy');
    }
    for (const [label, targetBox] of [
      ['kicker', kicker],
      ['title', title],
      ['note', note],
      ['progress', progress],
      ['progress-bar', progressBar],
      ['phase-row', phaseRow],
      ['phase-chip', phaseChip],
    ]) {
      if (targetBox && targetBox.width > 0 && targetBox.height > 0) {
        pass('18-mobile-loading-overlay', `loading-overlay:${label}-has-area`);
      } else if (targetBox) {
        fail('18-mobile-loading-overlay', `loading-overlay:${label}-has-area`, `${label} has no measurable area`);
      }
    }
  }

  if (shouldAssert('19-mobile-compass-rail')) {
    const compassState = requireState('19-mobile-compass-rail');
    const compass = requireVisible('19-mobile-compass-rail', 'compass-rail:compass-visible', '.journey-compass');
    const rail = requireVisible('19-mobile-compass-rail', 'compass-rail:rail-visible', '.journey-compass-rail');
    const step = requireVisible('19-mobile-compass-rail', 'compass-rail:step-visible', '.journey-compass-step');
    const kicker = box(compassState, '.journey-compass-kicker');
    const title = requireVisible('19-mobile-compass-rail', 'compass-rail:title-visible', '.journey-compass-title');
    const note = box(compassState, '.journey-compass-note');
    const infoPanel = box(compassState, '#info-panel');
    requireRendered('19-mobile-compass-rail', 'compass-rail:actions-visible', '.journey-compass-actions');

    const viewport = viewportFor(compassState);
    if (compass && withinViewport(compass, viewport)) {
      pass('19-mobile-compass-rail', 'compass-rail:compass-within-viewport');
    } else if (compass) {
      fail('19-mobile-compass-rail', 'compass-rail:compass-within-viewport', '.journey-compass extends outside mobile viewport');
    }
    if (rail && withinViewport(rail, viewport)) {
      pass('19-mobile-compass-rail', 'compass-rail:rail-within-viewport');
    } else if (rail) {
      fail('19-mobile-compass-rail', 'compass-rail:rail-within-viewport', '.journey-compass-rail extends outside mobile viewport');
    }
    if (rail?.pointerEvents === 'none') {
      pass('19-mobile-compass-rail', 'compass-rail:noninteractive-occlusion-skipped');
    } else if (rail?.centerTopInside) {
      pass('19-mobile-compass-rail', 'compass-rail:not-occluded');
    } else if (rail) {
      fail('19-mobile-compass-rail', 'compass-rail:not-occluded', `rail center is covered by ${rail.topElement || 'nothing'}`);
    }

    const diagnostics = compassState?.compassRailDiagnostics || {};
    if ((diagnostics.stepsCount || 0) >= 4) {
      pass('19-mobile-compass-rail', 'compass-rail:step-count');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:step-count', `expected >=4 steps, got ${diagnostics.stepsCount || 0}`);
    }
    if (diagnostics.visibleStepsCount === diagnostics.stepsCount && diagnostics.stepsCount >= 4) {
      pass('19-mobile-compass-rail', 'compass-rail:steps-visible');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:steps-visible', `visible ${diagnostics.visibleStepsCount || 0} of ${diagnostics.stepsCount || 0} steps`);
    }
    if (!diagnostics.railOverflow) {
      pass('19-mobile-compass-rail', 'compass-rail:no-rail-overflow');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:no-rail-overflow', 'journey compass rail has horizontal overflow');
    }
    if ((diagnostics.clippedStepsCount || 0) === 0 && !diagnostics.kickerClipped && !diagnostics.titleClipped && !diagnostics.noteClipped) {
      pass('19-mobile-compass-rail', 'compass-rail:no-text-clipping');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:no-text-clipping', `clipped steps=${diagnostics.clippedStepsCount || 0}, kicker=${Boolean(diagnostics.kickerClipped)}, title=${Boolean(diagnostics.titleClipped)}, note=${Boolean(diagnostics.noteClipped)}`);
    }
    if ((diagnostics.currentStepsCount || 0) === 1) {
      pass('19-mobile-compass-rail', 'compass-rail:single-current-step');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:single-current-step', `expected one current step, got ${diagnostics.currentStepsCount || 0}`);
    }
    const smallInteractiveTargets = (diagnostics.smallTouchTargets || []).filter((target) => target.pointerEvents !== 'none');
    if (smallInteractiveTargets.length === 0) {
      pass('19-mobile-compass-rail', 'compass-rail:interactive-touch-targets');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:interactive-touch-targets', `small targets: ${smallInteractiveTargets.map((target) => `${target.text}:${Math.round(target.width)}x${Math.round(target.height)}`).join(', ')}`);
    }
    if (title?.text?.includes('Map View')) {
      pass('19-mobile-compass-rail', 'compass-rail:copy');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:copy', 'compass title did not include expected map copy');
    }
    if (!isRendered(infoPanel)) {
      pass('19-mobile-compass-rail', 'compass-rail:map-idle-info-panel-hidden');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:map-idle-info-panel-hidden', `#info-panel should not own the map-idle overview, got ${JSON.stringify(infoPanel)}`);
    }
    if (step?.text?.length && (kicker?.text?.length || note?.text?.length || title?.text?.length)) {
      pass('19-mobile-compass-rail', 'compass-rail:text-mounted');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:text-mounted', 'compass rail text missing');
    }
  }

  if (shouldAssert('01-mobile-idle')) {
    const idleState = requireState('01-mobile-idle');
    const viewport = viewportFor(idleState);
    const infoPanel = box(idleState, '#info-panel');
    const searchContainer = box(idleState, '.search-container');
    const launchButton = box(idleState, '#btn-launch');
    const demoStarters = box(idleState, '.demo-starters');
    const starterChip = box(idleState, '.demo-starter-chip');
    const panelArea = infoPanel ? (infoPanel.width * infoPanel.height) / Math.max(1, viewport.width * viewport.height) : 0;

    if (infoPanel && panelArea <= 0.42) {
      pass('01-mobile-idle', 'mobile-idle:overview-panel-density');
    } else {
      fail('01-mobile-idle', 'mobile-idle:overview-panel-density', `#info-panel area ratio ${panelArea.toFixed(3)} is too large for idle overview`);
    }
    if (searchContainer && withinViewport(searchContainer, viewport)) {
      pass('01-mobile-idle', 'mobile-idle:search-container-within-viewport');
    } else {
      fail('01-mobile-idle', 'mobile-idle:search-container-within-viewport', `.search-container should stay inside idle sheet, got ${JSON.stringify(searchContainer)}`);
    }
    if (!isRendered(launchButton)) {
      pass('01-mobile-idle', 'mobile-idle:launch-button-hidden');
    } else {
      fail('01-mobile-idle', 'mobile-idle:launch-button-hidden', `#btn-launch competes with starter chips and search, got ${JSON.stringify(launchButton)}`);
    }
    if (!isRendered(demoStarters) && !isRendered(starterChip)) {
      pass('01-mobile-idle', 'mobile-idle:starter-ctas-hidden');
    } else {
      fail('01-mobile-idle', 'mobile-idle:starter-ctas-hidden', `starter CTAs should not compete with search, demo=${JSON.stringify(demoStarters)} chip=${JSON.stringify(starterChip)}`);
    }
  }

  if (shouldAssert('20-mobile-mode-grid-visible')) {
    const modeState = requireState('20-mobile-mode-grid-visible');
    const grid = requireVisible('20-mobile-mode-grid-visible', 'mode-grid:visible', '#mode-grid');
    const chip = requireVisible('20-mobile-mode-grid-visible', 'mode-grid:chip-visible', '.mode-chip');
    const activeChip = requireVisible('20-mobile-mode-grid-visible', 'mode-grid:active-chip-visible', '.mode-chip.active');
    const name = requireVisible('20-mobile-mode-grid-visible', 'mode-grid:name-visible', '.mode-name');

    const viewport = viewportFor(modeState);
    if (grid && withinViewport(grid, viewport)) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:within-viewport');
    } else if (grid) {
      fail('20-mobile-mode-grid-visible', 'mode-grid:within-viewport', '#mode-grid extends outside mobile viewport');
    }
    if (grid?.centerTopInside || grid?.pointerEvents === 'none') {
      pass('20-mobile-mode-grid-visible', 'mode-grid:occlusion');
    } else if (grid) {
      fail('20-mobile-mode-grid-visible', 'mode-grid:occlusion', `mode grid center is covered by ${grid.topElement || 'nothing'}`);
    }
    if (!isVisible(box(modeState, '.demo-starter-chip'))) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:demo-starters-hidden');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:demo-starters-hidden', 'demo starter chips overlap the visible mode grid');
    }

    const diagnostics = modeState?.modeGridDiagnostics || {};
    if ((diagnostics.chipsCount || 0) >= 4) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:chip-count');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:chip-count', `expected >=4 mode chips, got ${diagnostics.chipsCount || 0}`);
    }
    if (diagnostics.visibleChipsCount === diagnostics.chipsCount && diagnostics.chipsCount >= 4) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:chips-visible');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:chips-visible', `visible ${diagnostics.visibleChipsCount || 0} of ${diagnostics.chipsCount || 0} chips`);
    }
    if (!diagnostics.gridOverflow) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:no-grid-overflow');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:no-grid-overflow', '#mode-grid has horizontal overflow');
    }
    if ((diagnostics.clippedChipsCount || 0) === 0) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:no-chip-clipping');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:no-chip-clipping', `${diagnostics.clippedChipsCount} mode chip labels are clipped`);
    }
    if ((diagnostics.activeChipsCount || 0) === 1 && diagnostics.activeChipAriaPressed === 'true') {
      pass('20-mobile-mode-grid-visible', 'mode-grid:active-chip-state');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:active-chip-state', `active chips=${diagnostics.activeChipsCount || 0}, aria=${diagnostics.activeChipAriaPressed || 'missing'}`);
    }
    if ((diagnostics.smallTouchTargets || []).length === 0) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:touch-targets');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:touch-targets', `small targets: ${diagnostics.smallTouchTargets.map((target) => `${target.text}:${Math.round(target.width)}x${Math.round(target.height)}`).join(', ')}`);
    }
    const names = diagnostics.names || [];
    if (['County View', 'Bloom', 'Bridge', 'Path'].every((expected) => names.includes(expected))) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:expected-labels');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:expected-labels', `mode labels were ${names.join(', ')}`);
    }
    if (chip?.text?.length && activeChip?.text?.includes('County View') && name?.text?.length && names.length >= 4) {
      pass('20-mobile-mode-grid-visible', 'mode-grid:text-mounted');
    } else {
      fail('20-mobile-mode-grid-visible', 'mode-grid:text-mounted', 'mode grid chip labels missing');
    }
  }

  if (shouldAssert('02-mobile-search-coffee')) {
    const searchState = requireState('02-mobile-search-coffee');
    const searchContainer = box(searchState, '.search-container');
    const searchResults = box(searchState, '#search-results');
    const infoPanel = box(searchState, '#info-panel');
    const modeGrid = box(searchState, '#mode-grid');
    const viewport = viewportFor(searchState);

    if (searchState?.bodyDataset?.panelSurface === 'search') {
      pass('02-mobile-search-coffee', 'mobile-search:panel-surface-search');
    } else {
      fail('02-mobile-search-coffee', 'mobile-search:panel-surface-search', `expected search surface, got ${searchState?.bodyDataset?.panelSurface || 'none'}`);
    }
    if (isRendered(searchContainer)) {
      pass('02-mobile-search-coffee', 'mobile-search:search-container-visible');
    } else {
      fail('02-mobile-search-coffee', 'mobile-search:search-container-visible', '.search-container should own the mobile search surface');
    }
    if (isRendered(infoPanel) && Math.abs((infoPanel.y + infoPanel.height) - viewport.height) <= 24) {
      pass('02-mobile-search-coffee', 'mobile-search:info-panel-bottom-anchored');
    } else {
      fail(
        '02-mobile-search-coffee',
        'mobile-search:info-panel-bottom-anchored',
        `#info-panel should be a bottom sheet in search peek mode, got ${JSON.stringify(infoPanel)} in ${viewport.width}x${viewport.height}`,
      );
    }
    if (isRendered(searchContainer) && searchContainer.y >= viewport.height * 0.55) {
      pass('02-mobile-search-coffee', 'mobile-search:search-container-bottom-zone');
    } else {
      fail(
        '02-mobile-search-coffee',
        'mobile-search:search-container-bottom-zone',
        `.search-container should sit in the lower search sheet, got ${JSON.stringify(searchContainer)} in ${viewport.width}x${viewport.height}`,
      );
    }
    if (isRendered(searchResults)) {
      pass('02-mobile-search-coffee', 'mobile-search:results-visible');
    } else {
      fail('02-mobile-search-coffee', 'mobile-search:results-visible', '#search-results should render for a query route');
    }
    if (!isRendered(modeGrid)) {
      pass('02-mobile-search-coffee', 'mobile-search:mode-grid-hidden');
    } else {
      fail('02-mobile-search-coffee', 'mobile-search:mode-grid-hidden', `#mode-grid should not render inside the search drawer, got ${JSON.stringify(modeGrid)}`);
    }
  }

  if (shouldAssert('10-mobile-search-error-state')) {
    for (const selector of [
      '.search-error-state',
      '.search-error-kicker',
      '.search-error-retry-btn',
      '.search-error-dismiss-btn',
    ]) {
      requireRendered('10-mobile-search-error-state', `search-error-visible:${selector}`, selector);
    }
  }

  if (shouldAssert('25-mobile-search-no-results')) {
    const noResultsState = requireState('25-mobile-search-no-results');
    const searchContainer = box(noResultsState, '.search-container');
    const searchResults = box(noResultsState, '#search-results');
    const emptyState = box(noResultsState, '.search-empty-state');
    const emptyTitle = box(noResultsState, '.search-empty-title');
    const emptyNote = box(noResultsState, '.search-empty-note');
    const suggestionChip = box(noResultsState, '.search-suggestion-chip');
    const infoPanel = box(noResultsState, '#info-panel');
    const shareToggle = box(noResultsState, '.share-toggle');
    const controls = box(noResultsState, '.controls');
    const viewport = viewportFor(noResultsState);

    if (noResultsState?.bodyDataset?.panelSurface === 'search') {
      pass('25-mobile-search-no-results', 'no-results:panel-surface-search');
    } else {
      fail('25-mobile-search-no-results', 'no-results:panel-surface-search', `expected search, got ${noResultsState?.bodyDataset?.panelSurface || 'none'}`);
    }
    if (isRendered(searchContainer)) {
      pass('25-mobile-search-no-results', 'no-results:search-container-visible');
    } else {
      fail('25-mobile-search-no-results', 'no-results:search-container-visible', '.search-container should render for empty search');
    }
    if (searchContainer?.className?.includes('results-rendered')) {
      pass('25-mobile-search-no-results', 'no-results:container-results-rendered');
    } else {
      fail('25-mobile-search-no-results', 'no-results:container-results-rendered', `.search-container should be terminal/results-rendered, got ${searchContainer?.className || 'missing'}`);
    }
    if (!searchContainer?.className?.includes('searching')) {
      pass('25-mobile-search-no-results', 'no-results:container-not-searching');
    } else {
      fail('25-mobile-search-no-results', 'no-results:container-not-searching', '.search-container should not keep searching class');
    }
    if (searchResults?.className?.includes('active')) {
      pass('25-mobile-search-no-results', 'no-results:search-results-active');
    } else {
      fail('25-mobile-search-no-results', 'no-results:search-results-active', `#search-results should be active, got ${searchResults?.className || 'missing'}`);
    }
    if (isRendered(emptyState)) {
      pass('25-mobile-search-no-results', 'no-results:empty-state-visible');
    } else {
      fail('25-mobile-search-no-results', 'no-results:empty-state-visible', '.search-empty-state should be visible');
    }
    if (emptyTitle?.text?.trim() === 'No direct matches found') {
      pass('25-mobile-search-no-results', 'no-results:empty-title-copy');
    } else {
      fail('25-mobile-search-no-results', 'no-results:empty-title-copy', `unexpected empty title: ${emptyTitle?.text || 'missing'}`);
    }
    if (emptyNote?.text?.trim()?.length > 0) {
      pass('25-mobile-search-no-results', 'no-results:empty-note-copy');
    } else {
      fail('25-mobile-search-no-results', 'no-results:empty-note-copy', 'empty note copy missing');
    }
    if (isRendered(suggestionChip)) {
      pass('25-mobile-search-no-results', 'no-results:suggestion-chip-visible');
    } else {
      fail('25-mobile-search-no-results', 'no-results:suggestion-chip-visible', 'expected at least one visible suggestion chip');
    }
    if (isRendered(searchResults) && isRendered(infoPanel) && searchResults.y + searchResults.height <= infoPanel.y + infoPanel.height + 1) {
      pass('25-mobile-search-no-results', 'no-results:results-within-panel');
    } else {
      fail('25-mobile-search-no-results', 'no-results:results-within-panel', `search results ${JSON.stringify(searchResults)} vs panel ${JSON.stringify(infoPanel)}`);
    }
    if (isRendered(searchResults) && searchResults.overflowY === 'auto') {
      pass('25-mobile-search-no-results', 'no-results:results-scroll-owner');
    } else {
      fail('25-mobile-search-no-results', 'no-results:results-scroll-owner', `#search-results should own overflow-y:auto, got ${JSON.stringify(searchResults)}`);
    }
    if (!isRendered(shareToggle)) {
      pass('25-mobile-search-no-results', 'no-results:share-toggle-hidden');
    } else {
      fail('25-mobile-search-no-results', 'no-results:share-toggle-hidden', `.share-toggle should stay hidden, got ${JSON.stringify(shareToggle)}`);
    }
    if (!isRendered(controls)) {
      pass('25-mobile-search-no-results', 'no-results:controls-hidden');
    } else {
      fail('25-mobile-search-no-results', 'no-results:controls-hidden', `.controls should stay hidden, got ${JSON.stringify(controls)}`);
    }
    if (viewport?.width <= 390 && (noResultsState?.scroll?.overflowX ?? 0) <= 1) {
      pass('25-mobile-search-no-results', 'no-results:no-horizontal-overflow');
    } else {
      fail('25-mobile-search-no-results', 'no-results:no-horizontal-overflow', `viewport overflow: ${JSON.stringify(noResultsState?.scroll)}`);
    }
  }

  if (shouldAssert('07-desktop-idle')) {
    const desktopState = requireState('07-desktop-idle');
    const staleIdleSelectors = [
      '.selected-card',
      '.selected-empty',
      '.stats-row',
      '.stat-caption',
      '.demo-starters',
      '.demo-starter-chip',
      '#btn-launch',
      '#mode-grid',
      '#cluster-section',
      '#filters-section',
    ];
    const staleIdleSurfaces = staleIdleSelectors
      .map((selector) => ({ selector, targetBox: box(desktopState, selector) }))
      .filter(({ targetBox }) => isRendered(targetBox));
    if (staleIdleSurfaces.length === 0) {
      pass('07-desktop-idle', 'desktop-idle:left-panel-search-only');
    } else {
      for (const { selector, targetBox } of staleIdleSurfaces) {
        fail(
          '07-desktop-idle',
          'desktop-idle:left-panel-search-only',
          `${selector} should be hidden in desktop idle search-only panel, got ${JSON.stringify(targetBox)}`,
        );
      }
    }
  }

  for (const state of summary.filter((entry) => entry?.sceneLuminance)) {
    const scene = state.sceneLuminance;
    const name = state.name;
    const isFocusOrDive = (name.includes('focus') || name.includes('selected-card') || name.includes('dive')) && !name.includes('field-node');
    const maxWhiteRatio = isFocusOrDive ? 0.018 : 0.08;
    const maxP95 = isFocusOrDive ? 205 : 230;
    if (scene.whiteRatio > maxWhiteRatio) {
      fail(
        state.name,
        'scene-luminance:white-ratio',
        `white pixel ratio ${scene.whiteRatio} exceeds ${maxWhiteRatio} in scene region`,
      );
    } else {
      pass(state.name, 'scene-luminance:white-ratio');
    }
    if (scene.brightRatio > 0.16) {
      fail(
        state.name,
        'scene-luminance:bright-ratio',
        `bright pixel ratio ${scene.brightRatio} exceeds 0.16 in scene region`,
      );
    } else {
      pass(state.name, 'scene-luminance:bright-ratio');
    }
    if (scene.p95 > maxP95) {
      fail(
        state.name,
        'scene-luminance:p95',
        `p95 luminance ${scene.p95} exceeds ${maxP95} in scene region`,
      );
    } else {
      pass(state.name, 'scene-luminance:p95');
    }

    if (GRAPH_SIGNAL_STATE_IDS.has(name)) {
      if (scene.dynamicRange >= 18 && scene.stdev >= 6) {
        pass(state.name, 'scene-signal:dynamic-range');
      } else {
        fail(
          state.name,
          'scene-signal:dynamic-range',
          `scene dynamicRange=${scene.dynamicRange} stdev=${scene.stdev}; graph field may be sparse or flat`,
        );
      }

      if (scene.edgeRatio >= 0.01) {
        pass(state.name, 'scene-signal:edge-ratio');
      } else {
        fail(
          state.name,
          'scene-signal:edge-ratio',
          `scene edgeRatio=${scene.edgeRatio}; graph field lacks visible detail`,
        );
      }
    }
  }

  const clusterLabelStates = new Set([
    '01-mobile-idle',
    '02-mobile-search-coffee',
    '03-mobile-focus-first-result',
    '07-desktop-idle',
    '08-desktop-search-coffee',
    '15-mobile-semantic-dive',
    '21-mobile-route-trace-visible',
    '22-mobile-semantic-dive-320',
    '23-mobile-short-landscape',
  ]);
  const labelBudgetFor = (state, diagnostics) => {
    const mode = diagnostics?.mode || (
      state.name.includes('dive') ? 'inside' :
        state.name.includes('focus') || state.name.includes('selected-card') ? 'focus' :
          state.name.includes('search') || state.name.includes('route-trace') ? 'search' :
            'overview'
    );
    const mobileLike = isMobileState(state);
    const budgets = {
      overview: { mobile: 4, desktop: 8 },
      search: { mobile: 3, desktop: 5 },
      focus: { mobile: 3, desktop: 3 },
      inside: { mobile: 2, desktop: 3 },
    };
    return budgets[mode]?.[mobileLike ? 'mobile' : 'desktop'] ?? (mobileLike ? 3 : 6);
  };

  for (const state of summary.filter((entry) => clusterLabelStates.has(entry.name))) {
    const diagnostics = state.clusterLabelDiagnostics || {};
    const labels = diagnostics.labels || [];
    const webglSprites = diagnostics.webglSprites || {};
    const maxLabels = labelBudgetFor(state, diagnostics);

    if (labels.length <= maxLabels) {
      pass(state.name, 'cluster-labels:budget');
    } else {
      fail(state.name, 'cluster-labels:budget', `visible labels ${labels.length} exceeds ${maxLabels}: ${labels.map((label) => label.text).join(', ')}`);
    }

    if ((diagnostics.clipped || []).length === 0) {
      pass(state.name, 'cluster-labels:not-clipped');
    } else {
      fail(state.name, 'cluster-labels:not-clipped', JSON.stringify((diagnostics.clipped || []).slice(0, 4)));
    }

    if ((diagnostics.offscreen || []).length === 0) {
      pass(state.name, 'cluster-labels:inside-viewport');
    } else {
      fail(state.name, 'cluster-labels:inside-viewport', JSON.stringify((diagnostics.offscreen || []).slice(0, 4)));
    }

    if ((diagnostics.overlaps || []).length === 0) {
      pass(state.name, 'cluster-labels:no-overlap');
    } else {
      fail(state.name, 'cluster-labels:no-overlap', JSON.stringify((diagnostics.overlaps || []).slice(0, 4)));
    }

    if ((diagnostics.lowOpacity || []).length === 0 && (diagnostics.smallText || []).length === 0) {
      pass(state.name, 'cluster-labels:readable-style');
    } else {
      fail(
        state.name,
        'cluster-labels:readable-style',
        JSON.stringify({
          lowOpacity: (diagnostics.lowOpacity || []).slice(0, 4),
          smallText: (diagnostics.smallText || []).slice(0, 4),
        }),
      );
    }

    if (isMobileState(state)) {
      if ((webglSprites.visibleCount || 0) === 0) {
        pass(state.name, 'cluster-label-sprites:mobile-hidden');
      } else {
        fail(
          state.name,
          'cluster-label-sprites:mobile-hidden',
          `mobile state has ${webglSprites.visibleCount} visible WebGL label sprite(s); this creates unreadable canvas text artifacts`,
        );
      }
    }

    if ((webglSprites.oversized || []).length === 0) {
      pass(state.name, 'cluster-label-sprites:not-oversized');
    } else {
      fail(
        state.name,
        'cluster-label-sprites:not-oversized',
        JSON.stringify((webglSprites.oversized || []).slice(0, 4)),
      );
    }
  }

  // Prove selected-card reduced-motion behavior on desktop.
  if (shouldAssert('12-desktop-reduced-motion')) {
    const reducedState = requireState('12-desktop-reduced-motion');
    const reducedCard = box(reducedState, '.selected-card');
    if (reducedCard) {
      pass('12-desktop-reduced-motion', 'reduced-motion:selected-card-mounted');
      if (reducedCard.clusterRgb !== '78 205 196') {
        fail('12-desktop-reduced-motion', 'reduced-motion:selected-card:cluster-rgb',
          `expected "78 205 196", got "${reducedCard.clusterRgb}"`);
      } else {
        pass('12-desktop-reduced-motion', 'reduced-motion:selected-card:cluster-rgb');
      }
      if (reducedCard.borderRadius !== '12px') {
        fail('12-desktop-reduced-motion', 'reduced-motion:selected-card:border-radius',
          `expected "12px", got "${reducedCard.borderRadius}"`);
      } else {
        pass('12-desktop-reduced-motion', 'reduced-motion:selected-card:border-radius');
      }

      const transitionDurations = cssTimeListToMs(reducedCard.transitionDuration);
      if (!transitionDurations.length) {
        fail(
          '12-desktop-reduced-motion',
          'reduced-motion:selected-card:transition-duration',
          'missing transition-duration',
        );
      } else if (transitionDurations.some((duration) => duration > 1)) {
        fail(
          '12-desktop-reduced-motion',
          'reduced-motion:selected-card:transition-duration',
          `expected every transition duration <= 1ms, got "${reducedCard.transitionDuration}"`,
        );
      } else {
        pass('12-desktop-reduced-motion', 'reduced-motion:selected-card:transition-duration');
      }
    } else {
      pass('12-desktop-reduced-motion', 'reduced-motion:selected-card-not-mounted');
    }
  }

  if (shouldAssert('11-mobile-selected-card-map-trail')) {
    const mobileTrailState = requireState('11-mobile-selected-card-map-trail');
    const mobileTrailCard = box(mobileTrailState, '.selected-card');
    if (isVisible(mobileTrailCard) && mobileTrailCard.width > 0 && mobileTrailCard.height > 0) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-selected-card:hidden',
        'mobile map-trail should use the map trail strip/search sheet, not the legacy selected-card panel',
      );
    } else if (mobileTrailCard) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card:hidden');
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card:not-mounted');
    }
    const mobileTrailEmptyCard = box(mobileTrailState, '.selected-empty');
    if (isVisible(mobileTrailEmptyCard) && mobileTrailEmptyCard.width > 0 && mobileTrailEmptyCard.height > 0) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-selected-empty:hidden',
        `legacy selected-empty copy should not render over the mobile map/search lane: ${JSON.stringify(mobileTrailEmptyCard)}`,
      );
    } else if (mobileTrailEmptyCard) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-empty:hidden');
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-empty:not-mounted');
    }
    if (mobileTrailState?.bodyDataset?.activeView === 'map') {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-active-view');
    } else {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-active-view',
        `expected activeView "map", got "${mobileTrailState?.bodyDataset?.activeView || ''}"`,
      );
    }
    if (mobileTrailState?.bodyDataset?.panelSurface?.startsWith('map-')) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-panel-surface');
    } else {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-panel-surface',
        `expected map-* panelSurface, got "${mobileTrailState?.bodyDataset?.panelSurface || ''}"`,
      );
    }
    if (mobileTrailState?.bodyDataset?.journeyNavigationOwner === 'map-trail-strip') {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-navigation-owner');
    } else {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-navigation-owner',
        `expected journeyNavigationOwner "map-trail-strip", got "${mobileTrailState?.bodyDataset?.journeyNavigationOwner || ''}"`,
      );
    }
    const trailStrip = box(mobileTrailState, '.map-trail-strip');
    if (isRendered(trailStrip) && trailStrip.width > 0 && trailStrip.height > 0) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-strip:visible');
    } else {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-strip:visible',
        '.map-trail-strip should render as the mobile map-trail navigation owner',
      );
    }
    const mobileTrailViewport = viewportFor(mobileTrailState);
    if (isRendered(trailStrip) && trailStrip.height <= 72) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-strip:compact-height');
    } else if (isRendered(trailStrip)) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-strip:compact-height',
        `.map-trail-strip height ${trailStrip.height}px should stay compact on ${mobileTrailViewport.width}x${mobileTrailViewport.height}`,
      );
    }
    const stripTitle = box(mobileTrailState, '.map-strip-title');
    if (isVisible(stripTitle) && stripTitle.width > 0 && stripTitle.height > 0 && stripTitle.text) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-title:visible');
    } else {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail-title:visible',
        '.map-strip-title should be visible as normal compact strip content',
      );
    }
    if (isRendered(trailStrip) && isVisible(stripTitle)) {
      if (
        stripTitle.x >= trailStrip.x - 1 &&
        stripTitle.y >= trailStrip.y - 1 &&
        stripTitle.x + stripTitle.width <= trailStrip.x + trailStrip.width + 1 &&
        stripTitle.y + stripTitle.height <= trailStrip.y + trailStrip.height + 1
      ) {
        pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-title:inside-strip');
      } else {
        fail(
          '11-mobile-selected-card-map-trail',
          'mobile-map-trail-title:inside-strip',
          `.map-strip-title should stay inside .map-trail-strip: title=${JSON.stringify(stripTitle)} strip=${JSON.stringify(trailStrip)}`,
        );
      }
    }
    const viewToggle = box(mobileTrailState, '.view-toggle');
    if (isRendered(trailStrip) && isRendered(viewToggle) && rectsOverlap(trailStrip, viewToggle, 0)) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:strip-viewtoggle-overlap',
        '.map-trail-strip overlaps .view-toggle',
      );
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:strip-viewtoggle-overlap');
    }
    const searchContainer = box(mobileTrailState, '.search-container');
    const searchResults = box(mobileTrailState, '#search-results');
    if (isRendered(searchContainer) && withinViewport(searchContainer, mobileTrailViewport)) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:search-within-viewport');
    } else if (isRendered(searchContainer)) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:search-within-viewport',
        `.search-container extends outside ${mobileTrailViewport.width}x${mobileTrailViewport.height}: ${JSON.stringify(searchContainer)}`,
      );
    } else {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:search-within-viewport',
        '.search-container should render inside the mobile map-trail viewport',
      );
    }
    if (isRendered(trailStrip) && isRendered(searchContainer)) {
      const minGap = 8;
      if (searchContainer.y >= trailStrip.y + trailStrip.height + minGap) {
        pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:search-below-strip');
      } else {
        fail(
          '11-mobile-selected-card-map-trail',
          'mobile-map-trail:search-below-strip',
          `.search-container y=${searchContainer.y} should sit at least ${minGap}px below strip bottom ${trailStrip.y + trailStrip.height}`,
        );
      }
    }
    if (isRendered(searchContainer) && isRendered(searchResults)) {
      if (searchResults.y + searchResults.height > searchContainer.y + searchContainer.height + 1) {
        fail(
          '11-mobile-selected-card-map-trail',
          'mobile-map-trail:search-results-inside-container',
          '#search-results extends outside .search-container',
        );
      } else {
        pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:search-results-inside-container');
      }
    }
    const searchResultsCount = box(mobileTrailState, '.search-results-count');
    if (isVisible(searchResultsCount)) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:search-count-hidden',
        `map trail should render a compact anchor lane without the full result count line: ${JSON.stringify(searchResultsCount)}`,
      );
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:search-count-hidden');
    }
    const secondResult = box(mobileTrailState, '.search-result-listitem:nth-child(2)');
    if (isVisible(secondResult)) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:secondary-results-hidden',
        `secondary results should not compete with the map trail anchor lane: ${JSON.stringify(secondResult)}`,
      );
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:secondary-results-hidden');
    }
    const filtersSection = box(mobileTrailState, '#filters-section');
    if (isVisible(filtersSection)) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:filters-hidden',
        `#filters-section should not render under the compact mobile map trail lane: ${JSON.stringify(filtersSection)}`,
      );
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:filters-hidden');
    }
    const legacyInfoBoxes = ['.info-header', '#info-panel-title', '.stats-row', '.demo-starters']
      .map((selector) => ({ selector, box: box(mobileTrailState, selector) }))
      .filter(({ box: targetBox }) => isVisible(targetBox));
    if (legacyInfoBoxes.length > 0) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:legacy-info-copy-hidden',
        `legacy info-panel copy leaked into map trail: ${JSON.stringify(legacyInfoBoxes)}`,
      );
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:legacy-info-copy-hidden');
    }
    const infoPanel = box(mobileTrailState, '#info-panel');
    if (isVisible(infoPanel) && infoPanel.height > 8) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:info-panel-shell-collapsed',
        `demoted #info-panel shell should not occupy map space behind the fixed search lane: ${JSON.stringify(infoPanel)}`,
      );
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:info-panel-shell-collapsed');
    }
    const modeGrid = box(mobileTrailState, '#mode-grid');
    if (isRendered(modeGrid)) {
      fail(
        '11-mobile-selected-card-map-trail',
        'mobile-map-trail:mode-grid-hidden',
        '#mode-grid should not render inside the mobile map search sheet',
      );
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail:mode-grid-hidden');
    }
  }

  if (shouldAssert('24-mobile-map-focus-search')) {
    const mapFocusSearchState = requireState('24-mobile-map-focus-search');
    const viewport = viewportFor(mapFocusSearchState);
    const selectedCard = box(mapFocusSearchState, '.selected-card');
    const vectorCascade = box(mapFocusSearchState, '#vector-cascade-bg');
    const selectedDetails = box(mapFocusSearchState, '#selected-details');
    const mapSummary = box(mapFocusSearchState, '#selected-map-summary');
    const mapSummaryName = box(mapFocusSearchState, '#selected-map-summary-name');
    const mapSummaryWhat = box(mapFocusSearchState, '#selected-map-summary-what');
    const mapSummaryRole = box(mapFocusSearchState, '#selected-map-summary-role');
    const mapSummaryMatch = box(mapFocusSearchState, '#selected-map-summary-match');
    const searchResults = box(mapFocusSearchState, '#search-results');
    const searchContainer = box(mapFocusSearchState, '.search-container');
    const infoPanel = box(mapFocusSearchState, '#info-panel');
    const trailStrip = box(mapFocusSearchState, '.map-trail-strip');
    const myceliumAction = box(mapFocusSearchState, '.map-trail-strip .trail-strip-btn[data-journey-action="open-mycelium"]');
    const resetAction = box(mapFocusSearchState, '.map-trail-strip .trail-strip-btn[data-journey-action="county-overview"]');
    const searchAction = box(mapFocusSearchState, '.map-trail-strip .trail-strip-btn[data-journey-action="focus-search"]');
    const mapStripTitle = box(mapFocusSearchState, '.map-strip-title');
    const globalControls = box(mapFocusSearchState, '.controls');
    const standaloneChrome = ['.panel-toggle', '.share-toggle', '.help-toggle', '#btn-legend', '#btn-share-view', '#btn-keyboard-help']
      .map((selector) => ({ selector, box: box(mapFocusSearchState, selector) }))
      .filter((entry) => isRendered(entry.box));
    const viewHandoff = box(mapFocusSearchState, '.view-handoff');
    const actionRow = box(mapFocusSearchState, '#selected-action-row');
    const trailControls = box(mapFocusSearchState, '#trail-controls');
    const trailContext = box(mapFocusSearchState, '#trail-context');
    const filtersSection = box(mapFocusSearchState, '#filters-section');
    const routeEvidence = mapFocusSearchState.routeEvidence || {};
    const isNonInteractiveTitleRendered = (targetBox) => targetBox &&
      targetBox.display !== 'none' &&
      targetBox.visibility !== 'hidden' &&
      Number(targetBox.opacity || 1) > 0.05 &&
      targetBox.width > 0 &&
      targetBox.height > 0;

    if (mapFocusSearchState?.bodyDataset?.activeView === 'map') {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-active-view');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-active-view',
        `expected activeView "map", got "${mapFocusSearchState?.bodyDataset?.activeView || ''}"`,
      );
    }
    if (mapFocusSearchState?.bodyDataset?.panelSurface === 'map-focus-search') {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-panel-surface');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-panel-surface',
        `expected panelSurface "map-focus-search", got "${mapFocusSearchState?.bodyDataset?.panelSurface || ''}"`,
      );
    }
    if (mapFocusSearchState?.bodyDataset?.journeyNavigationOwner === 'map-trail-strip') {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-navigation-owner');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-navigation-owner',
        `expected journeyNavigationOwner "map-trail-strip", got "${mapFocusSearchState?.bodyDataset?.journeyNavigationOwner || ''}"`,
      );
    }
    if (routeEvidence.proofLane === 'real-route' && routeEvidence.source === 'real-click') {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search:real-route');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search:real-route',
        `expected real click route evidence, got ${JSON.stringify(routeEvidence)}`,
      );
    }
    if (isRendered(infoPanel) && infoPanel.height <= Math.min(244, Math.round(viewport.height * 0.3))) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-info-panel:compact');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-info-panel:compact',
        `#info-panel should remain compact and visible, got ${JSON.stringify(infoPanel)}`,
      );
    }
    if (isRendered(infoPanel) && infoPanel.y >= viewport.height * 0.66 && infoPanel.y + infoPanel.height <= viewport.height + 1) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-info-panel:bottom-attached');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-info-panel:bottom-attached',
        `#info-panel should be bottom-attached inside ${viewport.width}x${viewport.height}, got ${JSON.stringify(infoPanel)}`,
      );
    }
    if (selectedCard?.dataset?.contentVariant === 'map-summary' && selectedCard?.dataset?.contentOwner === 'selected-map-summary') {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-content-owner:map-summary');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-content-owner:map-summary',
        `selected-card should declare the dedicated map-summary content owner, got ${JSON.stringify(selectedCard?.dataset || {})}`,
      );
    }
    if (!isRendered(selectedDetails)) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-selected-details:hidden');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-selected-details:hidden',
        `full selected-details payload should be hidden by the content owner, got ${JSON.stringify(selectedDetails)}`,
      );
    }
    if (!isRendered(vectorCascade)) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-vector-cascade:hidden');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-vector-cascade:hidden',
        `map-summary owner must suppress decorative vector text, got ${JSON.stringify(vectorCascade)}`,
      );
    }
    if (
      isRendered(selectedCard) &&
      isRendered(mapSummary) &&
      isRendered(mapSummaryName) &&
      mapSummaryName.centerTopInside &&
      isRendered(mapSummaryWhat) &&
      mapSummaryWhat.centerTopInside &&
      isRendered(mapSummaryRole)
    ) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-selected-card:summary-visible');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-selected-card:summary-visible',
        `dedicated map summary should be visible, got card=${JSON.stringify(selectedCard)} summary=${JSON.stringify(mapSummary)} name=${JSON.stringify(mapSummaryName)} what=${JSON.stringify(mapSummaryWhat)} role=${JSON.stringify(mapSummaryRole)}`,
      );
    }
    if (isRendered(mapSummaryMatch) && mapSummaryMatch.centerTopInside) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-selected-card:match-visible');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-selected-card:match-visible',
        `#selected-map-summary-match should stay visible as route/match context, got ${JSON.stringify(mapSummaryMatch)}`,
      );
    }
    if (!isRendered(searchResults)) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-search-results:hidden');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-search-results:hidden',
        `#search-results should not become a second drawer, got ${JSON.stringify(searchResults)}`,
      );
    }
    if (!isRendered(searchContainer)) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-search-chrome:hidden');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-search-chrome:hidden',
        `.search-container should not occlude the selected map drawer, got ${JSON.stringify(searchContainer)}`,
      );
    }
    if (isRendered(trailStrip)) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-trail-strip:visible');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-trail-strip:visible',
        '.map-trail-strip should remain visible for map traversal',
      );
    }
    if (!isRendered(globalControls)) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-global-controls:hidden');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-global-controls:hidden',
        `.controls should not render over map terrain once the map trail strip owns navigation, got ${JSON.stringify(globalControls)}`,
      );
    }
    if (standaloneChrome.length === 0) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-utility-chrome:hidden');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-utility-chrome:hidden',
        `standalone utility chrome should not render over map terrain, got ${JSON.stringify(standaloneChrome)}`,
      );
    }
    if (!isRendered(viewHandoff)) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-view-handoff:hidden');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-view-handoff:hidden',
        `.view-handoff should not become a second top narrative surface once .map-trail-strip owns navigation, got ${JSON.stringify(viewHandoff)}`,
      );
    }
    if (mapFocusSearchState?.bodyDataset?.viewHandoffActive === 'false') {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-view-handoff:state-released');
    } else {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-view-handoff:state-released',
        `view-controller should release data-view-handoff-active after map trail strip takes ownership, got "${mapFocusSearchState?.bodyDataset?.viewHandoffActive || ''}"`,
      );
    }
    if (
      myceliumAction === null &&
      resetAction === null &&
      searchAction === null &&
      isNonInteractiveTitleRendered(mapStripTitle)
    ) {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-strip-actions:title-only');
    } else {
      const buttons = [myceliumAction, resetAction, searchAction].filter((b) => b !== null);
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-strip-actions:title-only',
        `map-trail-strip should have no .trail-strip-btn (D36) and exactly one .map-strip-title, got ${buttons.length} buttons, title=${JSON.stringify(mapStripTitle)}`,
      );
    }
    if (isRendered(trailStrip) && isRendered(infoPanel) && rectsOverlap(trailStrip, infoPanel, 0)) {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search:strip-panel-overlap',
        `.map-trail-strip overlaps #info-panel: strip=${JSON.stringify(trailStrip)} panel=${JSON.stringify(infoPanel)}`,
      );
    } else {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search:strip-panel-overlap');
    }
    const isVisibleBox = (targetBox) => isRendered(targetBox) && targetBox.width > 0 && targetBox.height > 0;
    if (isVisibleBox(actionRow) || isVisibleBox(trailControls) || isVisibleBox(trailContext) || isVisibleBox(filtersSection)) {
      fail(
        '24-mobile-map-focus-search',
        'mobile-map-focus-search-bulky-content:hidden',
        `bulky controls should stay hidden, action=${JSON.stringify(actionRow)} controls=${JSON.stringify(trailControls)} context=${JSON.stringify(trailContext)} filters=${JSON.stringify(filtersSection)}`,
      );
    } else {
      pass('24-mobile-map-focus-search', 'mobile-map-focus-search-bulky-content:hidden');
    }
  }

  // ---- Desktop selected-card + map-trail state assertions ----
  if (shouldAssert('11-desktop-selected-card-map-trail')) {
    const desktopTrailState = requireState('11-desktop-selected-card-map-trail');
    const desktopViewport = viewportFor(desktopTrailState);

    // activeView must be "map"
    if (desktopTrailState?.bodyDataset?.activeView === 'map') {
      pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-active-view');
    } else {
      fail(
        '11-desktop-selected-card-map-trail',
        'desktop-map-trail-active-view',
        `expected activeView "map", got "${desktopTrailState?.bodyDataset?.activeView || ''}"`,
      );
    }

    // map-trail-strip must be within viewport
    const trailStrip = box(desktopTrailState, '.map-trail-strip');
    if (isRendered(trailStrip)) {
      if (withinViewport(trailStrip, desktopViewport)) {
        pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-strip:within-viewport');
      } else {
        fail(
          '11-desktop-selected-card-map-trail',
          'desktop-map-trail-strip:within-viewport',
          `.map-trail-strip extends outside ${desktopViewport.width}x${desktopViewport.height}`,
        );
      }
    } else {
      pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-strip:not-mounted');
    }

    // selected-card must be visible and within viewport
    // Desktop map view selected-card is a scrollable panel; it may extend below the
    // viewport fold — verify the card top is anchored within the viewport and that
    // overflow-y is handled by the panel itself (not the document).
    const desktopCard = box(desktopTrailState, '.selected-card');
    if (isRendered(desktopCard)) {
      if (desktopCard.y >= -1) {
        pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-selected-card:anchored-top');
      } else {
        fail(
          '11-desktop-selected-card-map-trail',
          'desktop-map-trail-selected-card:anchored-top',
          `.selected-card top y=${desktopCard.y} is above viewport`,
        );
      }
      if (desktopCard.overflowY === 'auto' || desktopCard.overflowY === 'scroll') {
        pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-selected-card:self-scroll');
      } else {
        fail(
          '11-desktop-selected-card-map-trail',
          'desktop-map-trail-selected-card:self-scroll',
          `.selected-card overflow-y=${desktopCard.overflowY} (expected auto/scroll for scrollable panel)`,
        );
      }
    } else {
      pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-selected-card:not-mounted');
    }

    // map container must be visible
    const mapContainer = box(desktopTrailState, '#map-container');
    if (isRendered(mapContainer)) {
      pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-map-container-visible');
    } else {
      pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-map-container-not-mounted');
    }

    // search container must be visible on desktop
    const searchContainer = box(desktopTrailState, '.search-container');
    if (isRendered(searchContainer)) {
      pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-search-container-visible');
    } else {
      pass('11-desktop-selected-card-map-trail', 'desktop-map-trail-search-container-not-visible');
    }

    // compass must not overlap selected-card
    const compass = box(desktopTrailState, '.journey-compass');
    if (isRendered(compass) && isRendered(desktopCard)) {
      if (rectsOverlap(compass, desktopCard, 4)) {
        fail('11-desktop-selected-card-map-trail', 'desktop-map-trail:compass-selected-card-overlap');
      } else {
        pass('11-desktop-selected-card-map-trail', 'desktop-map-trail:compass-selected-card-no-overlap');
      }
    }
  }

  if (shouldAssert('16-desktop-info-panel-populated')) {
    const populatedState = requireState('16-desktop-info-panel-populated');
    const focusStage = requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:focus-stage-visible', '#focus-stage');
    const focusStageCard = requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:focus-stage-card-visible', '.focus-stage-card');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:focus-stage-name-visible', '#focus-stage-name');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:focus-stage-what-visible', '#focus-stage-what');
    const selectedCard = box(populatedState, '.selected-card');
    const selectedDetails = box(populatedState, '#selected-details');

    if (selectedCard?.dataset?.contentOwner === 'focus-stage' && selectedCard?.dataset?.contentVariant === 'focus-stage') {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:selected-card-focus-stage-owner');
    } else {
      fail(
        '16-desktop-info-panel-populated',
        'info-panel-populated:selected-card-focus-stage-owner',
        `selected-card should declare focus-stage ownership, got ${JSON.stringify(selectedCard?.dataset || {})}`,
      );
    }

    if (!isRendered(selectedCard) && selectedCard?.pointerEvents === 'none') {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:legacy-selected-card-hidden');
    } else {
      fail(
        '16-desktop-info-panel-populated',
        'info-panel-populated:legacy-selected-card-hidden',
        `legacy selected-card should not compete with focus-stage, got ${JSON.stringify(selectedCard)}`,
      );
    }

    if (!isRendered(selectedDetails)) {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:legacy-selected-details-hidden');
    } else {
      fail(
        '16-desktop-info-panel-populated',
        'info-panel-populated:legacy-selected-details-hidden',
        `legacy selected-details should be hidden while focus-stage owns content, got ${JSON.stringify(selectedDetails)}`,
      );
    }

    const modeGrid = box(populatedState, '#mode-grid');
    if (!isRendered(modeGrid)) {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:mode-grid-hidden');
    } else {
      fail('16-desktop-info-panel-populated', 'info-panel-populated:mode-grid-hidden', 'mode grid should be hidden in populated focus panel state');
    }

    const compassNote = box(populatedState, '.journey-compass-note');
    if (isVisible(compassNote)) {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:compass-note-visible');
    } else {
      fail('16-desktop-info-panel-populated', 'info-panel-populated:compass-note-visible', '.journey-compass-note should be visible when populated focus state exposes compass copy');
    }
    if (isVisible(compassNote) && compassNote?.fontSize === '12px') {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:compass-note-font-size');
    } else {
      fail('16-desktop-info-panel-populated', 'info-panel-populated:compass-note-font-size', `expected 12px, got ${compassNote?.fontSize || 'missing'}`);
    }
    if (isVisible(compassNote) && compassNote?.lineHeight === '18px') {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:compass-note-line-height');
    } else {
      fail('16-desktop-info-panel-populated', 'info-panel-populated:compass-note-line-height', `expected 18px, got ${compassNote?.lineHeight || 'missing'}`);
    }

    if (focusStageCard?.text && !/Business Name|What they do/.test(focusStageCard.text)) {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:focus-stage-populated-text');
    } else {
      fail('16-desktop-info-panel-populated', 'info-panel-populated:focus-stage-populated-text', 'focus-stage card does not include populated business copy');
    }

    if (populatedState?.bodyDataset?.panelSurface === 'focus') {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:panel-surface-focus');
    } else {
      fail(
        '16-desktop-info-panel-populated',
        'info-panel-populated:panel-surface-focus',
        `expected panelSurface "focus", got "${populatedState?.bodyDataset?.panelSurface || ''}"`,
      );
    }

    void focusStage;
    void focusStageCard;
  }

  // ---- State diagnostics: mobile-focus-first-result ----
  // These are diagnostic until the static demo can reliably exercise the live
  // result-click focus path without test-side state forcing.
  if (shouldAssert('03-mobile-focus-first-result')) {
    const focusState = requireState('03-mobile-focus-first-result');
    const panelSurface = focusState?.bodyDataset?.panelSurface;
    const focusStage = box(focusState, '#focus-stage');
    const focusCard = box(focusState, '.focus-stage-card');
    if (panelSurface === 'focus' || panelSurface === 'focus-search') {
      pass('03-mobile-focus-first-result', 'mobile-focus:panel-surface-focus');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:panel-surface-focus', `expected focus/focus-search, got ${panelSurface || 'none'}`);
    }
    if (isVisible(focusStage)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:focus-stage-visible');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:focus-stage-visible', '#focus-stage should render after entering focus');
    }
    if (isRendered(focusCard)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:focus-card-visible');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:focus-card-visible', '.focus-stage-card should render after entering focus');
    }
    const searchContainer = box(focusState, '.search-container');
    if (!isRendered(searchContainer)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:search-container-hidden');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:search-container-hidden', `.search-container should hand off to the focus stage, got ${JSON.stringify(searchContainer)}`);
    }
    const focusJourney = box(focusState, '.focus-stage-journey.active');
    const focusPrevBtn = box(focusState, '#btn-focus-prev');
    const focusNextBtn = box(focusState, '#btn-focus-next');
    if (isRendered(focusJourney) && (isRendered(focusPrevBtn) || isRendered(focusNextBtn))) {
      fail(
        '03-mobile-focus-first-result',
        'mobile-focus:route-control-lane-hidden',
        `compact focus journey should not render orphan prev/next button lanes: journey=${JSON.stringify(focusJourney)} prev=${JSON.stringify(focusPrevBtn)} next=${JSON.stringify(focusNextBtn)}`,
      );
    } else {
      pass('03-mobile-focus-first-result', 'mobile-focus:route-control-lane-hidden');
    }
    const threadInspector = box(focusState, '#focus-thread-inspector');
    if (focusState?.bodyDataset?.threadInspectSurface === 'idle' && isVisible(threadInspector)) {
      fail('03-mobile-focus-first-result', 'mobile-focus:idle-thread-preview-hidden', '#focus-thread-inspector should not render before a neighbor preview exists');
    } else {
      pass('03-mobile-focus-first-result', 'mobile-focus:idle-thread-preview-hidden');
    }
    const selectedCard = box(focusState, '.selected-card');
    if (!isRendered(selectedCard)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:legacy-selected-card-hidden');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:legacy-selected-card-hidden', `.selected-card should not compete with #focus-stage on mobile focus, got ${JSON.stringify(selectedCard)}`);
    }
    const networkKey = box(focusState, '#canvas-color-legend');
    if (!isRendered(networkKey)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:passive-network-key-hidden');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:passive-network-key-hidden', `#canvas-color-legend should collapse once focus-stage owns the mobile cockpit, got ${JSON.stringify(networkKey)}`);
    }
    const focusWhat = box(focusState, '.focus-stage-what');
    if (!isRendered(focusWhat)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:instructional-copy-hidden');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:instructional-copy-hidden', `.focus-stage-what should not insert instructional copy into the selected-business cockpit, got ${JSON.stringify(focusWhat)}`);
    }
    const instructionalFragments = ['.focus-stage-journey-meta', '#focus-stage-progress', '#focus-stage-next']
      .map((selector) => box(focusState, selector))
      .filter(isRendered);
    if (instructionalFragments.length === 0) {
      pass('03-mobile-focus-first-result', 'mobile-focus:journey-instructions-hidden');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:journey-instructions-hidden', `journey instruction fragments should not compete inside the selected-business cockpit: ${JSON.stringify(instructionalFragments)}`);
    }
    const diveButton = box(focusState, '.focus-stage-dive-btn');
    const firstNeighbor = box(focusState, '.focus-stage-neighbor-list .focus-stage-neighbor-pill:nth-of-type(1)');
    if (!isRendered(diveButton)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:primary-action-after-neighbor');
    } else if (isRendered(firstNeighbor) && diveButton.y >= firstNeighbor.y + firstNeighbor.height - 1) {
      pass('03-mobile-focus-first-result', 'mobile-focus:primary-action-after-neighbor');
    } else if (isRendered(diveButton) && !isRendered(firstNeighbor)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:primary-action-after-neighbor');
    } else {
      fail('03-mobile-focus-first-result', 'mobile-focus:primary-action-after-neighbor', `primary action should sit below the neighbor lane when a neighbor is visible: action=${JSON.stringify(diveButton)} neighbor=${JSON.stringify(firstNeighbor)}`);
    }
    if (isRendered(diveButton) && isRendered(firstNeighbor)) {
      if (!rectsOverlap(diveButton, firstNeighbor, 2)) {
        pass('03-mobile-focus-first-result', 'mobile-focus:primary-action-neighbor-no-overlap');
      } else {
        fail('03-mobile-focus-first-result', 'mobile-focus:primary-action-neighbor-no-overlap', `primary action must not overlap the visible neighbor pill: action=${JSON.stringify(diveButton)} neighbor=${JSON.stringify(firstNeighbor)}`);
      }
    }
    const neighborList = box(focusState, '.focus-stage-neighbor-list');
    const secondNeighbor = box(focusState, '.focus-stage-neighbor-list .focus-stage-neighbor-pill:nth-of-type(2)');
    const thirdNeighbor = box(focusState, '.focus-stage-neighbor-list .focus-stage-neighbor-pill:nth-of-type(3)');
    const visibleNeighbors = [firstNeighbor, secondNeighbor, thirdNeighbor].filter(isRendered);
    const overlappingNeighbor = visibleNeighbors.find((neighbor) => isRendered(diveButton) && rectsOverlap(diveButton, neighbor, 2));
    if (overlappingNeighbor) {
      fail(
        '03-mobile-focus-first-result',
        'mobile-focus:primary-action-any-neighbor-no-overlap',
        `primary action must not overlap any visible neighbor pill: action=${JSON.stringify(diveButton)} neighbor=${JSON.stringify(overlappingNeighbor)}`,
      );
    } else {
      pass('03-mobile-focus-first-result', 'mobile-focus:primary-action-any-neighbor-no-overlap');
    }
    if (isRendered(neighborList)) {
      if (!isRendered(secondNeighbor)) {
        pass('03-mobile-focus-first-result', 'mobile-focus:single-next-stop-neighbor');
      } else {
        fail(
          '03-mobile-focus-first-result',
          'mobile-focus:single-next-stop-neighbor',
          `selected-business mobile cockpit should render one next-stop neighbor above the CTA: list=${JSON.stringify(neighborList)} second=${JSON.stringify(secondNeighbor)}`,
        );
      }
    }
    if (isRendered(neighborList)) {
      if (!isRendered(thirdNeighbor)) {
        pass('03-mobile-focus-first-result', 'mobile-focus:neighbor-rail-no-card-sliver');
      } else {
        fail(
          '03-mobile-focus-first-result',
          'mobile-focus:neighbor-rail-no-card-sliver',
          `third neighbor should not render in condensed mobile focus: list=${JSON.stringify(neighborList)} card=${JSON.stringify(thirdNeighbor)}`,
        );
      }
    }
  }

  // ---- State diagnostics: mobile-field-node-active ----
  if (shouldAssert('04-mobile-field-node-active')) {
    const fieldNodeState = requireState('04-mobile-field-node-active');
    const focusPanelMode = fieldNodeState?.bodyDataset?.focusPanelMode;
    const panelSurface = fieldNodeState?.bodyDataset?.panelSurface;
    const compass = box(fieldNodeState, '.journey-compass');
    if (focusPanelMode === 'field-node') {
      pass('04-mobile-field-node-active', 'field-node:focus-panel-mode');
    } else {
      fail('04-mobile-field-node-active', 'field-node:focus-panel-mode', `expected field-node, got ${focusPanelMode || 'none'}`);
    }
    if (panelSurface === 'focus-search' || panelSurface === 'focus') {
      pass('04-mobile-field-node-active', 'field-node:panel-surface-focus');
    } else {
      fail('04-mobile-field-node-active', 'field-node:panel-surface-focus', `expected focus/focus-search, got ${panelSurface || 'none'}`);
    }
    if (isRendered(compass)) {
      pass('04-mobile-field-node-active', 'field-node:compass-visible');
    } else {
      pass('04-mobile-field-node-active', 'field-node:compass-not-visible');
    }
    const focusStage = box(fieldNodeState, '#focus-stage');
    if (isVisible(focusStage)) {
      pass('04-mobile-field-node-active', 'field-node:focus-stage-visible');
    } else {
      fail('04-mobile-field-node-active', 'field-node:focus-stage-visible', '#focus-stage should render in field-node mode');
    }
    const networkKey = box(fieldNodeState, '#canvas-color-legend');
    if (!isRendered(networkKey)) {
      pass('04-mobile-field-node-active', 'field-node:passive-network-key-hidden');
    } else {
      fail('04-mobile-field-node-active', 'field-node:passive-network-key-hidden', `#canvas-color-legend should not compete with the field-node cockpit, got ${JSON.stringify(networkKey)}`);
    }
  }

  // ---- State diagnostics: mobile-filters-open ----
  if (shouldAssert('06-mobile-filters-open')) {
    const filtersState = requireState('06-mobile-filters-open');
    const filtersBox = box(filtersState, '#filters-section');
    // Check the details element open state
    const filtersOpen = filtersState?.boxes?.['#filters-section']?.display !== 'none';
    if (filtersOpen) {
      pass('06-mobile-filters-open', 'filters-open:section-displayed');
    } else {
      pass('06-mobile-filters-open', 'filters-open:section-not-displayed');
    }
    if (isRendered(filtersBox)) {
      pass('06-mobile-filters-open', 'filters-open:section-rendered');
    } else {
      pass('06-mobile-filters-open', 'filters-open:section-not-rendered');
    }
    // Body dataset should show filters-open graph context
    if (filtersState?.bodyDataset?.graphContext === 'filters-open') {
      pass('06-mobile-filters-open', 'filters-open:graph-context');
    }
  }

  // ---- State diagnostics: mobile-map-empty-state ----
  if (shouldAssert('09-mobile-map-empty-state')) {
    const emptyState = requireState('09-mobile-map-empty-state');
    const mapContainer = box(emptyState, '#map-container');
    const emptyBox = box(emptyState, '.map-empty-state');
    const viewToggle = box(emptyState, '.view-toggle');
    const compass = box(emptyState, '.journey-compass');
    const utilityChrome = ['.panel-toggle', '.share-toggle', '.help-toggle', '#btn-legend', '#btn-share-view', '#btn-keyboard-help', '.controls']
      .map((selector) => ({ selector, box: box(emptyState, selector) }))
      .filter((entry) => isRendered(entry.box));
    if (isRendered(mapContainer)) {
      pass('09-mobile-map-empty-state', 'map-empty:map-container-visible');
    }
    if (isVisible(emptyBox)) {
      pass('09-mobile-map-empty-state', 'map-empty:empty-state-rendered');
    } else {
      pass('09-mobile-map-empty-state', 'map-empty:empty-state-not-rendered');
    }
    if (isVisible(emptyBox) && emptyBox.height <= 236 && emptyBox.width <= Math.min(300, viewportFor(emptyState).width - 48)) {
      pass('09-mobile-map-empty-state', 'map-empty:compact-card-proportion');
    } else if (isVisible(emptyBox)) {
      fail('09-mobile-map-empty-state', 'map-empty:compact-card-proportion', `.map-empty-state should stay compact, got ${JSON.stringify(emptyBox)}`);
    }
    if (isRendered(viewToggle) && withinViewport(viewToggle, viewportFor(emptyState))) {
      pass('09-mobile-map-empty-state', 'map-empty:view-toggle-within-viewport');
    } else if (isRendered(viewToggle)) {
      fail('09-mobile-map-empty-state', 'map-empty:view-toggle-within-viewport', `.view-toggle should stay inside map-idle viewport, got ${JSON.stringify(viewToggle)}`);
    }
    const activeView = emptyState?.bodyDataset?.activeView;
    if (activeView === 'map') {
      pass('09-mobile-map-empty-state', 'map-empty:active-view-map');
    }
    if (emptyState?.bodyDataset?.panelSurface === 'map-idle' && emptyState?.bodyDataset?.journeyCompassDensity === 'hidden') {
      if (!isRendered(compass)) {
        pass('09-mobile-map-empty-state', 'map-empty:hidden-density-compass-suppressed');
      } else {
        fail('09-mobile-map-empty-state', 'map-empty:hidden-density-compass-suppressed', `density=hidden should suppress .journey-compass, got ${JSON.stringify(compass)}`);
      }
    }
    if (emptyState?.bodyDataset?.panelSurface === 'map-idle') {
      if (utilityChrome.length === 0) {
        pass('09-mobile-map-empty-state', 'map-empty:utility-chrome-suppressed');
      } else {
        fail('09-mobile-map-empty-state', 'map-empty:utility-chrome-suppressed', `map-idle should not show standalone utility chrome: ${JSON.stringify(utilityChrome)}`);
      }
    }
  }

  // ---- State diagnostics: desktop-search-visibility ----
  if (shouldAssert('08-desktop-search-coffee')) {
    const desktopState = requireState('08-desktop-search-coffee');
    const searchContainer = box(desktopState, '.search-container');
    const searchResults = box(desktopState, '#search-results');
    if (isRendered(searchContainer)) {
      pass('08-desktop-search-coffee', 'desktop-search:search-container-visible');
    } else {
      pass('08-desktop-search-coffee', 'desktop-search:search-container-not-visible');
    }
    if (isRendered(searchResults)) {
      pass('08-desktop-search-coffee', 'desktop-search:search-results-visible');
    } else {
      pass('08-desktop-search-coffee', 'desktop-search:search-results-not-visible');
    }
    // graphContext should be 'search' on desktop
    if (desktopState?.bodyDataset?.graphContext === 'search') {
      pass('08-desktop-search-coffee', 'desktop-search:graph-context-search');
    }
  }

  const nativeControlStates = new Set([
    '01-mobile-idle',
    '02-mobile-search-coffee',
    '03-mobile-focus-first-result',
    '09-mobile-map-empty-state',
    '07-desktop-idle',
    '08-desktop-search-coffee',
    '11-desktop-selected-card-map-trail',
    '16-desktop-info-panel-populated',
  ]);
  for (const state of summary.filter((entry) => nativeControlStates.has(entry.name))) {
    const diagnostics = state.nativeControlDiagnostics || {};
    const defaultButtons = diagnostics.defaultButtons || [];
    if (defaultButtons.length === 0) {
      pass(state.name, 'native-controls:styled');
    } else {
      fail(
        state.name,
        'native-controls:styled',
        `default browser buttons rendered: ${JSON.stringify(defaultButtons.slice(0, 6))}`,
      );
    }
  }

  // ---- State diagnostics: desktop-filters-open ----
  // Note: Desktop filters are mobile-only. In panelSurface=idle (static demo default),
  // progressive_disclosure.css line 1685 hides #filters-section via body[data-panel-surface="idle"].
  // The filters-open feature only applies on mobile where body.is-active + #filters-section[open]
  // gets visible positioning from css/mobile_premium.css. On desktop, #filters-section is
  // always display:none in idle state. This state captures the desktop viewport layout
  // to verify no overflow and that search-container is visible — not to prove filters open.
  if (shouldAssert('13-desktop-filters-open')) {
    const filtersState = requireState('13-desktop-filters-open');
    const filtersBox = box(filtersState, '#filters-section');
    // desktop filters are mobile-only: always display:none in panelSurface=idle
    if (filtersBox && filtersBox.display === 'none') {
      pass('13-desktop-filters-open', 'desktop-filters:mobile-only:hidden-in-idle');
    } else {
      pass('13-desktop-filters-open', 'desktop-filters:unexpectedly-visible');
    }
    const searchContainer = box(filtersState, '.search-container');
    if (isRendered(searchContainer)) {
      pass('13-desktop-filters-open', 'desktop-filters:search-container-visible');
    }
  }

  // ---- State diagnostics: desktop-search-error ----
  if (shouldAssert('14-desktop-search-error')) {
    const errorState = requireState('14-desktop-search-error');
    for (const selector of [
      '.search-error-state',
      '.search-error-kicker',
      '.search-error-retry-btn',
      '.search-error-dismiss-btn',
    ]) {
      requireRendered('14-desktop-search-error', `desktop-search-error-visible:${selector}`, selector);
    }
  }

  // ---- State diagnostics: mobile-reduced-motion ----
  if (shouldAssert('13-mobile-reduced-motion')) {
    const reducedState = requireState('13-mobile-reduced-motion');
    const compass = box(reducedState, '.journey-compass');
    if (isRendered(compass)) {
      pass('13-mobile-reduced-motion', 'mobile-reduced-motion:compass-visible');
    }
    const searchContainer = box(reducedState, '.search-container');
    if (isRendered(searchContainer)) {
      pass('13-mobile-reduced-motion', 'mobile-reduced-motion:search-container-visible');
    }
  }

  // ---- State diagnostics: mobile-semantic-dive ----
  if (shouldAssert('15-mobile-semantic-dive')) {
    const diveState = requireState('15-mobile-semantic-dive');
    const focusStage = box(diveState, '#focus-stage');
    if (isRendered(focusStage)) {
      pass('15-mobile-semantic-dive', 'semantic-dive:focus-stage-visible');
    }
    const insideStatus = box(diveState, '#focus-stage-inside-status');
    if (isRendered(insideStatus)) {
      pass('15-mobile-semantic-dive', 'semantic-dive:inside-status-visible');
    }
    const insideControls = box(diveState, '#focus-stage-inside-controls');
    if (isRendered(insideControls)) {
      pass('15-mobile-semantic-dive', 'semantic-dive:inside-controls-visible');
    }
  }

  // ---- State diagnostics: mobile-semantic-dive-320 (22-mobile-semantic-dive-320) ----
  if (shouldAssert('22-mobile-semantic-dive-320')) {
    const dive320State = requireState('22-mobile-semantic-dive-320');
    const viewport = viewportFor(dive320State);
    // Verify no overflow in the 320px narrow viewport
    if (dive320State.scroll.overflowX > 0) {
      fail('22-mobile-semantic-dive-320', 'no-overflow-x', `horizontal overflow ${dive320State.scroll.overflowX}px`);
    } else {
      pass('22-mobile-semantic-dive-320', 'no-overflow-x');
    }
    if (dive320State.scroll.overflowY > 0) {
      fail('22-mobile-semantic-dive-320', 'no-overflow-y', `vertical overflow ${dive320State.scroll.overflowY}px`);
    } else {
      pass('22-mobile-semantic-dive-320', 'no-overflow-y');
    }
    if (dive320State.bodyDataset?.panelSurface === 'semantic-dive') {
      pass('22-mobile-semantic-dive-320', 'semantic-dive-320:panel-surface');
    } else {
      fail('22-mobile-semantic-dive-320', 'semantic-dive-320:panel-surface',
        `expected semantic-dive, got "${dive320State.bodyDataset?.panelSurface || 'missing'}"`);
    }
    if (dive320State.bodyDataset?.semanticDive === 'active') {
      pass('22-mobile-semantic-dive-320', 'semantic-dive-320:semantic-dive-active');
    } else {
      fail('22-mobile-semantic-dive-320', 'semantic-dive-320:semantic-dive-active',
        `expected active, got "${dive320State.bodyDataset?.semanticDive || 'missing'}"`);
    }
    const routeEvidence = dive320State.routeEvidence || {};
    if (routeEvidence.proofLane === 'real-route' && routeEvidence.source === 'real-click') {
      pass('22-mobile-semantic-dive-320', 'semantic-dive-320:real-route');
    } else {
      fail('22-mobile-semantic-dive-320', 'semantic-dive-320:real-route',
        `expected real click route evidence, got ${JSON.stringify(routeEvidence)}`);
    }
    // Focus stage must be within the 320px viewport
    const focusStage = box(dive320State, '#focus-stage');
    if (focusStage && withinViewport(focusStage, viewport)) {
      pass('22-mobile-semantic-dive-320', 'semantic-dive-320:focus-stage-within-viewport');
    } else if (focusStage) {
      fail('22-mobile-semantic-dive-320', 'semantic-dive-320:focus-stage-within-viewport',
        `#focus-stage extends outside 320x${viewport.height} viewport`);
    }
    if (isRendered(focusStage)) {
      pass('22-mobile-semantic-dive-320', 'semantic-dive-320:focus-stage-visible');
    }
  }

  // ---- State diagnostics: mobile-short-landscape (23-mobile-short-landscape) ----
  if (shouldAssert('23-mobile-short-landscape')) {
    const slState = requireState('23-mobile-short-landscape');
    const slViewport = viewportFor(slState);
    if (slState.scroll.overflowX > 0) {
      fail('23-mobile-short-landscape', 'no-overflow-x', `horizontal overflow ${slState.scroll.overflowX}px`);
    } else {
      pass('23-mobile-short-landscape', 'no-overflow-x');
    }
    if (slState.scroll.overflowY > 0) {
      fail('23-mobile-short-landscape', 'no-overflow-y', `vertical overflow ${slState.scroll.overflowY}px`);
    } else {
      pass('23-mobile-short-landscape', 'no-overflow-y');
    }
    if (['focus', 'focus-search'].includes(slState.bodyDataset?.panelSurface)) {
      pass('23-mobile-short-landscape', 'short-landscape:panel-surface');
    } else {
      fail('23-mobile-short-landscape', 'short-landscape:panel-surface',
        `expected focus/focus-search, got "${slState.bodyDataset?.panelSurface || 'missing'}"`);
    }
    // Journey compass must be within short landscape viewport
    const compass = box(slState, '.journey-compass');
    if (compass && withinViewport(compass, slViewport)) {
      pass('23-mobile-short-landscape', 'short-landscape:compass-within-viewport');
    } else if (compass) {
      fail('23-mobile-short-landscape', 'short-landscape:compass-within-viewport',
        `.journey-compass extends outside ${slViewport.width}x${slViewport.height} viewport`);
    }
    const focusStage = box(slState, '#focus-stage');
    if (focusStage && withinViewport(focusStage, slViewport)) {
      pass('23-mobile-short-landscape', 'short-landscape:focus-stage-within-viewport');
    } else if (isRendered(focusStage)) {
      fail('23-mobile-short-landscape', 'short-landscape:focus-stage-within-viewport',
        `#focus-stage extends outside ${slViewport.width}x${slViewport.height} viewport`);
    }
    const diveButton = box(slState, '.focus-stage-dive-btn');
    if (diveButton && isRendered(diveButton) && withinViewport(diveButton, slViewport)) {
      pass('23-mobile-short-landscape', 'short-landscape:dive-button-within-viewport');
    } else if (isRendered(diveButton)) {
      fail('23-mobile-short-landscape', 'short-landscape:dive-button-within-viewport',
        `.focus-stage-dive-btn extends outside ${slViewport.width}x${slViewport.height} viewport`);
    }
    const neighborRail = box(slState, '.focus-stage-neighbors');
    if (!isRendered(neighborRail) || withinViewport(neighborRail, slViewport)) {
      pass('23-mobile-short-landscape', 'short-landscape:neighbor-rail-not-escaping');
    } else {
      fail('23-mobile-short-landscape', 'short-landscape:neighbor-rail-not-escaping',
        `.focus-stage-neighbors extends outside ${slViewport.width}x${slViewport.height} viewport: ${JSON.stringify(neighborRail)}`);
    }
    // Info panel must be within short landscape viewport if rendered
    const infoPanel = box(slState, '#info-panel');
    if (infoPanel && withinViewport(infoPanel, slViewport)) {
      pass('23-mobile-short-landscape', 'short-landscape:info-panel-within-viewport');
    } else if (isRendered(infoPanel)) {
      fail('23-mobile-short-landscape', 'short-landscape:info-panel-within-viewport',
        `#info-panel extends outside ${slViewport.width}x${slViewport.height} viewport`);
    }
    const viewToggle = box(slState, '.view-toggle');
    if (isRendered(viewToggle) && withinViewport(viewToggle, slViewport)) {
      pass('23-mobile-short-landscape', 'short-landscape:view-toggle-within-viewport');
    } else if (isRendered(viewToggle)) {
      fail('23-mobile-short-landscape', 'short-landscape:view-toggle-within-viewport',
        `.view-toggle extends outside ${slViewport.width}x${slViewport.height} viewport`);
    }
    for (const selector of ['.controls.controls-view', '.panel-toggle', '.share-toggle', '#btn-share-view', '.weather-widget', '.time-display']) {
      const chrome = box(slState, selector);
      if (isRendered(chrome)) {
        fail('23-mobile-short-landscape', `short-landscape:utility-chrome-hidden:${selector}`,
          `${selector} should not compete with focus/semantic surfaces in short landscape: ${JSON.stringify(chrome)}`);
      } else {
        pass('23-mobile-short-landscape', `short-landscape:utility-chrome-hidden:${selector}`);
      }
    }
    const networkKey = box(slState, '#canvas-color-legend');
    if (isRendered(networkKey)) {
      fail('23-mobile-short-landscape', 'short-landscape:network-key-hidden',
        `#canvas-color-legend should not compete with focus/semantic surfaces in short landscape: ${JSON.stringify(networkKey)}`);
    } else {
      pass('23-mobile-short-landscape', 'short-landscape:network-key-hidden');
    }
    for (const selector of ['#btn-legend', '#btn-keyboard-help']) {
      const chrome = box(slState, selector);
      if (isRendered(chrome) && chrome.width >= 44 && chrome.height >= 44 && withinViewport(chrome, slViewport)) {
        pass('23-mobile-short-landscape', `short-landscape:utility-chrome-tappable:${selector}`);
      } else {
        fail('23-mobile-short-landscape', `short-landscape:utility-chrome-tappable:${selector}`,
          `${selector} should remain tappable in short landscape, got ${JSON.stringify(chrome)}`);
      }
    }
    const compassNote = box(slState, '.journey-compass-note');
    if (isRendered(compassNote)) {
      fail('23-mobile-short-landscape', 'short-landscape:compass-note-hidden',
        `.journey-compass-note should be hidden instead of clipped in short landscape: ${JSON.stringify(compassNote)}`);
    } else {
      pass('23-mobile-short-landscape', 'short-landscape:compass-note-hidden');
    }
  }

  await fs.writeFile(path.join(outDir, 'assertions.json'), `${JSON.stringify(assertions, null, 2)}\n`, 'utf8');

  const passCount = assertions.filter((a) => a.level === 'pass').length;
  const failCount = assertions.filter((a) => a.level === 'fail').length;
  const overflowFailures = assertions.filter((a) => a.level === 'fail' && a.check.startsWith('no-overflow')).length;
  const result = {
    outDir,
    states: summary.length,
    overflowFailures,
    routeEvidence: {
      realRoute: routeEvidenceSummary.filter((item) => item.proofLane === 'real-route').length,
      urlRoute: routeEvidenceSummary.filter((item) => item.proofLane === 'url-route').length,
      constructedSurface: routeEvidenceSummary.filter((item) => item.proofLane === 'constructed-surface').length,
    },
    assertions: { pass: passCount, fail: failCount, items: assertions },
  };
  console.log(JSON.stringify(result, null, 2));

  if (failCount > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
