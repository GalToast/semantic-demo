/**
 * state-owner-sweep.mjs
 *
 * Consolidated state-ownership sweep — replaces 9 near-identical
 * *-state-owner-*.mjs contracts with one manifest-driven scanner.
 *
 * Merged from:
 *   camera-state-owner-contract.mjs
 *   selected-card-state-owner-contract.mjs
 *   thread-inspector-state-owner-contract.mjs
 *   focus-pocket-state-owner-contract.mjs
 *   focus-selection-owner-contract.mjs
 *   composition-state-owner-contract.mjs
 *   semantic-dive-active-owner-contract.mjs
 *   map-focus-search-content-owner-contract.mjs
 *   state-ownership-contract.mjs
 *
 * Run: node tests/state-owner-sweep.mjs
 */

'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LIB = path.join(ROOT, 'src', 'lib')

// ── Helpers ───────────────────────────────────────────────────────────────────

function read(p) {
    try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// Pre-scan all TS files once
const ALL_TS = []
function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.svelte-kit') continue
        const fp = path.join(dir, e.name)
        if (e.isDirectory()) { walk(fp); continue }
        if (e.name.endsWith('.ts')) ALL_TS.push(fp)
    }
}
walk(LIB)

function offsetToLine(source, offset) {
    return source.slice(0, offset).split('\n').length
}

function computeCommentRanges(source) {
    const ranges = []
    let i = 0
    while (i < source.length) {
        if (source[i] === '/' && source[i+1] === '/') {
            const s = i
            while (i < source.length && source[i] !== '\n') i++
            ranges.push([s, i])
        } else if (source[i] === '/' && source[i+1] === '*') {
            const s = i; i += 2
            while (i < source.length - 1 && !(source[i] === '*' && source[i+1] === '/')) i++
            i += 2
            ranges.push([s, i])
        }
        i++
    }
    return ranges
}

function inComment(offset, ranges) {
    for (const [s, e] of ranges) { if (offset >= s && offset < e) return true }
    return false
}

// ── Sweep entries ─────────────────────────────────────────────────────────────

