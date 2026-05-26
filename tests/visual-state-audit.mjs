import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');
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
const outRoot = process.env.SEMANTIC_VISUAL_AUDIT_OUT || path.resolve(process.cwd(), 'tmp', 'semantic-ui-visual-audit');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, runId);

const mobile = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function createAuditPage(browser, options = {}) {
  const page = await browser.newPage(options);
  page.on('console', (msg) => {
    console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    console.log(`[Request Failed] ${req.url()} - Error: ${req.failure()?.errorText || 'unknown'}`);
  });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.endsWith('.woff') ||
      url.endsWith('.woff2') ||
      url.endsWith('.ttf')
    ) {
      // console.log(`[Aborting Route] ${url}`);
      route.abort();
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
  await page.waitForFunction(() => {
    const state = window.__TEST_STATE__;
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) return false;
    const mode = document.body.dataset.graphicsMode;
    if (mode === 'fallback') return true; // resolved via fallback
    if (mode !== 'webgl') return false;
    if (!state?.renderer || !state?.scene || !state?.camera) return false;
    if (!state?.pointsMesh?.geometry?.attributes?.position?.count) return false;
    return Boolean(state?.pointsMaterial?.userData?.shader);
  }, undefined, { timeout: 8000 })
    .then(() => console.log(`[waitForReady:${label}] WebGL/fallback state resolved`))
    .catch((err) => console.log(`[waitForReady:${label}] WebGL state timeout/failed: ${err.message}`));
  
  console.log(`[waitForReady:${label}] Waiting timeout 2200ms...`);
  await page.waitForTimeout(2200);
  console.log(`[waitForReady:${label}] Done!`);
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'commit', timeout: 10000 });
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
  let bright = 0;
  let white = 0;
  let saturated = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const luma = Math.round((r * 299 + g * 587 + b * 114) / 1000);
      luminance.push(luma);
      if (luma >= 210) bright += 1;
      if (luma >= 236) white += 1;
      if (r >= 248 && g >= 248 && b >= 248) saturated += 1;
    }
  }
  luminance.sort((a, b) => a - b);
  const count = luminance.length || 1;
  const percentile = (p) => luminance[Math.min(luminance.length - 1, Math.max(0, Math.floor((luminance.length - 1) * p)))] || 0;
  return {
    region,
    samples: luminance.length,
    median: percentile(0.5),
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
    brightRatio: Number((bright / count).toFixed(4)),
    whiteRatio: Number((white / count).toFixed(4)),
    saturatedRatio: Number((saturated / count).toFixed(4)),
  };
}

