/**
 * Product playthrough audit for Semantic Explorer.
 *
 * This captures live screenshots plus compact DOM/runtime snapshots for UX
 * review, then asserts the critical mobile ownership seams exercised by the
 * route-level playthrough.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const DEFAULT_URL = 'http://127.0.0.1:5173/?view=galaxy&nodemo=1';
const targetUrl = process.env.PRODUCT_QA_URL || DEFAULT_URL;
const REAL_ROUTE_VISUAL = process.argv.includes('--real-route-visual');
const VISUAL_ERGONOMICS = process.argv.includes('--visual-ergonomics');
const HEADED = !process.argv.includes('--headless') &&
  process.env.PW_HEADLESS !== '1' &&
  process.env.PLAYWRIGHT_HEADLESS !== '1';
const REQUIRE_WEBGL = HEADED && process.env.ALLOW_WEBGL_FALLBACK !== '1';
const launchOptions = {
  headless: !HEADED,
  args: HEADED
    ? [
        '--ignore-gpu-blocklist',
        ...(process.platform === 'win32' && process.env.SEMANTIC_USE_D3D11 === '1' ? ['--use-angle=d3d11'] : []),
      ]
    : [],
};
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outLane = VISUAL_ERGONOMICS && REAL_ROUTE_VISUAL
  ? 'real-route-ergonomics'
  : REAL_ROUTE_VISUAL
    ? 'real-route-visual'
    : 'product-qa';
const outDir = path.resolve(process.cwd(), 'tmp', outLane, runId);

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
  shortLandscape: { width: 896, height: 414 },
};
const KNOWN_COFFEE_INDEX = 3060;

const ignoreRequestFailure = (url) => (
  /fonts\.(?:googleapis|gstatic)\.com/i.test(url) ||
  /\.(?:woff2?|ttf)(?:$|\?)/i.test(url)
);

function classifyConsoleIssue(msg) {
  const text = msg.text();
  if (/GL Driver Message .*ReadPixels/i.test(text)) return 'headless-webgl-readpixels';
  if (/WebGL:\s+CONTEXT_LOST_WEBGL:.*context lost/i.test(text)) return 'headless-webgl-context-lost';
  if (/Detected raw PHP response\. Assuming static dev server/i.test(text)) return 'expected-static-dev-fallback';
  if (/\[demo\] blocked .*no WebGL \/ software renderer/i.test(text)) return 'headless-demo-webgl-guard';
  if (/\[demo\] blocked .*nodemo URL param/i.test(text)) return 'expected-demo-nodemo-guard';
  if (/error|warn/i.test(msg.type()) || /error|exception|failed/i.test(text)) return 'actionable';
  return 'ignore';
}

function classifyRequestFailure(request) {
  const url = request.url();
  const error = request.failure()?.errorText || 'request failed';
  if (ignoreRequestFailure(url)) return 'ignored-asset';
  if (/api\.php\?action=semantic_search/i.test(url) && /ERR_ABORTED/i.test(error)) return 'superseded-search-request';
  return 'actionable';
}

function withCacheBust(url, label) {
  const parsed = new URL(url);
  parsed.searchParams.set('nodemo', '1');
  parsed.searchParams.set('productqa', `${label}-${Date.now()}`);
  return parsed.href;
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

function clampRegion(region, width, height) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(region.x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(region.y)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(region.x + region.width)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(region.y + region.height)));
  return { x0, y0, x1, y1 };
}

function analyzePixelRegion(image, region, step = 2) {
  const { width, height, rgba } = image;
  const { x0, y0, x1, y1 } = clampRegion(region, width, height);
  const lumas = [];
  let dark = 0;
  let nearBlack = 0;
  let bright = 0;
  let white = 0;
  let saturated = 0;
  let colorSpreadTotal = 0;
  let edgeHits = 0;
  let edgeComparisons = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const luma = Math.round((r * 299 + g * 587 + b * 114) / 1000);
      lumas.push(luma);
      if (luma < 16) dark += 1;
      if (luma < 4) nearBlack += 1;
      if (luma >= 210) bright += 1;
      if (luma >= 240) white += 1;
      if (r >= 248 && g >= 248 && b >= 248) saturated += 1;
      colorSpreadTotal += Math.max(r, g, b) - Math.min(r, g, b);
      if (x + step < x1) {
        const j = (y * width + x + step) * 4;
        const next = Math.round((rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000);
        if (Math.abs(next - luma) >= 18) edgeHits += 1;
        edgeComparisons += 1;
      }
      if (y + step < y1) {
        const j = ((y + step) * width + x) * 4;
        const next = Math.round((rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000);
        if (Math.abs(next - luma) >= 18) edgeHits += 1;
        edgeComparisons += 1;
      }
    }
  }
  lumas.sort((a, b) => a - b);
  const count = lumas.length || 1;
  const mean = lumas.reduce((sum, value) => sum + value, 0) / count;
  const variance = lumas.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / count;
  const percentile = (p) => lumas[Math.min(lumas.length - 1, Math.max(0, Math.floor((lumas.length - 1) * p)))] || 0;
  return {
    samples: lumas.length,
    mean: Number(mean.toFixed(2)),
    stdev: Number(Math.sqrt(variance).toFixed(2)),
    p05: percentile(0.05),
    p10: percentile(0.10),
    median: percentile(0.50),
    p90: percentile(0.90),
    p95: percentile(0.95),
    dynamicRange: percentile(0.95) - percentile(0.05),
    darkRatio: Number((dark / count).toFixed(4)),
    nearBlackRatio: Number((nearBlack / count).toFixed(4)),
    brightRatio: Number((bright / count).toFixed(4)),
    whiteRatio: Number((white / count).toFixed(4)),
    saturatedRatio: Number((saturated / count).toFixed(4)),
    colorSpread: Number((colorSpreadTotal / count).toFixed(2)),
    edgeRatio: Number((edgeHits / Math.max(1, edgeComparisons)).toFixed(4)),
  };
}

async function analyzeScreenshotQuality(pngPath, state) {
  const image = parsePngRgba(await fs.readFile(pngPath));
  const { width, height } = image;
  const sceneRegion = state.viewport?.width <= 900
    ? { x: width * 0.04, y: height * 0.14, width: width * 0.92, height: height * 0.48 }
    : { x: width * 0.16, y: height * 0.12, width: width * 0.68, height: height * 0.66 };
  const surfaces = (state.ergonomics?.visiblePrimarySurfaces || [])
    .filter((surface) => surface?.rect?.width >= 32 && surface?.rect?.height >= 24)
    .map((surface) => ({
      selector: surface.selector,
      areaRatio: surface.areaRatio,
      stats: analyzePixelRegion(image, {
        x: surface.rect.x,
        y: surface.rect.y,
        width: surface.rect.width,
        height: surface.rect.height,
      }, 2),
    }));
  return {
    viewport: { width, height },
    full: analyzePixelRegion(image, { x: 0, y: 0, width, height }, 3),
    scene: analyzePixelRegion(image, sceneRegion, 2),
    surfaces,
  };
}

async function markRouteEvidence(page, source, detail) {
  await page.evaluate(({ source, detail }) => {
    document.body.dataset.productRouteEvidence = source;
    document.body.dataset.productRouteEvidenceDetail = detail;
  }, { source, detail });
}

async function waitForAppReady(page) {
  const ready = await page.waitForFunction((mustUseWebgl) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const hasPoints = Array.isArray(state.points) && state.points.length > 100;
    const hasThreads = state.semanticNeighborMapByLeadId instanceof Map &&
      state.semanticNeighborMapByLeadId.size > 100;
    const hasSearch = typeof window.__APP_ACTIONS__?.search === 'function' ||
      typeof window.searchBusinesses === 'function';
    const hasSearchInput = Boolean(document.querySelector('#search-input'));
    const sceneReady = document.body.dataset.sceneReady === 'true' ||
      document.body.dataset.graphicsMode === 'webgl' ||
      (!mustUseWebgl && document.body.dataset.graphicsMode === 'fallback');
    const overlay = document.getElementById('loading-overlay');
    const loadingHidden = !overlay || overlay.classList.contains('hidden') ||
      overlay.getAttribute('aria-hidden') === 'true';
    return loadingHidden && hasSearchInput && hasSearch && sceneReady && (hasPoints || hasThreads);
  }, REQUIRE_WEBGL, { timeout: 45000 }).then(() => true).catch(() => false);
  if (!ready) {
    const diagnostics = await page.evaluate(() => {
      const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
      const overlay = document.getElementById('loading-overlay');
      return {
        url: location.href,
        title: document.title,
        bodyDataset: { ...document.body.dataset },
        points: Array.isArray(state.points) ? state.points.length : null,
        threadMapSize: state.semanticNeighborMapByLeadId instanceof Map ? state.semanticNeighborMapByLeadId.size : null,
        hasSearchAction: typeof window.__APP_ACTIONS__?.search === 'function',
        hasSearchInput: Boolean(document.querySelector('#search-input')),
        overlayClass: overlay?.className || '',
        overlayAriaHidden: overlay?.getAttribute('aria-hidden') || '',
      };
    }).catch((error) => ({ error: String(error) }));
    throw new Error(`Timed out waiting for app readiness: ${JSON.stringify(diagnostics)}`);
  }
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});
  const semanticReady = await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const rows = Number(state.semanticSpaceLayoutManifest?.rows ?? 0);
    const edges = Number(state.semanticSpaceLayoutManifest?.edges ?? 0);
    const points = Array.isArray(state.points) ? state.points.length : 0;
    return state.semanticSpaceLayoutStatus === 'ready' &&
      points > 100 &&
      rows === points &&
      edges > 0;
  }, null, { timeout: 45000 }).then(() => true).catch(() => false);
  if (!semanticReady) {
    const diagnostics = await page.evaluate(() => {
      const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
      return {
        points: Array.isArray(state.points) ? state.points.length : null,
        semanticThreadsStatus: state.semanticThreadsStatus || '',
        semanticThreadsLoadPromise: Boolean(state.semanticThreadsLoadPromise),
        semanticThreadArtifactName: state.semanticThreadArtifactName || '',
        semanticNeighborCount: state.semanticNeighborMapByLeadId instanceof Map ? state.semanticNeighborMapByLeadId.size : null,
        semanticSpaceLayoutStatus: state.semanticSpaceLayoutStatus || '',
        semanticSpaceLayoutRows: Number(state.semanticSpaceLayoutManifest?.rows ?? 0),
        semanticSpaceLayoutEdges: Number(state.semanticSpaceLayoutManifest?.edges ?? 0),
        semanticSpaceLayoutError: state.semanticSpaceLayoutError || '',
      };
    }).catch((error) => ({ error: String(error) }));
    throw new Error(`Timed out waiting for semantic/data readiness: ${JSON.stringify(diagnostics)}`);
  }
}

async function pageWaitForResize(page) {
  await page.waitForFunction((mustUseWebgl) => document.body.dataset.sceneReady === 'true' ||
    document.body.dataset.graphicsMode === 'webgl' ||
    (!mustUseWebgl && document.body.dataset.graphicsMode === 'fallback'),
  REQUIRE_WEBGL, { timeout: 8000 });
  await waitForUiSettled(page, 8000);
}

async function waitForUiSettled(page, timeout = 8000) {
  await page.waitForFunction(() => {
    const dataset = document.body.dataset;
    const overlay = document.getElementById('loading-overlay');
    const loadingHidden = !overlay || overlay.classList.contains('hidden') ||
      overlay.getAttribute('aria-hidden') === 'true';
    return loadingHidden &&
      dataset.viewHandoffActive !== 'true' &&
      dataset.cameraAssist !== 'active';
  }, null, { timeout }).catch(() => {});
}

async function waitForPanelSurface(page, surfaces, timeout = 8000) {
  const expected = Array.isArray(surfaces) ? surfaces : [surfaces];
  await page.waitForFunction((values) => values.includes(document.body.dataset.panelSurface || ''), expected, { timeout });
}

async function runSearch(page, query) {
  const input = page.locator('#search-input');
  if (await input.count()) {
    await input.first().fill(query);
    await input.first().press('Enter');
    await markRouteEvidence(page, 'real-click', `typed search query "${query}"`);
  }
  let hasResults = await page.waitForFunction(() => document.querySelectorAll('.search-result-item').length > 0, null, {
    timeout: 15000,
  }).then(() => true).catch(() => false);
  if (!hasResults) {
    await page.evaluate((term) => {
      window.__APP_ACTIONS__?.search?.(term, { preferCachedResults: false });
    }, query);
    await markRouteEvidence(page, 'debug-probe', `APP_ACTIONS.search("${query}") fallback`);
    hasResults = await page.waitForFunction(() => document.querySelectorAll('.search-result-item').length > 0, null, {
      timeout: 15000,
    }).then(() => true).catch(() => false);
  }
  await waitForPanelSurface(page, ['search', 'focus-search'], 8000).catch(() => {});
  await waitForUiSettled(page, 8000);
  return hasResults;
}

async function runVisibleSearch(page, query) {
  const input = page.locator('#search-input:visible').first();
  await input.fill(query, { timeout: 8000 });
  await input.press('Enter');
  await markRouteEvidence(page, 'real-click', `typed search query "${query}" and pressed Enter`);
  await page.waitForFunction(() => {
    return document.body.dataset.panelSurface === 'search' &&
      document.querySelectorAll('.search-result-item').length > 0;
  }, null, { timeout: 15000 });
  await waitForUiSettled(page, 8000);
}

async function focusFirstSearchResult(page) {
  const row = page.locator('.search-result-item').first();
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded();
    const clicked = await row.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
    if (!clicked) {
      const forced = await row.click({ timeout: 5000, force: true, noWaitAfter: true }).then(() => true).catch(() => false);
      if (!forced) {
        await page.evaluate(() => document.querySelector('.search-result-item')?.click());
        await markRouteEvidence(page, 'debug-probe', 'DOM click fallback for first search result');
      } else {
        await markRouteEvidence(page, 'real-click', 'forced Playwright click on first search result');
      }
    } else {
      await markRouteEvidence(page, 'real-click', 'clicked first search result');
    }
  } else {
    await page.evaluate(() => {
      const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
      const index = state.searchResults?.[0]?.index ?? 0;
      window.__APP_ACTIONS__?.focusOnNode?.(index, { fromSearchResult: true, skipUrlSync: true });
    });
    await markRouteEvidence(page, 'debug-probe', 'APP_ACTIONS.focusOnNode fallback for first search result');
  }
  const focused = await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Number.isFinite(state.navState?.focusedIndex ?? state.focusedNode) &&
      String(document.body.dataset.graphContext || '').startsWith('focus');
  }, null, { timeout: 5000 }).then(() => true).catch(() => false);
  await waitForPanelSurface(page, ['focus', 'focus-search', 'map-focus', 'map-focus-search'], 8000).catch(() => {});
  await waitForUiSettled(page, 8000);
  return focused;
}

async function clickVisibleFirstSearchResult(page) {
  const row = page.locator('.search-result-item:visible').first();
  await row.waitFor({ state: 'visible', timeout: 8000 });
  await row.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  const clicked = await row.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
  if (clicked) {
    await markRouteEvidence(page, 'real-click', 'clicked first visible search result');
  } else {
    const box = await row.boundingBox();
    if (!box) throw new Error('first visible search result had no clickable bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 28));
    await markRouteEvidence(page, 'real-click', 'mouse-clicked first visible search result center');
  }
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Number.isFinite(state.navState?.focusedIndex ?? state.focusedNode) &&
      String(document.body.dataset.graphContext || '').startsWith('focus');
  }, null, { timeout: 8000 });
  await waitForPanelSurface(page, ['focus', 'focus-search', 'map-focus', 'map-focus-search'], 8000).catch(() => {});
  await waitForUiSettled(page, 8000);
}

async function forceFocusVisibleResult(page) {
  await page.evaluate((knownIndex) => {
    const row = document.querySelector('.search-result-item[data-index]');
    const index = Number(row?.dataset?.index);
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const fallback = state.searchResults?.[0]?.index ?? knownIndex;
    const target = Number.isFinite(index) ? index : fallback;
    window.__APP_ACTIONS__?.focusOnNode?.(target, { fromSearchResult: true, skipUrlSync: true });
    window.__APP_ACTIONS__?.setTrailDepth?.(1, { skipUrlSync: true });
    window.__APP_ACTIONS__?.refreshCompositionState?.();
  }, KNOWN_COFFEE_INDEX);
  await markRouteEvidence(page, 'test-forced-state', 'forceFocusVisibleResult fallback');
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Number.isFinite(state.navState?.focusedIndex ?? state.focusedNode) &&
      String(document.body.dataset.graphContext || '').startsWith('focus');
  }, null, { timeout: 12000 });
  await waitForPanelSurface(page, ['focus', 'focus-search'], 8000).catch(() => {});
  await waitForUiSettled(page, 8000);
}

async function previewFirstNeighbor(page) {
  const pill = page.locator('.focus-stage-neighbor-pill[data-index]').first();
  if (await pill.count()) {
    await pill.scrollIntoViewIfNeeded();
    const clicked = await pill.click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!clicked) {
      const forced = await pill.click({ timeout: 5000, force: true }).then(() => true).catch(() => false);
      if (!forced) {
        await page.evaluate(() => document.querySelector('.focus-stage-neighbor-pill[data-index]')?.click());
        await markRouteEvidence(page, 'debug-probe', 'DOM click fallback for first neighbor pill');
      } else {
        await markRouteEvidence(page, 'real-click', 'forced Playwright click on first neighbor pill');
      }
    } else {
      await markRouteEvidence(page, 'real-click', 'clicked first neighbor pill');
    }
    await page.waitForFunction(() => {
      const surface = document.body.dataset.threadInspectSurface || 'idle';
      return surface !== 'idle' || Boolean(document.querySelector('#focus-thread-inspector:not([hidden])'));
    }, null, { timeout: 8000 }).catch(() => {});
    await waitForUiSettled(page, 8000);
    return true;
  }
  return false;
}

async function followInspectedNeighbor(page) {
  const follow = page.locator('#btn-thread-follow');
  if (await follow.count()) {
    const disabled = await follow.first().evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true');
    if (!disabled) {
      const clicked = await follow.first().click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!clicked) {
        await page.evaluate(() => document.getElementById('btn-thread-follow')?.click());
        await markRouteEvidence(page, 'debug-probe', 'DOM click fallback for follow connection');
      } else {
        await markRouteEvidence(page, 'real-click', 'clicked follow connection');
      }
      await waitForUiSettled(page, 8000);
      return true;
    }
  }

  const secondPill = page.locator('.focus-stage-neighbor-pill[data-index]').nth(1);
  if (await secondPill.count()) {
    const clicked = await secondPill.click({ timeout: 5000, force: true }).then(() => true).catch(() => false);
    if (!clicked) {
      await page.evaluate(() => document.querySelectorAll('.focus-stage-neighbor-pill[data-index]')[1]?.click());
      await markRouteEvidence(page, 'debug-probe', 'DOM click fallback for second neighbor pill');
    } else {
      await markRouteEvidence(page, 'real-click', 'forced Playwright click on second neighbor pill');
    }
    await waitForUiSettled(page, 8000);
    return true;
  }
  return false;
}

async function waitForSemanticDiveState(page, timeout = 12000) {
  return page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return document.body.dataset.panelSurface === 'semantic-dive' ||
      document.body.dataset.semanticDive === 'active' ||
      state.semanticDiveMode === true ||
      state.trailDepth >= 2;
  }, null, { timeout });
}

async function waitForSemanticDiveActive(page, timeout = 12000) {
  return page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return document.body.dataset.panelSurface === 'semantic-dive' &&
      state.semanticDiveMode === true &&
      Number(state.trailDepth || document.body.dataset.trailDepth || 0) >= 2;
  }, null, { timeout });
}

async function enterSemanticDive(page) {
  let clicked = false;
  const journeyInsideButton = page.locator('button[data-journey-action="enter-inside"]:visible').first();
  if (await journeyInsideButton.count()) {
    clicked = await journeyInsideButton.click({ timeout: 5000, noWaitAfter: true }).then(() => true).catch(() => false);
    if (clicked) await markRouteEvidence(page, 'real-click', 'clicked journey compass enter-inside action');
  }

  const button = page.locator('#btn-focus-dive:visible').first();
  if (!clicked && await button.count()) {
    const disabled = await button.evaluate((el) =>
      el.disabled || el.inert || el.hidden || el.getAttribute('aria-disabled') === 'true'
    ).catch(() => true);
    if (!disabled) {
      clicked = await button.click({ timeout: 5000, noWaitAfter: true }).then(() => true).catch(() => false);
      if (clicked) await markRouteEvidence(page, 'real-click', 'clicked #btn-focus-dive');
    }
  }
  let naturalDive = await waitForSemanticDiveState(page, clicked ? 5000 : 500).then(() => true).catch(() => false);
  if (!clicked) {
    const stepInside = page.getByRole('button', { name: /step inside/i }).first();
    if (!naturalDive && await stepInside.count()) {
      clicked = await stepInside.click({ timeout: 5000, noWaitAfter: true }).then(() => true).catch(() => false);
      if (clicked) await markRouteEvidence(page, 'real-click', 'clicked Step Inside button by role');
      naturalDive = await waitForSemanticDiveState(page, clicked ? 5000 : 500).then(() => true).catch(() => false);
    }
  }

  if (!naturalDive) throw new Error('Timed out entering semantic dive through the visible product route');

  await waitForSemanticDiveState(page, 12000);
  await waitForSemanticDiveActive(page, 12000);
  await waitForPanelSurface(page, 'semantic-dive', 8000);
  await waitForUiSettled(page, 8000);
}

async function clickVisibleSemanticDive(page) {
  const journeyInsideButton = page.locator('button[data-journey-action="enter-inside"]:visible').first();
  if (await journeyInsideButton.count()) {
    await journeyInsideButton.click({ timeout: 8000, noWaitAfter: true });
    await markRouteEvidence(page, 'real-click', 'clicked journey compass enter-inside action');
    await waitForSemanticDiveState(page, 8000);
    await waitForSemanticDiveActive(page, 12000);
    await waitForPanelSurface(page, 'semantic-dive', 8000);
    await waitForUiSettled(page, 8000);
    return;
  }

  const focusDive = page.locator('#btn-focus-dive:visible').first();
  if (await focusDive.count()) {
    await focusDive.click({ timeout: 8000, noWaitAfter: true });
    await markRouteEvidence(page, 'real-click', 'clicked #btn-focus-dive');
    await waitForSemanticDiveState(page, 8000);
    await waitForSemanticDiveActive(page, 12000);
    await waitForPanelSurface(page, 'semantic-dive', 8000);
    await waitForUiSettled(page, 8000);
    return;
  }

  const stepInside = page.getByRole('button', { name: /step inside/i }).first();
  await stepInside.click({ timeout: 8000, noWaitAfter: true });
  await markRouteEvidence(page, 'real-click', 'clicked Step Inside button by role');
  await waitForSemanticDiveState(page, 8000);
  await waitForSemanticDiveActive(page, 12000);
  await waitForPanelSurface(page, 'semantic-dive', 8000);
  await waitForUiSettled(page, 8000);
}

async function enterMap(page) {
  let clicked = false;
  const insideMap = page.locator('#btn-inside-map:visible').first();
  if (await insideMap.count()) {
    clicked = await insideMap.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
    if (clicked) await markRouteEvidence(page, 'real-click', 'clicked semantic-dive inside Map button');
  }
  if (!clicked) {
    const mapAction = page.locator('button[data-journey-action="open-map"]:visible').first();
    if (await mapAction.count()) {
      clicked = await mapAction.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
      if (clicked) await markRouteEvidence(page, 'real-click', 'clicked journey open-map action');
    }
  }
  if (!clicked) {
    await page.evaluate(() => {
      const actions = window.__APP_ACTIONS__ || {};
      if (typeof actions.switchView === 'function') actions.switchView('map', { skipUrlSync: true, silentHandoff: true });
      else if (typeof actions.setActiveView === 'function') actions.setActiveView('map');
      else if (typeof actions.showMapView === 'function') actions.showMapView();
      else {
        const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
        state.currentView = 'map';
        document.body.dataset.activeView = 'map';
      }
      actions.refreshCompositionState?.();
    });
    await markRouteEvidence(page, 'debug-probe', 'switchView("map") app-action route');
  }
  await page.waitForFunction(() => document.body.dataset.activeView === 'map', null, { timeout: 12000 });
  await waitForPanelSurface(page, ['map-trail', 'map-focus', 'map-focus-search', 'map-search'], 8000).catch(() => {});
  await waitForUiSettled(page, 8000);
}

async function clickVisibleMap(page) {
  const insideMap = page.locator('#btn-inside-map:visible').first();
  if (await insideMap.count()) {
    await insideMap.click({ timeout: 8000, noWaitAfter: true });
    await markRouteEvidence(page, 'real-click', 'clicked semantic-dive inside Map button');
  } else {
    const mapAction = page.locator('button[data-journey-action="open-map"]:visible').first();
    await mapAction.click({ timeout: 8000, noWaitAfter: true });
    await markRouteEvidence(page, 'real-click', 'clicked journey open-map action');
  }
  await page.waitForFunction(() => document.body.dataset.activeView === 'map', null, { timeout: 12000 });
  await waitForPanelSurface(page, ['map-trail', 'map-focus', 'map-focus-search', 'map-search'], 8000).catch(() => {});
  await waitForUiSettled(page, 8000);
}

async function resetToCounty(page) {
  let clicked = false;
  const mapReset = page.locator('.map-trail-strip .trail-strip-btn[data-journey-action="county-overview"]:visible').first();
  if (await mapReset.count()) {
    clicked = await mapReset.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
    if (clicked) await markRouteEvidence(page, 'real-click', 'clicked map trail Reset button');
  }
  if (!clicked) {
    const county = page.locator('#btn-focus-overview:visible, #btn-inside-county:visible, button[data-journey-action="county-overview"]:visible').first();
    if (await county.count()) {
      clicked = await county.click({ timeout: 8000, noWaitAfter: true }).then(() => true).catch(() => false);
      if (clicked) await markRouteEvidence(page, 'real-click', 'clicked visible County reset action');
    }
  }
  if (!clicked) {
    await page.evaluate(() => {
      window.__APP_ACTIONS__?.setTrailDepth?.(0, { skipUrlSync: true });
      window.__APP_ACTIONS__?.clearSearch?.({ skipUrlSync: true });
      window.__APP_ACTIONS__?.refreshCompositionState?.();
    });
    await markRouteEvidence(page, 'debug-probe', 'resetToCounty app-action route');
  }
  await page.waitForFunction(() => {
    const surface = document.body.dataset.panelSurface || '';
    return surface === 'idle' || surface === 'map-idle' || surface === 'map-trail' || surface === 'search';
  }, null, { timeout: 8000 }).catch(() => {});
  await waitForUiSettled(page, 8000);
}

async function clickVisibleCountyReset(page) {
  const mapReset = page.locator('.map-trail-strip .trail-strip-btn[data-journey-action="county-overview"]:visible').first();
  if (await mapReset.count()) {
    await mapReset.click({ timeout: 8000, noWaitAfter: true });
    await markRouteEvidence(page, 'real-click', 'clicked map trail Reset button');
  } else {
    const county = page.locator('#btn-focus-overview:visible, #btn-inside-county:visible, button[data-journey-action="county-overview"]:visible').first();
    await county.click({ timeout: 8000, noWaitAfter: true });
    await markRouteEvidence(page, 'real-click', 'clicked visible County reset action');
  }
  await page.waitForFunction(() => {
    const surface = document.body.dataset.panelSurface || '';
    return surface === 'idle' || surface === 'map-idle' || surface === 'map-trail' || surface === 'search';
  }, null, { timeout: 8000 }).catch(() => {});
  await waitForUiSettled(page, 8000);
}

async function capture(page, label, artifacts) {
  const png = path.join(outDir, `${label}.png`);
  const json = path.join(outDir, `${label}.json`);
  await page.screenshot({ path: png, fullPage: true });
  const state = await page.evaluate(() => {
    const rectFromElement = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        display: style.display,
        visibility: style.visibility,
        opacity: Number.parseFloat(style.opacity || '1'),
        pointerEvents: style.pointerEvents,
        overflowY: style.overflowY,
        zIndex: style.zIndex,
        hidden: el.hidden || el.getAttribute('aria-hidden') === 'true',
        dataset: { ...el.dataset },
      };
    };
    const app = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value[Symbol.iterator] === 'function') return Array.from(value);
      return [];
    };
    const bodyDataset = { ...document.body.dataset };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const focusedIndex = app.navState?.focusedIndex ?? app.focusedNode ?? null;
    const points = toArray(app.points);
    const focusedPoint = Number.isFinite(focusedIndex) ? points[focusedIndex] : null;
    const selectors = [
      '#canvas-container',
      '#loading-overlay',
      '#info-panel',
      '.search-container',
      '#search-results',
      '#mode-grid',
      '#focus-stage',
      '.focus-stage-card',
      '.focus-stage-dive-btn',
      '.focus-stage-neighbors',
      '.focus-stage-journey.active',
      '#focus-stage-neighbor-list',
      '#focus-stage-inside-status',
      '#focus-stage-inside-controls',
      '#btn-inside-next',
      '#selected-card',
      '#selected-details',
      '#selected-map-summary',
      '#selected-map-summary-name',
      '#selected-map-summary-what',
      '#selected-map-summary-role',
      '#selected-map-summary-match',
      '#focus-thread-inspector',
      '#btn-inside-map',
      '#btn-inside-county',
      '.map-trail-strip',
      '#journey-compass',
      '#btn-journey-primary',
      '#btn-journey-secondary',
      '#btn-journey-tertiary',
      '.controls',
      '.panel-toggle',
      '.share-toggle',
      '.help-toggle',
      '#btn-legend',
      '#btn-share-view',
      '#btn-keyboard-help',
      '.view-toggle',
      '.view-handoff',
      '.weather-widget',
    ];
    const rects = Object.fromEntries(selectors.map((selector) => [
      selector,
      rectFromElement(document.querySelector(selector)),
    ]));
    const journeyActions = ['btn-journey-primary', 'btn-journey-secondary', 'btn-journey-tertiary'].map((id) => {
      const button = document.getElementById(id);
      if (!button) return null;
      const beforeContent = getComputedStyle(button, '::before').content;
      const compactLabel = beforeContent && beforeContent !== 'none' && beforeContent !== 'normal'
        ? beforeContent.replace(/^["']|["']$/g, '')
        : '';
      return {
        id,
        text: button.textContent.replace(/\s+/g, ' ').trim(),
        compactLabel,
        action: button.dataset.journeyAction || '',
        disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
        hidden: button.hidden || button.getAttribute('aria-hidden') === 'true',
        rect: rectFromElement(button),
      };
    }).filter(Boolean);
    const mapStrip = (() => {
      const el = document.querySelector('.map-trail-strip');
      if (!el) {
        return { exists: false, childCount: 0, titleCount: 0, buttonCount: 0 };
      }
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
    const railPills = [...document.querySelectorAll('.focus-stage-neighbor-pill')].slice(0, 10).map((pill) => ({
      text: pill.textContent.replace(/\s+/g, ' ').trim(),
      role: pill.dataset.relationshipRole || '',
      index: pill.dataset.index || '',
      active: pill.classList.contains('is-inspected') || pill.classList.contains('is-exploring'),
      rect: rectFromElement(pill),
    }));
    const searchRows = [...document.querySelectorAll('.search-result-item')].slice(0, 8).map((row) => ({
      text: row.textContent.replace(/\s+/g, ' ').trim().slice(0, 320),
      index: row.dataset.index || '',
      rect: rectFromElement(row),
    }));
    const controls = [...document.querySelectorAll('button, [role="button"], input')].map((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        cls: String(el.className || '').slice(0, 120),
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100),
        rect: rectFromElement(el),
      };
    }).filter(Boolean);
    const smallTargets = controls.filter((control) =>
      control.rect.width < 40 || control.rect.height < 40
    );
    const visible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.05 &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.x < window.innerWidth &&
        rect.y < window.innerHeight &&
        !el.hidden &&
        el.getAttribute('aria-hidden') !== 'true';
    };
    const simpleRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: Number(rect.x.toFixed(1)),
        y: Number(rect.y.toFixed(1)),
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
      };
    };
    const cssContent = (value) => {
      if (!value || value === 'none' || value === 'normal') return '';
      return value.replace(/^["']|["']$/g, '').replace(/\\"/g, '"').trim();
    };
    const textFor = (el) => {
      const style = getComputedStyle(el);
      const before = cssContent(getComputedStyle(el, '::before').content);
      const after = cssContent(getComputedStyle(el, '::after').content);
      const candidates = [
        Number.parseFloat(style.fontSize || '0') <= 0.5 ? `${before} ${after}` : '',
        el.textContent,
        el.value,
        el.getAttribute('aria-label'),
        el.getAttribute('placeholder'),
        before,
      ];
      return candidates
        .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
    };
    const isClipped = (el) => {
      const text = textFor(el);
      if (!text || text.length < 2) return false;
      const style = getComputedStyle(el);
      if (Number.parseFloat(style.fontSize || '0') <= 0.5 && text) return false;
      const rect = el.getBoundingClientRect();
      if (style.overflow === 'visible' && style.whiteSpace !== 'nowrap') return false;
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    };
    const overlaps = (a, b, tolerance = 2) => (
      a && b &&
      !(a.right <= b.x + tolerance || b.right <= a.x + tolerance || a.bottom <= b.y + tolerance || b.bottom <= a.y + tolerance)
    );
    const textSelectors = [
      '.map-strip-title',
      '.trail-strip-btn',
      '.search-result-item',
      '.focus-stage-name',
      '.focus-stage-summary',
      '.focus-stage-dive-btn',
      '.focus-stage-neighbor-pill',
      '#focus-thread-inspector-title',
      '#focus-thread-inspector-copy',
      '#focus-thread-inspector-meta',
      '#btn-thread-pin',
      '#btn-thread-follow',
      '#btn-thread-clear',
      '#btn-inside-map',
      '#btn-inside-county',
      '.journey-compass-title',
      '.journey-compass-action',
    ];
    const textClipping = textSelectors.flatMap((selector) => (
      [...document.querySelectorAll(selector)]
        .filter(visible)
        .filter(isClipped)
        .slice(0, 6)
        .map((el) => ({
          selector,
          text: textFor(el).slice(0, 120),
          rect: simpleRect(el),
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
        }))
    ));
    const blankVisibleLabels = [...document.querySelectorAll('button, [role="button"], .map-strip-title, .journey-compass-title')]
      .filter(visible)
      .map((el) => ({
        selector: el.id ? `#${el.id}` : el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : el.tagName.toLowerCase(),
        text: textFor(el),
        action: el.dataset?.journeyAction || '',
        rect: simpleRect(el),
      }))
      .filter((entry) => !entry.text && entry.rect.width >= 18 && entry.rect.height >= 18)
      .slice(0, 12);
    const leakedHiddenControls = [...document.querySelectorAll('button[hidden], [role="button"][hidden], button[aria-hidden="true"], [role="button"][aria-hidden="true"]')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0.05 &&
          rect.width >= 18 &&
          rect.height >= 18 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.x < window.innerWidth &&
          rect.y < window.innerHeight;
      })
      .map((el) => ({
        selector: el.id ? `#${el.id}` : el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : el.tagName.toLowerCase(),
        text: textFor(el),
        hiddenAttr: el.hidden,
        ariaHidden: el.getAttribute('aria-hidden') || '',
        rect: simpleRect(el),
      }))
      .slice(0, 12);
    const crampedSearchRows = (() => {
      if (bodyDataset.panelSurface !== 'search' || bodyDataset.panelSurfaceDetail !== 'peek') return [];
      const results = document.querySelector('#search-results.active');
      if (!visible(results)) return [];
      const resultsRect = simpleRect(results);
      return [...document.querySelectorAll('#search-results.active .search-result-item')]
        .filter(visible)
        .map((row) => {
          const rect = simpleRect(row);
          return {
            text: textFor(row).slice(0, 120),
            rect,
            resultsRect,
            tooNarrow: rect.width < resultsRect.width * 0.86,
            escapesResults: rect.bottom > resultsRect.bottom + 1,
          };
        })
        .filter((entry) => entry.tooNarrow || entry.escapesResults)
        .slice(0, 12);
    })();
    const colorBrightness = (color) => {
      const match = String(color || '').match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const [r, g, b] = match[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part));
      if (![r, g, b].every(Number.isFinite)) return null;
      return (r * 299 + g * 587 + b * 114) / 1000;
    };
    const lowContrastSearchPeekText = (() => {
      if (bodyDataset.panelSurface !== 'search' || bodyDataset.panelSurfaceDetail !== 'peek') return [];
      return [...document.querySelectorAll('#search-results.active .search-result-item, #search-results.active .search-result-name, #search-results.active .search-result-rank')]
        .filter(visible)
        .map((el) => {
          const style = getComputedStyle(el);
          return {
            selector: el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : el.tagName.toLowerCase(),
            text: textFor(el).slice(0, 120),
            color: style.color,
            brightness: colorBrightness(style.color),
            rect: simpleRect(el),
          };
        })
        .filter((entry) => Number.isFinite(entry.brightness) && entry.brightness < 145)
        .slice(0, 12);
    })();
    const severeTapTargets = controls
      .filter((control) => {
        const el = control.id
          ? document.getElementById(control.id)
          : [...document.querySelectorAll('button, [role="button"], input')].find((candidate) => simpleRect(candidate).x === control.rect.x && simpleRect(candidate).y === control.rect.y);
        if (el) {
          const style = getComputedStyle(el);
          if (style.pointerEvents === 'none' || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
        }
        if (control.rect.pointerEvents === 'none') return false;
        return control.rect.width < 32 || control.rect.height < 30;
      })
      .slice(0, 20);
    const overlapPairs = [
      ['.search-container', '#focus-stage'],
      ['.search-container', '#focus-thread-inspector'],
      ['#info-panel', '#focus-stage'],
      ['#info-panel', '#focus-thread-inspector'],
      ['.map-trail-strip', '#info-panel'],
      ['.map-trail-strip', '.search-container'],
      ['.map-trail-strip', '.view-toggle'],
      ['.journey-compass', '.search-container'],
      ['.journey-compass', '#focus-stage'],
      ['.journey-compass', '#focus-thread-inspector'],
    ];
    const unexpectedOverlaps = overlapPairs
      .map(([a, b]) => {
        const aEl = document.querySelector(a);
        const bEl = document.querySelector(b);
        if (!visible(aEl) || !visible(bEl)) return null;
        const aRect = simpleRect(aEl);
        const bRect = simpleRect(bEl);
        return overlaps(aRect, bRect) ? { a, b, aRect, bRect } : null;
      })
      .filter(Boolean);
    const visiblePrimarySurfaces = ['.search-container', '#search-results', '#info-panel', '#focus-stage', '#focus-thread-inspector', '.map-trail-strip', '.view-handoff']
      .map((selector) => {
        const el = document.querySelector(selector);
        if (!visible(el)) return null;
        const rect = simpleRect(el);
        const visibleText = (() => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          const chunks = [];
          let node = walker.nextNode();
          while (node) {
            const parent = node.parentElement;
            if (parent && visible(parent)) chunks.push(node.nodeValue || '');
            node = walker.nextNode();
          }
          return chunks.join(' ').replace(/\s+/g, ' ').trim();
        })();
        return {
          selector,
          rect,
          areaRatio: Number(((rect.width * rect.height) / (window.innerWidth * window.innerHeight)).toFixed(3)),
          textChars: visibleText.length,
        };
      })
      .filter(Boolean);
    const overflows = selectors.map((selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      return {
        selector,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowX: Math.max(0, el.scrollWidth - el.clientWidth),
        overflowY: Math.max(0, el.scrollHeight - el.clientHeight),
      };
    }).filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      viewport,
      bodyDataset,
      scroll: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        overflowY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      },
      appState: {
        points: points.length,
        semanticThreads: app.semanticNeighborMapByLeadId?.size ?? 0,
        semanticThreadsStatus: app.semanticThreadsStatus || '',
        semanticSpaceLayoutStatus: app.semanticSpaceLayoutStatus || '',
        semanticSpaceLayoutRows: Number(app.semanticSpaceLayoutManifest?.rows ?? 0),
        semanticSpaceLayoutEdges: Number(app.semanticSpaceLayoutManifest?.edges ?? 0),
        semanticSpaceLayoutError: app.semanticSpaceLayoutError || '',
        graphicsMode: bodyDataset.graphicsMode || '',
        activeView: bodyDataset.activeView || '',
        panelSurface: bodyDataset.panelSurface || '',
        graphContext: bodyDataset.graphContext || '',
        semanticDive: bodyDataset.semanticDive || '',
        focusedIndex,
        focusedName: focusedPoint?.name || '',
        navMode: app.navState?.mode || '',
        trailDepth: app.trailDepth ?? null,
        threadSource: app.navState?.threadSource || '',
        candidateCount: app.navState?.threadCandidates?.length ?? 0,
        walkHistory: toArray(app.navState?.walkHistoryIndices),
        lastTraversalReason: app.navState?.lastTraversalReason || '',
      },
      routeEvidence: {
        source: bodyDataset.productRouteEvidence || 'real-route',
        detail: bodyDataset.productRouteEvidenceDetail || 'initial route load',
      },
      journeyActions,
      mapStrip,
      focusText: document.querySelector('#focus-stage')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 1200) || '',
      inspectorText: document.querySelector('#focus-thread-inspector')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 700) || '',
      searchText: document.querySelector('#search-results')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 1000) || '',
      railPills,
      searchRows,
      rects,
      overflows,
      smallTargets: smallTargets.slice(0, 30),
      ergonomics: {
        textClipping,
        blankVisibleLabels,
        leakedHiddenControls,
        crampedSearchRows,
        lowContrastSearchPeekText,
        severeTapTargets,
        unexpectedOverlaps,
        visiblePrimarySurfaces,
        visibleTextChars: {
          primarySurfaces: visiblePrimarySurfaces.reduce((sum, surface) => sum + Number(surface.textChars || 0), 0),
        },
      },
    };
  });
  if (VISUAL_ERGONOMICS) {
    state.pixelQuality = await analyzeScreenshotQuality(png, state);
  }
  await fs.writeFile(json, `${JSON.stringify(state, null, 2)}\n`);
  artifacts.push({ label, png, json, state });
  console.log(`[capture] ${label}`);
  return state;
}

function rendered(rect) {
  return Boolean(rect) &&
    rect.display !== 'none' &&
    rect.visibility !== 'hidden' &&
    Number(rect.opacity ?? 1) > 0.05 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.hidden !== true;
}

function insideViewport(rect, viewport, tolerance = 1) {
  return rendered(rect) &&
    rect.x >= -tolerance &&
    rect.y >= -tolerance &&
    rect.right <= viewport.width + tolerance &&
    rect.bottom <= viewport.height + tolerance;
}

function expectedCompactJourneyLabel(action) {
  return ({
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
}

/**
 * Hardened contract for the new map-trail-strip design: the strip is a
 * passive display surface that shows the focused business name. The
 * action buttons it used to render were removed in the 2026-06-04
 * fix batch (D36) because they duplicated the right-panel chip rail.
 * This assertion codifies the new design and prevents regressions
 * in either direction (buttons reappearing, or the title getting lost).
 *
 * For each artifact state, the strip is expected to:
 *   1. exist (.map-trail-strip) and be rendered when the trail owns
 *      navigation (data-journey-navigation-owner='map-trail-strip' and
 *      currentView==='map'); be hidden otherwise.
 *   2. contain exactly ONE child element with class .map-strip-title
 *      and ZERO .trail-strip-btn descendants.
 *   3. The title has non-empty text matching its title/aria-label.
 *   4. The title does not overflow the strip (scrollWidth <= clientWidth).
 *   5. When the strip is rendered, it sits at the top of the viewport
 *      (y < 200px) and has positive size.
 */
