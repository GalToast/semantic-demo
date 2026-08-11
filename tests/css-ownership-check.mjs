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
import { fileURLToPath } from 'node:url'

const cssDir = path.resolve(process.cwd(), 'css')

// CSS ownership model (Option C, see tmp/css-ownership-REPORT.md §3.3 + §4).
// Source of truth: tests/fixtures/css-ownership-ownership.json
// (diff-able in PRs; removed from inline JS to eliminate the "edit the test
// file" wart). To update after a CSS refactor, edit the JSON fixture in the
// same commit as the CSS change.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(__dirname, 'fixtures/css-ownership-ownership.json')
const ownershipFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const ownership = ownershipFixture.ownership

// Validate fixture shape on load (fail-fast on missing/malformed fixture)
if (!Array.isArray(ownership) || ownership.length === 0) {
    console.error(`css-ownership-check: fixture ${fixturePath} has empty or missing ownership array.`)
    process.exit(1)
}
for (const entry of ownership) {
    if (!entry.selector || !entry.ownerFile) {
        console.error(`css-ownership-check: fixture entry missing selector or ownerFile: ${JSON.stringify(entry)}`)
        process.exit(1)
    }
}

// Lookup helpers built once from `ownership` so the per-file loop is O(1)
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
    return selectorRulePreludes(cssText).filter((prelude) => {
        // Token-aware match: split by CSS combinators/whitespace so
        // `.journey-compass-action.primary` is not falsely matched by
        // `.journey-compass-action.primary-thing`.
        //
        // For class selectors we also accept compound atoms like
        // `.suggestion-btn.shake` or `.journey-compass-action.primary[attr]`
        // when looking for the base class, but only when the next character
        // after the selector is a class delimiter (`.`, `[`, `:`).
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
