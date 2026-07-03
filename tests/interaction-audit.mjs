/**
 * Interaction Audit — Semantic Explorer
 * 
 * Navigates to the live app, exercises search, buttons, chips, toggles,
 * mode switching, filters, and 3D canvas interactions.
 * Captures console errors and state transitions.
 * Produces a structured markdown report.
 */

import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8795/index.html';
const LOAD_WAIT_MS = 10_000;

const consoleErrors = [];
const consoleWarnings = [];
const interactionResults = [];

function record(area, action, result, detail = '', severity = 'Info') {
  interactionResults.push({ area, action, result, detail, severity });
  console.log(`[${severity}] ${area} | ${action} → ${result}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({
    headless: false, // headed per AGENTS.md
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // ── Console capture ──────────────────────────────────────
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') consoleErrors.push(text);
    if (type === 'warning') consoleWarnings.push(text);
  });
  page.on('pageerror', err => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  // ── Navigate & wait ──────────────────────────────────────
  console.log(`\nNavigating to ${URL} …`);
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.warn('Initial navigation warning:', e.message);
    // Try domcontentloaded as fallback
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (e2) {
      console.error('Navigation failed:', e2.message);
    }
  }
  console.log(`Waiting ${LOAD_WAIT_MS / 1000}s for full load …`);
  await page.waitForTimeout(LOAD_WAIT_MS);

  // ── 1. Search Functionality ──────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  SEARCH FUNCTIONALITY');
  console.log('══════════════════════════════════════');

  // Try to find the search input
  const searchSelectors = [
    'input[type="search"]',
    'input[type="text"]',
    'input[placeholder*="earch"]',
    'input[placeholder*="ind"]',
    'input[placeholder*="business"]',
    '#search-input',
    '.search-input',
    '[data-testid*="search"]',
    'input',
  ];

  let searchInput = null;
  for (const sel of searchSelectors) {
    searchInput = await page.$(sel);
    if (searchInput) {
      const isVisible = await searchInput.isVisible();
      if (isVisible) {
        record('Search', 'Find input', 'Found', `Selector: ${sel}`, 'Info');
        break;
      }
      searchInput = null;
    }
  }
  if (!searchInput) {
    record('Search', 'Find input', 'NOT FOUND', 'No visible search input found', 'Warning');
  }

  if (searchInput) {
    // Click and type
    try {
      await searchInput.click();
      await searchInput.fill('coffee');
      record('Search', 'Type "coffee"', 'Success', 'Filled search input');
    } catch (e) {
      record('Search', 'Type "coffee"', 'FAILED', e.message, 'Warning');
    }

    // Look for search submit
    const submitSelectors = [
      'button[type="submit"]',
      'button[aria-label*="earch"]',
      'button[aria-label*="ubmit"]',
      '.search-btn',
      '.search-button',
      '#search-btn',
      'form button',
      'form [type="submit"]',
    ];

    let submitted = false;
    // Try pressing Enter first
    try {
      await searchInput.press('Enter');
      submitted = true;
      record('Search', 'Submit (Enter key)', 'Success', 'Pressed Enter');
    } catch (e) {
      record('Search', 'Submit (Enter key)', 'FAILED', e.message, 'Warning');
    }

    await page.waitForTimeout(2000);

    // Check for search results
    const resultSelectors = [
      '.search-results',
      '.results-list',
      '[data-testid*="result"]',
      '.info-panel',
      '.selected-card',
      '[data-panel-state]',
    ];

    let foundResults = false;
    for (const sel of resultSelectors) {
      const el = await page.$(sel);
      if (el) {
        foundResults = true;
        record('Search', 'Results appear', 'Found', `Selector: ${sel}`);
        break;
      }
    }
    if (!foundResults) {
      // Check if body data attributes changed (app state)
      const bodyAttrs = await page.evaluate(() => {
        const attrs = {};
        for (const attr of document.body.attributes) {
          if (attr.name.startsWith('data-')) attrs[attr.name] = attr.value;
        }
        return attrs;
      });
      record('Search', 'Results appear', 'Unclear', `Body data-attrs: ${JSON.stringify(bodyAttrs)}`, 'Info');
    }

    // Clear search
    try {
      await searchInput.fill('');
      await searchInput.press('Enter');
      await page.waitForTimeout(1000);
      record('Search', 'Clear search', 'Success', 'Cleared input and submitted');
    } catch (e) {
      record('Search', 'Clear search', 'FAILED', e.message, 'Warning');
    }
  }

  // ── 2. Buttons, Chips, Toggles ───────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  BUTTONS, CHIPS, TOGGLES');
  console.log('══════════════════════════════════════');

  const chipSelectors = [
    '.mode-chip',
    '[data-mode]',
    '.chip',
    '.filter-chip',
    '.toggle-btn',
    'button[data-toggle]',
    '.journey-chip',
    '.view-chip',
  ];

  for (const sel of chipSelectors) {
    const elements = await page.$$(sel);
    for (let i = 0; i < Math.min(elements.length, 3); i++) {
      const el = elements[i];
      try {
        const isVisible = await el.isVisible();
        if (!isVisible) continue;
        const text = await el.textContent();
        const tag = await el.evaluate(e => e.tagName);
        const classes = await el.evaluate(e => e.className);
        await el.click();
        await page.waitForTimeout(500);
        record('Buttons/Chips', `Click "${text?.trim()?.slice(0, 30) || sel}"`, 'Success', `Tag: ${tag}, Classes: ${classes?.slice?.(0, 60) || ''}`);
      } catch (e) {
        record('Buttons/Chips', `Click ${sel}[${i}]`, 'FAILED', e.message, 'Warning');
      }
    }
  }

  // Generic visible buttons
  const buttons = await page.$$('button');
  let clickedButtons = 0;
  for (const btn of buttons) {
    if (clickedButtons >= 5) break;
    try {
      const isVisible = await btn.isVisible();
      if (!isVisible) continue;
      const text = await btn.textContent();
      if (!text?.trim()) continue;
      const ariaLabel = await btn.evaluate(e => e.getAttribute('aria-label') || '');
      await btn.click();
      await page.waitForTimeout(300);
      record('Buttons/Chips', `Click button "${text?.trim()?.slice(0, 40)}"`, 'Success', `aria-label: ${ariaLabel}`);
      clickedButtons++;
    } catch (e) {
      // skip
    }
  }

  // ── 3. Mode Switching ────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  MODE SWITCHING');
  console.log('══════════════════════════════════════');

  const modeSelectors = [
    '[data-view]',
    '.mode-switch',
    '.view-toggle',
    '.mode-btn',
    '.mode-btn--active',
    '[data-ui-mode]',
    '.mode-grid',
    '.mode-grid button',
    '.mode-grid [role="button"]',
  ];

  for (const sel of modeSelectors) {
    const elements = await page.$$(sel);
    for (let i = 0; i < Math.min(elements.length, 4); i++) {
      const el = elements[i];
      try {
        const isVisible = await el.isVisible();
        if (!isVisible) continue;
        const text = await el.textContent();
        const dataView = await el.evaluate(e => e.getAttribute('data-view') || e.getAttribute('data-ui-mode') || '');
        await el.click();
        await page.waitForTimeout(1000);

        // Check body state after click
        const bodyState = await page.evaluate(() => {
          const attrs = {};
          for (const attr of document.body.attributes) {
            if (attr.name.startsWith('data-')) attrs[attr.name] = attr.value;
          }
          return attrs;
        });

        record('Mode Switch', `Click "${text?.trim()?.slice(0, 30) || sel}"`, 'Success',
          `data-view/data-ui-mode="${dataView}", body state: ${JSON.stringify(bodyState).slice(0, 200)}`);
      } catch (e) {
        record('Mode Switch', `Click ${sel}[${i}]`, 'FAILED', e.message, 'Warning');
      }
    }
  }

  // ── 4. Filter Panels ─────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  FILTER PANELS');
  console.log('══════════════════════════════════════');

  const filterSelectors = [
    '.filter-panel',
    '.filters',
    '#filter-panel',
    '[data-panel="filters"]',
    '.sidebar-filter',
    '.legend',
    '#legend',
    '.filter-toggle',
    '.controls',
  ];

  for (const sel of filterSelectors) {
    const el = await page.$(sel);
    if (el) {
      try {
        const isVisible = await el.isVisible();
        const text = (await el.textContent())?.trim()?.slice(0, 100) || '';
        record('Filters', `Found "${sel}"`, isVisible ? 'Visible' : 'Hidden', `Content preview: ${text.slice(0, 80)}`);
        if (isVisible) {
          await el.click();
          await page.waitForTimeout(500);
          record('Filters', `Click "${sel}"`, 'Success');
        }
      } catch (e) {
        record('Filters', `Interact "${sel}"`, 'FAILED', e.message, 'Warning');
      }
    }
  }

  // ── 5. 3D Canvas Interactions ────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  3D CANVAS INTERACTIONS');
  console.log('══════════════════════════════════════');

  const canvas = await page.$('canvas');
  if (canvas) {
    const isVisible = await canvas.isVisible();
    const box = await canvas.boundingBox();
    record('Canvas', 'Find canvas', isVisible ? 'Visible' : 'Hidden',
      box ? `Size: ${Math.round(box.width)}×${Math.round(box.height)}` : 'No bounding box');

    if (isVisible && box) {
      // Click center of canvas
      try {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1000);
        record('Canvas', 'Click center', 'Success');
      } catch (e) {
        record('Canvas', 'Click center', 'FAILED', e.message, 'Warning');
      }

      // Click in various quadrants
      const quadrants = [
        { name: 'top-left', x: 0.25, y: 0.25 },
        { name: 'top-right', x: 0.75, y: 0.25 },
        { name: 'bottom-left', x: 0.25, y: 0.75 },
        { name: 'bottom-right', x: 0.75, y: 0.75 },
      ];
      for (const q of quadrants) {
        try {
          await page.mouse.click(box.x + box.width * q.x, box.y + box.height * q.y);
          await page.waitForTimeout(500);
          record('Canvas', `Click ${q.name}`, 'Success');
        } catch (e) {
          record('Canvas', `Click ${q.name}`, 'FAILED', e.message, 'Warning');
        }
      }

      // Hover around canvas
      try {
        for (let i = 0; i < 5; i++) {
          const rx = box.x + Math.random() * box.width;
          const ry = box.y + Math.random() * box.height;
          await page.mouse.move(rx, ry);
          await page.waitForTimeout(200);
        }
        record('Canvas', 'Random hover sweep', 'Success', '5 random hover points');
      } catch (e) {
        record('Canvas', 'Random hover sweep', 'FAILED', e.message, 'Warning');
      }

      // Try scroll wheel on canvas (zoom)
      try {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(500);
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(500);
        record('Canvas', 'Scroll wheel zoom', 'Success');
      } catch (e) {
        record('Canvas', 'Scroll wheel zoom', 'FAILED', e.message, 'Warning');
      }
    }
  } else {
    record('Canvas', 'Find canvas', 'NOT FOUND', 'No <canvas> element found', 'Warning');
  }

  // ── 6. Info Panel / Selected Card ────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  INFO PANEL / SELECTED CARD');
  console.log('══════════════════════════════════════');

  const panelSelectors = [
    '.info-panel',
    '.selected-card',
    '[data-panel-state]',
    '.panel',
    '.card',
    '.detail-panel',
  ];

  for (const sel of panelSelectors) {
    const el = await page.$(sel);
    if (el) {
      try {
        const isVisible = await el.isVisible();
        const text = (await el.textContent())?.trim()?.slice(0, 100) || '';
        const panelState = await el.evaluate(e => e.getAttribute('data-panel-state') || '');
        record('Info Panel', `Found "${sel}"`, isVisible ? 'Visible' : 'Hidden',
          `panel-state="${panelState}", content: ${text.slice(0, 80)}`);
      } catch (e) {
        record('Info Panel', `Inspect "${sel}"`, 'FAILED', e.message, 'Warning');
      }
    }
  }

  // ── 7. Body State Audit ──────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  BODY STATE AUDIT');
  console.log('══════════════════════════════════════');

  const bodyState = await page.evaluate(() => {
    const attrs = {};
    for (const attr of document.body.attributes) {
      if (attr.name.startsWith('data-')) attrs[attr.name] = attr.value;
    }
    return attrs;
  });
  console.log('Body data attributes:', JSON.stringify(bodyState, null, 2));
  record('State', 'Body data attributes', 'Captured', JSON.stringify(bodyState));

  // Check for UI state inconsistencies
  const stateCheck = await page.evaluate(() => {
    const issues = [];
    const body = document.body;

    // Check if any data attributes are in an invalid state
    const phase = body.getAttribute('data-journey-phase');
    const panel = body.getAttribute('data-panel-state');
    const view = body.getAttribute('data-view');
    const mode = body.getAttribute('data-ui-mode');
    const search = body.getAttribute('data-search-state');
    const loading = body.getAttribute('data-loading-state');

    if (!phase) issues.push('data-journey-phase missing');
    if (!panel) issues.push('data-panel-state missing');
    if (!view) issues.push('data-view missing');

    // Check for elements with display:none that shouldn't be
    const hiddenButAnimating = document.querySelectorAll('[style*="display: none"][style*="animation"]');
    if (hiddenButAnimating.length > 0) {
      issues.push(`${hiddenButAnimating.length} elements hidden but have animation styles`);
    }

    // Check for overlapping z-index issues
    const highZ = document.querySelectorAll('[style*="z-index"]');
    const zValues = [];
    highZ.forEach(el => {
      const z = parseInt(el.style.zIndex);
      if (!isNaN(z)) zValues.push(z);
    });
    const maxZ = Math.max(...zValues, 0);
    if (maxZ > 1000) issues.push(`Very high z-index found: ${maxZ}`);

    return { issues, attributes: { phase, panel, view, mode, search, loading } };
  });
  console.log('State consistency check:', JSON.stringify(stateCheck, null, 2));
  record('State', 'Consistency check', stateCheck.issues.length === 0 ? 'Clean' : 'Issues found',
    stateCheck.issues.join('; ') || 'No issues');

  // ── 8. Micro Demo State ──────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  MICRO DEMO STATE');
  console.log('══════════════════════════════════════');

  const demoState = await page.evaluate(() => {
    return {
      localStorage_v1: localStorage.getItem('moco_mycelium_demo_v1'),
      sessionStorage_v1: sessionStorage.getItem('moco_mycelium_demo_session_v1'),
      demoPhase: document.body.getAttribute('data-demo-phase') || 'none',
      demoActive: document.body.getAttribute('data-demo-active') || 'none',
    };
  });
  console.log('Demo state:', JSON.stringify(demoState, null, 2));
  record('Demo', 'State check', 'Captured', JSON.stringify(demoState));

  // ── 9. Screenshot ────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  SCREENSHOT');
  console.log('══════════════════════════════════════');

  try {
    await page.screenshot({ path: 'reports/screenshots/interaction-audit-final.png', fullPage: true });
    record('Screenshot', 'Capture final state', 'Success', 'Saved to reports/screenshots/interaction-audit-final.png');
  } catch (e) {
    record('Screenshot', 'Capture final state', 'FAILED', e.message, 'Warning');
  }

  // ── 10. Snapshot / A11y tree ─────────────────────────────
  try {
    // Get a DOM snapshot via accessibility tree
    const snapshot = await page.accessibility.snapshot({ interestingOnly: false });
    const snapshotStr = JSON.stringify(snapshot, null, 2).slice(0, 5000);
    const fs = await import('fs');
    fs.mkdirSync('reports/screenshots', { recursive: true });
    fs.writeFileSync('reports/screenshots/interaction-audit-a11y-tree.json', JSON.stringify(snapshot, null, 2));
    console.log(`Accessibility snapshot saved (${(snapshotStr.length / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.warn('Could not capture a11y snapshot:', e.message);
  }

  // ── 11. Additional: Journey Start if available ───────────
  console.log('\n══════════════════════════════════════');
  console.log('  JOURNEY / WALK INTERACTION');
  console.log('══════════════════════════════════════');

  const journeySelectors = [
    '[data-action="start-journey"]',
    '.journey-start',
    '.start-walk',
    'button:has-text("Start")',
    'button:has-text("Journey")',
    'button:has-text("Walk")',
    'button:has-text("Explore")',
  ];

  for (const sel of journeySelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const isVisible = await el.isVisible();
        if (isVisible) {
          const text = await el.textContent();
          await el.click();
          await page.waitForTimeout(1500);
          record('Journey', `Click "${text?.trim()?.slice(0, 30)}"`, 'Success');
          break;
        }
      }
    } catch (e) {
      // skip
    }
  }

  // ── Generate Report ──────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════');
  console.log('  INTERACTION AUDIT RESULTS');
  console.log('══════════════════════════════════════════════\n');

  const report = generateReport(interactionResults, consoleErrors, consoleWarnings, bodyState, stateCheck, demoState);
  
  const fs = await import('fs');
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/interaction-audit-report.md', report);
  console.log('Report saved to reports/interaction-audit-report.md\n');

  // Also print to stdout
  console.log(report);

  await browser.close();
})();