function assertMapTrailTitleOnly(artifacts) {
  const assertions = [];
  const pass = (label, check) => assertions.push({ level: 'pass', label, check });
  const fail = (label, check, msg) => assertions.push({ level: 'fail', label, check, msg });

  for (const { label, state } of artifacts) {
    const navOwner = state.bodyDataset?.journeyNavigationOwner || '';
    const view = state.bodyDataset?.activeView || '';
    const shouldBeVisible = navOwner === 'map-trail-strip' && view === 'map';
    const stripRect = state.rects?.['.map-trail-strip'];
    const strip = state.mapStrip || { exists: false };

    if (!shouldBeVisible) {
      // Strip should be hidden in non-trail states.
      const isHidden = !strip.exists
        || !stripRect
        || stripRect.hidden === true
        || stripRect.display === 'none'
        || stripRect.width === 0
        || stripRect.height === 0;
      if (isHidden) {
        pass(label, 'map-strip:hidden-when-not-owner');
      } else {
        fail(label, 'map-strip:hidden-when-not-owner',
          `map-trail-strip should be hidden when navOwner="${navOwner}" view="${view}", got rect=${JSON.stringify(stripRect)}`);
      }
      continue;
    }

    // Strip is expected to be visible — run the full contract checks.
    if (!stripRect || stripRect.width === 0 || stripRect.height === 0) {
      fail(label, 'map-strip:visible-when-owner',
        `map-trail-strip should be rendered when navOwner=map-trail-strip view=map, got ${JSON.stringify(stripRect)}`);
      continue;
    }

    // Position: must be near the top of the viewport, not pushed off-screen.
    if (stripRect.y > 200) {
      fail(label, 'map-strip:top-position',
        `map-trail-strip should be near the top of the viewport, got y=${stripRect.y}`);
    } else {
      pass(label, 'map-strip:top-position');
    }

    if (!strip.exists) {
      fail(label, 'map-strip:strip-element-missing',
        `map-trail-strip rect exists but element could not be queried`);
      continue;
    }

    // Zero buttons — the D36 fix removed them; if they reappear, the same
    // actions would also live in the right-panel chip rail and create duplicates.
    if (strip.buttonCount === 0) {
      pass(label, 'map-strip:no-trail-strip-buttons');
    } else {
      fail(label, 'map-strip:no-trail-strip-buttons',
        `map-trail-strip should not contain any .trail-strip-btn (those were removed in D36; same actions live in the right-panel chip rail), got ${strip.buttonCount} buttons`);
    }

    // Exactly one child, and it must be the title.
    if (strip.childCount === 1 && strip.titleCount === 1) {
      pass(label, 'map-strip:exactly-one-title-child');
    } else {
      fail(label, 'map-strip:exactly-one-title-child',
        `map-trail-strip should have exactly one .map-strip-title child, got ${strip.childCount} children, ${strip.titleCount} title(s), childClasses="${strip.childClasses}"`);
    }

    if (strip.titleCount !== 1) continue;

    // Title text content.
    if (strip.titleText && strip.titleText.length > 0) {
      pass(label, 'map-strip:title-has-content');
    } else {
      fail(label, 'map-strip:title-has-content',
        `map-strip-title should have non-empty text content, got "${strip.titleText}"`);
    }

    // title attribute matches text (for tooltip on hover).
    if (strip.titleAttr === strip.titleText) {
      pass(label, 'map-strip:title-attr-matches-text');
    } else {
      fail(label, 'map-strip:title-attr-matches-text',
        `map-strip-title title attribute should match text content, got title="${strip.titleAttr}" text="${strip.titleText}"`);
    }

    // aria-label matches text (for screen readers).
    if (strip.ariaLabel === strip.titleText) {
      pass(label, 'map-strip:aria-label-matches-text');
    } else {
      fail(label, 'map-strip:aria-label-matches-text',
        `map-strip-title aria-label should match text content, got aria-label="${strip.ariaLabel}" text="${strip.titleText}"`);
    }

    // No text clipping within the title.
    if (strip.titleScrollWidth <= strip.titleClientWidth + 1) {
      pass(label, 'map-strip:title-not-clipped');
    } else {
      fail(label, 'map-strip:title-not-clipped',
        `map-strip-title text is clipped: scrollWidth=${strip.titleScrollWidth} clientWidth=${strip.titleClientWidth} text="${strip.titleText}"`);
    }
  }

  return assertions;
}