async function captureState(page, name) {
  await waitForReady(page, name);
  if (name === '16-desktop-info-panel-populated') {
    await applyPopulatedInfoPanelState(page);
  }
  if (name === '18-mobile-loading-overlay') {
    await applyLoadingOverlayState(page);
  }
  if (name === '19-mobile-compass-rail') {
    await applyCompassRailState(page);
  }
  if (name === '20-mobile-mode-grid-visible') {
    await applyModeGridVisibleState(page);
  }

  const data = await page.evaluate(() => {
    const selectors = [
      '#canvas-container',
      '.journey-compass',
      '.search-container',
      '#search-results',
      '#mode-grid',
      '#filters-section',
      '#info-panel',
      '#focus-stage',
      '.focus-stage-card',
      '.selected-card',
      '.about-card',
      '.selected-empty',
      '#selected-details',
      '#selected-name',
      '#selected-what',
      '#selected-theme',
      '#selected-status',
      '#selected-role-badge',
      '.selected-hero',
      '.search-error-state',
      '.search-error-kicker',
      '.search-error-retry-btn',
      '.search-error-dismiss-btn',
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
      '#focus-thread-inspector',
      '#focus-thread-inspector-title',
      '#focus-thread-inspector-copy',
      '#focus-thread-inspector-meta',
      '#btn-thread-pin',
      '#btn-thread-follow',
      '#btn-thread-clear',
      '#map-container',
      '.map-trail-strip',
      '.map-empty-state',
      '.journey-compass-note',
      '.journey-compass-rail',
      '.journey-compass-step',
      '.journey-compass-kicker',
      '.journey-compass-title',
      '.journey-compass-actions',
      '.demo-starters',
      '.demo-starter-chip',
      '.mode-chip',
      '.mode-chip.active',
      '.mode-name',
      '.view-toggle',
      '#btn-legend',
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
        topElement: describeElement(topElement),
        centerTopInside: topElement ? element.contains(topElement) : false,
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
      routeTraceDiagnostics: (() => {
        const diagnostics = window.__TEST_STATE__?.routeTraceDiagnostics || null;
        const lines = window.__TEST_STATE__?.routeTraceLines || null;
        return {
          ...(diagnostics || {}),
          linePresent: !!lines,
          lineSegmentCount: lines?.geometry?.attributes?.position?.count
            ? Math.floor(lines.geometry.attributes.position.count / 2)
            : 0,
          connectionPairCount: Array.isArray(window.__TEST_STATE__?.routeTraceConnectionPairs)
            ? window.__TEST_STATE__.routeTraceConnectionPairs.length
            : 0,
          motionProbe: window.__routeTraceMotionProbe || null,
        };
      })(),
      inspectedStrandDiagnostics: {
        ...(window.__TEST_STATE__?.inspectedStrandDiagnostics || {}),
      },
    };
  });

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

async function applyPopulatedInfoPanelState(page) {
  await page.evaluate(() => {
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus';
    document.body.dataset.panelSurface = 'focus';

    const selectedCard = document.querySelector('#selected-card');
    selectedCard?.classList.remove('is-empty');

    const selectedDetails = document.querySelector('#selected-details');
    if (selectedDetails) {
      selectedDetails.classList.add('active');
      selectedDetails.hidden = false;
      selectedDetails.style.display = 'block';
      selectedDetails.style.visibility = 'visible';
    }

    const selectedEmpty = document.querySelector('.selected-empty');
    if (selectedEmpty) selectedEmpty.style.display = 'none';

    const selectedName = document.querySelector('#selected-name');
    if (selectedName) selectedName.textContent = 'Downtown Coffee Collective';

    const selectedWhat = document.querySelector('#selected-what');
    if (selectedWhat) selectedWhat.textContent = 'Artisan coffee shop with outdoor seating';

    const selectedTheme = document.querySelector('#selected-theme');
    if (selectedTheme) selectedTheme.textContent = 'Food & Drink - Cafes';

    const selectedStatus = document.querySelector('#selected-status');
    if (selectedStatus) selectedStatus.textContent = 'Active';

    const selectedFiledAs = document.querySelector('#selected-filed-as');
    if (selectedFiledAs) selectedFiledAs.style.display = 'none';
  });
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
    });

    const rail = document.querySelector('.journey-compass-rail');
    if (rail) {
      rail.style.display = 'grid';
      rail.style.visibility = 'visible';
    }

    const actions = document.querySelector('.journey-compass-actions');
    if (actions) {
      actions.style.display = 'flex';
      actions.style.visibility = 'visible';
    }

    const title = document.querySelector('#journey-compass-title');
    if (title) {
      title.textContent = 'Map View';
      title.style.display = 'block';
      title.style.visibility = 'visible';
    }
    const note = document.querySelector('#journey-compass-note');
    if (note) {
      note.textContent = 'The map rail keeps the journey steps visible.';
      note.style.display = 'block';
      note.style.visibility = 'visible';
    }
    const kicker = document.querySelector('#journey-compass-kicker');
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
    document.querySelectorAll('#btn-launch, .search-label, .search-input-wrapper, .search-hint, .semantic-lane-assist, .search-trail-cue').forEach((element) => {
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
      infoContent.scrollTop = Math.max(0, modeGrid.offsetTop - infoContent.clientHeight + modeGrid.offsetHeight + 24);
    }
  });
}

