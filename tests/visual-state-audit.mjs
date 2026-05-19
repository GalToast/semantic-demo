import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://localhost:8080/semantic-demo/vector-explorer-polished.html';
const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const targetUrl = cliArgs.find((arg) => !arg.startsWith('--')) || DEFAULT_URL;
const statesArg = cliArgs.find((arg) => arg.startsWith('--states='))?.slice('--states='.length)
  || process.env.SEMANTIC_VISUAL_AUDIT_STATES
  || '';
const requestedStates = new Set(statesArg.split(',').map((state) => state.trim()).filter(Boolean));
const outRoot = process.env.SEMANTIC_VISUAL_AUDIT_OUT || path.resolve(process.cwd(), 'tmp', 'semantic-ui-visual-audit');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, runId);

const mobile = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function withParams(url, params) {
  const next = new URL(url);
  Object.entries(params).forEach(([key, value]) => next.searchParams.set(key, value));
  return next.toString();
}

async function waitForReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2200);
}

async function captureState(page, name) {
  await waitForReady(page);

  const data = await page.evaluate(() => {
    const selectors = [
      '#canvas-container',
      '.journey-compass',
      '.search-container',
      '#search-results',
      '#filters-section',
      '#info-panel',
      '#focus-stage',
      '.selected-card',
      '.about-card',
      '.selected-empty',
      '.search-error-state',
      '.search-error-kicker',
      '.search-error-retry-btn',
      '.search-error-dismiss-btn',
      '.focus-stage-journey.active',
      '.focus-stage-kicker',
      '.focus-stage-dive-btn',
      '.focus-stage-neighbors',
      '#map-container',
      '.map-trail-strip',
      '.map-empty-state',
      '.journey-compass-note',
      '.journey-compass-rail',
      '.view-toggle',
      '#btn-legend',
    ];

    const boxFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
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
        scrollbarWidth: style.scrollbarWidth,
        zIndex: style.zIndex,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        color: style.color,
        padding: style.padding,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        transitionDelay: style.transitionDelay,
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        clusterRgb: style.getPropertyValue('--cluster-rgb').trim(),
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      };
    };

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
      clusterLabelDiagnostics: typeof window.__clusterLabelDiagnostics === 'function'
        ? window.__clusterLabelDiagnostics()
        : null,
    };
  });

  const screenshotPath = path.join(outDir, `${name}.png`);
  const jsonPath = path.join(outDir, `${name}.json`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return { name, data };
}

