/**
 * css-ownership-sweep.mjs
 *
 * Consolidated sweep: merges css-ownership-check.mjs + css-transient-state-
 * ownership-contract.mjs (W2 Phase 3+4). Checks CSS attribute/selector
 * ownership and transient choreography-state ownership in one pass.
 *
 * Sweep sources (loc before/after):
 *   tests/css-ownership-check.mjs                              341 LOC
 *   tests/css-transient-state-ownership-contract.mjs           226 LOC
 *   Total originals: 567 LOC → ~340 LOC in this sweep
 *
 * Pass-fail criterion: exit 0 = no violations; exit 1 + error messages = fail.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cssDir = path.resolve(process.cwd(), 'css')

// ─── Sweep Part 1: css-ownership-check (selector ownership baseline) ──────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(__dirname, 'fixtures/css-ownership-ownership.json')
const ownershipFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const ownership = ownershipFixture.ownership

if (!Array.isArray(ownership) || ownership.length === 0) {
    console.error(`css-ownership-sweep [part 1]: fixture ${fixturePath} has empty or missing ownership array.`)
    process.exit(1)
}
for (const entry of ownership) {
    if (!entry.selector || !entry.ownerFile) {
        console.error(`css-ownership-sweep [part 1]: fixture entry missing selector or ownerFile: ${JSON.stringify(entry)}`)
        process.exit(1)
    }
}

const ownershipByFile = new Map()
for (const entry of ownership) {
    if (!ownershipByFile.has(entry.ownerFile)) ownershipByFile.set(entry.ownerFile, [])
    ownershipByFile.get(entry.ownerFile).push(entry)
}
const allOwnedSelectors = new Set(ownership.map((entry) => entry.selector))

const mobilePremiumLegacyStatePatterns = [
    'data-active-view="galaxy"',
    'data-active-view="map"',
    'data-graph-context',
    'data-map-context',
    'data-semantic-dive'
]

const mobilePremiumLegacyStatePatternExceptions = new Map([['mobile_premium__components.css', ['data-semantic-dive']]])

const globalLegacyPanelStatePatterns = ['data-graph-context', 'data-map-context', 'data-semantic-dive="active"']

const forbiddenActivitySelectors = [
    { pattern: /body\.is-active\b/, label: 'body.is-active' },
    { pattern: /body:not\(\.is-active\)/, label: 'body:not(.is-active)' }
]

const bannedSelectorImportantRules = [
    {
        file: 'search.css',
        selectorIncludes: ['data-panel-surface="focus-search"', '.search-results.active'],
        label: 'focus-search search-results active'
    }
]

const forbiddenSelectorFragments = [
    {
        file: 'strands.css',
        fragment: 'body.surface-search .info-panel {\n        max-height: min(23vh, 178px);',
        label: 'mobile search info-panel geometry belongs to mobile_premium__state.css, not strands.css'
    },
    {
        file: 'strands.css',
        fragment: 'body.surface-search .info-content {\n        max-height: calc(min(23vh, 178px) - 10px);',
        label: 'mobile search info-content geometry belongs to mobile_premium__state.css, not strands.css'
    },
    {
        file: 'strands.css',
        fragment:
            'body.surface-search .info-panel,\n    body.surface-focus-search .info-panel {\n        opacity: 0.97;',
        label: 'mobile search/focus-search info-panel opacity belongs to mobile_premium__state.css, not strands.css'
    },
    {
        file: 'strands.css',
        fragment:
            'body.surface-search .info-content,\n    body.surface-focus-search .info-content {\n        max-height: calc(min(54vh, 456px) - 42px);',
        label: 'mobile search/focus-search info-content sizing belongs to mobile_premium__state.css, not strands.css'
    },
    {
        file: 'strands.css',
        fragment:
            'body.surface-focus .info-content,\n    body.surface-semantic-dive .info-content {\n        max-height: min(15vh, 116px);',
        label: 'dead early focus/semantic info-content block is overridden later in strands.css'
    },
    {
        file: 'strands.css',
        fragment: 'data-panel-surface="focus"]:has(.search-container.has-query) .info-content',
        label: 'redundant focus info-content :has(.search-container.has-query) selector'
    },
    {
        file: 'strands.css',
        fragment: 'data-panel-surface="focus-search"]:has(.search-container.has-query) .info-content',
        label: 'redundant focus-search info-content :has(.search-container.has-query) selector'
    },
    {
        file: 'strands.css',
        fragment: 'data-panel-surface="semantic-dive"]:has(.search-container.has-query) .info-content',
        label: 'redundant semantic-dive info-content :has(.search-container.has-query) selector'
    },
    {
        file: 'layout_base.css',
        fragment: 'data-panel-surface="search"] .search-results.active',
        label: 'mobile search results belong to search.css, not layout_base.css'
    },
    {
        file: 'layout_base.css',
        fragment: 'data-panel-surface="search"] .search-result-item',
        label: 'mobile search result rows belong to search.css, not layout_base.css'
    },
    {
        file: 'layout_base.css',
        fragment:
            'data-mobile-route-peek="active"][data-panel-surface]:not([data-panel-surface^="map-"]) .search-result-item',
        label: 'route-peek search result rows belong to search.css, not layout_base.css'
    }
]

const mobileBaseJourneyCompassLayoutProperties = [
    'top:', 'left:', 'right:', 'bottom:', 'width:', 'min-width:', 'max-width:',
    'height:', 'min-height:', 'max-height:', 'display:', 'grid-template', 'grid-column',
    'flex:', 'gap:', 'padding:', 'margin:', 'border-radius:', 'transform:', 'overflow'
]

function stripComments(cssText) {
    return cssText.replace(/\/\*[\s\S]*?\*\//g, '')
}

function selectorRuleBlocks(cssText) {
    return stripComments(cssText)
        .split('}')
        .map((chunk) => {
            const braceIndex = chunk.lastIndexOf('{')
            if (braceIndex === -1) return null
            return { prelude: chunk.slice(0, braceIndex).trim(), body: chunk.slice(braceIndex + 1).trim() }
        })
        .filter(Boolean)
}

function hasDeclaration(body) {
    return /[a-z-]+\s*:/.test(body)
}

function selectorRulePreludes(cssText) {
    return stripComments(cssText)
        .split('{')
        .slice(0, -1)
        .map((chunk) => chunk.split('}').pop() || '')
        .flatMap((prelude) => prelude.split(',').map((selector) => selector.trim()))
        .filter(Boolean)
}

function countSelectorDefinitions(cssText, selector) {
    return selectorRulePreludes(cssText).filter((prelude) => {
        const atoms = prelude.split(/[\s>+~]+/).map((s) => s.trim()).filter(Boolean)
        return atoms.some((atom) => {
            if (atom === selector) return true
            if (selector.startsWith('.') && atom.startsWith(selector)) {
                const nextChar = atom.slice(selector.length, selector.length + 1)
                return nextChar === '' || nextChar === '.' || nextChar === '[' || nextChar === ':'
            }
            return false
        })
    }).length
}

const violations1 = []

if (!fs.existsSync(cssDir)) {
    console.error(`CSS directory not found: ${cssDir}`)
    process.exit(1)
}

const cssFiles = fs.readdirSync(cssDir).filter((file) => file.endsWith('.css')).sort()

for (const file of cssFiles) {
    const content = fs.readFileSync(path.join(cssDir, file), 'utf8')
    const uncommentedContent = stripComments(content)
    const ruleBlocks = selectorRuleBlocks(content)

    for (const block of ruleBlocks) {
        if (!hasDeclaration(block.body)) {
            violations1.push(`${file} has an empty/comment-only CSS rule for "${block.prelude}". Remove the dead selector or add a real declaration.`)
        }
    }

    if (file === 'mobile_base.css') {
        for (const block of ruleBlocks) {
            if (!block.prelude.includes('.journey-compass')) continue
            const lowerBody = block.body.toLowerCase()
            if (mobileBaseJourneyCompassLayoutProperties.some((p) => lowerBody.includes(p))) {
                violations1.push('mobile_base.css defines journey-compass layout; mobile journey-compass layout belongs to css/mobile_premium.css.')
            }
        }
    }

    for (const pattern of globalLegacyPanelStatePatterns) {
        if (uncommentedContent.includes(pattern)) {
            violations1.push(`${file} uses legacy panel state ${pattern}; panel ownership must use data-panel-surface.`)
        }
    }

    for (const rule of forbiddenActivitySelectors) {
        if (rule.pattern.test(uncommentedContent)) {
            violations1.push(`${file} uses retired activity selector ${rule.label}; use canonical surface classes.`)
        }
    }

    for (const rule of bannedSelectorImportantRules) {
        if (file !== rule.file) continue
        for (const block of ruleBlocks) {
            const matchesSelector = rule.selectorIncludes.every((frag) => block.prelude.includes(frag))
            if (matchesSelector && block.body.includes('!important')) {
                violations1.push(`${file} uses !important in ${rule.label}; use state-scoped ownership instead.`)
            }
        }
    }

    for (const rule of forbiddenSelectorFragments) {
        if (file === rule.file && uncommentedContent.includes(rule.fragment)) {
            violations1.push(`${file} reintroduced ${rule.label}; use the plain data-panel-surface owner instead.`)
        }
    }

    if (file.startsWith('mobile_premium')) {
        const fileExceptions = mobilePremiumLegacyStatePatternExceptions.get(file) || []
        for (const pattern of mobilePremiumLegacyStatePatterns) {
            if (fileExceptions.includes(pattern)) continue
            if (uncommentedContent.includes(pattern)) {
                violations1.push(`${file} uses legacy state selector ${pattern}; mobile premium panel ownership must use data-panel-surface.`)
            }
        }
    }

    for (const entry of ownership) {
        if (entry.ownerFile !== file) continue
        const count = countSelectorDefinitions(content, entry.selector)
        const noteSuffix = entry.note ? ` (${entry.note})` : ''
        if (count < entry.min) {
            if (entry.min > 0) {
                violations1.push(`${file} owns ${entry.selector} (min: ${entry.min}) but defines it ${count} time(s)${noteSuffix}; owner stopped owning.`)
            }
        } else if (entry.max != null && count > entry.max) {
            violations1.push(`${file} defines ${entry.selector} ${count} time(s); ownership cap is ${entry.max}${noteSuffix}.`)
        }
    }
    for (const selector of allOwnedSelectors) {
        const isOwner = ownershipByFile.get(file)?.some((entry) => entry.selector === selector)
        if (isOwner) continue
        const count = countSelectorDefinitions(content, selector)
        if (count === 0) continue
        const owners = ownership.filter((entry) => entry.selector === selector).map((entry) => entry.ownerFile)
        violations1.push(`${file} now defines ${selector} ${count} time(s), but it is not an owner (owners: ${owners.join(', ')}).`)
    }
}

// ─── Sweep Part 2: css-transient-state-ownership ──────────────────────────────

const TRANSIENT_ATTRS = [
    'data-mobile-route-peek',
    'data-route-director',
    'data-terrain-handoff',
    'data-camera-assist',
    'data-semantic-dive'
]

const BROAD_PANEL_SELECTORS = [
    '.info-panel',
    '.search-results',
    '.search-container',
    '.focus-stage',
    '.selected-card',
    '.rail-section'
]

const ALLOWED_BASELINE = {
    'layout_base.css|data-mobile-route-peek|.info-panel': true,
    'layout_base.css|data-mobile-route-peek|.search-container': true,
    'search.css|data-mobile-route-peek|.info-content': true,
    'search.css|data-mobile-route-peek|.search-container': true,
    'journey_active.css|data-mobile-route-peek|.journey-compass': true,
    'journey_active.css|data-terrain-handoff|.journey-compass': true,
    'journey_steps.css|data-semantic-dive|#canvas-container': true,
    'shell.css|data-mobile-route-peek|#canvas-container': true,
    'shell.css|data-semantic-dive|#canvas-container': true,
    'shell.css|data-terrain-handoff|#map-container': true,
    'shell.css|data-terrain-handoff|#canvas-container': true,
    'shell.css|data-route-motion|#canvas-container': true,
    'mobile_base.css|data-semantic-dive|#canvas-container': true,
    'mobile_base.css|data-semantic-dive|::before': true,
    'progressive_disclosure.css|data-semantic-dive|#canvas-container': true,
    'progressive_disclosure.css|data-semantic-dive|::before': true,
    'progressive_disclosure.css|data-route-director|.map-strip-title': true,
    'progressive_disclosure.css|data-camera-assist|#map-container::before': true,
    'animations.css|data-semantic-dive|.focus-stage-card': true,
    'journey_active.css|data-route-director|.focus-stage-dive-btn': true,
    'animations.css|data-semantic-dive|#canvas-container': true,
    'controls.css|data-terrain-handoff|.view-handoff': true
}

function extractAttrs(prelude) {
    return TRANSIENT_ATTRS.filter((attr) => prelude.includes(attr))
}

function extractBroadPanels(prelude) {
    const found = []
    for (const sel of BROAD_PANEL_SELECTORS) {
        const escaped = sel.replace(/\./g, '\\.')
        const re = new RegExp(`(?:^|[,( \\t\\n\\r>+~])${escaped}(?=[ \\t\\n\\r{([]|$)`, 'g')
        if (re.test(prelude)) found.push(sel)
    }
    return found
}

function hasPanelSurface(prelude) {
    return prelude.includes('data-panel-surface')
}

const violations2 = []

for (const file of cssFiles) {
    const content = fs.readFileSync(path.join(cssDir, file), 'utf8')
    const ruleBlocks = selectorRuleBlocks(content)

    for (const block of ruleBlocks) {
        const { prelude } = block
        const attrs = extractAttrs(prelude)
        if (attrs.length === 0) continue
        const panels = extractBroadPanels(prelude)
        if (panels.length === 0) continue

        for (const attr of attrs) {
            for (const panel of panels) {
                const baselineKey = `${file}|${attr}|${panel}`
                const hasSurface = hasPanelSurface(prelude)

                if (hasSurface) continue
                if (ALLOWED_BASELINE[baselineKey]) continue

                violations2.push(
                    `${file}: '${prelude.split('\n')[0].trim()}' uses ${attr} ` +
                        `to own '${panel}' without data-panel-surface — transient choreography ` +
                        `attributes must not become broad panel layout owners. ` +
                        `Pair with data-panel-surface or scope to specific choreographed elements.`
                )
            }
        }
    }
}

// ─── Report ───────────────────────────────────────────────────────────────────

const allViolations = [...violations1, ...violations2]

if (allViolations.length) {
    console.error('css-ownership-sweep FAIL:')
    if (violations1.length) {
        console.error(`\nPart 1 — selector ownership (${violations1.length} violation(s)):`)
        for (const v of violations1) console.error(`  - ${v}`)
    }
    if (violations2.length) {
        console.error(`\nPart 2 — transient state ownership (${violations2.length} violation(s)):`)
        for (const v of violations2) console.error(`  - ${v}`)
    }
    process.exit(1)
}

console.log('css-ownership-sweep OK:')
console.log('  Part 1: selector ownership baseline — no new shared-selector definitions beyond documented baseline.')
console.log('  Part 2: transient state ownership — no transient attrs as sole owners of broad panels without data-panel-surface.')