function assertCompactJourneyActionLabels(artifacts) {
  const assertions = [];
  const pass = (label, check) => assertions.push({ level: 'pass', label, check });
  const fail = (label, check, msg) => assertions.push({ level: 'fail', label, check, msg });

  for (const { label, state } of artifacts) {
    const visibleCompactActions = (state?.journeyActions || []).filter((action) =>
      action?.compactLabel &&
      action?.action &&
      rendered(action.rect) &&
      !action.hidden &&
      !action.disabled
    );
    const mismatches = visibleCompactActions
      .map((action) => ({
        id: action.id,
        action: action.action,
        text: action.text,
        compactLabel: action.compactLabel,
        expected: expectedCompactJourneyLabel(action.action),
      }))
      .filter((action) => action.expected && action.compactLabel !== action.expected);

    if (mismatches.length === 0) pass(label, 'compact-actions:semantic-labels');
    else fail(label, 'compact-actions:semantic-labels', JSON.stringify(mismatches));
  }

  return assertions;
}

function clippedVisibleHeight(container, child) {
  if (!container || !child) return 0;
  return Math.max(
    0,
    Math.min(container.bottom, child.bottom) - Math.max(container.y, child.y),
  );
}

function assertProductOwnership(artifacts) {
  const byLabel = new Map(artifacts.map((artifact) => [artifact.label, artifact.state]));
  const assertions = [];
  const pass = (label, check) => assertions.push({ level: 'pass', label, check });
  const fail = (label, check, msg) => assertions.push({ level: 'fail', label, check, msg });
  const state = (label) => byLabel.get(label);
  const rect = (snapshot, selector) => snapshot?.rects?.[selector];

  const mobileIdle = state('01-mobile-idle');
  if (mobileIdle) {
    if (mobileIdle.appState?.semanticSpaceLayoutStatus === 'ready') pass('01-mobile-idle', 'semantic-space-layout:ready');
    else fail('01-mobile-idle', 'semantic-space-layout:ready', `expected ready, got ${mobileIdle.appState?.semanticSpaceLayoutStatus || 'none'} (${mobileIdle.appState?.semanticSpaceLayoutError || 'no error detail'})`);
    if (mobileIdle.appState?.semanticSpaceLayoutRows === mobileIdle.appState?.points) pass('01-mobile-idle', 'semantic-space-layout:rows-match-points');
    else fail('01-mobile-idle', 'semantic-space-layout:rows-match-points', `rows ${mobileIdle.appState?.semanticSpaceLayoutRows} != points ${mobileIdle.appState?.points}`);
    if (mobileIdle.appState?.semanticSpaceLayoutEdges > 0) pass('01-mobile-idle', 'semantic-space-layout:edges-present');
    else fail('01-mobile-idle', 'semantic-space-layout:edges-present', `expected positive manifest edge count, got ${mobileIdle.appState?.semanticSpaceLayoutEdges}`);
  }

  const mobileSearch = state('02-mobile-search-coffee');
  if (mobileSearch) {
    const search = rect(mobileSearch, '.search-container');
    const results = rect(mobileSearch, '#search-results');
    const modeGrid = rect(mobileSearch, '#mode-grid');
    if (mobileSearch.bodyDataset?.panelSurface === 'search') pass('02-mobile-search-coffee', 'mobile-search:panel-surface');
    else fail('02-mobile-search-coffee', 'mobile-search:panel-surface', `expected search, got ${mobileSearch.bodyDataset?.panelSurface || 'none'}`);
    if (rendered(search) && insideViewport(search, mobileSearch.viewport)) pass('02-mobile-search-coffee', 'mobile-search:search-visible');
    else fail('02-mobile-search-coffee', 'mobile-search:search-visible', `.search-container should own search surface, got ${JSON.stringify(search)}`);
    if (rendered(results)) pass('02-mobile-search-coffee', 'mobile-search:results-visible');
    else fail('02-mobile-search-coffee', 'mobile-search:results-visible', `#search-results should be visible, got ${JSON.stringify(results)}`);
    if (!rendered(modeGrid)) pass('02-mobile-search-coffee', 'mobile-search:mode-grid-hidden');
    else fail('02-mobile-search-coffee', 'mobile-search:mode-grid-hidden', `#mode-grid leaked into search, got ${JSON.stringify(modeGrid)}`);
  }

  const mobileFocus = state('04-mobile-focus-first-result');
  if (mobileFocus) {
    const panel = mobileFocus.bodyDataset?.panelSurface || '';
    const search = rect(mobileFocus, '.search-container');
    const focusStage = rect(mobileFocus, '#focus-stage');
    if (panel === 'focus' || panel === 'focus-search') pass('04-mobile-focus-first-result', 'mobile-focus:panel-surface');
    else fail('04-mobile-focus-first-result', 'mobile-focus:panel-surface', `expected focus/focus-search, got ${panel || 'none'}`);
    if (rendered(focusStage) && insideViewport(focusStage, mobileFocus.viewport)) pass('04-mobile-focus-first-result', 'mobile-focus:focus-stage-visible');
    else fail('04-mobile-focus-first-result', 'mobile-focus:focus-stage-visible', `#focus-stage should own focus surface, got ${JSON.stringify(focusStage)}`);
    if (!rendered(search)) pass('04-mobile-focus-first-result', 'mobile-focus:search-hidden');
    else fail('04-mobile-focus-first-result', 'mobile-focus:search-hidden', `.search-container should hand off to focus stage, got ${JSON.stringify(search)}`);
    const primaryAction = (mobileFocus.journeyActions || []).find((action) => action.id === 'btn-journey-primary');
    if (primaryAction?.action === 'enter-inside' && primaryAction.compactLabel === 'Inside') {
      pass('04-mobile-focus-first-result', 'mobile-focus:compact-primary-action-label');
    } else {
      fail('04-mobile-focus-first-result', 'mobile-focus:compact-primary-action-label',
        `expected enter-inside to render compact label "Inside", got ${JSON.stringify(primaryAction)}`);
    }
    const neighborList = rect(mobileFocus, '#focus-stage-neighbor-list');
    const railPills = mobileFocus.railPills || [];
    if (rendered(neighborList) && railPills.length >= 2) {
      const secondPill = railPills[1]?.rect;
      const thirdPill = railPills[2]?.rect;
      if (secondPill?.bottom <= neighborList.bottom + 1) {
        pass('04-mobile-focus-first-result', 'mobile-focus:neighbor-second-card-unclipped');
      } else {
        fail('04-mobile-focus-first-result', 'mobile-focus:neighbor-second-card-unclipped',
          `second neighbor should fit inside the rail: list=${JSON.stringify(neighborList)} card=${JSON.stringify(secondPill)}`);
      }
      if (!rendered(thirdPill)) {
        pass('04-mobile-focus-first-result', 'mobile-focus:neighbor-rail-no-card-sliver');
      } else {
        const thirdVisibleHeight = clippedVisibleHeight(neighborList, thirdPill);
        fail('04-mobile-focus-first-result', 'mobile-focus:neighbor-rail-no-card-sliver',
          `third neighbor should not be rendered in condensed mobile focus (${thirdVisibleHeight.toFixed(1)}px visible): list=${JSON.stringify(neighborList)} card=${JSON.stringify(thirdPill)}`);
      }
    }
  }

  const desktopFocus = state('11-desktop-focus-first-result');
  if (desktopFocus) {
    const panel = desktopFocus.bodyDataset?.panelSurface || '';
    const focusStage = rect(desktopFocus, '#focus-stage');
    const threadInspector = rect(desktopFocus, '#focus-thread-inspector');
    if (panel === 'focus' || panel === 'focus-search') pass('11-desktop-focus-first-result', 'desktop-focus:panel-surface');
    else fail('11-desktop-focus-first-result', 'desktop-focus:panel-surface', `expected focus/focus-search, got ${panel || 'none'}`);
    if (rendered(focusStage) && insideViewport(focusStage, desktopFocus.viewport)) {
      pass('11-desktop-focus-first-result', 'desktop-focus:focus-stage-visible');
    } else {
      fail('11-desktop-focus-first-result', 'desktop-focus:focus-stage-visible', `#focus-stage should be visible on the real desktop route, got ${JSON.stringify(focusStage)}`);
    }
    if (desktopFocus.bodyDataset?.threadInspectSurface === 'idle' && rendered(threadInspector)) {
      fail('11-desktop-focus-first-result', 'desktop-focus:idle-thread-preview-hidden', `idle thread inspector should not render offscreen, got ${JSON.stringify(threadInspector)}`);
    } else {
      pass('11-desktop-focus-first-result', 'desktop-focus:idle-thread-preview-hidden');
    }
  }

  for (const label of ['05-mobile-neighbor-preview']) {
    const preview = state(label);
    if (!preview) continue;
    const threadSurface = preview.bodyDataset?.threadInspectSurface || '';
    const search = rect(preview, '.search-container');
    const inspector = rect(preview, '#focus-thread-inspector');
    const dive = rect(preview, '.focus-stage-dive-btn');
    const neighbors = rect(preview, '.focus-stage-neighbors');
    const journey = rect(preview, '.focus-stage-journey.active');
    if (threadSurface && threadSurface !== 'idle') pass(label, 'mobile-preview:thread-surface-active');
    else fail(label, 'mobile-preview:thread-surface-active', `expected active threadInspectSurface, got ${threadSurface || 'none'}`);
    if (rendered(inspector) && insideViewport(inspector, preview.viewport)) pass(label, 'mobile-preview:inspector-visible');
    else fail(label, 'mobile-preview:inspector-visible', `#focus-thread-inspector should be visible, got ${JSON.stringify(inspector)}`);
    if (!rendered(search)) pass(label, 'mobile-preview:search-hidden');
    else fail(label, 'mobile-preview:search-hidden', `.search-container should not duplicate preview context, got ${JSON.stringify(search)}`);
    if (!rendered(dive)) pass(label, 'mobile-preview:step-inside-hidden');
    else fail(label, 'mobile-preview:step-inside-hidden', `.focus-stage-dive-btn should not compete with preview actions, got ${JSON.stringify(dive)}`);
    if (!rendered(neighbors) || neighbors.height >= 40) pass(label, 'mobile-preview:nearby-stops-not-squeezed');
    else fail(label, 'mobile-preview:nearby-stops-not-squeezed', `.focus-stage-neighbors is squeezed to ${neighbors.height}px`);
    if (!rendered(journey) || journey.height <= 58) pass(label, 'mobile-preview:journey-chip-compact');
    else fail(label, 'mobile-preview:journey-chip-compact', `.focus-stage-journey.active is ${journey.height}px tall`);
  }

  const mobileFollow = state('06-mobile-neighbor-follow');
  if (mobileFollow) {
    const panel = mobileFollow.bodyDataset?.panelSurface || '';
    const threadSurface = mobileFollow.bodyDataset?.threadInspectSurface || '';
    const search = rect(mobileFollow, '.search-container');
    const inspector = rect(mobileFollow, '#focus-thread-inspector');
    const focusStage = rect(mobileFollow, '#focus-stage');
    const neighbors = rect(mobileFollow, '.focus-stage-neighbors');
    const journey = rect(mobileFollow, '.focus-stage-journey.active');
    if (panel === 'focus' || panel === 'focus-search') pass('06-mobile-neighbor-follow', 'mobile-follow:panel-surface');
    else fail('06-mobile-neighbor-follow', 'mobile-follow:panel-surface', `expected focus/focus-search after following a neighbor, got ${panel || 'none'}`);
    if (mobileFollow.appState?.navMode === 'trail' && mobileFollow.appState?.walkHistory?.length >= 2) {
      pass('06-mobile-neighbor-follow', 'mobile-follow:trail-walk-state');
    } else {
      fail('06-mobile-neighbor-follow', 'mobile-follow:trail-walk-state',
        `expected trail walk history after following a neighbor, got navMode=${mobileFollow.appState?.navMode || 'none'} history=${JSON.stringify(mobileFollow.appState?.walkHistory || [])}`);
    }
    if (threadSurface === 'idle' && !rendered(inspector)) pass('06-mobile-neighbor-follow', 'mobile-follow:inspector-released');
    else fail('06-mobile-neighbor-follow', 'mobile-follow:inspector-released', `followed state should release preview inspector, got surface=${threadSurface || 'none'} rect=${JSON.stringify(inspector)}`);
    if (!rendered(search)) pass('06-mobile-neighbor-follow', 'mobile-follow:search-hidden');
    else fail('06-mobile-neighbor-follow', 'mobile-follow:search-hidden', `.search-container should not duplicate followed focus context, got ${JSON.stringify(search)}`);
    if (rendered(focusStage) && insideViewport(focusStage, mobileFollow.viewport)) pass('06-mobile-neighbor-follow', 'mobile-follow:focus-stage-visible');
    else fail('06-mobile-neighbor-follow', 'mobile-follow:focus-stage-visible', `#focus-stage should own followed state, got ${JSON.stringify(focusStage)}`);
    if (!rendered(neighbors) || neighbors.height >= 80) pass('06-mobile-neighbor-follow', 'mobile-follow:nearby-stops-usable');
    else fail('06-mobile-neighbor-follow', 'mobile-follow:nearby-stops-usable', `.focus-stage-neighbors is squeezed to ${neighbors.height}px`);
    if (!rendered(journey) || journey.height <= 64) pass('06-mobile-neighbor-follow', 'mobile-follow:journey-chip-compact');
    else fail('06-mobile-neighbor-follow', 'mobile-follow:journey-chip-compact', `.focus-stage-journey.active is ${journey.height}px tall`);
  }

  const mobileDive = state('07-mobile-semantic-dive');
  if (mobileDive) {
    const search = rect(mobileDive, '.search-container');
    const infoPanel = rect(mobileDive, '#info-panel');
    const routeEvidence = mobileDive.routeEvidence || {};
    if (mobileDive.bodyDataset?.panelSurface === 'semantic-dive' || mobileDive.bodyDataset?.semanticDive === 'active') {
      pass('07-mobile-semantic-dive', 'mobile-dive:semantic-surface');
    } else {
      fail('07-mobile-semantic-dive', 'mobile-dive:semantic-surface', `expected semantic dive, got panelSurface=${mobileDive.bodyDataset?.panelSurface || 'none'} semanticDive=${mobileDive.bodyDataset?.semanticDive || 'none'}`);
    }
    if (!rendered(search)) pass('07-mobile-semantic-dive', 'mobile-dive:search-hidden');
    else fail('07-mobile-semantic-dive', 'mobile-dive:search-hidden', `.search-container should be hidden in semantic dive, got ${JSON.stringify(search)}`);
    if (!rendered(infoPanel)) pass('07-mobile-semantic-dive', 'mobile-dive:info-panel-hidden');
    else fail('07-mobile-semantic-dive', 'mobile-dive:info-panel-hidden', `#info-panel should not become a duplicate dive slab, got ${JSON.stringify(infoPanel)}`);
    if (routeEvidence.source === 'real-click') pass('07-mobile-semantic-dive', 'mobile-dive:real-user-route');
    else fail('07-mobile-semantic-dive', 'mobile-dive:real-user-route', `semantic dive reached via ${routeEvidence.source || 'unknown'} (${routeEvidence.detail || 'no detail'})`);
  }

  const mobileMap = state('08-mobile-map-after-dive');
  if (mobileMap) {
    const trailStrip = rect(mobileMap, '.map-trail-strip');
    const search = rect(mobileMap, '.search-container');
    const routeEvidence = mobileMap.routeEvidence || {};
    if (mobileMap.bodyDataset?.activeView === 'map') pass('08-mobile-map-after-dive', 'mobile-map:active-view');
    else fail('08-mobile-map-after-dive', 'mobile-map:active-view', `expected map active view, got ${mobileMap.bodyDataset?.activeView || 'none'}`);
    if (!rendered(search) || insideViewport(search, mobileMap.viewport)) pass('08-mobile-map-after-dive', 'mobile-map:search-not-offscreen');
    else fail('08-mobile-map-after-dive', 'mobile-map:search-not-offscreen', `.search-container is outside viewport, got ${JSON.stringify(search)}`);
    if (!rendered(trailStrip) || trailStrip.height <= 72) pass('08-mobile-map-after-dive', 'mobile-map:trail-strip-compact');
    else fail('08-mobile-map-after-dive', 'mobile-map:trail-strip-compact', `.map-trail-strip is ${trailStrip.height}px tall`);
    if (routeEvidence.source === 'real-click') pass('08-mobile-map-after-dive', 'mobile-map:real-user-route');
    else fail('08-mobile-map-after-dive', 'mobile-map:real-user-route', `map reached via ${routeEvidence.source || 'unknown'} (${routeEvidence.detail || 'no detail'})`);
  }

  const mobileReturn = state('09-mobile-return-county');
  if (mobileReturn) {
    const routeEvidence = mobileReturn.routeEvidence || {};
    const infoPanel = rect(mobileReturn, '#info-panel');
    const compass = rect(mobileReturn, '#journey-compass');
    const utilityChrome = ['.panel-toggle', '.share-toggle', '.help-toggle', '#btn-legend', '#btn-share-view', '#btn-keyboard-help']
      .map((selector) => ({ selector, rect: rect(mobileReturn, selector) }))
      .filter((entry) => rendered(entry.rect));
    if (mobileReturn.bodyDataset?.trailDepth === '0' || mobileReturn.appState?.trailDepth === 0) pass('09-mobile-return-county', 'mobile-return:trail-depth-reset');
    else fail('09-mobile-return-county', 'mobile-return:trail-depth-reset', `expected trailDepth=0, got body=${mobileReturn.bodyDataset?.trailDepth || 'none'} state=${mobileReturn.appState?.trailDepth}`);
    if (mobileReturn.bodyDataset?.panelSurface === 'map-idle') pass('09-mobile-return-county', 'mobile-return:calm-map-overview-surface');
    else fail('09-mobile-return-county', 'mobile-return:calm-map-overview-surface', `expected map-idle, got ${mobileReturn.bodyDataset?.panelSurface || 'none'}`);
    if (mobileReturn.bodyDataset?.journeyNavigationOwner !== 'map-trail-strip') pass('09-mobile-return-county', 'mobile-return:map-trail-strip-released');
    else fail('09-mobile-return-county', 'mobile-return:map-trail-strip-released', 'map trail strip still owns navigation after county reset');
    if (!rendered(compass)) pass('09-mobile-return-county', 'mobile-return:hidden-density-compass-suppressed');
    else fail('09-mobile-return-county', 'mobile-return:hidden-density-compass-suppressed', `map-idle density=hidden should suppress #journey-compass, got ${JSON.stringify(compass)}`);
    if (utilityChrome.length === 0) pass('09-mobile-return-county', 'mobile-return:utility-chrome-suppressed');
    else fail('09-mobile-return-county', 'mobile-return:utility-chrome-suppressed', `map-idle should not show standalone utility chrome: ${JSON.stringify(utilityChrome)}`);
    if (!rendered(infoPanel)) pass('09-mobile-return-county', 'mobile-return:info-panel-released');
    else fail('09-mobile-return-county', 'mobile-return:info-panel-released', `#info-panel should not dominate calm map overview, got ${JSON.stringify(infoPanel)}`);
    const actions = enabledVisibleActions(mobileReturn);
    if (actions.length <= 2) pass('09-mobile-return-county', 'mobile-return:calm-action-hierarchy');
    else fail('09-mobile-return-county', 'mobile-return:calm-action-hierarchy', `expected at most two calm map actions, got ${JSON.stringify(actions.map(({ text, action }) => ({ text, action })))}`);
    if (routeEvidence.source === 'real-click') pass('09-mobile-return-county', 'mobile-return:real-user-route');
    else fail('09-mobile-return-county', 'mobile-return:real-user-route', `county reset reached via ${routeEvidence.source || 'unknown'} (${routeEvidence.detail || 'no detail'})`);
  }

  return assertions;
}

