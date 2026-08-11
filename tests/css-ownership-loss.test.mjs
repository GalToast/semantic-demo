/**
 * css-ownership-loss.test.mjs
 *
 * Positive drift-catcher for the CSS ownership contract.
 *
 * The main `css-ownership-check.mjs` enforces per-file min/max ranges, but
 * it cannot catch the case where a selector disappears from *all* of its
 * declared owners (the old `if (count === 0) continue` path silently passed
 * that drift). This test asserts that every selector in the ownership table
 * appears in at least one of its declared owners.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(__dirname, 'fixtures/css-ownership-ownership.json')
const ownershipFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const ownership = ownershipFixture.ownership

const cssDir = path.resolve(process.cwd(), 'css')

function stripComments(cssText) {
    return cssText.replace(/\/\*[\s\S]*?\*\//g, '')
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

// Group ownership entries by selector
const ownershipBySelector = new Map()
for (const entry of ownership) {
    if (!ownershipBySelector.has(entry.selector)) ownershipBySelector.set(entry.selector, [])
    ownershipBySelector.get(entry.selector).push(entry.ownerFile)
}

const violations = []

for (const [selector, owners] of ownershipBySelector) {
    let totalCount = 0
    for (const ownerFile of owners) {
        const cssPath = path.join(cssDir, ownerFile)
        if (!fs.existsSync(cssPath)) {
            violations.push(`Owner file missing: ${ownerFile} for selector ${selector}`)
            continue
        }
        const content = fs.readFileSync(cssPath, 'utf8')
        totalCount += countSelectorDefinitions(content, selector)
    }
    if (totalCount === 0) {
        violations.push(
            `Selector ${selector} is not defined in any declared owner (${owners.join(', ')}); ownership table is stale.`
        )
    }
}

if (violations.length) {
    console.error('CSS ownership loss contract violations:')
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
}

console.log('CSS ownership loss contract OK: every selector appears in at least one declared owner.')
