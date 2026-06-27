#!/usr/bin/env node
/**
 * Phase B3d.1 CSS Codemod
 *
 * Migrate body[data-panel-surface='X'] → body.surface-X
 * Migrate body[data-panel-surface^='map-'] → body[class*='surface-map-']
 * Migrate body[data-active-view='X'] → body.view-X
 *
 * Both single and double quotes handled.
 *
 * Usage: node scripts/phase-b3d-codemod.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DRY_RUN = process.argv.includes('--dry-run')

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
    'thread-inspect'
]

const ACTIVE_VIEW_VALUES = ['galaxy', 'map']

const CSS_FILES = [
    'css/strands.css',
    'css/progressive_disclosure.css',
    'css/search.css',
    'css/layout_base.css',
    'css/journey_steps.css',
    'css/modules/focus_stage.css',
    'css/mobile_premium__state.css',
    'css/clusters.css',
    'css/journey_active.css',
    'css/mobile_premium__focus-dive.css',
    'css/mobile_premium__surfaces.css',
    'css/shell.css',
    'css/mobile_base.css',
    'css/animations.css',
    'css/controls.css',
    'css/time_weather.css'
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

let totalPanelSurfaceRules = 0
let totalPanelSurfacePrefixRules = 0
let totalActiveViewRules = 0
let totalFilesChanged = 0

for (const relPath of CSS_FILES) {
    const fullPath = resolve(projectRoot, relPath)
    const src = readFileSync(fullPath, 'utf8')
    let out = src
    let filePanelSurface = 0
    let filePanelSurfacePrefix = 0
    let fileActiveView = 0

    for (const value of PANEL_SURFACE_VALUES) {
        const sqPattern = new RegExp(`body\\[data-panel-surface='${value}'\\]`, 'g')
        const sqReplacement = `body.surface-${value}`
        const sqMatches = out.match(sqPattern)
        if (sqMatches) {
            filePanelSurface += sqMatches.length
            out = out.replace(sqPattern, sqReplacement)
        }
        const dqPattern = new RegExp(`body\\[data-panel-surface="${value}"\\]`, 'g')
        const dqMatches = out.match(dqPattern)
        if (dqMatches) {
            filePanelSurface += dqMatches.length
            out = out.replace(dqPattern, sqReplacement)
        }
    }

    const prefixPatterns = [
        { pattern: /body\[data-panel-surface\^='map-'\]/g, replacement: "body[class*='surface-map-']" },
        { pattern: /body\[data-panel-surface\^="map-"\]/g, replacement: 'body[class*="surface-map-"]' }
    ]
    for (const { pattern, replacement } of prefixPatterns) {
        const matches = out.match(pattern)
        if (matches) {
            filePanelSurfacePrefix += matches.length
            out = out.replace(pattern, replacement)
        }
    }

    for (const value of ACTIVE_VIEW_VALUES) {
        const sqPattern = new RegExp(`body\\[data-active-view='${value}'\\]`, 'g')
        const sqReplacement = `body.view-${value}`
        const sqMatches = out.match(sqPattern)
        if (sqMatches) {
            fileActiveView += sqMatches.length
            out = out.replace(sqPattern, sqReplacement)
        }
        const dqPattern = new RegExp(`body\\[data-active-view="${value}"\\]`, 'g')
        const dqMatches = out.match(dqPattern)
        if (dqMatches) {
            fileActiveView += dqMatches.length
            out = out.replace(dqPattern, sqReplacement)
        }
    }

    totalPanelSurfaceRules += filePanelSurface
    totalPanelSurfacePrefixRules += filePanelSurfacePrefix
    totalActiveViewRules += fileActiveView

    if (out !== src) {
        totalFilesChanged++
        const changes = filePanelSurface + filePanelSurfacePrefix + fileActiveView
        console.log(
            `  ${relPath}: ${changes} rules (${filePanelSurface} panel-surface + ${filePanelSurfacePrefix} panel-surface^ + ${fileActiveView} active-view)`
        )
        if (!DRY_RUN) {
            writeFileSync(fullPath, out, 'utf8')
        }
    }
}

console.log('\n=== Totals ===')
console.log(`  body[data-panel-surface='X']:     ${totalPanelSurfaceRules} rules`)
console.log(`  body[data-panel-surface^='map-']: ${totalPanelSurfacePrefixRules} rules`)
console.log(`  body[data-active-view='X']:       ${totalActiveViewRules} rules`)
console.log(`  Files changed: ${totalFilesChanged} / ${CSS_FILES.length}`)
console.log(`  ${DRY_RUN ? '(DRY RUN — no files written)' : '(FILES WRITTEN)'}`)