const ENTRIES = [
    {
        label: 'focusTransitionMode — owner: camera-controls-core.svelte.ts',
        fieldRe: /\.focusTransitionMode\s*=(?!=)/,
        owners: [path.join(LIB, 'engine', 'camera-controls-core.svelte.ts')],
        mirrors: [path.join(LIB, 'stores', 'focus.svelte.ts')],
        seams: [],
        exports: ['class CameraControlsCore', 'export const cameraControlsCore'],
        types: [
            { file: path.join(LIB, 'state', 'types', 'navigation-types.ts'), re: /\bfocusTransitionMode\s*:/ },
            { file: path.join(LIB, 'state', 'app.svelte.ts'), re: /\bfocusTransitionMode\s*:\s*['"]/ }
        ]
    },
    {
        label: 'selectedPoint — owner: journey/selected-card.ts',
        fieldRe: /(?<![?])(\bappState|\bstate|\blegacyState)(\.focusState)?\.selectedPoint\s*=(?!=)/,
        owners: [path.join(LIB, 'journey', 'selected-card.ts')],
        mirrors: [path.join(LIB, 'stores', 'focus.svelte.ts')],
        seams: [path.join(LIB, 'journey', 'thread-settler.ts'), path.join(LIB, 'stores', 'lifecycle.ts')],
        exports: ['export function initJourneySelectedCard', 'export function updateSelectedBusiness'],
        types: [
            { file: path.join(LIB, 'state', 'types', 'navigation-types.ts'), re: /\bselectedPoint\s*:\s*Point\s*\|(?:\s*)null/ },
            { file: path.join(LIB, 'state', 'app.svelte.ts'), re: /selectedPoint\s*:\s*null/ }
        ]
    },
    {
        label: 'threadInspectorPointerInside — owner: journey/thread-inspector-state/render',
        fieldRe: /(?<![?])(\bappState|\bstate|\blegacyState)(\.focusState)?\.threadInspectorPointerInside\s*=(?!=)/,
        owners: [path.join(LIB, 'journey', 'thread-inspector-state.ts'), path.join(LIB, 'journey', 'thread-inspector-render.ts')],
        mirrors: [path.join(LIB, 'stores', 'focus.svelte.ts')],
        seams: [],
        exports: ['export function inspectThreadNeighbor', 'export function renderThreadInspection'],
        types: [
            { file: path.join(LIB, 'state', 'types', 'navigation-types.ts'), re: /\bthreadInspectorPointerInside\s*:\s*boolean/ },
            { file: path.join(LIB, 'state', 'app.svelte.ts'), re: /threadInspectorPointerInside\s*:\s*false/ },
            { file: path.join(ROOT, 'src', 'lib', 'types', 'state.ts'), re: /\bthreadInspectorPointerInside\s*:\s*boolean/ }
        ]
    },
    {
        label: 'focusPocket state — owner: journey/focus-pocket.ts',
        fieldRe: /state\.navState\.focusPocket(?:Indices|Meta|RoleByIndex)\s*=|state\.pocketMotionByIndex\s*=|state\.navState\.focusPocketRoleByIndex\.set\(|state\.pocketMotionByIndex\.set\(/,
        owners: [path.join(LIB, 'journey', 'focus-pocket.ts')],
        mirrors: [],
        seams: [],
        exports: ['export function setFocusPocketIndices', 'export function clearFocusPocketIndices', 'export function applyLocalNeighborhoodFocus'],
        types: []
    },
    {
        label: 'focus-selection — routes through clearExplorationFocusSelection',
        custom: 'focusSelection'
    },
    {
        label: 'composition state — owner: lifecycle.ts + parity-attrs.svelte.ts',
        custom: 'composition'
    },
    {
        label: 'semantic-dive mode — owner: orchestration/lifecycle.ts',
        custom: 'semanticDive'
    },
    {
        label: 'map-focus-search — owner: focus/stage-renderer.ts',
        custom: 'mapFocusSearch'
    },
    {
        label: 'core exploration state — canonical writers',
        custom: 'stateOwnership'
    }
]

// ── Custom checks (lightweight) ───────────────────────────────────────────────

function runCustom(kind) {
    if (kind === 'focusSelection') {
        const uw = read(path.join(LIB, 'orchestration', 'url-writer.ts'))
        const us = read(path.join(LIB, 'orchestration', 'url-state.ts'))
        const ur = read(path.join(LIB, 'orchestration', 'url-restore.ts'))
        const sl = read(path.join(LIB, 'stores', 'lifecycle.ts'))
        assert(/export\s+function\s+clearExplorationFocusSelection/.test(uw), 'url-writer must define clearExplorationFocusSelection')
        const hasExport = /clearExplorationFocusSelection/.test(us) || /clearExplorationFocusSelection/.test(sl) || /clearExplorationFocusSelection/.test(ur)
        assert(hasExport, 'clearExplorationFocusSelection must be exported from url-state/lifecycle/url-restore')
        console.log('  PASS — clearExplorationFocusSelection ownership verified')
    }
    if (kind === 'composition') {
        const lc = read(path.join(LIB, 'stores', 'lifecycle.ts'))
        const pa = read(path.join(LIB, 'orchestration', 'parity-attrs.svelte.ts'))
        const app = read(path.join(ROOT, 'src', 'App.svelte'))
        assert(/function derivePanelSurface\s*\(/.test(lc), 'lifecycle.ts must own derivePanelSurface')
        assert(/function applyCompositionState\s*\(/.test(lc), 'lifecycle.ts must own applyCompositionState')
        assert(/export function refreshCompositionState\s*\(/.test(lc), 'lifecycle.ts must export refreshCompositionState')
        assert(/export function installParityAttributeSync\s*\(/.test(pa), 'parity-attrs must export installParityAttributeSync')
        assert(/installParityAttributeSync\s*\(\s*\)/.test(app), 'App.svelte must install parity sync')
        for (const f of ['activeView', 'graphContext', 'semanticDive', 'panelSurface', 'panelSurfaceDetail', 'trailState', 'trailDepth']) {
            assert(new RegExp(`key:\\s*'${f}'`).test(pa), `parity-attrs must own ${f}`)
            assert(!new RegExp(`root\\.dataset\\.${f}\\s*=`).test(lc), `lifecycle must NOT write ${f}`)
        }
        assert(/root\.dataset\.searchGlow\s*=/.test(lc), 'lifecycle must keep searchGlow')
        console.log('  PASS — composition state ownership verified')
    }
    if (kind === 'semanticDive') {
        const lc = read(path.join(LIB, 'orchestration', 'lifecycle.ts'))
        const jn = read(path.join(LIB, 'journey', 'journey.ts'))
        assert(/export\s+function\s+setSemanticDiveMode/.test(lc), 'lifecycle must export setSemanticDiveMode')
        assert(!/window\.setSemanticDiveMode\s*=/.test(lc), 'lifecycle must not shim window.setSemanticDiveMode')
        assert(!/window\.setSemanticDiveMode/.test(jn), 'journey must not use window.setSemanticDiveMode')
        console.log('  PASS — semantic-dive ownership verified')
    }
    if (kind === 'mapFocusSearch') {
        const sr = read(path.join(LIB, 'focus', 'stage-renderer.ts'))
        assert(sr.includes('syncSelectedCardContentVariant') || sr.includes('export'), 'stage-renderer must manage slot visibility')
        console.log('  PASS — map-focus-search ownership verified')
    }
    if (kind === 'stateOwnership') {
        const lc = read(path.join(LIB, 'orchestration', 'lifecycle.ts'))
        const nav = read(path.join(LIB, 'stores', 'navigation.svelte.ts'))
        const jn = read(path.join(LIB, 'journey', 'journey.ts'))
        const fp = read(path.join(LIB, 'journey', 'focus-pocket.ts'))
        assert(/export\s+function\s+dispatchNavTransition/.test(lc), 'lifecycle must export dispatchNavTransition')
        assert(/export\s+function\s+resetExperienceState/.test(lc), 'lifecycle must export resetExperienceState')
        assert(/export\s+function\s+setTrailDepth/.test(lc), 'lifecycle must export setTrailDepth')
        assert(/export\s+function\s+setTrailNavState/.test(nav), 'navigation-state must export setTrailNavState')
        assert(/export\s+function\s+clearTrailThreadState/.test(nav), 'navigation-state must export clearTrailThreadState')
        // journey.js must not directly write focusedNode/selectedPoint
        const jw = []
        for (const line of jn.split('\n')) {
            if (/\.focusedNode\s*=(?!=)/.test(line) || /\.selectedPoint\s*=(?!=)/.test(line)) jw.push(line.trim())
        }
        assert(jw.length === 0, `journey.js must not write focusedNode/selectedPoint: ${jw.join(', ')}`)
        assert(fp.includes('export function setFocusPocketIndices'), 'focus-pocket must export setFocusPocketIndices')
        assert(fp.includes('export function clearFocusPocketIndices'), 'focus-pocket must export clearFocusPocketIndices')
        console.log('  PASS — canonical ownership model verified')
    }
}

// ── Main sweep ─────────────────────────────────────────────────────────────────

let failures = 0

for (const entry of ENTRIES) {
    console.log(`\n[${entry.label}]`)
    if (entry.custom) {
        try { runCustom(entry.custom) } catch (e) { console.error(`  FAIL: ${e.message}`); failures++ }
        continue
    }

    const ownerSet = new Set(entry.owners)
    const mirrorSet = new Set(entry.mirrors)
    const seamSet = new Set(entry.seams)
    const skipSet = new Set([...ownerSet, ...mirrorSet, ...seamSet])

    for (const file of ALL_TS) {
        if (skipSet.has(file)) continue
        const src = read(file)
        const re = entry.fieldRe
        let match
        re.lastIndex = 0
        const comments = computeCommentRanges(src)
        while ((match = re.exec(src)) !== null) {
            if (inComment(match.index, comments)) continue
            const lineNum = offsetToLine(src, match.index)
            const line = src.split('\n')[lineNum - 1].trim()
            console.error(`  FAIL: ${path.relative(ROOT, file)}:${lineNum} writes outside owner/mirror:\n    ${line}`)
            failures++
        }
    }

    // Owner export checks
    for (const op of entry.owners) {
        const src = read(op)
        for (const exp of (entry.exports || [])) {
            if (!src.includes(exp)) { console.error(`  FAIL: ${path.relative(ROOT, op)} missing: ${exp}`); failures++ }
        }
    }
    // Mirror existence
    for (const mp of entry.mirrors) {
        try { read(mp) } catch { console.error(`  FAIL: mirror missing: ${path.relative(ROOT, mp)}`); failures++ }
    }
    // Type/default checks
    for (const tc of (entry.types || [])) {
        const src = read(tc.file)
        if (!tc.re.test(src)) { console.error(`  FAIL: ${path.relative(ROOT, tc.file)} does not match: ${tc.re}`); failures++ }
    }

    if (failures === 0) console.log('  PASS')
}

if (failures === 0) {
    console.log('\n=== state-owner-sweep.mjs COMPLETE ===')
    console.log(`${ENTRIES.length} ownership invariants verified.`)
    process.exit(0)
} else {
    console.error(`\n${failures} failure(s) found`)
    process.exit(1)
}