function generateReport(results, errors, warnings, bodyState, stateCheck, demoState) {
  const lines = [];
  lines.push('# Semantic Explorer — Interaction Audit Report');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**URL:** http://127.0.0.1:8795/index.html`);
  lines.push('');

  // Summary
  const successes = results.filter(r => r.result === 'Success').length;
  const failures = results.filter(r => r.result === 'FAILED').length;
  const notFound = results.filter(r => r.result === 'NOT FOUND').length;
  const unclear = results.filter(r => r.result === 'Unclear' || r.result === 'Hidden').length;
  
  lines.push('## Summary');
  lines.push(`- **Total interactions:** ${results.length}`);
  lines.push(`- **Successes:** ${successes}`);
  lines.push(`- **Failures:** ${failures}`);
  lines.push(`- **Not Found:** ${notFound}`);
  lines.push(`- **Console Errors:** ${errors.length}`);
  lines.push(`- **Console Warnings:** ${warnings.length}`);
  lines.push('');

  // Issues by severity
  lines.push('## Issues Found');
  lines.push('');

  const criticalIssues = results.filter(r => r.severity === 'Critical');
  const warningsIssues = results.filter(r => r.severity === 'Warning');
  const infoIssues = results.filter(r => r.severity === 'Info');

  if (criticalIssues.length > 0) {
    lines.push('### 🔴 Critical');
    for (const r of criticalIssues) {
      lines.push(`- **${r.area}** — ${r.action}: ${r.result}${r.detail ? ' — ' + r.detail : ''}`);
    }
    lines.push('');
  }

  if (warningsIssues.length > 0) {
    lines.push('### 🟡 Warning');
    for (const r of warningsIssues) {
      lines.push(`- **${r.area}** — ${r.action}: ${r.result}${r.detail ? ' — ' + r.detail : ''}`);
    }
    lines.push('');
  }

  // Console Errors
  lines.push('## Console Errors');
  if (errors.length === 0) {
    lines.push('No console errors captured. ✅');
  } else {
    for (const err of errors) {
      lines.push(`- ${err.slice(0, 200)}`);
    }
  }
  lines.push('');

  // Console Warnings
  lines.push('## Console Warnings');
  if (warnings.length === 0) {
    lines.push('No console warnings captured. ✅');
  } else {
    for (const w of warnings.slice(0, 10)) {
      lines.push(`- ${w.slice(0, 200)}`);
    }
    if (warnings.length > 10) lines.push(`- ... and ${warnings.length - 10} more`);
  }
  lines.push('');

  // Body State
  lines.push('## Body State Attributes (Final)');
  lines.push('```json');
  lines.push(JSON.stringify(bodyState, null, 2));
  lines.push('```');
  lines.push('');

  // State Consistency
  lines.push('## State Consistency Check');
  if (stateCheck.issues.length === 0) {
    lines.push('All data attributes present and consistent. ✅');
  } else {
    for (const issue of stateCheck.issues) {
      lines.push(`- ⚠️ ${issue}`);
    }
  }
  lines.push('');

  // Demo State
  lines.push('## Demo State');
  lines.push('```json');
  lines.push(JSON.stringify(demoState, null, 2));
  lines.push('```');
  lines.push('');

  // Detailed Results Table
  lines.push('## Detailed Interaction Results');
  lines.push('');
  lines.push('| Area | Action | Result | Severity | Detail |');
  lines.push('|------|--------|--------|----------|--------|');
  for (const r of results) {
    const emoji = r.severity === 'Critical' ? '🔴' : r.severity === 'Warning' ? '🟡' : '🟢';
    lines.push(`| ${r.area} | ${r.action} | ${r.result} | ${emoji} ${r.severity} | ${(r.detail || '').slice(0, 80)} |`);
  }
  lines.push('');

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');

  if (errors.length > 0) {
    lines.push('1. **Investigate console errors** — Some interactions may be silently failing due to JS errors.');
  }
  if (failures > 0) {
    lines.push('2. **Review failed interactions** — Check element selectors and DOM structure for mismatches.');
  }
  if (notFound > 0) {
    lines.push('3. **Missing UI elements** — Some expected elements were not found; verify feature completeness.');
  }
  if (stateCheck.issues.length > 0) {
    lines.push('4. **Fix state inconsistencies** — Body data attributes are missing or in unexpected states.');
  }
  if (successes > failures && errors.length === 0) {
    lines.push('✅ **Overall health appears good** — Most interactions succeeded with no console errors.');
  }

  return lines.join('\n');
}