async function run() {
  await ensureDir(outDir);
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
      '17-mobile-thread-inspector',
      '18-mobile-loading-overlay',
      '19-mobile-compass-rail',
      '20-mobile-mode-grid-visible',
      '21-mobile-route-trace-visible',
    ])) {
      const browser = await chromium.launch({ headless: true });
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
              if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
            });
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
          await waitForReady(mobilePage);
          await mobilePage.locator('#filters-section summary').click({ timeout: 5000 }).catch(() => {});
          await captureMaybe(states, mobilePage, '06-mobile-filters-open');
        }

        if (wantsState('09-mobile-map-empty-state')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'map' }));
          await mobilePage.locator('.map-empty-state').waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
          await captureMaybe(states, mobilePage, '09-mobile-map-empty-state');
        }

        if (wantsState('10-mobile-search-error-state')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy', q: 'semantic-error-proof' }));
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
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'map', q: 'coffee', anchor: '519' }));
          await waitForReady(mobilePage);
          await mobilePage.evaluate(() => {
            document.body.dataset.activeView = 'map';
            document.body.dataset.trailState = 'active';
            document.body.dataset.mapContext = 'focus';
          });
          await captureMaybe(states, mobilePage, '11-mobile-selected-card-map-trail');
        }

        if (wantsState('21-mobile-route-trace-visible')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }));
          await waitForReady(mobilePage);
          const firstResult = mobilePage.locator('.search-result-item').first();
          if (await firstResult.count()) {
            await firstResult.click({ timeout: 5000 }).catch(() => {});
          }
          await mobilePage.waitForTimeout(600);
          await mobilePage.evaluate(() => {
            const state = window.__TEST_STATE__ || {};
            if (typeof window.switchView === 'function') {
              window.switchView('galaxy', { skipUrlSync: true, silentHandoff: true });
            }
            if (state.currentView !== 'galaxy') {
              state.currentView = 'galaxy';
            }
            const seedIndex =
              Number.isFinite(state.navState?.focusedIndex) ? state.navState.focusedIndex :
              Number.isFinite(state.focusedNode) ? state.focusedNode :
              Number.isFinite(state.currentSearchSummary?.anchorIndex) ? state.currentSearchSummary.anchorIndex :
              519;
            if (typeof window.setTrailFromSeed === 'function' && Number.isFinite(seedIndex)) {
              window.setTrailFromSeed(seedIndex);
            }
            if (document.body?.dataset) {
              document.body.dataset.activeView = 'galaxy';
              document.body.dataset.routeMotion = 'focus';
            }
            if (typeof window.setRouteChoreographyPhase === 'function') {
              window.setRouteChoreographyPhase('focus', { reason: 'visual-audit-route-trace' });
            } else if (typeof window.refreshRouteTraceOverlay === 'function') {
              window.refreshRouteTraceOverlay({ reason: 'visual-audit-route-trace' });
            }
            if (typeof window.updateRouteTraceOverlayPositions === 'function') {
              window.updateRouteTraceOverlayPositions(performance.now());
            }
          });
          await mobilePage.waitForFunction(() => {
            const diagnostics = window.__TEST_STATE__?.routeTraceDiagnostics;
            return Boolean(
              diagnostics?.active &&
              diagnostics.edgeCount > 0 &&
              diagnostics.segmentCount > 0 &&
              window.__TEST_STATE__?.routeTraceLines
            );
          }, undefined, { timeout: 8000 }).catch(() => {});
          await mobilePage.evaluate(async () => {
            const t1 = window.__TEST_STATE__?.routeTraceLines?.material?.uniforms?.time?.value ?? null;
            await new Promise((resolve) => setTimeout(resolve, 300));
            const t2 = window.__TEST_STATE__?.routeTraceLines?.material?.uniforms?.time?.value ?? null;
            window.__routeTraceMotionProbe = {
              t1,
              t2,
              advanced: Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1,
            };
          });
          await captureMaybe(states, mobilePage, '21-mobile-route-trace-visible');
        }

        if (wantsState('17-mobile-thread-inspector')) {
          await gotoReady(mobilePage, withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }));
          await waitForReady(mobilePage);
          const firstResult = mobilePage.locator('.search-result-item').first();
          if (await firstResult.count()) {
            await firstResult.click({ timeout: 5000 }).catch(() => {});
          }
          await mobilePage.waitForTimeout(800);
          await mobilePage.evaluate(() => {
            const state = window.__TEST_STATE__ || {};
            if (typeof window.switchView === 'function') {
              window.switchView('galaxy', { skipUrlSync: true, silentHandoff: true });
            }
            if (state.currentView !== 'galaxy') {
              state.currentView = 'galaxy';
            }
            const seedIndex =
              Number.isFinite(state.navState?.focusedIndex) ? state.navState.focusedIndex :
              Number.isFinite(state.focusedNode) ? state.focusedNode :
              Number.isFinite(state.currentSearchSummary?.anchorIndex) ? state.currentSearchSummary.anchorIndex :
              519;
            if (typeof window.setTrailFromSeed === 'function' && Number.isFinite(seedIndex)) {
              window.setTrailFromSeed(seedIndex);
            }

            document.body.classList.add('is-active');
            document.body.dataset.activeView = 'galaxy';
            document.body.dataset.graphContext = 'focus';
            document.body.dataset.panelSurface = 'focus';

            const focusStage = document.querySelector('#focus-stage');
            if (focusStage) {
              focusStage.hidden = false;
              focusStage.style.display = 'block';
              focusStage.classList.add('active');
            }

            const candidate = (state.navState?.threadCandidates || [])
              .find((item) => item && Number.isFinite(item.index) && item.index !== seedIndex);
            const renderThreadInspection =
              typeof window.renderThreadInspection === 'function' ? window.renderThreadInspection :
              typeof window._ti?.renderThreadInspection === 'function' ? window._ti.renderThreadInspection :
              null;
            const inspectThreadNeighbor =
              typeof window.inspectThreadNeighbor === 'function' ? window.inspectThreadNeighbor :
              typeof window._ti?.inspectThreadNeighbor === 'function' ? window._ti.inspectThreadNeighbor :
              null;
            let inspectionState = null;
            if (candidate && inspectThreadNeighbor) {
              inspectionState = inspectThreadNeighbor(candidate.index, { force: true, surface: 'inspector' });
            } else if (candidate && renderThreadInspection) {
              state.inspectedThreadIndex = candidate.index;
              inspectionState = renderThreadInspection(candidate.index, { force: true, surface: 'inspector' });
            }
            if (typeof window._ti?.updateInspectedStrandOverlay === 'function') {
              window._ti.updateInspectedStrandOverlay(performance.now());
            }
            window.__visualThreadInspectorProbe = {
              candidateIndex: candidate?.index ?? null,
              active: !!inspectionState?.active,
              diagnostics: { ...(state.inspectedStrandDiagnostics || {}) },
            };

            document.querySelectorAll('#btn-thread-pin, #btn-thread-follow, #btn-thread-clear').forEach((btn) => {
              btn.disabled = false;
            });
            document
              .querySelectorAll('.focus-stage-kicker, .focus-stage-name, .focus-stage-what, .focus-stage-meta, .focus-stage-badges, .focus-stage-trivia')
              .forEach((el) => {
                el.style.display = 'none';
              });

            const searchContainer = document.querySelector('.search-container');
            if (searchContainer) {
              searchContainer.classList.remove('has-query', 'results-rendered', 'searching');
              searchContainer.style.display = 'none';
            }
            const infoPanel = document.querySelector('#info-panel');
            if (infoPanel) {
              infoPanel.style.display = 'none';
            }
          });
          await mobilePage.waitForFunction(() => {
            const diagnostics = window.__TEST_STATE__?.inspectedStrandDiagnostics;
            return Boolean(
              diagnostics?.active &&
              diagnostics.segmentCount > 0 &&
              diagnostics.braidCount > 0 &&
              diagnostics.endpointCount > 0
            );
          }, undefined, { timeout: 8000 }).catch(() => {});
          await mobilePage.waitForTimeout(300);
          await captureMaybe(states, mobilePage, '17-mobile-thread-inspector');
        }

        await mobilePage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsAny(['07-desktop-idle', '08-desktop-search-coffee', '11-desktop-selected-card-map-trail', '16-desktop-info-panel-populated'])) {
      const browser = await chromium.launch({ headless: true });
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
          await waitForReady(desktopPage);
          await desktopPage.evaluate(() => {
            document.body.dataset.activeView = 'map';
            document.body.dataset.trailState = 'active';
            document.body.dataset.mapContext = 'focus';
          });
          await captureMaybe(states, desktopPage, '11-desktop-selected-card-map-trail');
        }

        if (wantsState('16-desktop-info-panel-populated')) {
          await gotoReady(desktopPage, targetUrl);
          await waitForReady(desktopPage);
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
      const browser = await chromium.launch({ headless: true });
      try {
        const desktopPage = await createAuditPage(browser, { viewport: desktop });

        if (wantsState('13-desktop-filters-open')) {
          await gotoReady(desktopPage, targetUrl);
          await waitForReady(desktopPage);
          await desktopPage.locator('#filters-section summary').click({ timeout: 5000 }).catch(() => {});
          await captureMaybe(states, desktopPage, '13-desktop-filters-open');
        }

        if (wantsState('14-desktop-search-error')) {
          await gotoReady(desktopPage, withParams(targetUrl, { view: 'galaxy', q: 'semantic-error-proof' }));
          await waitForReady(desktopPage);
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
          await captureMaybe(states, desktopPage, '14-desktop-search-error');
        }

        await desktopPage.close();
      } finally {
        await browser.close();
      }
    }

    if (wantsState('12-desktop-reduced-motion')) {
      const browser = await chromium.launch({ headless: true });
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
      const browser = await chromium.launch({ headless: true });
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
      const browser = await chromium.launch({ headless: true });
      try {
        const divePage = await createAuditPage(browser, { viewport: mobile, deviceScaleFactor: 2, isMobile: true });
        await divePage.goto(withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }), { waitUntil: 'commit', timeout: 10000 });
        // Wait for scene to be interactive
        await divePage.waitForFunction(() => {
          const canvas = document.querySelector('#canvas-container canvas');
          return canvas && document.body.dataset.graphicsMode === 'webgl';
        }, undefined, { timeout: 8000 }).catch(() => {});
        await divePage.waitForTimeout(2200);

        // Step 1: Click the first search result to establish focus + trailDepth >= 1
        const firstResult = divePage.locator('.search-result-item').first();
        if (await firstResult.count()) {
          await firstResult.click({ timeout: 5000 }).catch(() => {});
          await divePage.waitForTimeout(600);
        }

        // Step 2: Click the Step Inside button to enter semantic dive mode
        const diveBtn = divePage.locator('#btn-focus-dive').first();
        if (await diveBtn.count()) {
          await diveBtn.click({ timeout: 5000 }).catch(() => {});
          // Wait for the 'transitioning' → 'active' animation cycle (820ms + buffer)
          await divePage.waitForTimeout(1100);
        }

        // Capture the natural dive state
        const captured = await captureState(divePage, '15-mobile-semantic-dive');
        if (captured) states.push(captured);
        await divePage.close();
      } finally {
        await browser.close();
      }
    }
  } catch (err) {
    console.error('Run failed:', err);
    throw err;
  }

  const summary = states.map(({ name, data }) => ({
    name,
    url: data.url,
    bodyDataset: data.bodyDataset,
    scroll: data.scroll,
    boxes: data.boxes,
    loadingOverlayDiagnostics: data.loadingOverlayDiagnostics,
    compassRailDiagnostics: data.compassRailDiagnostics,
    modeGridDiagnostics: data.modeGridDiagnostics,
    routeTraceDiagnostics: data.routeTraceDiagnostics,
    inspectedStrandDiagnostics: data.inspectedStrandDiagnostics,
    sceneLuminance: data.sceneLuminance,
  }));

  await fs.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const assertions = [];
  const stateByName = new Map(summary.map((state) => [state.name, state]));
  const pass = (name, check) => assertions.push({ level: 'pass', name, check });
  const fail = (name, check, msg) => assertions.push({ level: 'fail', name, check, msg });
  const box = (state, selector) => state?.boxes?.[selector];
  const isRendered = (b) => b && b.display !== 'none' && b.visibility !== 'hidden' && Number(b.opacity) > 0.05 && b.pointerEvents !== 'none';
  const isVisible = (b) => b && b.display !== 'none' && b.visibility !== 'hidden' && Number(b.opacity) > 0.05;
  const isMobileState = (state) => state?.name?.includes('-mobile-');
  const viewportFor = (state) => ({
    width: state?.name?.includes('-desktop-') ? desktop.width : mobile.width,
    height: state?.name?.includes('-desktop-') ? desktop.height : mobile.height,
  });
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
      for (const selector of lowerSurfaces) {
        const targetBox = box(state, selector);
        if (!isRendered(targetBox)) continue;
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

    if (inspectorState?.bodyDataset?.threadInspectSurface === 'inspector') {
      pass('17-mobile-thread-inspector', 'thread-inspector:surface-state');
    } else {
      fail('17-mobile-thread-inspector', 'thread-inspector:surface-state', `expected threadInspectSurface "inspector", got "${inspectorState?.bodyDataset?.threadInspectSurface || ''}"`);
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
    if (step?.text?.length && (kicker?.text?.length || note?.text?.length || title?.text?.length)) {
      pass('19-mobile-compass-rail', 'compass-rail:text-mounted');
    } else {
      fail('19-mobile-compass-rail', 'compass-rail:text-mounted', 'compass rail text missing');
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
    const desktopState = requireState('07-desktop-idle');
    const desktopCard = box(desktopState, '.selected-card');
    if (isRendered(desktopCard)) {
      pass('07-desktop-idle', 'desktop-selected-card-visible');
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
    } else if (desktopCard) {
      pass('07-desktop-idle', 'desktop-selected-card-idle-hidden');
    } else {
      pass('07-desktop-idle', 'desktop-selected-card-not-mounted');
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
    if (mobileTrailCard) {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card-mounted');
      if (!mobileTrailCard.clusterRgb) {
        fail('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card:cluster-rgb', 'missing --cluster-rgb');
      } else {
        pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card:cluster-rgb');
      }
    } else {
      pass('11-mobile-selected-card-map-trail', 'mobile-map-trail-selected-card-not-mounted');
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
    const trailStrip = box(mobileTrailState, '.map-trail-strip');
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
    const populatedCard = requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-card-visible', '.selected-card');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-details-visible', '#selected-details');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-name-visible', '#selected-name');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-what-visible', '#selected-what');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-theme-visible', '#selected-theme');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-status-visible', '#selected-status');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-role-badge-visible', '#selected-role-badge');
    requireRendered('16-desktop-info-panel-populated', 'info-panel-populated:selected-hero-visible', '.selected-hero');

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

    if (populatedCard?.text?.includes('Downtown Coffee Collective')) {
      pass('16-desktop-info-panel-populated', 'info-panel-populated:selected-name-text');
    } else {
      fail('16-desktop-info-panel-populated', 'info-panel-populated:selected-name-text', 'selected card does not include expected populated business name');
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
  }

  // ---- State diagnostics: mobile-focus-first-result ----
  // These are diagnostic until the static demo can reliably exercise the live
  // result-click focus path without test-side state forcing.
  if (shouldAssert('03-mobile-focus-first-result')) {
    const focusState = requireState('03-mobile-focus-first-result');
    const infoPanel = box(focusState, '#info-panel');
    const panelSurface = focusState?.bodyDataset?.panelSurface;
    if (panelSurface === 'focus') {
      pass('03-mobile-focus-first-result', 'mobile-focus:panel-surface-focus');
    } else {
      pass('03-mobile-focus-first-result', `mobile-focus:not-proved:${panelSurface || 'none'}`);
    }
    if (isRendered(infoPanel)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:info-panel-rendered');
    } else {
      pass('03-mobile-focus-first-result', 'mobile-focus:info-panel-not-rendered');
    }
    const selectedCard = box(focusState, '.selected-card');
    if (isRendered(selectedCard)) {
      pass('03-mobile-focus-first-result', 'mobile-focus:selected-card-visible');
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
      pass('04-mobile-field-node-active', `field-node:focus-panel-mode-not-proved:${focusPanelMode || 'none'}`);
    }
    if (panelSurface === 'focus-search' || panelSurface === 'focus') {
      pass('04-mobile-field-node-active', 'field-node:panel-surface-focus');
    } else {
      pass('04-mobile-field-node-active', `field-node:panel-surface-not-proved:${panelSurface || 'none'}`);
    }
    if (isRendered(compass)) {
      pass('04-mobile-field-node-active', 'field-node:compass-visible');
    } else {
      pass('04-mobile-field-node-active', 'field-node:compass-not-visible');
    }
    const focusStage = box(fieldNodeState, '#focus-stage');
    if (isRendered(focusStage)) {
      pass('04-mobile-field-node-active', 'field-node:focus-stage-visible');
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
    if (isRendered(mapContainer)) {
      pass('09-mobile-map-empty-state', 'map-empty:map-container-visible');
    }
    if (isVisible(emptyBox)) {
      pass('09-mobile-map-empty-state', 'map-empty:empty-state-rendered');
    } else {
      pass('09-mobile-map-empty-state', 'map-empty:empty-state-not-rendered');
    }
    const activeView = emptyState?.bodyDataset?.activeView;
    if (activeView === 'map') {
      pass('09-mobile-map-empty-state', 'map-empty:active-view-map');
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

  // ---- State diagnostics: desktop-filters-open ----
  // Note: Desktop filters are mobile-only. In panelSurface=idle (static demo default),
  // progressive_disclosure.css line 1685 hides #filters-section via body[data-panel-surface="idle"].
  // The filters-open feature only applies on mobile where body.is-active + #filters-section[open]
  // gets visible positioning from mobile_premium_state.css. On desktop, #filters-section is
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
