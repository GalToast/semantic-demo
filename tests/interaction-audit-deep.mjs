/**
 * Deep-Dive Interaction Audit — Semantic Explorer (Pass 2)
 * 
 * Focused follow-up on issues from Pass 1:
 * - Locate and test search input (may be inside info panel)
 * - Enumerate ALL event-bindings warnings
 * - Test keyboard shortcuts
 * - Try canvas node picking more aggressively
 * - Test panel open/close, legend, filter chips
 * - Capture screenshots at each interaction state
 */

import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
const LOAD_WAIT_MS = 10_000;

const consoleErrors = [];
const allConsoleWarnings = [];
const results = [];

function record(area, action, result, detail = '', severity = 'Info') {
  results.push({ area, action, result, detail, severity });
  console.log(`[${severity}] ${area} | ${action} → ${result}${detail ? ' — ' + detail : ''}`);
}

fs.mkdirSync('reports/screenshots', { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // ── Console capture (all messages) ──────────────────────
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') consoleErrors.push(text);
    if (type === 'warning') allConsoleWarnings.push(text);
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  // ── Navigate ─────────────────────────────────────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  console.log(`Waiting ${LOAD_WAIT_MS / 1000}s for full load …`);
  await page.waitForTimeout(LOAD_WAIT_MS);

  // Screenshot: initial state
  await page.screenshot({ path: 'reports/screenshots/deep-01-initial.png' });

  // ── 1. Full DOM audit ───────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  FULL DOM AUDIT');
  console.log('══════════════════════════════════════');

  const domAudit = await page.evaluate(() => {
    const audit = {};
    
    // All inputs
    const inputs = document.querySelectorAll('input, textarea');
    audit.inputs = Array.from(inputs).map(el => ({
      tag: el.tagName,
      type: el.type,
      placeholder: el.placeholder,
      id: el.id,
      className: el.className?.toString()?.slice(0, 80),
      visible: el.offsetParent !== null,
      hidden: el.hidden || el.style.display === 'none',
    }));

    // All buttons
    const buttons = document.querySelectorAll('button');
    audit.buttons = Array.from(buttons).map(el => ({
      text: el.textContent?.trim()?.slice(0, 50),
      id: el.id,
      className: el.className?.toString()?.slice(0, 80),
      ariaLabel: el.getAttribute('aria-label'),
      visible: el.offsetParent !== null,
      disabled: el.disabled,
    }));

    // All links
    const links = document.querySelectorAll('a');
    audit.links = Array.from(links).slice(0, 20).map(el => ({
      text: el.textContent?.trim()?.slice(0, 50),
      href: el.href,
      visible: el.offsetParent !== null,
    }));

    // Canvas
    const canvas = document.querySelector('canvas');
    audit.canvas = canvas ? {
      width: canvas.width,
      height: canvas.height,
      visible: canvas.offsetParent !== null,
    } : null;

    // Count elements by data attributes
    const dataEls = document.querySelectorAll('[data-view], [data-panel], [data-filter], [data-mode]');
    audit.dataElements = dataEls.length;

    // Search-related elements
    const searchEls = document.querySelectorAll('[class*="search"], [id*="search"], [placeholder*="earch"], [placeholder*="ind"], [aria-label*="earch"]');
    audit.searchElements = Array.from(searchEls).map(el => ({
      tag: el.tagName,
      id: el.id,
      className: el.className?.toString()?.slice(0, 100),
      visible: el.offsetParent !== null,
      hidden: el.hidden || el.style.display === 'none',
    }));

    // Info panel contents
    const infoPanel = document.querySelector('.info-panel');
    if (infoPanel) {
      audit.infoPanel = {
        visible: infoPanel.offsetParent !== null,
        childCount: infoPanel.children.length,
        innerHTML_preview: infoPanel.innerHTML?.slice(0, 500),
      };
    }

    // Legend
    const legend = document.querySelector('.legend, #legend, [class*="legend"]');
    if (legend) {
      audit.legend = {
        visible: legend.offsetParent !== null,
        text: legend.textContent?.slice(0, 200),
      };
    }

    return audit;
  });

  console.log('\n--- INPUTS ---');
  for (const inp of domAudit.inputs) {
    console.log(`  ${inp.tag}[${inp.type}] "${inp.placeholder}" id="${inp.id}" class="${inp.className}" visible=${inp.visible}`);
  }

  console.log('\n--- BUTTONS ---');
  for (const btn of domAudit.buttons) {
    console.log(`  btn "${btn.text}" id="${btn.id}" aria="${btn.ariaLabel}" visible=${btn.visible} disabled=${btn.disabled}`);
  }

  console.log('\n--- SEARCH ELEMENTS ---');
  for (const el of domAudit.searchElements) {
    console.log(`  ${el.tag} id="${el.id}" class="${el.className}" visible=${el.visible} hidden=${el.hidden}`);
  }

  console.log('\n--- INFO PANEL ---');
  if (domAudit.infoPanel) {
    console.log(`  visible=${domAudit.infoPanel.visible} children=${domAudit.infoPanel.childCount}`);
    console.log(`  HTML: ${domAudit.infoPanel.innerHTML_preview}`);
  }

  console.log('\n--- LEGEND ---');
  if (domAudit.legend) {
    console.log(`  visible=${domAudit.legend.visible}`);
    console.log(`  text: ${domAudit.legend.text}`);
  }

  console.log(`\nCanvas: ${JSON.stringify(domAudit.canvas)}`);
  console.log(`Data-attributed elements: ${domAudit.dataElements}`);

  record('DOM Audit', 'Full scan', 'Complete',
    `inputs=${domAudit.inputs.length}, buttons=${domAudit.buttons.length}, searchEls=${domAudit.searchElements.length}`);

  // ── 2. Search input: try clicking info panel first ──────
  console.log('\n══════════════════════════════════════');
  console.log('  SEARCH INPUT DEEP TEST');
  console.log('══════════════════════════════════════');

  // The search might be hidden inside collapsed panel — try expanding panel
  const infoPanelBtn = await page.$('button[aria-label*="info panel"], button[aria-label*="Toggle"]');
  if (infoPanelBtn) {
    try {
      const isVisible = await infoPanelBtn.isVisible();
      console.log(`Info panel toggle button: visible=${isVisible}`);
      if (isVisible) {
        await infoPanelBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'reports/screenshots/deep-02-panel-toggled.png' });
        record('Search', 'Expand info panel', 'Success', 'Clicked panel toggle');
      }
    } catch (e) {
      record('Search', 'Expand info panel', 'FAILED', e.message, 'Warning');
    }
  }

  // Now try to find search input again after panel expansion
  const searchInput2 = await page.$('input');
  if (searchInput2) {
    try {
      const isVisible = await searchInput2.isVisible();
      const placeholder = await searchInput2.evaluate(e => e.placeholder);
      console.log(`Input found: visible=${isVisible}, placeholder="${placeholder}"`);
      
      if (isVisible) {
        await searchInput2.click();
        await searchInput2.fill('coffee');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'reports/screenshots/deep-03-search-typed.png' });
        record('Search', 'Type "coffee" (pass 2)', 'Success', `placeholder="${placeholder}"`);
        
        // Try Enter
        await searchInput2.press('Enter');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'reports/screenshots/deep-04-search-submitted.png' });
        record('Search', 'Submit search (Enter)', 'Success');
        
        // Check body state after search
        const searchState = await page.evaluate(() => ({
          searchGlow: document.body.getAttribute('data-search-glow'),
          panelSurface: document.body.getAttribute('data-panel-surface'),
          activeView: document.body.getAttribute('data-active-view'),
        }));
        console.log('After search:', JSON.stringify(searchState));
        record('Search', 'Post-search state', 'Captured', JSON.stringify(searchState));

        // Clear
        await searchInput2.fill('');
        await searchInput2.press('Escape');
        await page.waitForTimeout(500);
      } else {
        record('Search', 'Input visible check', 'Hidden', 'Input exists but is not visible — likely inside collapsed panel', 'Warning');
      }
    } catch (e) {
      record('Search', 'Deep test', 'FAILED', e.message, 'Warning');
    }
  }

  // ── 3. Panel toggle cycling ─────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  PANEL TOGGLE CYCLING');
  console.log('══════════════════════════════════════');

  const toggleBtns = await page.$$('button[aria-label*="panel"], button[aria-label*="Toggle"], .view-toggle, .panel-toggle');
  for (const btn of toggleBtns) {
    try {
      const isVisible = await btn.isVisible();
      if (!isVisible) continue;
      const label = await btn.evaluate(e => e.getAttribute('aria-label') || e.textContent?.trim()?.slice(0, 30) || '');
      
      // Click and capture state change
      await btn.click();
      await page.waitForTimeout(800);
      const state1 = await page.evaluate(() => ({
        panelMode: document.body.getAttribute('data-focus-panel-mode'),
        panelSurface: document.body.getAttribute('data-panel-surface'),
        activeView: document.body.getAttribute('data-active-view'),
      }));
      
      await btn.click();
      await page.waitForTimeout(800);
      const state2 = await page.evaluate(() => ({
        panelMode: document.body.getAttribute('data-focus-panel-mode'),
        panelSurface: document.body.getAttribute('data-panel-surface'),
        activeView: document.body.getAttribute('data-active-view'),
      }));
      
      const changed = JSON.stringify(state1) !== JSON.stringify(state2);
      record('Panel Toggle', `Cycle "${label}"`, changed ? 'State changed' : 'No state change',
        `Before: ${JSON.stringify(state1)}, After: ${JSON.stringify(state2)}`, changed ? 'Info' : 'Warning');
      
      await page.screenshot({ path: `reports/screenshots/deep-05-panel-cycle-${label.replace(/\s+/g, '-')}.png` });
    } catch (e) {
      record('Panel Toggle', `Cycle`, 'FAILED', e.message, 'Warning');
    }
  }

  // ── 4. Keyboard shortcuts ───────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  KEYBOARD SHORTCUTS');
  console.log('══════════════════════════════════════');

  const shortcuts = [
    { key: 'Escape', name: 'Escape' },
    { key: ' ', name: 'Space' },
    { key: 'ArrowLeft', name: 'Arrow Left' },
    { key: 'ArrowRight', name: 'Arrow Right' },
    { key: 'ArrowUp', name: 'Arrow Up' },
    { key: 'ArrowDown', name: 'Arrow Down' },
    { key: 'Tab', name: 'Tab' },
    { key: 'f', name: 'f key' },
    { key: 'g', name: 'g key' },
    { key: 'm', name: 'm key' },
    { key: 's', name: 's key' },
  ];

  for (const sc of shortcuts) {
    try {
      const before = await page.evaluate(() => document.body.getAttribute('data-active-view'));
      await page.keyboard.press(sc.key);
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => document.body.getAttribute('data-active-view'));
      const changed = before !== after;
      record('Keyboard', `Press ${sc.name}`, changed ? 'State changed' : 'No visible change',
        `view: ${before} → ${after}${changed ? ' ✓' : ''}`);
    } catch (e) {
      record('Keyboard', `Press ${sc.name}`, 'FAILED', e.message, 'Warning');
    }
  }

  await page.screenshot({ path: 'reports/screenshots/deep-06-after-keyboard.png' });

  // ── 5. Aggressive canvas interaction ────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  AGGRESSIVE CANVAS INTERACTION');
  console.log('══════════════════════════════════════');

  const canvas2 = await page.$('canvas');
  if (canvas2) {
    const box = await canvas2.boundingBox();
    if (box) {
      // Grid of clicks across entire canvas
      console.log('Performing 4×4 grid click sweep …');
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const x = box.x + (col + 0.5) * (box.width / 4);
          const y = box.y + (row + 0.5) * (box.height / 4);
          await page.mouse.click(x, y);
          await page.waitForTimeout(200);
        }
      }
      
      // Check if any node was selected after sweep
      const afterSweep = await page.evaluate(() => ({
        panelSurface: document.body.getAttribute('data-panel-surface'),
        panelSurfaceDetail: document.body.getAttribute('data-panel-surface-detail'),
        focusTransition: document.body.getAttribute('data-focus-transition'),
        focusTransitionPhase: document.body.getAttribute('data-focus-transition-phase'),
      }));
      console.log('After grid sweep:', JSON.stringify(afterSweep));
      record('Canvas', '4×4 grid sweep', 'Complete', JSON.stringify(afterSweep));

      await page.screenshot({ path: 'reports/screenshots/deep-07-after-grid-sweep.png' });

      // Try double-click
      await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.waitForTimeout(1000);
      const afterDblclick = await page.evaluate(() => ({
        panelSurface: document.body.getAttribute('data-panel-surface'),
        panelSurfaceDetail: document.body.getAttribute('data-panel-surface-detail'),
      }));
      record('Canvas', 'Double-click center', 'Success', JSON.stringify(afterDblclick));
      await page.screenshot({ path: 'reports/screenshots/deep-08-after-dblclick.png' });

      // Right-click
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
      await page.waitForTimeout(500);
      record('Canvas', 'Right-click center', 'Success');
    }
  }

  // ── 6. Full body state capture ──────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  FINAL STATE CAPTURE');
  console.log('══════════════════════════════════════');

  const finalState = await page.evaluate(() => {
    const attrs = {};
    for (const attr of document.body.attributes) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  });
  console.log('Final body state:');
  for (const [k, v] of Object.entries(finalState)) {
    console.log(`  ${k} = ${v}`);
  }

  // ── 7. Console warning enumeration ──────────────────────
  console.log('\n══════════════════════════════════════');
  console.log('  CONSOLE WARNING ANALYSIS');
  console.log('══════════════════════════════════════');

  // Group warnings by prefix
  const warningGroups = {};
  for (const w of allConsoleWarnings) {
    const prefix = w.match(/^\[([^\]]+)\]/)?.[1] || 'other';
    if (!warningGroups[prefix]) warningGroups[prefix] = [];
    warningGroups[prefix].push(w);
  }
  
  for (const [prefix, warnings] of Object.entries(warningGroups)) {
    console.log(`\n[${prefix}] — ${warnings.length} warnings:`);
    for (const w of warnings.slice(0, 5)) {
      console.log(`  ${w.slice(0, 120)}`);
    }
    if (warnings.length > 5) console.log(`  ... and ${warnings.length - 5} more`);
  }

  // ── 8. Screenshot final ─────────────────────────────────
  await page.screenshot({ path: 'reports/screenshots/deep-09-final.png', fullPage: true });

  // ── 9. Generate deep-dive report ────────────────────────
  const report = [];
  report.push('# Semantic Explorer — Deep-Dive Interaction Audit (Pass 2)');
  report.push(`**Date:** ${new Date().toISOString()}`);
  report.push('');
  
  report.push('## Executive Summary');
  report.push(`- **Console Errors:** ${consoleErrors.length}`);
  report.push(`- **Console Warnings:** ${allConsoleWarnings.length}`);
  report.push(`- **Interactions Tested:** ${results.length}`);
  report.push('');

  // Critical findings
  report.push('## Critical Findings');
  report.push('');

  // event-bindings warnings
  const ebWarnings = allConsoleWarnings.filter(w => w.startsWith('[event-bindings]'));
  if (ebWarnings.length > 0) {
    report.push(`### Event Bindings: ${ebWarnings.length} missing DOM elements`);
    report.push('');
    report.push('The `event-bindings.js` module is logging warnings for buttons it cannot find:');
    report.push('');
    const missingIds = ebWarnings.map(w => {
      const match = w.match(/button not found: (.+)/);
      return match ? match[1] : null;
    }).filter(Boolean);
    
    report.push('| Missing Button ID | Status |');
    report.push('|---|---|');
    for (const id of missingIds) {
      report.push(`| \`${id}\` | ⚠️ Not found in DOM |`);
    }
    report.push('');
    report.push('**Impact:** These buttons are expected by the event-binding system but do not exist in the HTML. This suggests either:');
    report.push('1. The buttons were renamed/removed but event bindings were not updated');
    report.push('2. The buttons are rendered dynamically but the binding runs before render');
    report.push('3. Feature regression from a recent refactor');
    report.push('');
  }

  // Search input
  report.push('### Search Input Discovery');
  report.push('');
  if (domAudit.searchElements.length > 0) {
    report.push(`Found ${domAudit.searchElements.length} search-related element(s):`);
    for (const el of domAudit.searchElements) {
      report.push(`- ${el.tag} id="${el.id}" class="${el.className}" visible=${el.visible} hidden=${el.hidden}`);
    }
  } else {
    report.push('**No search-related elements found in DOM.** The search input may be:');
    report.push('- Rendered inside a shadow DOM');
    report.push('- Lazily loaded and not present at audit time');
    report.push('- Removed during a refactor');
  }
  report.push('');

  // Console errors
  report.push('## Console Errors');
  if (consoleErrors.length === 0) {
    report.push('No console errors. ✅');
  } else {
    for (const err of consoleErrors) {
      report.push(`- ❌ ${err.slice(0, 200)}`);
    }
  }
  report.push('');

  // Warning groups
  report.push('## Console Warning Groups');
  for (const [prefix, warnings] of Object.entries(warningGroups)) {
    report.push(`### \`${prefix}\` — ${warnings.length} warnings`);
    for (const w of warnings.slice(0, 3)) {
      report.push(`- ${w.slice(0, 150)}`);
    }
    if (warnings.length > 3) report.push(`- *…and ${warnings.length - 3} more*`);
    report.push('');
  }

  // DOM audit summary
  report.push('## DOM Audit Summary');
  report.push(`| Category | Count |`);
  report.push(`|---|---|`);
  report.push(`| Inputs | ${domAudit.inputs.length} |`);
  report.push(`| Buttons | ${domAudit.buttons.length} |`);
  report.push(`| Links | ${domAudit.links.length} |`);
  report.push(`| Canvas | ${domAudit.canvas ? '1' : '0'} |`);
  report.push(`| Search-related elements | ${domAudit.searchElements.length} |`);
  report.push('');

  report.push('### Visible Buttons');
  const visibleBtns = domAudit.buttons.filter(b => b.visible);
  report.push(`| Text | ID | aria-label |`);
  report.push(`|---|---|---|`);
  for (const btn of visibleBtns) {
    report.push(`| ${btn.text?.slice(0, 30) || '(empty)'} | ${btn.id || '-'} | ${btn.ariaLabel || '-'} |`);
  }
  report.push('');

  // Detailed results
  report.push('## Detailed Interaction Results');
  report.push('| Area | Action | Result | Severity | Detail |');
  report.push('|------|--------|--------|----------|--------|');
  for (const r of results) {
    const emoji = r.severity === 'Critical' ? '🔴' : r.severity === 'Warning' ? '🟡' : '🟢';
    report.push(`| ${r.area} | ${r.action} | ${r.result} | ${emoji} ${r.severity} | ${(r.detail || '').slice(0, 100)} |`);
  }
  report.push('');

  // Final state
  report.push('## Final Body State');
  report.push('```json');
  report.push(JSON.stringify(finalState, null, 2));
  report.push('```');

  const reportText = report.join('\n');
  fs.writeFileSync('reports/interaction-audit-deep-dive.md', reportText);
  console.log('\n\nReport saved to reports/interaction-audit-deep-dive.md');

  await browser.close();
})();
