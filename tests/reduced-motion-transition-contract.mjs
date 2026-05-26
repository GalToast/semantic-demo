/**
 * reduced-motion-transition-contract.mjs
 *
 * Deterministic proof of reduced-motion transition suppression.
 *
 * Two-layer validation:
 *
 *  Layer 1 — Static CSS scan:
 *    Verifies the canonical late reduced-motion owner exists and reports
 *    per-file motion declarations as advisory context. This repo intentionally
 *    centralizes broad reduced-motion suppression late in the cascade, so
 *    individual source files are not required to own local suppression blocks.
 *
 *  Layer 2 — Playwright browser proof:
 *    Loads the page with reducedMotion:'reduce' emulated.
 *    Collects transition-duration from all elements that have CSS transitions.
 *    Asserts every computed transition-duration is <= 1ms (or 0s).
 *    Falls back to 0s (instant) under reduced-motion — any non-zero duration
 *    that exceeds 1ms is a defect.
 *
 * Exit:
 *   0  — all checks pass
 *   1  — one or more failures (with descriptive JSON report)
 *
 * Evidence dir: tmp/reduced-motion-video-proof-2026-05-20/
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const OUT_DIR = resolve(root, 'tmp', 'reduced-motion-video-proof-2026-05-20');

const CSS_FILES = readdirSync(resolve(root, 'css')).filter(
  (f) => extname(f) === '.css'
).map((f) => resolve(root, 'css', f));

// Elements with CSS transitions — must be instant under reduced-motion
const ANIMATED_SELECTORS = [
  '#canvas-container',
  '.journey-compass',
  '.search-container',
  '#info-panel',
  '.selected-card',
  '.focus-stage',
  '#focus-stage',
  '.about-card',
  '#map-container',
  '.map-trail-strip',
  '.journey-compass-rail',
  '.view-toggle',
  '#btn-legend',
];

// ---- Layer 1: Static CSS analysis ----

function scanCssForReducedMotionSuppression(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const filename = filePath.split(/[/\\]/).pop();

  // Does this file declare any transition or animation properties at all?
  const hasTransitions = /transition(-property|-duration|-delay|-timing-function|):/.test(content);
  const hasAnimations = /animation(-name|-duration|-delay|-timing-function|-iteration-count|-fill-mode|-play-state|):/.test(content);

  if (!hasTransitions && !hasAnimations) {
    return { file: filename, role: 'no-motion', suppressed: true, rules: 0 };
  }

  // Count @media (prefers-reduced-motion: reduce) blocks
  const reducedMotionBlocks = [
    ...content.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\}/gi),
  ];

  const suppressedBlocks = reducedMotionBlocks.filter((block) => {
    const blockBody = block[0];
    // A suppressing block must contain at least one valid suppression:
  //   transition-duration: 0s / 0ms / 0.01ms
  //   transition: none
  //   animation: none
  //   animation-duration: 0s / 0ms
  const hasSuppressingDuration =
    /transition-duration:\s*(0(?:s|ms)?|0\.01ms)/.test(blockBody);
  const hasSuppressingTransitionNone =
    /transition:\s*none/.test(blockBody);
  const hasSuppressingAnimationNone =
    /animation:\s*none/.test(blockBody);
  const hasSuppressingAnimDuration =
    /animation-duration:\s*(0(?:s|ms)?|0\.01ms)/.test(blockBody);

  return hasSuppressingDuration || hasSuppressingTransitionNone || hasSuppressingAnimationNone || hasSuppressingAnimDuration;
  });

  return {
    file: filename,
    role: hasTransitions ? 'transition' : 'animation',
    hasTransitions,
    hasAnimations,
    reducedMotionBlocks: reducedMotionBlocks.length,
    suppressedBlocks: suppressedBlocks.length,
    suppressed: suppressedBlocks.length > 0,
    sampleRule: suppressedBlocks[0]
      ? suppressedBlocks[0][0].slice(0, 120)
      : null,
  };
}

function runStaticCheck() {
  const results = CSS_FILES.map((f) => scanCssForReducedMotionSuppression(f));
  const advisory = results.filter((r) => r.role !== 'no-motion' && !r.suppressed);
  const ownerPath = resolve(root, 'css', 'animations.css');
  const ownerCss = readFileSync(ownerPath, 'utf8');
  const requiredSelectors = [
    '#canvas-container',
    '#map-container',
    '.journey-compass',
    '.view-toggle',
    '#btn-legend',
    '.search-container',
    '.info-panel',
    '.focus-stage',
  ];
  const ownerMissingSelectors = requiredSelectors.filter((selector) => !ownerCss.includes(selector));
  const ownerHasSuppression =
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(ownerCss) &&
    /animation:\s*none/.test(ownerCss) &&
    /transition:\s*none/.test(ownerCss);

  return {
    results,
    advisory,
    owner: {
      file: 'animations.css',
      hasSuppression: ownerHasSuppression,
      missingSelectors: ownerMissingSelectors,
      passed: ownerHasSuppression && ownerMissingSelectors.length === 0,
    },
  };
}

// ---- Layer 2: Playwright browser proof ----

function cssTimeToMs(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'none' || normalized === 'all') return NaN;
  if (normalized.endsWith('ms')) return parseFloat(normalized);
  if (normalized.endsWith('s')) return parseFloat(normalized) * 1000;
  return parseFloat(normalized);
}

function cssTimeListToMs(value) {
  return String(value || '')
    .split(',')
    .map(cssTimeToMs)
    .filter((v) => Number.isFinite(v));
}

async function startServer(port) {
  const http = await import('node:http');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
  };

  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/' || !urlPath.includes('.')) {
      urlPath = '/vector-explorer-polished.html';
    }
    const filePath = resolve(root, urlPath.replace(/^\//, ''));
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function waitForReady(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => {
    const body = document.body?.dataset;
    const canvas = document.querySelector('#canvas-container canvas');
    return (
      body?.graphicsMode === 'webgl' &&
      canvas &&
      window.__TEST_STATE__?.renderer &&
      window.__TEST_STATE__?.scene &&
      window.__TEST_STATE__?.camera
    );
  }, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2200);
}

async function runBrowserProof(port) {
  const server = await startServer(port);
  const browser = await chromium.launch({ headless: true });

  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktopPage.emulateMedia({ reducedMotion: 'reduce' });

  const url = `http://127.0.0.1:${port}/vector-explorer-polished.html?nodemo=1`;
  await desktopPage.goto(url, { waitUntil: 'commit', timeout: 15000 });
  await waitForReady(desktopPage);

  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await mobilePage.emulateMedia({ reducedMotion: 'reduce' });
  await mobilePage.goto(url, { waitUntil: 'commit', timeout: 15000 });
  await waitForReady(mobilePage);

  const collectFromPage = async (page) => {
    return page.evaluate(() => {
      const selectors = [
        '#canvas-container',
        '.journey-compass',
        '.search-container',
        '#info-panel',
        '.selected-card',
        '.focus-stage',
        '#focus-stage',
        '.about-card',
        '#map-container',
        '.map-trail-strip',
        '.journey-compass-rail',
        '.view-toggle',
        '#btn-legend',
      ];
      return selectors.map((selector) => {
        const el = document.querySelector(selector);
        if (!el) return { selector, present: false };
        const style = getComputedStyle(el);
        const transitionDuration = style.transitionDuration;
        const transitionDelay = style.transitionDelay;
        const animationName = style.animationName;
        const animationDuration = style.animationDuration;
        const computedStyle = {
          transitionDuration,
          transitionDelay,
          animationName,
          animationDuration,
        };
        return {
          selector,
          present: true,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          transitionDuration,
          transitionDelay,
          animationName,
          animationDuration,
          computedStyle,
        };
      });
    }, ANIMATED_SELECTORS);
  };

  const desktopData = await collectFromPage(desktopPage);
  const mobileData = await collectFromPage(mobilePage);

  await browser.close();
  server.close();

  return { desktop: desktopData, mobile: mobileData };
}

function analyzeBrowserData(desktop, mobile) {
  const allData = [
    ...desktop.map((d) => ({ ...d, viewport: 'desktop' })),
    ...mobile.map((m) => ({ ...m, viewport: 'mobile' })),
  ];

  const failures = [];
  const passes = [];

  for (const item of allData) {
    if (!item.present) continue;
    if (item.display === 'none' || item.visibility === 'hidden') continue;

    const durations = cssTimeListToMs(item.transitionDuration);
    for (const duration of durations) {
      if (duration > 1) {
        failures.push({
          selector: item.selector,
          viewport: item.viewport,
          property: 'transition-duration',
          actualMs: duration,
          thresholdMs: 1,
          computedValue: item.transitionDuration,
        });
      } else if (duration >= 0) {
        passes.push({
          selector: item.selector,
          viewport: item.viewport,
          property: 'transition-duration',
          actualMs: duration,
          thresholdMs: 1,
          computedValue: item.transitionDuration,
        });
      }
    }

    const animDurations = cssTimeListToMs(item.animationDuration);
    for (const duration of animDurations) {
      if (duration > 1) {
        failures.push({
          selector: item.selector,
          viewport: item.viewport,
          property: 'animation-duration',
          actualMs: duration,
          thresholdMs: 1,
          computedValue: item.animationDuration,
        });
      } else if (duration >= 0) {
        passes.push({
          selector: item.selector,
          viewport: item.viewport,
          property: 'animation-duration',
          actualMs: duration,
          thresholdMs: 1,
          computedValue: item.animationDuration,
        });
      }
    }
  }

  return { failures, passes };
}

// ---- Main ----

async function run() {
  console.log('=== Layer 1: Static CSS analysis ===');
  const staticResult = runStaticCheck();

  if (staticResult.owner.passed) {
    console.log(`PASS [static-owner] ${staticResult.owner.file}: canonical late reduced-motion owner covers key selectors`);
  } else {
    console.log(
      `FAIL [static-owner] ${staticResult.owner.file}: missing suppression=${!staticResult.owner.hasSuppression}, missing selectors=${staticResult.owner.missingSelectors.join(', ') || 'none'}`,
    );
  }

  for (const r of staticResult.results) {
    if (r.role === 'no-motion') {
      console.log(`PASS [static] ${r.file}: no motion properties — skipped`);
    } else if (r.suppressed) {
      console.log(`PASS [static] ${r.file}: ${r.reducedMotionBlocks} reduced-motion rule(s), ${r.suppressedBlocks} suppressing`);
    } else {
      console.log(`INFO [static] ${r.file}: has ${r.role} properties; relies on canonical late suppression`);
    }
  }

  console.log(`\nStatic summary: ${staticResult.results.length - staticResult.advisory.length}/${staticResult.results.length} CSS files have local suppression or no motion; ${staticResult.advisory.length} rely on canonical suppression`);

  console.log('\n=== Layer 2: Playwright browser proof ===');
  let browserResult;
  try {
    browserResult = await runBrowserProof(8816);
  } catch (err) {
    console.error(`Browser proof FAILED: ${err.message}`);
    console.error('Falling back to static-only result');
    browserResult = { desktop: [], mobile: [], error: String(err) };
  }

  const { failures, passes } = analyzeBrowserData(
    browserResult.desktop || [],
    browserResult.mobile || []
  );

  console.log(`\nBrowser proof: ${passes.length} transition checks passed, ${failures.length} failed`);

  for (const p of passes) {
    console.log(`PASS [browser] ${p.viewport} ${p.selector} ${p.property}=${p.computedValue} (${p.actualMs}ms)`);
  }

  for (const f of failures) {
    console.log(`FAIL [browser] ${f.viewport} ${f.selector} ${f.property}=${f.computedValue} (${f.actualMs}ms > ${f.thresholdMs}ms threshold)`);
  }

  const staticFailed = staticResult.owner.passed ? 0 : 1;
  const browserFailed = failures.length;
  const coverageFailed = passes.length < 20 ? 1 : 0;
  const totalFailed = staticFailed + browserFailed + coverageFailed;

  const report = {
    timestamp: new Date().toISOString(),
    layer1_static: {
      total: staticResult.results.length,
      locallySuppressedOrNoMotion: staticResult.results.length - staticResult.advisory.length,
      advisoryCount: staticResult.advisory.length,
      owner: staticResult.owner,
      failed: staticFailed,
      advisory: staticResult.advisory,
      details: staticResult.results,
    },
    layer2_browser: {
      passed: passes.length,
      failures: failures.length,
      failureDetails: failures,
      coverageFailed: coverageFailed === 1,
      desktopElements: (browserResult.desktop || []).length,
      mobileElements: (browserResult.mobile || []).length,
    },
    overall: totalFailed === 0 ? 'PASS' : 'FAIL',
  };

  console.log(`\n=== Overall: ${report.overall} ===`);
  console.log(JSON.stringify(report, null, 2));

  if (totalFailed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
