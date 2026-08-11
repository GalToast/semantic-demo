/**
 * css-ownership-check.mjs
 *
 * Fast structural guard for the shared-selector ownership contracts in
 * docs/css-architecture.md. This is intentionally baseline-aware: existing
 * shared selectors are allowed up to their current count, while new definitions
 * in unowned modules fail the check.
 */

import fs from 'node:fs'
import path from 'node:path'

const cssDir = path.resolve(process.cwd(), 'css')

// CSS ownership model (Option C, see tmp/css-ownership-REPORT.md §3.3 + §4).
// Each entry asserts: ownerFile must define `selector` at least `min` times
// (min: 1 = load-bearing owner that must keep owning it; min: 0 = optional
// modifier allowed but not required) and at most `max` times (omit for
// `Infinity` — only set when the historical count is high enough to warrant
// a sanity ceiling against runaway copy-paste). `note` carries any
// documented exception the original count-baseline encoded as a 0-slot.
//
// min: 1 catches the "owner stopped owning" drift the old
// `if (count === 0) continue` (tests/css-ownership-check.mjs:320 pre-redesign)
// silently passed: the previous count-baseline had stale slots (e.g.
// `.close-icon` declared owners in `controls.css` and `synthesis.css` even
// though the selector no longer exists anywhere in css/; `.btn-synthesize`
// had `search.css: 1` though the file no longer defines it). The entries
// below are rebased to the actual current state — see
// `tmp/css-ownership-impl-REPORT.md` for the audit and §5 for the rebase
// source counts. To rebase after a CSS refactor, run a probe that mirrors
// `countSelectorDefinitions` over every css/*.css and update this table
// in the same commit as the CSS change.
//
// The app shell loads the double-underscore mobile premium split directly.
// Keep this table aligned with the legacy shell (docs/archive/vector-explorer-polished-legacy.html) so the ownership
// entries describe the loaded cascade instead of the deleted collapsed file.
const ownership = [
    // .suggestion-btn
    { selector: '.suggestion-btn', ownerFile: 'animations.css', min: 1, max: 2 },
    { selector: '.suggestion-btn', ownerFile: 'controls.css', min: 1, max: 4 },
    { selector: '.suggestion-btn', ownerFile: 'search.css', min: 1, max: 4 },

    // .btn-synthesize
    { selector: '.btn-synthesize', ownerFile: 'controls.css', min: 1, max: 6 },
    { selector: '.btn-synthesize', ownerFile: 'journey_active.css', min: 1, max: 4 },
    { selector: '.btn-synthesize', ownerFile: 'mobile_base.css', min: 1, max: 2 },
    { selector: '.btn-synthesize', ownerFile: 'synthesis.css', min: 1, max: 6 },

    // .focus-stage-route
    { selector: '.focus-stage-route', ownerFile: 'journey_steps.css', min: 1, max: 20 },
    { selector: '.focus-stage-route', ownerFile: 'mobile_premium__components.css', min: 1, max: 4 },
    { selector: '.focus-stage-route', ownerFile: 'mobile_premium__state.css', min: 1, max: 2 },

    // .focus-stage-card — mobile_premium__components.css is the load-bearing
    // canonical owner (the report explicitly calls this out as MUST-own).
    { selector: '.focus-stage-card', ownerFile: 'animations.css', min: 1, max: 6 },
    { selector: '.focus-stage-card', ownerFile: 'journey_steps.css', min: 1, max: 36 },
    {
        selector: '.focus-stage-card',
        ownerFile: 'mobile_premium__components.css',
        min: 1,
        max: 62,
        note: 'load-bearing canonical owner; do not refactor away without a migration issue'
    },

    // .share-toggle
    { selector: '.share-toggle', ownerFile: 'layout_base.css', min: 1, max: 12 },
    { selector: '.share-toggle', ownerFile: 'mobile_base.css', min: 1, max: 4 },
    { selector: '.share-toggle', ownerFile: 'mobile_premium__components.css', min: 1, max: 6 },
    { selector: '.share-toggle', ownerFile: 'mobile_premium__layout.css', min: 1, max: 10 },
    { selector: '.share-toggle', ownerFile: 'progressive_disclosure.css', min: 1, max: 4 },

    // .legend-toggle
    { selector: '.legend-toggle', ownerFile: 'layout_base.css', min: 1, max: 18 },
    { selector: '.legend-toggle', ownerFile: 'mobile_premium__layout.css', min: 1, max: 8 },
    { selector: '.legend-toggle', ownerFile: 'mobile_premium__state.css', min: 1, max: 4 },

    // .search-results.active
    { selector: '.search-results.active', ownerFile: 'animations.css', min: 1, max: 2 },
    { selector: '.search-results.active', ownerFile: 'journey_active.css', min: 1, max: 2 },
    { selector: '.search-results.active', ownerFile: 'mobile_premium__layout.css', min: 1, max: 20 },
    { selector: '.search-results.active', ownerFile: 'mobile_premium__state.css', min: 1, max: 22 },
    { selector: '.search-results.active', ownerFile: 'progressive_disclosure.css', min: 1, max: 6 },
    { selector: '.search-results.active', ownerFile: 'search.css', min: 1, max: 10 },
    { selector: '.search-results.active', ownerFile: 'strands.css', min: 1, max: 2 },

    // .help-toggle
    { selector: '.help-toggle', ownerFile: 'layout_base.css', min: 1, max: 8 },
    { selector: '.help-toggle', ownerFile: 'mobile_premium__layout.css', min: 1, max: 4 },

    // .journey-compass-title
    { selector: '.journey-compass-title', ownerFile: 'journey_active.css', min: 1, max: 6 },
    { selector: '.journey-compass-title', ownerFile: 'layout_base.css', min: 1, max: 2 },
    { selector: '.journey-compass-title', ownerFile: 'mobile_premium__components.css', min: 1, max: 10 },
    { selector: '.journey-compass-title', ownerFile: 'mobile_premium__state.css', min: 1, max: 10 },
    { selector: '.journey-compass-title', ownerFile: 'strands.css', min: 1, max: 4 },

    // .journey-compass-actions
    { selector: '.journey-compass-actions', ownerFile: 'journey_active.css', min: 1, max: 6 },
    { selector: '.journey-compass-actions', ownerFile: 'mobile_premium__components.css', min: 1, max: 8 },
    { selector: '.journey-compass-actions', ownerFile: 'mobile_premium__layout.css', min: 1, max: 2 },
    { selector: '.journey-compass-actions', ownerFile: 'mobile_premium__state.css', min: 1, max: 14 },
    { selector: '.journey-compass-actions', ownerFile: 'progressive_disclosure.css', min: 1, max: 2 },
    { selector: '.journey-compass-actions', ownerFile: 'strands.css', min: 1, max: 10 },

    // .journey-compass-rail
    { selector: '.journey-compass-rail', ownerFile: 'journey_active.css', min: 1, max: 8 },
    { selector: '.journey-compass-rail', ownerFile: 'layout_base.css', min: 1, max: 2 },
    { selector: '.journey-compass-rail', ownerFile: 'mobile_premium__components.css', min: 1, max: 6 },
    { selector: '.journey-compass-rail', ownerFile: 'mobile_premium__layout.css', min: 1, max: 24 },
    { selector: '.journey-compass-rail', ownerFile: 'mobile_premium__state.css', min: 1, max: 4 },
    { selector: '.journey-compass-rail', ownerFile: 'strands.css', min: 1, max: 2 },

    // .journey-compass-action.primary
    { selector: '.journey-compass-action.primary', ownerFile: 'journey_active.css', min: 1, max: 12 },
    { selector: '.journey-compass-action.primary', ownerFile: 'mobile_premium__components.css', min: 1, max: 8 },
    { selector: '.journey-compass-action.primary', ownerFile: 'mobile_premium__layout.css', min: 1, max: 6 },
    { selector: '.journey-compass-action.primary', ownerFile: 'mobile_premium__state.css', min: 1, max: 8 },
    { selector: '.journey-compass-action.primary', ownerFile: 'strands.css', min: 1, max: 10 }
]

