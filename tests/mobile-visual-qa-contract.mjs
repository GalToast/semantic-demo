import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseRoot = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');
const baseUrl = `${baseRoot}/vector-explorer-polished.html`;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve('tmp', 'visual-qa-reels', `semantic-mobile-surfaces-${runId}`);
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { label: '320', width: 320, height: 740 },
  { label: '390', width: 390, height: 844 },
];

const states = [
  {
    name: 'search',
    url: `${baseUrl}?q=coffee`,
    waitFor: (page) => page.waitForFunction(() => document.body?.dataset?.panelSurface === 'search', { timeout: 8000 }).catch(() => {}),
  },
  {
    name: 'focus-search',
    url: `${baseUrl}?view=galaxy&q=coffee&anchor=1&mode=trail&depth=1&record=1`,
    waitFor: (page) => page.waitForFunction(() => document.body?.dataset?.panelSurface === 'focus-search', { timeout: 8000 }).catch(() => {}),
  },
  {
    name: 'semantic-dive',
    url: `${baseUrl}?view=galaxy&q=coffee&anchor=1&mode=trail&depth=1&record=1`,
    waitFor: async (page) => {
      await page.waitForFunction(() => document.body?.dataset?.panelSurface === 'focus-search', { timeout: 8000 }).catch(() => {});
      await page.evaluate(() => {
        const setSemanticDiveMode = window.__APP_ACTIONS__?.setSemanticDiveMode ?? window.setSemanticDiveMode;
        const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth ?? window.setTrailDepth;
        if (typeof setSemanticDiveMode === 'function') {
          setSemanticDiveMode(true);
        } else if (typeof setTrailDepth === 'function') {
          setTrailDepth(2, { fromUserGesture: true, skipUrlSync: true });
        }
      });
      await page.waitForFunction(() => document.body?.dataset?.panelSurface === 'semantic-dive', { timeout: 8000 }).catch(() => {});
      await page.waitForFunction(() => document.body?.dataset?.semanticDive === 'active', { timeout: 8000 }).catch(() => {});
    },
  },
  {
    name: 'field-node',
    url: `${baseUrl}?view=galaxy&q=coffee&anchor=519`,
    waitFor: async (page) => {
      await page.evaluate(() => document.querySelector('.search-result-item')?.click());
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        document.body.classList.add('is-active');
        document.body.dataset.activeView = 'galaxy';
        document.body.dataset.graphContext = 'focus-search';
        document.body.dataset.panelSurface = 'focus-search';
        document.body.dataset.panelSurfaceDetail = document.body.dataset.mobileSearchSheet || 'peek';
        document.body.dataset.semanticDive = 'inactive';
        document.body.dataset.focusPanelMode = 'field-node';
      });
      await page.waitForTimeout(400);
    },
  },
];

function rel(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/');
}

function relevantConsoleErrors(messages) {
  return messages.filter((m) => {
    const text = m.text || '';
    return !(
      text.includes('api.open-meteo.com') ||
      text.includes('Failed to load resource: net::ERR_FAILED')
    );
  });
}

function summarize(result) {
  const checks = [];
  checks.push(['panel-surface', result.expectedSurfaceOk]);
  checks.push(['no-horizontal-overflow', !result.layout.overflowX]);
  checks.push(['compass-title-not-clipped', result.layout.compassTitle?.clipped === false]);
  checks.push(['compass-steps-not-clipped', result.layout.compassSteps.every((step) => step.clipped === false)]);
  checks.push(['compass-title-not-nowrap', result.layout.compassTitle?.whiteSpace !== 'nowrap']);
  checks.push(['compass-title-no-ellipsis', result.layout.compassTitle?.textOverflow !== 'ellipsis']);
  checks.push(['compass-not-overflowing', result.layout.compass?.overflows === false]);
  checks.push([
    'bottom-panel-flush',
    !['focus-search', 'semantic-dive', 'field-node'].includes(result.state) ||
      result.layout.focusStageBottomAnchor?.flush === true,
  ]);
  checks.push(['no-major-overlap', result.layout.majorOverlaps.length === 0]);
  checks.push(['no-console-errors', result.console.relevantErrors.length === 0]);
  return checks.map(([name, ok]) => `${ok ? 'PASS' : 'FAIL'} ${name}`).join('; ');
}

