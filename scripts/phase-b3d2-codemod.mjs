#!/usr/bin/env node
/**
 * Phase B3d.2 CSS Codemod — Eliminate is-active class
 *
 * Migrate body.is-active[X] → body.X (drop is-active, use class mirrors)
 *
 * - body.is-active[data-panel-surface='X'] → body.surface-X
 * - body.is-active[data-panel-surface^='map-'] → body[class*='surface-map-']
 * - body.is-active[data-active-view='X'] → body.view-X
 * - body.is-active[data-journey-navigation-owner='X'] → body.navigation-X
 *
 * Bare `body.is-active` (no data attr) is NOT migrated — deferred to B3d.3
 * because it requires `body:not(.surface-idle)` which has specificity
 * implications.
 *
 * Usage: node scripts/phase-b3d2-codemod.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');

const PANEL_SURFACE_VALUES = [
    'idle',
    'search',
    'focus',
    'focus-search',
    'semantic-dive',
    'map',
    'map-trail',
    'map-focus',
    'map-focus-search',
    'map-search',
    'map-idle',
    'inside',
    'thread-inspect',
];

const ACTIVE_VIEW_VALUES = ['galaxy', 'map'];

const JOURNEY_NAVIGATION_OWNER_VALUES = [
    'journey-compass',
    'map-trail-strip',
    'map-controls',
    'scene',
    'inside-walk',
];

const CSS_FILES = [
    'css/mobile_premium__focus-dive.css',
    'css/mobile_premium__state.css',
    'css/mobile_premium__surfaces.css',
    'css/mobile_premium__chrome.css',
    'css/mobile_premium__narrow.css',
    'css/mobile_premium__idle.css',
    'css/modules/focus_stage.css',
    'css/strands.css',
    'css/search.css',
    'css/journey_active.css',
    'css/journey_steps.css',
    'css/controls.css',
    'css/time_weather.css',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

let totalPanelSurface = 0;
let totalPanelSurfacePrefix = 0;
let totalActiveView = 0;
let totalJourneyNav = 0;
let totalFilesChanged = 0;

for (const relPath of CSS_FILES) {
    const fullPath = resolve(projectRoot, relPath);
    const src = readFileSync(fullPath, 'utf8');
    let out = src;
    let fPanelSurface = 0;
    let fPanelSurfacePrefix = 0;
    let fActiveView = 0;
    let fJourneyNav = 0;

    // body.is-active[data-panel-surface='X'] → body.surface-X
    for (const value of PANEL_SURFACE_VALUES) {
        // Single-quoted
        const sqPattern = new RegExp(
            `body\\.is-active\\[data-panel-surface='${value}'\\]`,
            'g'
        );
        const sqReplacement = `body.surface-${value}`;
        const sqMatches = out.match(sqPattern);
        if (sqMatches) {
            fPanelSurface += sqMatches.length;
            out = out.replace(sqPattern, sqReplacement);
        }
        // Double-quoted
        const dqPattern = new RegExp(
            `body\\.is-active\\[data-panel-surface="${value}"\\]`,
            'g'
        );
        const dqMatches = out.match(dqPattern);
        if (dqMatches) {
            fPanelSurface += dqMatches.length;
            out = out.replace(dqPattern, sqReplacement);
        }
    }

    // body.is-active[data-panel-surface^='map-'] → body[class*='surface-map-']
    const prefixPatterns = [
        { pattern: /body\.is-active\[data-panel-surface\^='map-'\]/g, replacement: "body[class*='surface-map-']" },
        { pattern: /body\.is-active\[data-panel-surface\^="map-"\]/g, replacement: 'body[class*="surface-map-"]' },
    ];
    for (const { pattern, replacement } of prefixPatterns) {
        const matches = out.match(pattern);
        if (matches) {
            fPanelSurfacePrefix += matches.length;
            out = out.replace(pattern, replacement);
        }
    }

    // body.is-active[data-active-view='X'] → body.view-X
    for (const value of ACTIVE_VIEW_VALUES) {
        const sqPattern = new RegExp(
            `body\\.is-active\\[data-active-view='${value}'\\]`,
            'g'
        );
        const sqReplacement = `body.view-${value}`;
        const sqMatches = out.match(sqPattern);
        if (sqMatches) {
            fActiveView += sqMatches.length;
            out = out.replace(sqPattern, sqReplacement);
        }
        const dqPattern = new RegExp(
            `body\\.is-active\\[data-active-view="${value}"\\]`,
            'g'
        );
        const dqMatches = out.match(dqPattern);
        if (dqMatches) {
            fActiveView += dqMatches.length;
            out = out.replace(dqPattern, sqReplacement);
        }
    }

    // body.is-active[data-journey-navigation-owner='X'] → body.navigation-X
    for (const value of JOURNEY_NAVIGATION_OWNER_VALUES) {
        const sqPattern = new RegExp(
            `body\\.is-active\\[data-journey-navigation-owner='${value}'\\]`,
            'g'
        );
        const sqReplacement = `body.navigation-${value}`;
        const sqMatches = out.match(sqPattern);
        if (sqMatches) {
            fJourneyNav += sqMatches.length;
            out = out.replace(sqPattern, sqReplacement);
        }
        const dqPattern = new RegExp(
            `body\\.is-active\\[data-journey-navigation-owner="${value}"\\]`,
            'g'
        );
        const dqMatches = out.match(dqPattern);
        if (dqMatches) {
            fJourneyNav += dqMatches.length;
            out = out.replace(dqPattern, sqReplacement);
        }
    }

    totalPanelSurface += fPanelSurface;
    totalPanelSurfacePrefix += fPanelSurfacePrefix;
    totalActiveView += fActiveView;
    totalJourneyNav += fJourneyNav;

    if (out !== src) {
        totalFilesChanged++;
        const changes = fPanelSurface + fPanelSurfacePrefix + fActiveView + fJourneyNav;
        console.log(
            `  ${relPath}: ${changes} rules ` +
            `(${fPanelSurface} panel + ${fPanelSurfacePrefix} panel^ + ${fActiveView} view + ${fJourneyNav} nav)`
        );
        if (!DRY_RUN) {
            writeFileSync(fullPath, out, 'utf8');
        }
    }
}

console.log('\n=== Totals ===');
console.log(`  body.is-active[data-panel-surface='X']:      ${totalPanelSurface}`);
console.log(`  body.is-active[data-panel-surface^='map-']: ${totalPanelSurfacePrefix}`);
console.log(`  body.is-active[data-active-view='X']:        ${totalActiveView}`);
console.log(`  body.is-active[data-journey-nav-owner='X']:  ${totalJourneyNav}`);
console.log(`  TOTAL:                                       ${totalPanelSurface + totalPanelSurfacePrefix + totalActiveView + totalJourneyNav}`);
console.log(`  Files changed: ${totalFilesChanged} / ${CSS_FILES.length}`);
console.log(`  ${DRY_RUN ? '(DRY RUN — no files written)' : '(FILES WRITTEN)'}`);

console.log('\nNOTE: bare `body.is-active` (no data attr) NOT migrated.');
console.log('  Deferred to Phase B3d.3 (requires specificity bump to :not(.surface-idle)).');