function assertRealRouteVisual(artifacts) {
  const assertions = [];
  const byLabel = new Map(artifacts.map((artifact) => [artifact.label, artifact.state]));
  const pass = (label, check) => assertions.push({ level: 'pass', label, check });
  const fail = (label, check, msg) => assertions.push({ level: 'fail', label, check, msg });
  const requiredRealClick = [
    '02-mobile-search-coffee',
    '04-mobile-focus-first-result',
    '07-mobile-semantic-dive',
    '07a-mobile-semantic-dive-320',
    '07b-short-landscape-semantic-dive',
    '08-mobile-map-after-dive',
    '09-mobile-return-county',
  ];

  const idleState = byLabel.get('01-mobile-idle');
  if (idleState?.appState?.semanticSpaceLayoutStatus === 'ready') pass('01-mobile-idle', 'semantic-space-layout:ready');
  else fail('01-mobile-idle', 'semantic-space-layout:ready', `expected ready, got ${idleState?.appState?.semanticSpaceLayoutStatus || 'none'} (${idleState?.appState?.semanticSpaceLayoutError || 'no error detail'})`);

  for (const label of requiredRealClick) {
    const state = byLabel.get(label);
    const evidence = state?.routeEvidence || {};
    if (evidence.source === 'real-click') pass(label, 'real-route-visual:real-click');
    else fail(label, 'real-route-visual:real-click', `expected real-click route evidence, got ${evidence.source || 'missing'} (${evidence.detail || 'no detail'})`);
  }

  const nonRealClick = artifacts
    .filter(({ label }) => label !== '01-mobile-idle')
    .map(({ label, state }) => ({ label, evidence: state.routeEvidence || {} }))
    .filter(({ evidence }) => evidence.source !== 'real-click');
  if (nonRealClick.length === 0) pass('all', 'real-route-visual:all-captures-real-click');
  else fail('all', 'real-route-visual:all-captures-real-click', JSON.stringify(nonRealClick));

  for (const label of ['07-mobile-semantic-dive', '07a-mobile-semantic-dive-320', '07b-short-landscape-semantic-dive']) {
    const diveState = byLabel.get(label);
    const focusStage = diveState?.rects?.['#focus-stage'];
    const insideStatus = diveState?.rects?.['#focus-stage-inside-status'];
    const insideControls = diveState?.rects?.['#focus-stage-inside-controls'];
    if (!diveState) continue;
    if (diveState.bodyDataset?.panelSurface === 'semantic-dive' && diveState.bodyDataset?.semanticDive === 'active') {
      pass(label, 'real-route-visual:semantic-dive-state');
    } else {
      fail(label, 'real-route-visual:semantic-dive-state',
        `expected active semantic dive, got panelSurface=${diveState.bodyDataset?.panelSurface || 'missing'} semanticDive=${diveState.bodyDataset?.semanticDive || 'missing'}`);
    }
    if (diveState.bodyDataset?.trailState === 'active' && diveState.appState?.trailDepth === 2) {
      pass(label, 'real-route-visual:inside-route-continuity');
    } else {
      fail(label, 'real-route-visual:inside-route-continuity',
        `expected active trail depth 2, got trailState=${diveState.bodyDataset?.trailState || 'missing'} trailDepth=${diveState.appState?.trailDepth}`);
    }
    if (rendered(focusStage) && insideViewport(focusStage, diveState.viewport, 24)) {
      pass(label, 'real-route-visual:semantic-primary-surface-visible');
    } else {
      fail(label, 'real-route-visual:semantic-primary-surface-visible',
        `#focus-stage should be visible and mostly in viewport for semantic dive, got ${JSON.stringify(focusStage)}`);
    }
    if (rendered(insideStatus) && insideViewport(insideStatus, diveState.viewport, 24)) {
      pass(label, 'real-route-visual:inside-status-visible');
    } else {
      fail(label, 'real-route-visual:inside-status-visible',
        `#focus-stage-inside-status should be visible in semantic dive, got ${JSON.stringify(insideStatus)}`);
    }
    if (rendered(insideControls) && insideViewport(insideControls, diveState.viewport, 24)) {
      pass(label, 'real-route-visual:inside-controls-visible');
    } else {
      fail(label, 'real-route-visual:inside-controls-visible',
        `#focus-stage-inside-controls should be visible in semantic dive, got ${JSON.stringify(insideControls)}`);
    }
  }

  const returnState = byLabel.get('09-mobile-return-county');
  const returnInfoPanel = returnState?.rects?.['#info-panel'];
  const returnCompass = returnState?.rects?.['#journey-compass'];
  const returnUtilityChrome = ['.panel-toggle', '.share-toggle', '.help-toggle', '#btn-legend', '#btn-share-view', '#btn-keyboard-help']
    .map((selector) => ({ selector, rect: returnState?.rects?.[selector] }))
    .filter((entry) => rendered(entry.rect));
  if (returnState?.bodyDataset?.panelSurface === 'map-idle') pass('09-mobile-return-county', 'real-route-visual:calm-map-overview-surface');
  else fail('09-mobile-return-county', 'real-route-visual:calm-map-overview-surface', `expected map-idle after reset, got ${returnState?.bodyDataset?.panelSurface || 'missing'}`);
  if (returnState?.bodyDataset?.journeyNavigationOwner !== 'map-trail-strip') pass('09-mobile-return-county', 'real-route-visual:map-trail-strip-released');
  else fail('09-mobile-return-county', 'real-route-visual:map-trail-strip-released', 'map trail strip still owns navigation after reset');
  if (!rendered(returnCompass)) pass('09-mobile-return-county', 'real-route-visual:hidden-density-compass-suppressed');
  else fail('09-mobile-return-county', 'real-route-visual:hidden-density-compass-suppressed', `map-idle density=hidden should suppress #journey-compass, got ${JSON.stringify(returnCompass)}`);
  if (returnUtilityChrome.length === 0) pass('09-mobile-return-county', 'real-route-visual:utility-chrome-suppressed');
  else fail('09-mobile-return-county', 'real-route-visual:utility-chrome-suppressed', `map-idle should not show standalone utility chrome: ${JSON.stringify(returnUtilityChrome)}`);
  if (!rendered(returnInfoPanel)) pass('09-mobile-return-county', 'real-route-visual:info-panel-released');
  else fail('09-mobile-return-county', 'real-route-visual:info-panel-released', `#info-panel should be hidden after county reset, got ${JSON.stringify(returnInfoPanel)}`);
  const returnActions = enabledVisibleActions(returnState || {});
  if (returnActions.length <= 2) pass('09-mobile-return-county', 'real-route-visual:calm-action-hierarchy');
  else fail('09-mobile-return-county', 'real-route-visual:calm-action-hierarchy', `expected at most two calm map actions, got ${JSON.stringify(returnActions.map(({ text, action }) => ({ text, action })))}`);

  return assertions;
}

