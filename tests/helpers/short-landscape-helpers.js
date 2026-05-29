import { setupMockSearch } from './mock-semantic-search.js';

export const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');
export const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';

function buildAppUrl(baseUrl = BASE_URL, appPath = APP_PATH) {
  return `${baseUrl}${appPath}?nodemo=1`;
}

async function openAppPage(page, viewport) {
  const targetViewport = viewport || (await page.viewportSize());
  if (!targetViewport) {
    throw new Error('openShortLandscape requires a viewport or page-level viewportSize.');
  }
  await page.setViewportSize(targetViewport);
  await page.goto(buildAppUrl(), { waitUntil: 'domcontentloaded' });
}

export async function openShortLandscape(page, viewport, { activateSurface = true } = {}) {
  await openAppPage(page, viewport);
  await page.waitForFunction(() => (
    document.querySelector('#search-input') &&
    document.querySelector('#info-panel') &&
    document.querySelector('#focus-stage') &&
    Array.isArray((window.__APP_STATE__ ?? window.__TEST_STATE__)?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__)?.points?.length > 0
  ), { timeout: 20000 });
  if (activateSurface) {
    await page.evaluate(() => document.body.classList.add('is-active'));
  }
}

export async function openApp(page, viewport) {
  await setupMockSearch(page);
  await openAppPage(page, viewport);
  await page.waitForFunction(() => {
    const clearSearch = (window.__APP_ACTIONS__?.clearSearch ?? window.clearSearch);
    const setSemanticDiveMode = (window.__APP_ACTIONS__?.setSemanticDiveMode ?? window.setSemanticDiveMode);
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return typeof clearSearch === 'function' &&
      typeof setSemanticDiveMode === 'function' &&
      Array.isArray(appState.points) &&
      appState.points.length > 0 &&
      appState.renderer?.domElement &&
      appState.camera &&
      appState.pointsMesh;
  }, { timeout: 20000 });
  await page.waitForTimeout(1000);
}
