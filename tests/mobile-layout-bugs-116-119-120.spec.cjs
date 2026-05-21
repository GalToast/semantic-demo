const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8795/vector-explorer-polished.html';
const FALLBACK_URL = 'http://127.0.0.1:8766/vector-explorer-polished.html';

const VIEWPORTS = [
  { name: 'tablet', width: 768, height: 900 },
  { name: 'mobile', width: 414, height: 896 },
];

async function getComputedInfo(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { error: 'Element not found', selector: sel };
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      selector: sel,
      tagName: el.tagName,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      width: style.width,
      height: style.height,
      boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      dataPanelSurface: el.getAttribute('data-panel-surface'),
      childCount: el.children ? el.children.length : 0,
    };
  }, selector);
}

async function isVisible(page, selector) {
  const info = await getComputedInfo(page, selector);
  return info.display !== 'none' && info.visibility !== 'hidden' && info.opacity !== '0' && info.boundingRect.width > 0 && info.boundingRect.height > 0;
}

async function waitForAppReady(page) {
  try {
    await page.waitForSelector('.search-container, #info-panel', { timeout: 15000 });
    return true;
  } catch (e) {
    return false;
  }
}

async function runTestForViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const results = { viewport: viewport.name, width: viewport.width, height: viewport.height, checks: [], errors: [] };

  // Try primary URL first
  let url = APP_URL;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (e) {
    // Try fallback
    try {
      url = FALLBACK_URL;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      results.errors.push(`Primary URL failed, used fallback: ${e.message}`);
    } catch (e2) {
      results.errors.push(`Both URLs failed: ${url} -> ${e.message}, ${FALLBACK_URL} -> ${e2.message}`);
      await context.close();
      return results;
    }
  }

  results.url = url;

  // Wait for app ready
  const appReady = await waitForAppReady(page);
  if (!appReady) {
    results.errors.push('App did not become ready (no .search-container or #info-panel found)');
    await context.close();
    return results;
  }

  // Small settle time
  await page.waitForTimeout(1000);

  // --- IDLE STATE CHECKS ---
  const idleChecks = [
    { selector: '#search-input', name: 'search-input' },
    { selector: '#btn-launch', name: 'btn-launch' },
    { selector: '.demo-starter-chip', name: 'demo-starter-chip' },
  ];

  for (const check of idleChecks) {
    const info = await getComputedInfo(page, check.selector);
    const visible = await isVisible(page, check.selector);
    const passed = visible && !info.error;
    results.checks.push({
      phase: 'idle',
      element: check.name,
      selector: check.selector,
      passed,
      info,
    });
  }

  // --- SIMULATE SEARCH ---
  try {
    const searchInput = await page.$('#search-input');
    if (searchInput) {
      await searchInput.click({ clickCount: 3 });
      await searchInput.fill('coffee');
      await page.waitForTimeout(500);
      // Wait for results to appear
      await page.waitForTimeout(1500);
    } else {
      results.errors.push('Could not find #search-input for typing');
    }
  } catch (e) {
    results.errors.push(`Search simulation error: ${e.message}`);
  }

  // --- POST-SEARCH CHECKS ---
  const postSearchChecks = [
    { selector: '#search-input', name: 'search-input' },
    { selector: '#btn-launch', name: 'btn-launch' },
    { selector: '.demo-starter-chip', name: 'demo-starter-chip' },
    { selector: '.info-panel', name: 'info-panel' },
  ];

  for (const check of postSearchChecks) {
    const info = await getComputedInfo(page, check.selector);
    const visible = await isVisible(page, check.selector);
    const passed = visible && !info.error;
    results.checks.push({
      phase: 'post-search',
      element: check.name,
      selector: check.selector,
      passed,
      info,
    });
  }

  await context.close();
  return results;
}

async function main() {
  console.log('Starting Mobile Layout Bugs #116/#119/#120 Test');
  console.log('=' .repeat(60));
  console.log(`App URL: ${APP_URL}`);
  console.log('');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error(`Failed to launch browser: ${e.message}`);
    process.exit(1);
  }

  const allResults = [];
  for (const viewport of VIEWPORTS) {
    console.log(`\n--- Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height}) ---`);
    try {
      const result = await runTestForViewport(browser, viewport);
      allResults.push(result);
      console.log(`URL used: ${result.url || 'N/A'}`);
      if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.join('; ')}`);
      }
      for (const check of result.checks) {
        const status = check.passed ? 'PASS' : 'FAIL';
        console.log(`  [${status}] ${check.phase} - ${check.element} (${check.selector})`);
        if (!check.passed) {
          console.log(`         computed: display=${check.info.display}, visibility=${check.info.visibility}, opacity=${check.info.opacity}`);
          console.log(`         bounding: top=${check.info.boundingRect.top}, left=${check.info.boundingRect.left}, w=${check.info.boundingRect.width}, h=${check.info.boundingRect.height}`);
          if (check.info.dataPanelSurface) {
            console.log(`         data-panel-surface=${check.info.dataPanelSurface}`);
          }
        }
      }
    } catch (e) {
      console.error(`Viewport test crashed: ${e.message}`);
      allResults.push({ viewport: viewport.name, errors: [e.message] });
    }
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  let anyFailed = false;
  for (const result of allResults) {
    const failedChecks = result.checks ? result.checks.filter(c => !c.passed) : [];
    const passedChecks = result.checks ? result.checks.filter(c => c.passed) : [];
    const bugReproduced = failedChecks.length > 0;
    if (bugReproduced) anyFailed = true;
    console.log(`\n${result.viewport} (${result.width}x${result.height}):`);
    console.log(`  Passed: ${passedChecks.length}`);
    console.log(`  Failed: ${failedChecks.length}`);
    if (failedChecks.length > 0) {
      console.log(`  FAILED ELEMENTS: ${failedChecks.map(c => c.element).join(', ')}`);
    }
  }

  console.log('\nBUG STATUS: ' + (anyFailed ? 'REPRODUCING' : 'NOT REPRODUCING'));

  return { allResults, bugReproduced: anyFailed };
}

main().then(({ allResults, bugReproduced }) => {
  process.exit(bugReproduced ? 1 : 0);
}).catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