function rectContains(outer, inner, tolerance = 1) {
  return outer && inner &&
    outer.x <= inner.x + tolerance &&
    outer.y <= inner.y + tolerance &&
    outer.right >= inner.right - tolerance &&
    outer.bottom >= inner.bottom - tolerance;
}

function independentPrimarySurfaces(surfaces = []) {
  return surfaces.filter((surface, index) => !surfaces.some((other, otherIndex) => (
    otherIndex !== index &&
    Number(other.areaRatio || 0) >= Number(surface.areaRatio || 0) &&
    rectContains(other.rect, surface.rect)
  )));
}

function assertVisualErgonomics(artifacts) {
  const assertions = [];
  const pass = (label, check) => assertions.push({ level: 'pass', label, check });
  const fail = (label, check, msg) => assertions.push({ level: 'fail', label, check, msg });
  const mobileLike = artifacts.filter(({ state }) => state?.viewport?.width <= 900);

  for (const { label, state } of mobileLike) {
    const ergonomics = state.ergonomics || {};
    const clipping = ergonomics.textClipping || [];
    const blankLabels = ergonomics.blankVisibleLabels || [];
    const leakedHiddenControls = ergonomics.leakedHiddenControls || [];
    const crampedSearchRows = ergonomics.crampedSearchRows || [];
    const lowContrastSearchPeekText = ergonomics.lowContrastSearchPeekText || [];
    const severeTapTargets = ergonomics.severeTapTargets || [];
    const overlaps = ergonomics.unexpectedOverlaps || [];
    const primarySurfaces = ergonomics.visiblePrimarySurfaces || [];
    const independentSurfaces = independentPrimarySurfaces(primarySurfaces);
    const overflowX = Number(state.scroll?.overflowX || 0);
    const pixelQuality = state.pixelQuality || null;
    const focusStage = state.rects?.['#focus-stage'];

    if (overflowX <= 1) pass(label, 'ergonomics:document-no-horizontal-overflow');
    else fail(label, 'ergonomics:document-no-horizontal-overflow', `document overflows by ${overflowX}px`);

    if (clipping.length === 0) pass(label, 'ergonomics:no-critical-text-clipping');
    else fail(label, 'ergonomics:no-critical-text-clipping', JSON.stringify(clipping.slice(0, 5)));

    if (blankLabels.length === 0) pass(label, 'ergonomics:no-blank-visible-labels');
    else fail(label, 'ergonomics:no-blank-visible-labels', JSON.stringify(blankLabels.slice(0, 5)));

    if (leakedHiddenControls.length === 0) pass(label, 'ergonomics:no-rendered-hidden-controls');
    else fail(label, 'ergonomics:no-rendered-hidden-controls', JSON.stringify(leakedHiddenControls.slice(0, 5)));

    if (crampedSearchRows.length === 0) pass(label, 'ergonomics:search-peek-row-fit');
    else fail(label, 'ergonomics:search-peek-row-fit', JSON.stringify(crampedSearchRows.slice(0, 5)));

    if (lowContrastSearchPeekText.length === 0) pass(label, 'ergonomics:search-peek-text-contrast');
    else fail(label, 'ergonomics:search-peek-text-contrast', JSON.stringify(lowContrastSearchPeekText.slice(0, 5)));

    if (severeTapTargets.length === 0) pass(label, 'ergonomics:no-severe-tap-targets');
    else fail(label, 'ergonomics:no-severe-tap-targets', JSON.stringify(severeTapTargets.slice(0, 5)));

    if (overlaps.length === 0) pass(label, 'ergonomics:no-primary-surface-overlap');
    else fail(label, 'ergonomics:no-primary-surface-overlap', JSON.stringify(overlaps.slice(0, 5)));

    const oversized = independentSurfaces.filter((surface) => {
      if (state.bodyDataset?.panelSurface === 'semantic-dive' && surface.selector === '#focus-stage') return false;
      if (surface.selector === '#search-results') return false;
      return surface.areaRatio > 0.62;
    });
    if (oversized.length === 0) pass(label, 'ergonomics:primary-surface-density');
    else fail(label, 'ergonomics:primary-surface-density', JSON.stringify(oversized.slice(0, 5)));

    if (state.bodyDataset?.panelSurface === 'semantic-dive') {
      if (rendered(focusStage) && insideViewport(focusStage, state.viewport, 24)) {
        pass(label, 'ergonomics:semantic-dive-primary-surface-visible');
      } else {
        fail(label, 'ergonomics:semantic-dive-primary-surface-visible',
          `semantic-dive should expose #focus-stage as a visible primary surface, got ${JSON.stringify(focusStage)}`);
      }
    }

    if (state.bodyDataset?.panelSurface === 'map-focus-search') {
      const infoPanel = state.rects?.['#info-panel'];
      const selectedCard = state.rects?.['#selected-card'];
      const selectedDetails = state.rects?.['#selected-details'];
      const mapSummary = state.rects?.['#selected-map-summary'];
      const mapSummaryName = state.rects?.['#selected-map-summary-name'];
      const mapSummaryWhat = state.rects?.['#selected-map-summary-what'];
      const mapSummaryMatch = state.rects?.['#selected-map-summary-match'];
      const globalControls = state.rects?.['.controls'];
      const standaloneChrome = ['.panel-toggle', '.share-toggle', '.help-toggle', '#btn-legend', '#btn-share-view', '#btn-keyboard-help']
        .map((selector) => ({ selector, rect: state.rects?.[selector] }))
        .filter((entry) => rendered(entry.rect));
      const viewHandoff = state.rects?.['.view-handoff'];
      const maxMapCalloutHeight = Math.min(244, Math.round((state.viewport?.height || 0) * 0.3));
      if (rendered(infoPanel) && infoPanel.height <= maxMapCalloutHeight && infoPanel.y >= (state.viewport?.height || 0) * 0.66) {
        pass(label, 'ergonomics:map-focus-callout-compact');
      } else {
        fail(label, 'ergonomics:map-focus-callout-compact',
          `map-focus-search should use a compact bottom callout, got ${JSON.stringify(infoPanel)}`);
      }
      if (selectedCard?.dataset?.contentVariant === 'map-summary' && selectedCard?.dataset?.contentOwner === 'selected-map-summary') {
        pass(label, 'ergonomics:map-focus-content-owner-summary');
      } else {
        fail(label, 'ergonomics:map-focus-content-owner-summary',
          `selected card should declare the map-summary content owner, got ${JSON.stringify(selectedCard?.dataset || {})}`);
      }
      if (!rendered(selectedDetails)) {
        pass(label, 'ergonomics:map-focus-full-details-hidden');
      } else {
        fail(label, 'ergonomics:map-focus-full-details-hidden',
          `full selected details should be hidden when map summary owns content, got ${JSON.stringify(selectedDetails)}`);
      }
      if (rendered(mapSummary) && rendered(mapSummaryName) && rendered(mapSummaryWhat) && rendered(mapSummaryMatch)) {
        pass(label, 'ergonomics:map-focus-summary-visible');
      } else {
        fail(label, 'ergonomics:map-focus-summary-visible',
          `map-focus-search should render dedicated summary content, got summary=${JSON.stringify(mapSummary)} name=${JSON.stringify(mapSummaryName)} what=${JSON.stringify(mapSummaryWhat)} match=${JSON.stringify(mapSummaryMatch)}`);
      }
      if (!rendered(globalControls)) {
        pass(label, 'ergonomics:map-focus-global-controls-hidden');
      } else {
        fail(label, 'ergonomics:map-focus-global-controls-hidden',
          `global canvas controls should not compete with the map trail strip, got ${JSON.stringify(globalControls)}`);
      }
      if (standaloneChrome.length === 0) {
        pass(label, 'ergonomics:map-focus-utility-chrome-hidden');
      } else {
        fail(label, 'ergonomics:map-focus-utility-chrome-hidden',
          `standalone utility chrome should not compete with the map trail strip, got ${JSON.stringify(standaloneChrome)}`);
      }
      if (!rendered(viewHandoff)) {
        pass(label, 'ergonomics:map-focus-view-handoff-hidden');
      } else {
        fail(label, 'ergonomics:map-focus-view-handoff-hidden',
          `view handoff should not compete with the map trail strip, got ${JSON.stringify(viewHandoff)}`);
      }
      if (state.bodyDataset?.viewHandoffActive === 'false') {
        pass(label, 'ergonomics:map-focus-view-handoff-state-released');
      } else {
        fail(label, 'ergonomics:map-focus-view-handoff-state-released',
          `view-controller should release view handoff state after map trail strip owns navigation, got "${state.bodyDataset?.viewHandoffActive || ''}"`);
      }
    }

    if (!pixelQuality) {
      fail(label, 'image-quality:pixel-metrics-present', 'missing pixel quality metrics');
      continue;
    }
    pass(label, 'image-quality:pixel-metrics-present');

    const full = pixelQuality.full || {};
    const scene = pixelQuality.scene || {};
    if (full.dynamicRange >= 32 && full.stdev >= 10) pass(label, 'image-quality:screen-not-flat');
    else fail(label, 'image-quality:screen-not-flat', `full-screen dynamicRange=${full.dynamicRange} stdev=${full.stdev}`);

    if (full.whiteRatio <= 0.28 && full.saturatedRatio <= 0.18) pass(label, 'image-quality:not-washed-out');
    else fail(label, 'image-quality:not-washed-out', `whiteRatio=${full.whiteRatio} saturatedRatio=${full.saturatedRatio}`);

    if (full.nearBlackRatio <= 0.82 && full.darkRatio <= 0.9) pass(label, 'image-quality:not-blackout');
    else fail(label, 'image-quality:not-blackout', `nearBlackRatio=${full.nearBlackRatio} darkRatio=${full.darkRatio}`);

    if (scene.dynamicRange >= 20 && scene.stdev >= 6) pass(label, 'image-quality:scene-region-has-signal');
    else fail(label, 'image-quality:scene-region-has-signal', `scene dynamicRange=${scene.dynamicRange} stdev=${scene.stdev}`);

    const flatSurfaces = (pixelQuality.surfaces || []).filter((surface) => {
      if (surface.areaRatio < 0.025) return false;
      const stats = surface.stats || {};
      return stats.dynamicRange < 12 && stats.stdev < 5 && stats.edgeRatio < 0.015;
    });
    if (flatSurfaces.length === 0) pass(label, 'image-quality:primary-surfaces-have-visual-signal');
    else fail(label, 'image-quality:primary-surfaces-have-visual-signal', JSON.stringify(flatSurfaces.slice(0, 5)));
  }

  return assertions;
}

