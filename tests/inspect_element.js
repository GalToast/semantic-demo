import { chromium } from 'playwright';

const url = 'http://127.0.0.1:8795/vector-explorer-polished.html?nodemo=1&view=galaxy&q=coffee&anchor=519';

async function run() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true
  });

  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'commit' });

  // Wait for the WebGL scene and app loading
  await page.waitForFunction(() => {
    const state = window.__TEST_STATE__;
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas || document.body.dataset.graphicsMode !== 'webgl') return false;
    return document.body.classList.contains('is-active');
  }, { timeout: 10000 }).catch(() => console.log('WebGL ready wait timed out'));

  await page.waitForTimeout(3000); // Wait for animations to settle

  const details = await page.evaluate(() => {
    const searchContainer = document.querySelector('.search-container');
    const infoContent = document.querySelector('.info-content');
    const infoPanel = document.querySelector('.info-panel');
    const body = document.body;

    if (!searchContainer) return { error: 'No .search-container found' };

    const scRect = searchContainer.getBoundingClientRect();
    const scStyle = window.getComputedStyle(searchContainer);
    const icRect = infoContent ? infoContent.getBoundingClientRect() : null;
    const icStyle = infoContent ? window.getComputedStyle(infoContent) : null;
    const ipRect = infoPanel ? infoPanel.getBoundingClientRect() : null;
    const ipStyle = infoPanel ? window.getComputedStyle(infoPanel) : null;

    return {
      bodyClasses: Array.from(body.classList),
      bodyDataset: { ...body.dataset },
      scClasses: Array.from(searchContainer.classList),
      scRect: { x: scRect.x, y: scRect.y, width: scRect.width, height: scRect.height },
      scStyles: {
        position: scStyle.position,
        left: scStyle.left,
        right: scStyle.right,
        top: scStyle.top,
        marginLeft: scStyle.marginLeft,
        marginRight: scStyle.marginRight,
        paddingLeft: scStyle.paddingLeft,
        paddingRight: scStyle.paddingRight,
        width: scStyle.width,
        maxWidth: scStyle.maxWidth,
        boxSizing: scStyle.boxSizing,
        display: scStyle.display,
        flexDirection: scStyle.flexDirection,
      },
      icRect: icRect ? { x: icRect.x, y: icRect.y, width: icRect.width, height: icRect.height } : null,
      icStyles: icStyle ? {
        position: icStyle.position,
        paddingLeft: icStyle.paddingLeft,
        paddingRight: icStyle.paddingRight,
        width: icStyle.width,
        boxSizing: icStyle.boxSizing,
      } : null,
      ipRect: ipRect ? { x: ipRect.x, y: ipRect.y, width: ipRect.width, height: ipRect.height } : null,
      ipStyles: ipStyle ? {
        position: ipStyle.position,
        width: ipStyle.width,
        left: ipStyle.left,
        right: ipStyle.right,
        boxSizing: ipStyle.boxSizing,
      } : null,
    };
  });

  console.log(JSON.stringify(details, null, 2));
  await browser.close();
}

run().catch(console.error);