// Lookup helpers built once from `ownership` so the per-file loop is O(1)
// per entry. `ownershipByFile` indexes entries by ownerFile for the
// range-check pass; `allOwnedSelectors` is the set of selectors that have at
// least one declared owner (used to flag unowned definitions in non-owner
// files).
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

// Files that are temporarily grandfathered to use a legacy state pattern
// because the migration to data-panel-surface is planned for a later mobile-
// layout refactor. Do NOT add new patterns here without a matching refactor
// issue.
const mobilePremiumLegacyStatePatternExceptions = new Map([['mobile_premium__components.css', ['data-semantic-dive']]])

const globalLegacyPanelStatePatterns = ['data-graph-context', 'data-map-context', 'data-semantic-dive="active"']

const forbiddenActivitySelectors = [
    {
        pattern: /body\.is-active\b/,
        label: 'body.is-active'
    },
    {
        pattern: /body:not\(\.is-active\)/,
        label: 'body:not(.is-active)'
    }
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
    'top:',
    'left:',
    'right:',
    'bottom:',
    'width:',
    'min-width:',
    'max-width:',
    'height:',
    'min-height:',
    'max-height:',
    'display:',
    'grid-template',
    'grid-column',
    'flex:',
    'gap:',
    'padding:',
    'margin:',
    'border-radius:',
    'transform:',
    'overflow'
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
            return {
                prelude: chunk.slice(0, braceIndex).trim(),
                body: chunk.slice(braceIndex + 1).trim()
            }
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
    return selectorRulePreludes(cssText).filter((prelude) => prelude.includes(selector)).length
}