function enabledVisibleActions(state) {
  return [
    ...(state.journeyActions || []),
  ].filter((action) => {
    const rect = action.rect || {};
    return !action.hidden &&
      !action.disabled &&
      action.text &&
      rect.display !== 'none' &&
      rect.visibility !== 'hidden' &&
      Number(rect.opacity ?? 1) > 0.05 &&
      rect.width > 0 &&
      rect.height > 0;
  });
}

function buildDesignScoreReport(artifacts) {
  const states = [];
  const routeWarnings = [];

  for (const { label, png, json, state } of artifacts) {
    const warnings = [];
    let score = 100;
    const viewportArea = Math.max(1, (state.viewport?.width || 0) * (state.viewport?.height || 0));
    const primarySurfaces = state.ergonomics?.visiblePrimarySurfaces || [];
    const independentSurfaces = independentPrimarySurfaces(primarySurfaces);
    const significantSurfaces = independentSurfaces.filter((surface) => surface.areaRatio >= 0.035);
    const surfaceArea = independentSurfaces.reduce((sum, surface) => sum + Number(surface.areaRatio || 0), 0);
    const actions = enabledVisibleActions(state);
    const pixel = state.pixelQuality || {};
    const scene = pixel.scene || {};
    const full = pixel.full || {};
    const bodySurface = state.bodyDataset?.panelSurface || '';
    const visibleSurfaceTextChars = independentSurfaces.reduce((sum, surface) => sum + Number(surface.textChars || 0), 0);
    const focusChars = String(state.focusText || '').length;
    const searchChars = String(state.searchText || '').length;
    const inspectorChars = String(state.inspectorText || '').length;
    const focusRect = state.rects?.['#focus-stage'];
    const searchRect = state.rects?.['#search-results'];
    const inspectorRect = state.rects?.['#focus-thread-inspector'];
    const textArea = [focusRect, searchRect, inspectorRect]
      .filter((rect) => rect?.width > 0 && rect?.height > 0)
      .reduce((sum, rect) => sum + (rect.width * rect.height), 0);
    const visibleCopyChars = visibleSurfaceTextChars || (focusChars + searchChars + inspectorChars);
    const copyDensity = Number((visibleCopyChars / Math.max(1, textArea || viewportArea)).toFixed(4));
    const leakedHiddenControls = state.ergonomics?.leakedHiddenControls || [];
    const crampedSearchRows = state.ergonomics?.crampedSearchRows || [];
    const lowContrastSearchPeekText = state.ergonomics?.lowContrastSearchPeekText || [];

    const warn = (severity, lane, message, detail = {}) => {
      const penalty = severity === 'high' ? 14 : severity === 'medium' ? 8 : 4;
      score -= penalty;
      warnings.push({ severity, lane, message, detail });
    };

    if (bodySurface === 'semantic-dive' && !rendered(focusRect)) {
      warn('high', 'surface/spatial', 'Semantic dive has no visible primary focus surface.', {
        focusRect,
        visiblePrimarySurfaces: independentSurfaces.map(({ selector, areaRatio }) => ({ selector, areaRatio })),
      });
    }

    if (leakedHiddenControls.length) {
      warn('high', 'interaction/style', 'Controls marked hidden are still visibly rendered.', {
        controls: leakedHiddenControls.slice(0, 5),
      });
    }

    if (crampedSearchRows.length) {
      warn('medium', 'content/spatial', 'Search peek rows are visibly cramped or escape the results panel.', {
        rows: crampedSearchRows.slice(0, 5),
      });
    }

    if (lowContrastSearchPeekText.length) {
      warn('high', 'style/content', 'Search peek text is too dark for the mobile results surface.', {
        text: lowContrastSearchPeekText.slice(0, 5),
      });
    }

    if (bodySurface === 'map-focus-search') {
      const infoPanel = state.rects?.['#info-panel'];
      const globalControls = state.rects?.['.controls'];
      const viewHandoff = state.rects?.['.view-handoff'];
      const maxMapCalloutHeight = Math.min(244, Math.round((state.viewport?.height || 0) * 0.3));
      if (!rendered(infoPanel) || infoPanel.height > maxMapCalloutHeight || infoPanel.y < (state.viewport?.height || 0) * 0.66) {
        warn('high', 'spatial/content', 'Map focus selected business panel is too large for the terrain route.', {
          infoPanel,
          maxMapCalloutHeight,
        });
      }
      if (rendered(globalControls)) {
        warn('medium', 'spatial/interaction', 'Global canvas controls compete with map trail navigation.', {
          globalControls,
        });
      }
      if (rendered(viewHandoff)) {
        warn('medium', 'surface/spatial', 'View handoff competes with map trail navigation.', {
          viewHandoff,
        });
      }
    }

    if (significantSurfaces.length >= 3) {
      warn('medium', 'surface/spatial', 'Several primary surfaces compete for attention in one state.', {
        surfaces: significantSurfaces.map(({ selector, areaRatio }) => ({ selector, areaRatio })),
      });
    }

    if (surfaceArea > 0.52 && state.viewport?.width <= 900) {
      warn('medium', 'spatial/style', 'Visible UI chrome occupies more than half of the mobile viewport.', {
        surfaceArea: Number(surfaceArea.toFixed(3)),
        surfaces: independentSurfaces.map(({ selector, areaRatio }) => ({ selector, areaRatio })),
      });
    }

    const dominant = independentSurfaces.filter((surface) => surface.areaRatio > 0.42);
    if (dominant.length) {
      warn('medium', 'spatial', 'A single surface dominates the viewport; check whether the scene still has a role.', {
        surfaces: dominant.map(({ selector, areaRatio }) => ({ selector, areaRatio })),
      });
    }

    if (copyDensity > 0.012 && state.viewport?.width <= 900) {
      warn('medium', 'content/style', 'Visible copy density is high for a mobile route state.', {
        copyDensity,
        visibleCopyChars,
        textArea,
      });
    } else if (copyDensity > 0.009 && bodySurface !== 'search') {
      warn('low', 'content/style', 'Copy density is approaching a noisy mobile state.', {
        copyDensity,
        visibleCopyChars,
      });
    }

    if (actions.length >= 4) {
      warn('medium', 'interaction/content', 'Too many enabled visible actions compete for CTA hierarchy.', {
        actions: actions.map(({ text, action }) => ({ text, action })),
      });
    } else if (actions.length === 3 && bodySurface !== 'map-focus-search') {
      warn('low', 'interaction/content', 'Three enabled actions are visible; confirm the primary action is obvious.', {
        actions: actions.map(({ text, action }) => ({ text, action })),
      });
    }

    if (scene.dynamicRange !== undefined && scene.dynamicRange < 32) {
      warn('low', 'style/spatial', 'Scene region has limited contrast; visual depth may be weak.', {
        dynamicRange: scene.dynamicRange,
        stdev: scene.stdev,
        edgeRatio: scene.edgeRatio,
      });
    }

    if (scene.edgeRatio !== undefined && scene.edgeRatio < 0.012 && !/map/.test(bodySurface)) {
      warn('low', 'style/spatial', 'Scene region has low edge signal; graph/scene detail may feel flat.', {
        edgeRatio: scene.edgeRatio,
        dynamicRange: scene.dynamicRange,
      });
    }

    if (full.brightRatio > 0.13 && state.viewport?.width <= 900) {
      warn('low', 'style', 'Bright pixel ratio is high; check for glare or over-bright chrome.', {
        brightRatio: full.brightRatio,
        whiteRatio: full.whiteRatio,
      });
    }

    const repeatedLabels = actions.reduce((map, action) => {
      const key = String(action.text || '').toLowerCase();
      if (!key) return map;
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map());
    const duplicates = [...repeatedLabels.entries()].filter(([, count]) => count > 1);
    if (duplicates.length) {
      warn('low', 'content/interaction', 'Duplicate visible action labels may blur intent.', {
        duplicates: duplicates.map(([text, count]) => ({ text, count })),
      });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    states.push({
      label,
      score,
      warnings,
      metrics: {
        panelSurface: bodySurface,
        activeView: state.bodyDataset?.activeView || '',
        surfaceArea: Number(surfaceArea.toFixed(3)),
        significantSurfaceCount: significantSurfaces.length,
        actionCount: actions.length,
        visibleCopyChars,
        copyDensity,
        fullDynamicRange: full.dynamicRange ?? null,
        sceneDynamicRange: scene.dynamicRange ?? null,
        sceneEdgeRatio: scene.edgeRatio ?? null,
      },
      artifacts: { png, json },
    });
  }

  const averageScore = states.length
    ? Math.round(states.reduce((sum, state) => sum + state.score, 0) / states.length)
    : 0;
  const warningCount = states.reduce((sum, state) => sum + state.warnings.length, 0);
  const highWarningCount = states.reduce((sum, state) => sum + state.warnings.filter((warning) => warning.severity === 'high').length, 0);

  if (averageScore < 78) {
    routeWarnings.push({
      severity: 'medium',
      lane: 'style/spatial/content',
      message: 'Average advisory design score is below the review threshold.',
      detail: { averageScore },
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    advisoryOnly: true,
    summary: {
      averageScore,
      stateCount: states.length,
      warningCount,
      highWarningCount,
      routeWarningCount: routeWarnings.length,
    },
    routeWarnings,
    states,
  };
}

function renderDesignScoreMarkdown(report) {
  const lines = [
    '# Route Design Score Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Advisory only: ${report.advisoryOnly ? 'yes' : 'no'}`,
    '',
    `Average score: ${report.summary.averageScore}`,
    `States: ${report.summary.stateCount}`,
    `Warnings: ${report.summary.warningCount}`,
    '',
  ];

  if (report.routeWarnings.length) {
    lines.push('## Route Warnings', '');
    for (const warning of report.routeWarnings) {
      lines.push(`- **${warning.severity}** [${warning.lane}] ${warning.message}`);
    }
    lines.push('');
  }

  lines.push('## State Scores', '');
  for (const state of report.states) {
    lines.push(`### ${state.label} - ${state.score}`);
    lines.push('');
    lines.push(`- Surface: ${state.metrics.panelSurface || 'none'}`);
    lines.push(`- Surface area: ${state.metrics.surfaceArea}`);
    lines.push(`- Actions: ${state.metrics.actionCount}`);
    lines.push(`- Copy density: ${state.metrics.copyDensity}`);
    lines.push(`- Scene dynamic range: ${state.metrics.sceneDynamicRange ?? 'n/a'}`);
    lines.push(`- Scene edge ratio: ${state.metrics.sceneEdgeRatio ?? 'n/a'}`);
    if (!state.warnings.length) {
      lines.push('- Warnings: none');
    } else {
      lines.push('- Warnings:');
      for (const warning of state.warnings) {
        lines.push(`  - **${warning.severity}** [${warning.lane}] ${warning.message}`);
      }
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function makePage(browser, viewport, label, networkLog, ignoredNetworkLog) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    isMobile: viewport.width < 700,
    hasTouch: viewport.width < 700,
  });
  page.on('console', (msg) => {
    const text = msg.text();
    const classification = classifyConsoleIssue(msg);
    if (classification === 'actionable') {
      networkLog.push({ type: 'console', level: msg.type(), text: text.slice(0, 600) });
    } else if (classification !== 'ignore') {
      ignoredNetworkLog.push({ type: 'console', reason: classification, level: msg.type(), text: text.slice(0, 600) });
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    const classification = classifyRequestFailure(request);
    if (classification === 'actionable') {
      networkLog.push({
        type: 'requestfailed',
        url,
        error: request.failure()?.errorText || 'request failed',
      });
    } else if (classification !== 'ignored-asset') {
      ignoredNetworkLog.push({
        type: 'requestfailed',
        reason: classification,
        url,
        error: request.failure()?.errorText || 'request failed',
      });
    }
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400 && !ignoreRequestFailure(response.url())) {
      networkLog.push({ type: 'http', status, url: response.url() });
    }
  });
  await page.goto(withCacheBust(targetUrl, label), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForAppReady(page);
  return page;
}

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch(launchOptions);
const artifacts = [];
const networkLog = [];
const ignoredNetworkLog = [];

try {
  const mobilePage = await makePage(browser, VIEWPORTS.mobile, 'mobile', networkLog, ignoredNetworkLog);
  if (REAL_ROUTE_VISUAL) {
    await capture(mobilePage, '01-mobile-idle', artifacts);
    await runVisibleSearch(mobilePage, 'coffee');
    await capture(mobilePage, '02-mobile-search-coffee', artifacts);
    await clickVisibleFirstSearchResult(mobilePage);
    await capture(mobilePage, '04-mobile-focus-first-result', artifacts);
    await clickVisibleSemanticDive(mobilePage);
    await capture(mobilePage, '07-mobile-semantic-dive', artifacts);
    await mobilePage.setViewportSize({ width: 320, height: 740 });
    await pageWaitForResize(mobilePage);
    await capture(mobilePage, '07a-mobile-semantic-dive-320', artifacts);
    await mobilePage.setViewportSize(VIEWPORTS.shortLandscape);
    await pageWaitForResize(mobilePage);
    await capture(mobilePage, '07b-short-landscape-semantic-dive', artifacts);
    await mobilePage.setViewportSize(VIEWPORTS.mobile);
    await pageWaitForResize(mobilePage);
    await clickVisibleMap(mobilePage);
    await capture(mobilePage, '08-mobile-map-after-dive', artifacts);
    await clickVisibleCountyReset(mobilePage);
    await capture(mobilePage, '09-mobile-return-county', artifacts);
    await mobilePage.close();
  } else {
    await capture(mobilePage, '01-mobile-idle', artifacts);
    const mobileSearchReady = await runSearch(mobilePage, 'coffee');
    await capture(mobilePage, '02-mobile-search-coffee', artifacts);
    const mobileClickFocused = mobileSearchReady ? await focusFirstSearchResult(mobilePage) : false;
    await capture(mobilePage, '03-mobile-after-result-click', artifacts);
    if (!mobileClickFocused) await forceFocusVisibleResult(mobilePage);
    await capture(mobilePage, '04-mobile-focus-first-result', artifacts);
    await previewFirstNeighbor(mobilePage);
    await capture(mobilePage, '05-mobile-neighbor-preview', artifacts);
    await followInspectedNeighbor(mobilePage);
    await capture(mobilePage, '06-mobile-neighbor-follow', artifacts);
    await enterSemanticDive(mobilePage);
    await capture(mobilePage, '07-mobile-semantic-dive', artifacts);
    await enterMap(mobilePage);
    await capture(mobilePage, '08-mobile-map-after-dive', artifacts);
    await resetToCounty(mobilePage);
    await capture(mobilePage, '09-mobile-return-county', artifacts);
    await mobilePage.close();

    const desktopPage = await makePage(browser, VIEWPORTS.desktop, 'desktop', networkLog, ignoredNetworkLog);
    await capture(desktopPage, '09-desktop-idle', artifacts);
    const desktopSearchReady = await runSearch(desktopPage, 'coffee');
    const desktopClickFocused = desktopSearchReady ? await focusFirstSearchResult(desktopPage) : false;
    await capture(desktopPage, '10-desktop-after-result-click', artifacts);
    if (!desktopClickFocused) await forceFocusVisibleResult(desktopPage);
    await capture(desktopPage, '11-desktop-focus-first-result', artifacts);
    await previewFirstNeighbor(desktopPage);
    await capture(desktopPage, '12-desktop-neighbor-preview', artifacts);
    await desktopPage.close();

    const shortPage = await makePage(browser, VIEWPORTS.shortLandscape, 'short-landscape', networkLog, ignoredNetworkLog);
    const shortSearchReady = await runSearch(shortPage, 'coffee');
    const shortClickFocused = shortSearchReady ? await focusFirstSearchResult(shortPage) : false;
    await capture(shortPage, '13-short-landscape-after-result-click', artifacts);
    if (!shortClickFocused) await forceFocusVisibleResult(shortPage);
    await capture(shortPage, '14-short-landscape-focus', artifacts);
    await enterSemanticDive(shortPage);
    await capture(shortPage, '15-short-landscape-semantic-dive', artifacts);
    await shortPage.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outDir, 'network-log.json'), `${JSON.stringify(networkLog, null, 2)}\n`);
await fs.writeFile(path.join(outDir, 'ignored-network-log.json'), `${JSON.stringify(ignoredNetworkLog, null, 2)}\n`);
const productAssertions = [
  ...(REAL_ROUTE_VISUAL ? assertRealRouteVisual(artifacts) : assertProductOwnership(artifacts)),
  ...assertCompactJourneyActionLabels(artifacts),
  ...assertMapTrailTitleOnly(artifacts),
  ...(VISUAL_ERGONOMICS ? assertVisualErgonomics(artifacts) : []),
];
const productFailures = productAssertions.filter((assertion) => assertion.level === 'fail');
const designScoreReport = VISUAL_ERGONOMICS ? buildDesignScoreReport(artifacts) : null;
if (designScoreReport) {
  await fs.writeFile(path.join(outDir, 'design-score-report.json'), `${JSON.stringify(designScoreReport, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, 'design-score-report.md'), renderDesignScoreMarkdown(designScoreReport));
}
await fs.writeFile(path.join(outDir, 'ownership-assertions.json'), `${JSON.stringify(productAssertions, null, 2)}\n`);
await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({
  targetUrl,
  runId,
  outDir,
  visualErgonomics: VISUAL_ERGONOMICS,
  designScore: designScoreReport?.summary || null,
  artifacts: artifacts.map(({ state, ...artifact }) => artifact),
  networkLogCount: networkLog.length,
  ignoredNetworkLogCount: ignoredNetworkLog.length,
  ownershipAssertionCount: productAssertions.length,
  ownershipFailureCount: productFailures.length,
}, null, 2)}\n`);

console.log(`Product QA artifacts: ${outDir}`);
console.log(`Captured ${artifacts.length} states. Network/console issues: ${networkLog.length}; ignored diagnostics: ${ignoredNetworkLog.length}; ownership failures: ${productFailures.length}`);
if (designScoreReport) {
  console.log(`Design score advisory: average=${designScoreReport.summary.averageScore}; warnings=${designScoreReport.summary.warningCount}; report=${path.join(outDir, 'design-score-report.md')}`);
}
if (productFailures.length > 0) {
  console.error(JSON.stringify(productFailures, null, 2));
  process.exit(1);
}
