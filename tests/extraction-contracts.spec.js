import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8795';
const cameraControlsSource = readFileSync('', 'utf8');

test.describe('Extraction & De-monolith Contract Verification', () => {
  
  test.beforeEach(async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto(`${BASE_URL}/index.html?v=contract-test`);

    try {
      await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 45000 });
    } catch (e) {
      const info = await page.evaluate(() => {
        const overlay = document.getElementById('loading-overlay');
        const note = document.getElementById('loading-note');
        const foot = document.getElementById('loading-foot');
        return {
          phase: window.__TEST_STATE__?.loadingPhaseKey ?? 'unknown',
          overlayHidden: overlay?.hidden,
          overlayInert: overlay?.inert,
          overlayDisplay: overlay ? getComputedStyle(overlay).display : 'N/A',
          noteText: note?.textContent,
          footText: foot?.textContent,
          bodyLoadingPhase: document.body?.dataset?.loadingPhase
        };
      });
      console.error('TIMEOUT DIAGNOSTIC:', JSON.stringify({ consoleErrors, pageErrors, ...info }, null, 2));
      throw e;
    }
  });

  test('Module Seam: UI Renderers', async ({ page }) => {
    // Verify that functions moved to ui-renderers.js are exported as module APIs.
    // These helpers are intentionally dewindowed; live rendering is covered below.
    const exports = await page.evaluate(async () => {
 const ui = await import('./');
      return {
        buildLegend: typeof ui.buildLegend === 'function',
        renderSignalBadges: typeof ui.renderSignalBadges === 'function',
        buildSearchResultItemHtml: typeof ui.buildSearchResultItemHtml,
        setActiveSearchResultRow: typeof ui.setActiveSearchResultRow === 'function'
      };
    });

    expect(exports.buildLegend).toBe(true);
    expect(exports.renderSignalBadges).toBe(true);
    expect(exports.buildSearchResultItemHtml).toBe('undefined');
    expect(exports.setActiveSearchResultRow).toBe(true);
  });

  test('Module Seam: Camera Controls', async () => {
    expect(cameraControlsSource).toMatch(/export\s+function\s+animateCameraToSearchCorridor\s*\(/);
    expect(cameraControlsSource).toMatch(/export\s+function\s+zoomCamera\s*\(/);
    expect(cameraControlsSource).toMatch(/export\s+function\s+animateCameraToNode\s*\(/);
  });

  test('Module Seam: Mycelium Engine', async ({ page }) => {
    const exports = await page.evaluate(async () => {
 const mycelium = await import('./');
      return {
        buildSemanticMyceliumEdges: typeof mycelium.buildSemanticMyceliumEdges === 'function',
        updateMyceliumThreads: typeof mycelium.updateMyceliumThreads === 'function'
      };
    });

    expect(exports.buildSemanticMyceliumEdges).toBe(true);
    expect(exports.updateMyceliumThreads).toBe(true);
  });

  test('Functional Integrity: Search Still Works', async ({ page }) => {
    // 1. Trigger search
    const input = page.locator('#search-input');
    await input.fill('coffee');
    await page.keyboard.press('Enter');

    // 2. Verify results still render (proves ui-renderers.js is working)
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 10000 });
    const count = await page.locator('.search-result-item').count();
    expect(count).toBeGreaterThan(0);
  });

});