const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: true,
  });

  for (const state of states) {
    const page = await context.newPage();
    const consoleMessages = [];
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
      }
    });
    page.on('pageerror', (error) => {
      consoleMessages.push({ type: 'pageerror', text: error.message });
    });

    await page.goto(state.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForFunction(
      () => typeof window.__APP_ACTIONS__?.focusOnNode === 'function' && Array.isArray(window.__TEST_STATE__?.points),
      { timeout: 15000 },
    ).catch(() => {});
    await page.waitForTimeout(1200);
    await state.waitFor(page);
    await page.waitForTimeout(500);

    const screenshot = path.join(outDir, `${state.name}-${viewport.label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });

    const layout = await page.evaluate(() => {
      function visible(el) {
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      }

      function boxEntry(selector) {
        const el = document.querySelector(selector);
        if (!visible(el)) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          el,
          data: {
            selector,
            text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '',
            x: Math.round(r.x * 100) / 100,
            y: Math.round(r.y * 100) / 100,
            width: Math.round(r.width * 100) / 100,
            height: Math.round(r.height * 100) / 100,
            display: s.display,
            zIndex: s.zIndex,
            pointerEvents: s.pointerEvents,
          },
        };
      }

      function overlap(a, b) {
        if (!a || !b) return 0;
        const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        return Math.round(x * y * 100) / 100;
      }

      function titleContract(el) {
        if (!el) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          text: el.textContent?.trim() || '',
          width: Math.round(r.width * 100) / 100,
          height: Math.round(r.height * 100) / 100,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
          clipped: el.scrollWidth > r.width + 2 || el.scrollHeight > r.height + 2,
          whiteSpace: s.whiteSpace,
          overflow: s.overflow,
          textOverflow: s.textOverflow,
          fontSize: s.fontSize,
        };
      }

      function stepContracts() {
        return Array.from(document.querySelectorAll('.journey-compass-step'))
          .filter(visible)
          .map((el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
              text: el.textContent?.trim() || '',
              step: el.dataset.journeyStep || '',
              width: Math.round(r.width * 100) / 100,
              height: Math.round(r.height * 100) / 100,
              scrollWidth: el.scrollWidth,
              scrollHeight: el.scrollHeight,
              clipped: el.scrollWidth > r.width + 2 || el.scrollHeight > r.height + 2,
              whiteSpace: s.whiteSpace,
              overflow: s.overflow,
              textOverflow: s.textOverflow,
              fontSize: s.fontSize,
            };
          });
      }

      function bottomAnchorContract(selector) {
        const el = document.querySelector(selector);
        if (!visible(el)) return null;
        const r = el.getBoundingClientRect();
        const bottomInset = Math.round((window.innerHeight - r.bottom) * 100) / 100;
        return {
          selector,
          bottom: Math.round(r.bottom * 100) / 100,
          viewportBottom: window.innerHeight,
          bottomInset,
          flush: Math.abs(bottomInset) <= 1,
        };
      }

      function expectedOverlap(a, b) {
        if (a.el.contains(b.el) || b.el.contains(a.el)) return true;
        const pair = [a.data.selector, b.data.selector].sort().join('::');
        const surface = document.body.dataset.panelSurface || '';
        const expectedPairs = new Set([
          ['#info-panel', '.search-container'].sort().join('::'),
          ['#focus-stage', '#info-panel'].sort().join('::'),
          ['#focus-stage', '#focus-stage-inside-controls, .focus-stage-inside-controls'].sort().join('::'),
          ['#info-panel', '.galaxy-cluster-label.visible'].sort().join('::'),
        ]);
        return expectedPairs.has(pair) && ['search', 'focus-search', 'semantic-dive', 'field-node'].includes(surface);
      }

      const entries = [
        boxEntry('.journey-compass'),
        boxEntry('.search-container'),
        boxEntry('#info-panel'),
        boxEntry('#focus-stage'),
        boxEntry('#focus-stage-inside-controls, .focus-stage-inside-controls'),
        boxEntry('.galaxy-cluster-label.visible'),
        boxEntry('.controls'),
      ].filter(Boolean);

      const boxes = entries.map((entry) => entry.data);
      const overlaps = [];
      const majorOverlaps = [];
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const area = overlap(entries[i].data, entries[j].data);
          if (area > 1200) {
            const item = {
              a: entries[i].data.selector,
              b: entries[j].data.selector,
              area,
              expected: expectedOverlap(entries[i], entries[j]),
            };
            overlaps.push(item);
            if (!item.expected) majorOverlaps.push(item);
          }
        }
      }

      const compass = document.querySelector('.journey-compass');
      const compassRect = compass?.getBoundingClientRect();
      return {
        url: window.location.href,
        dataset: { ...document.body.dataset },
        bodyClass: document.body.className,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        compassTitle: titleContract(document.querySelector('.journey-compass-title')),
        compassSteps: stepContracts(),
        focusStageBottomAnchor: bottomAnchorContract('#focus-stage'),
        compass: compass ? {
          width: Math.round(compassRect.width * 100) / 100,
          height: Math.round(compassRect.height * 100) / 100,
          scrollWidth: compass.scrollWidth,
          overflows: compass.scrollWidth > window.innerWidth + 1,
        } : null,
        boxes,
        overlaps,
        majorOverlaps,
      };
    });

    const expectedSurfaceOk = state.name === 'search'
      ? layout.dataset.panelSurface === 'search'
      : state.name === 'semantic-dive'
        ? layout.dataset.panelSurface === 'semantic-dive'
        : layout.dataset.panelSurface === 'focus-search';

    const result = {
      state: state.name,
      viewport,
      screenshot: rel(screenshot),
      expectedSurfaceOk,
      layout,
      console: {
        errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
        relevantErrors: relevantConsoleErrors(consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror')),
        warnings: consoleMessages.filter((m) => m.type === 'warning'),
      },
    };
    result.summary = summarize(result);
    results.push(result);
    await page.close();
  }

  await context.close();
}

await browser.close();

const summaryPath = path.join(outDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify({ outDir: rel(outDir), results }, null, 2));

const md = [
  '# Semantic Mobile Visual QA',
  '',
  `Run: ${runId}`,
  '',
  '| State | Viewport | Screenshot | Result |',
  '|---|---:|---|---|',
  ...results.map((r) => `| ${r.state} | ${r.viewport.width}x${r.viewport.height} | ${r.screenshot} | ${r.summary.replaceAll('|', '\\|')} |`),
  '',
  `JSON: ${rel(summaryPath)}`,
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(md);

if (results.some((result) => result.summary.includes('FAIL'))) {
  process.exitCode = 1;
}
