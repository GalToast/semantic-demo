/**
 * design-token-sweep.mjs
 *
 * Consolidated sweep: merges design-token-doc-contract.mjs +
 * js-design-token-contract.mjs (W2 Phase 3+4). Checks token documentation
 * parity and JS/WebGL token preservation in one pass.
 *
 * Sweep sources (loc before/after):
 *   tests/design-token-doc-contract.mjs         108 LOC
 *   tests/js-design-token-contract.mjs            60 LOC
 *   Total originals: 168 LOC → ~160 LOC in this sweep
 *
 * Pass-fail criterion: exit 0 = no violations; exit 1 + error messages = fail.
 */

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

// ─── Sweep Part 1: design-token-doc (from design-token-doc-contract.mjs) ──────

function read(relativePath) {
    const fullPath = path.join(root, relativePath)
    if (!fs.existsSync(fullPath)) {
        failures.push(`${relativePath} is missing`)
        return ''
    }
    return fs.readFileSync(fullPath, 'utf8')
}

const failures = []

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

function rootBlock(cssText) {
    const css = stripComments(cssText)
    const rootStart = css.search(/:root\s*\{/)
    if (rootStart === -1) {
        failures.push(`css/base.css must define a :root token block`)
        return ''
    }
    const openBrace = css.indexOf('{', rootStart)
    let depth = 0
    for (let index = openBrace; index < css.length; index += 1) {
        const char = css[index]
        if (char === '{') depth += 1
        if (char === '}') depth -= 1
        if (depth === 0) {
            return css.slice(openBrace + 1, index)
        }
    }
    failures.push('css/base.css has an unterminated :root token block')
    return ''
}

function rootTokens(cssText) {
    const block = rootBlock(cssText)
    return [...block.matchAll(/^\s*(--[A-Za-z0-9-]+)\s*:/gm)]
        .map((match) => match[1])
        .sort((a, b) => a.localeCompare(b))
}

function documentedTableTokens(markdownText) {
    return [...markdownText.matchAll(/^\|\s*`([^`]+)`/gm)]
        .flatMap((match) => [...match[1].matchAll(/--[A-Za-z0-9-]+/g)].map((tokenMatch) => tokenMatch[0]))
        .sort((a, b) => a.localeCompare(b))
}

const baseCss = read('css/base.css')
const tokenDoc = read('docs/semantic-demo-design-tokens.md')
const tokens = rootTokens(baseCss)
const documentedTokens = documentedTableTokens(tokenDoc)
const missingFromDoc = tokens.filter((token) => !tokenDoc.includes(token))
const missingFromCss = documentedTokens.filter((token) => !tokens.includes(token))

if (!tokenDoc.includes('css/base.css')) {
    failures.push('docs/semantic-demo-design-tokens.md must identify css/base.css as the implementation source of truth')
}

if (!tokenDoc.includes('semantic-demo.css') || !tokenDoc.includes('import shell')) {
    failures.push('docs/semantic-demo-design-tokens.md must state that semantic-demo.css is only an import shell')
}

if (!tokenDoc.includes('Safe-area comfort should be handled with internal padding or content insets')) {
    failures.push('docs/semantic-demo-design-tokens.md must document bottom-sheet safe-area policy')
}

if (!tokenDoc.includes('Avoid `!important`')) {
    failures.push('docs/semantic-demo-design-tokens.md must document the !important policy')
}

if (missingFromDoc.length) {
    failures.push(
        `docs/semantic-demo-design-tokens.md is missing ${missingFromDoc.length} root token(s) from css/base.css: ${missingFromDoc.join(', ')}`
    )
}

if (missingFromCss.length) {
    failures.push(
        `docs/semantic-demo-design-tokens.md documents ${missingFromCss.length} token(s) not defined in css/base.css: ${missingFromCss.join(', ')}`
    )
}

console.log(`design-token-sweep [part 1] doc parity: ${tokens.length} root tokens checked.`)

// ─── Sweep Part 2: js-design-token (from js-design-token-contract.mjs) ─────────

// Native TS source of truth (src/lib/utils/design-tokens.ts) — the legacy
// js/modules design-token owner was retired during the Svelte cutover. This
// contract verifies that the native-TS tokens preserve all legacy visual
// values (frozen, color hex codes, vec3 shader strings, 29-entry cluster
// palette) so a future refactor cannot silently change product visuals.
import {
    CLUSTER_COLORS,
    CORRIDOR_TRAIL_SHADER_COLORS,
    FOCUS_SEMANTIC_COLORS,
    ROUTE_TRACE_COLORS,
    SCENE_PALETTE
} from '../src/lib/utils/design-tokens.ts'
import * as tokensMod from '../src/lib/utils/design-tokens.ts'

const legacyClusterColors = [
    '#4ecdc4', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8c42', '#a66cff', '#ff6b9d',
    '#45b7d1', '#96ceb4', '#ffeaa7', '#74b9ff', '#fd79a8', '#00b894', '#e17055', '#a29bfe',
    '#fdcb6e', '#e84393', '#00cec9', '#6c5ce7', '#fab1a0', '#81ecec', '#55efc4', '#ffeaa7',
    '#dfe6e9', '#ff7675', '#fd79a8', '#00b894', '#e17055'
]

const tokenFailures = []
const assert = (condition, message) => {
    if (!condition) tokenFailures.push(message)
}

assert(!('injectDesignTokens' in tokensMod), 'JS tokens must not inject or mutate CSS custom properties')
assert(!('PALETTE' in tokensMod), 'Avoid broad PALETTE export; use explicit token groups to prevent accidental visual drift')

assert(Object.isFrozen(SCENE_PALETTE), 'SCENE_PALETTE must be frozen')
// Fog deepened with the visual art-direction wave (6fb180a3): 0x070a12 -> 0x0b141e.
assert(SCENE_PALETTE.fog === 0x0b141e, 'scene fog token must preserve existing fog color')
assert(SCENE_PALETTE.sporeLift === 0xbffdf4, 'spore lift token must preserve existing color')
assert(SCENE_PALETTE.threadTint === 0x4ecdc4, 'thread tint token must preserve existing color')

assert(Object.isFrozen(CORRIDOR_TRAIL_SHADER_COLORS), 'CORRIDOR_TRAIL_SHADER_COLORS must be frozen')
assert(CORRIDOR_TRAIL_SHADER_COLORS.teal === '0.43, 1.0, 0.91', 'corridor teal shader token must preserve existing vec3')
assert(CORRIDOR_TRAIL_SHADER_COLORS.ember === '0.74, 0.86, 0.68', 'corridor ember shader token must preserve existing vec3')

assert(Object.isFrozen(ROUTE_TRACE_COLORS), 'ROUTE_TRACE_COLORS must be frozen')
assert(ROUTE_TRACE_COLORS.route === 0x4ecdc4, 'route trace color token must preserve existing route color')
assert(ROUTE_TRACE_COLORS.cue === 0xffdf6e, 'route trace cue token must preserve existing cue color')

assert(Object.isFrozen(FOCUS_SEMANTIC_COLORS), 'FOCUS_SEMANTIC_COLORS must be frozen')
assert(FOCUS_SEMANTIC_COLORS.focusLerp === 0xffd66b, 'focus semantic lerp token must preserve existing focus color')
assert(FOCUS_SEMANTIC_COLORS.cue === 0xffe27a, 'focus semantic cue token must preserve existing cue color')
assert(FOCUS_SEMANTIC_COLORS.candidate === 0x56d8d1, 'focus semantic candidate token must preserve existing candidate color')

assert(Object.isFrozen(CLUSTER_COLORS), 'CLUSTER_COLORS must be frozen')
assert(CLUSTER_COLORS.length === legacyClusterColors.length, `cluster color count changed: ${CLUSTER_COLORS.length}`)
legacyClusterColors.forEach((expected, index) => {
    assert(CLUSTER_COLORS[index] === expected, `cluster color ${index} changed: expected ${expected}, got ${CLUSTER_COLORS[index]}`)
})

console.log(`design-token-sweep [part 2] JS tokens: ${CLUSTER_COLORS.length} cluster colors, 5 frozen groups verified.`)

// ─── Report ───────────────────────────────────────────────────────────────────

const allFailures = [...failures, ...tokenFailures]

if (allFailures.length) {
    console.error('design-token-sweep FAIL:')
    if (failures.length) {
        console.error('\nPart 1 — doc parity:')
        for (const f of failures) console.error(`  - ${f}`)
    }
    if (tokenFailures.length) {
        console.error('\nPart 2 — JS token preservation:')
        for (const f of tokenFailures) console.error(`  - ${f}`)
    }
    process.exit(1)
}

console.log('design-token-sweep OK: doc parity + JS token preservation both pass.')