async function captureMaybe(states, page, name) {
  if (requestedStates.size && !requestedStates.has(name)) {
    await waitForReady(page);
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

async function run() {
  await ensureDir(outDir);
  const browser = await chromium.launch({ headless: true });
  const states = [];

  try {
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
    ])) {
      const mobilePage = await browser.newPage({ viewport: mobile, deviceScaleFactor: 2, isMobile: true });

      if (wantsState('01-mobile-idle')) {
        await mobilePage.goto(targetUrl);
        await captureMaybe(states, mobilePage, '01-mobile-idle');
      }

      if (wantsAny(['02-mobile-search-coffee', '03-mobile-focus-first-result', '04-mobile-field-node-active'])) {
        await mobilePage.goto(withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }));
        await captureMaybe(states, mobilePage, '02-mobile-search-coffee');

        if (wantsAny(['03-mobile-focus-first-result', '04-mobile-field-node-active'])) {
          const firstResult = mobilePage.locator('.search-result-item').first();
          if (await firstResult.count()) {
            await firstResult.click({ timeout: 5000 }).catch(() => {});
          }
          await captureMaybe(states, mobilePage, '03-mobile-focus-first-result');
        }

        if (wantsState('04-mobile-field-node-active')) {
          await mobilePage.evaluate(() => {
            document.body.dataset.focusPanelMode = 'field-node';
            document.body.dataset.focusOrigin = 'field-node';
            document.body.dataset.graphContext = 'focus-search';
            document.body.dataset.activeView = 'galaxy';
            document.body.dataset.fieldStepSync = 'active';
          });
          await captureMaybe(states, mobilePage, '04-mobile-field-node-active');
        }
      }

      if (wantsState('05-mobile-map')) {
        await mobilePage.goto(withParams(targetUrl, { view: 'map', q: 'coffee', anchor: '519' }));
        await captureMaybe(states, mobilePage, '05-mobile-map');
      }

      if (wantsState('06-mobile-filters-open')) {
        await mobilePage.goto(targetUrl);
        await waitForReady(mobilePage);
        await mobilePage.locator('#filters-section summary').click({ timeout: 5000 }).catch(() => {});
        await captureMaybe(states, mobilePage, '06-mobile-filters-open');
      }

      if (wantsState('09-mobile-map-empty-state')) {
        await mobilePage.goto(withParams(targetUrl, { view: 'map' }));
        await captureMaybe(states, mobilePage, '09-mobile-map-empty-state');
      }

      if (wantsState('10-mobile-search-error-state')) {
        await mobilePage.goto(withParams(targetUrl, { view: 'galaxy', q: 'semantic-error-proof' }));
        await waitForReady(mobilePage);
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
        await captureMaybe(states, mobilePage, '10-mobile-search-error-state');
      }

      if (wantsState('11-mobile-selected-card-map-trail')) {
        await mobilePage.goto(withParams(targetUrl, { view: 'map', q: 'coffee', anchor: '519' }));
        await waitForReady(mobilePage);
        await mobilePage.evaluate(() => {
          document.body.dataset.activeView = 'map';
          document.body.dataset.trailState = 'active';
          document.body.dataset.mapContext = 'focus';
        });
        await captureMaybe(states, mobilePage, '11-mobile-selected-card-map-trail');
      }

      await mobilePage.close();
    }

    if (wantsAny(['07-desktop-idle', '08-desktop-search-coffee'])) {
      const desktopPage = await browser.newPage({ viewport: desktop });
      if (wantsState('07-desktop-idle')) {
        await desktopPage.goto(targetUrl);
        await captureMaybe(states, desktopPage, '07-desktop-idle');
      }
      if (wantsState('08-desktop-search-coffee')) {
        await desktopPage.goto(withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }));
        await captureMaybe(states, desktopPage, '08-desktop-search-coffee');
      }
      await desktopPage.close();
    }

    if (wantsState('12-desktop-reduced-motion')) {
      const reducedPage = await browser.newPage({ viewport: desktop });
      await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
      await reducedPage.goto(targetUrl);
      await captureMaybe(states, reducedPage, '12-desktop-reduced-motion');
      await reducedPage.close();
    }
  } finally {
    await browser.close();
  }

  const summary = states.map(({ name, data }) => ({
    name,
    url: data.url,
    bodyDataset: data.bodyDataset,
    scroll: data.scroll,
    boxes: data.boxes,
  }));

  await fs.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const assertions = [];
  const stateByName = new Map(summary.map((state) => [state.name, state]));
  const pass = (name, check) => assertions.push({ level: 'pass', name, check });
  const fail = (name, check, msg) => assertions.push({ level: 'fail', name, check, msg });
  const box = (state, selector) => state?.boxes?.[selector];
  const isRendered = (b) => b && b.display !== 'none' && b.visibility !== 'hidden' && b.opacity !== '0';
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

  if (shouldAssert('09-mobile-map-empty-state')) {
    requireRendered('09-mobile-map-empty-state', 'map-empty-state-visible', '.map-empty-state');
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

  if (shouldAssert('07-desktop-idle')) {
    const desktopCard = requireRendered('07-desktop-idle', 'desktop-selected-card-visible', '.selected-card');
    if (desktopCard) {
      if (desktopCard.clusterRgb !== '78 205 196') {
        fail(
          '07-desktop-idle',
          'desktop-selected-card:cluster-rgb',
          `expected "78 205 196", got "${desktopCard.clusterRgb}"`,
        );
      } else {
        pass('07-desktop-idle', 'desktop-selected-card:cluster-rgb');
      }

      if (desktopCard.borderRadius !== '12px') {
        fail(
          '07-desktop-idle',
          'desktop-selected-card:border-radius',
          `expected "12px", got "${desktopCard.borderRadius}"`,
        );
      } else {
        pass('07-desktop-idle', 'desktop-selected-card:border-radius');
      }
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
      fail('12-desktop-reduced-motion', 'reduced-motion:selected-card-mounted',
        'missing selector: .selected-card');
    }
  }

  if (shouldAssert('11-mobile-selected-card-map-trail')) {
    const mobileTrailState = requireState('11-mobile-selected-card-map-trail');
    const mobileTrailCard = box(mobileTrailState, '.selected-card');
    if (mobileTrailCard) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card-mounted');
      if (!mobileTrailCard.clusterRgb) {
        fail('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card:cluster-rgb', 'missing --cluster-rgb');
      } else {
        pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card:cluster-rgb');
      }
    } else {
      fail('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card-mounted', 'missing selector: .selected-card');
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
  }

  await fs.writeFile(path.join(outDir, 'assertions.json'), `${JSON.stringify(assertions, null, 2)}\n`, 'utf8');

  const passCount = assertions.filter((a) => a.level === 'pass').length;
  const failCount = assertions.filter((a) => a.level === 'fail').length;
  const overflowFailures = assertions.filter((a) => a.level === 'fail' && a.check.startsWith('no-overflow')).length;
  const result = {
    outDir,
    states: summary.length,
    overflowFailures,
    assertions: { pass: passCount, fail: failCount, items: assertions },
  };
  console.log(JSON.stringify(result, null, 2));

  if (failCount > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