const violations = []

if (!fs.existsSync(cssDir)) {
    console.error(`CSS directory not found: ${cssDir}`)
    process.exit(1)
}

const cssFiles = fs
    .readdirSync(cssDir)
    .filter((file) => file.endsWith('.css'))
    .sort()

for (const file of cssFiles) {
    const content = fs.readFileSync(path.join(cssDir, file), 'utf8')
    const uncommentedContent = stripComments(content)
    const ruleBlocks = selectorRuleBlocks(content)

    for (const block of ruleBlocks) {
        if (!hasDeclaration(block.body)) {
            violations.push(
                `${file} has an empty/comment-only CSS rule for "${block.prelude}". Remove the dead selector or add a real declaration.`
            )
        }
    }

    if (file === 'mobile_base.css') {
        for (const block of ruleBlocks) {
            if (!block.prelude.includes('.journey-compass')) continue
            const lowerBody = block.body.toLowerCase()
            const hasLayoutProperty = mobileBaseJourneyCompassLayoutProperties.some((property) =>
                lowerBody.includes(property)
            )
            if (hasLayoutProperty) {
                violations.push(
                    'mobile_base.css defines journey-compass layout; mobile journey-compass layout belongs to css/mobile_premium.css.'
                )
            }
        }
    }

    for (const pattern of globalLegacyPanelStatePatterns) {
        if (uncommentedContent.includes(pattern)) {
            violations.push(`${file} uses legacy panel state ${pattern}; panel ownership must use data-panel-surface.`)
        }
    }

    for (const rule of forbiddenActivitySelectors) {
        if (rule.pattern.test(uncommentedContent)) {
            violations.push(`${file} uses retired activity selector ${rule.label}; use canonical surface classes.`)
        }
    }

    for (const rule of bannedSelectorImportantRules) {
        if (file !== rule.file) continue
        for (const block of ruleBlocks) {
            const matchesSelector = rule.selectorIncludes.every((fragment) => block.prelude.includes(fragment))
            if (matchesSelector && block.body.includes('!important')) {
                violations.push(`${file} uses !important in ${rule.label}; use state-scoped ownership instead.`)
            }
        }
    }

    for (const rule of forbiddenSelectorFragments) {
        if (file === rule.file && uncommentedContent.includes(rule.fragment)) {
            violations.push(`${file} reintroduced ${rule.label}; use the plain data-panel-surface owner instead.`)
        }
    }

    if (file.startsWith('mobile_premium')) {
        const fileExceptions = mobilePremiumLegacyStatePatternExceptions.get(file) || []
        for (const pattern of mobilePremiumLegacyStatePatterns) {
            if (fileExceptions.includes(pattern)) continue
            if (uncommentedContent.includes(pattern)) {
                violations.push(
                    `${file} uses legacy state selector ${pattern}; mobile premium panel ownership must use data-panel-surface.`
                )
            }
        }
    }

    for (const entry of ownership) {
        if (entry.ownerFile !== file) continue
        const count = countSelectorDefinitions(content, entry.selector)
        const noteSuffix = entry.note ? ` (${entry.note})` : ''
        if (count < entry.min) {
            // min: 0 entries are optional modifiers — silently allowed to be
            // absent. min: >= 1 catches the "owner stopped owning" drift the
            // old `if (count === 0) continue` quietly passed.
            if (entry.min > 0) {
                violations.push(
                    `${file} owns ${entry.selector} (min: ${entry.min}) but defines it ${count} time(s)${noteSuffix}; owner stopped owning.`
                )
            }
        } else if (entry.max != null && count > entry.max) {
            violations.push(
                `${file} defines ${entry.selector} ${count} time(s); ownership cap is ${entry.max}${noteSuffix}.`
            )
        }
    }
    for (const selector of allOwnedSelectors) {
        const isOwner = ownershipByFile.get(file)?.some((entry) => entry.selector === selector)
        if (isOwner) continue
        const count = countSelectorDefinitions(content, selector)
        if (count === 0) continue
        const owners = ownership.filter((entry) => entry.selector === selector).map((entry) => entry.ownerFile)
        violations.push(
            `${file} now defines ${selector} ${count} time(s), but it is not an owner (owners: ${owners.join(', ')}).`
        )
    }
}

if (violations.length) {
    console.error('CSS ownership contract violations:')
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
}

console.log('CSS ownership contract OK: no new shared-selector definitions beyond the documented baseline.')
