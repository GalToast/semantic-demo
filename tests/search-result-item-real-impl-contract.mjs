// W62-B: search-render bugsweep contract — SearchResultItem must wire real impls
// from @lib/search/result-presentation (NOT inline mock stubs), and the parent
// (SearchResultList) must thread topScore + isAnchor through the props so the
// real impls receive the rich arity-2 inputs they require.
//
// Bug surface covered (ling w62-b findings + main-lane re-verification):
//
// 1) Mock-shadow regression — `SearchResultItem.svelte` was previously inlining
//    `getSearchResultStrength: (r) => r.score || 0` and
//    `getSearchResultCardClasses: () => 'search-result'`, dropping both the
//    [14..100] strength normalization *and* the top-result / is-anchor / is-
//    secondary class discrimination. Mock-vs-real divergence was silent because
//    no contract test asserted use of real impls at runtime — the only tests
//    on these helpers (`tests/unit-active/result-renderer-pure-helpers.test.ts`)
//    exercise the real impls in isolation, never the Svelte render-path consumer.
//
//    Downstream DOM harm before this fix:
//      - Strength bar width read `style="width: ${r.score || 0}%"` — raw score
//        (often <1) instead of normalized [14, 100], producing a 1px-hair strength
//        bar on every result card (visual rank differentiation invisible).
//      - Card class string read `'search-result search-result-item'` (mock + a
//        redundant literal) — no `top-result` / `is-anchor` / `is-anchor` /
//        `is-secondary` class ever reached the DOM, leaving CSS selectors that
//        target these classes inert at runtime.
//
// 2) Redundant `' search-result-item'` literal in the `cardClasses` template —
//    produced duplicate `search-result-item` class strings when the real impl
//    (which already emits `'search-result-item'` as its first token) was plugged
//    back in. This contract verifies the redundant literal is removed as well.
//
// Purpose: text-based regression-prevention. The hook trips if a future Svelte
// refactor re-introduces mock stubs for either helper, or accidentally drops
// the prop-threading from SearchResultList, or restores the redundant literal.

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const itemPath = path.join(root, 'src/components/SearchResultItem.svelte')
const listPath = path.join(root, 'src/lib/components/search/SearchResultList.svelte')
const presPath = path.join(root, 'src/lib/search/result-presentation.ts')

const itemSrc = fs.readFileSync(itemPath, 'utf8')
const listSrc = fs.readFileSync(listPath, 'utf8')
const presSrc = fs.readFileSync(presPath, 'utf8')

// 1. Real impls ARE imported by SearchResultItem (no mock replacements).
assert(
    itemSrc.includes(
        "import { getSearchResultStrength, getSearchResultCardClasses } from '@lib/search/result-presentation';"
    ),
    'SearchResultItem.svelte must import getSearchResultStrength + getSearchResultCardClasses from @lib/search/result-presentation'
)

// 2. Mock shadow REMOVED — no inline mock definition for either helper.
assert(
    !itemSrc.includes('getSearchResultStrength: (r: SearchResult) => r.score || 0'),
    'SearchResultItem.svelte must NOT keep inline mock getSearchResultStrength (use real impl)'
)
assert(
    !itemSrc.includes("getSearchResultCardClasses: () => 'search-result'"),
    'SearchResultItem.svelte must NOT keep inline mock getSearchResultCardClasses (use real impl)'
)

// 3. Redundant literal append REMOVED — no `${deps.getSearchResultCardClasses()} search-result-item`.
assert(
    !itemSrc.includes('`${deps.getSearchResultCardClasses()} search-result-item`'),
    'SearchResultItem.svelte must NOT append redundant `search-result-item` after real getSearchResultCardClasses (which already emits it as its first token)'
)

// 4. Real impls ARE invoked with the proper arity — (result, topScore) for strength,
//    (order, isAnchor) for cardClasses. Single-arg form was the mock smell.
assert(
    itemSrc.includes('getSearchResultStrength(resultItem, topScore)'),
    'SearchResultItem.svelte must call getSearchResultStrength(result, topScore), not the mock single-arg form'
)
assert(
    itemSrc.includes('getSearchResultCardClasses(orderIdx, isAnchor)'),
    'SearchResultItem.svelte must call getSearchResultCardClasses(order, isAnchor) for real DOM-class discrimination'
)

// 5. Props interface includes topScore + isAnchor so the parent can thread them.
assert(
    itemSrc.includes('topScore: number;') || itemSrc.includes('topScore?: number;'),
    'SearchResultItem Props must declare topScore'
)
assert(
    itemSrc.includes('isAnchor: boolean;') || itemSrc.includes('isAnchor?: boolean;'),
    'SearchResultItem Props must declare isAnchor'
)
assert(
    itemSrc.includes('topScore, isAnchor, onClick') ||
        itemSrc.includes('topScore,\n      isAnchor,\n      onClick') ||
        itemSrc.includes('topScore, isAnchor'),
    'SearchResultItem destructured $props() must bind topScore + isAnchor'
)

// 6. Real impls still discriminate correctly at result-presentation.ts (i.e. the
//    code path the Svelte component now uses via the imports above).
assert(
    presSrc.includes("order === 0 ? 'top-result' : ''"),
    'result-presentation.ts getSearchResultCardClasses must still emit \"top-result\" for order === 0'
)
assert(
    presSrc.includes("isAnchor ? 'is-anchor' : 'is-secondary'"),
    'result-presentation.ts getSearchResultCardClasses must still emit "is-anchor" / "is-secondary"'
)

// 7. Strength-normalization still clamps [14, 100] — guardrail at result-presentation.ts.
assert(
    presSrc.includes('Math.max(14, Math.min(100,'),
    'result-presentation.ts getSearchResultStrength must still clamp to [14, 100]'
)

// 8. SearchResultList threads topScore + isAnchor through to <SearchResultItem>.
assert(
    listSrc.includes('topScore={renderContext.topScore ?? 0}'),
    'SearchResultList must thread topScore={renderContext.topScore ?? 0} to <SearchResultItem>'
)
assert(
    listSrc.includes('isAnchor={result.index === renderContext.anchorIndex}'),
    'SearchResultList must thread isAnchor={result.index === renderContext.anchorIndex} to <SearchResultItem>'
)
assert(
    listSrc.includes('renderContext: { trimmedQuery: string; topScore?: number; anchorIndex?: number | null };'),
    'SearchResultList Props.renderContext type must include topScore + anchorIndex fields (so prop-threading type-checks). If tuple indentation changes, update this assertion.'
)

console.log('SearchResultItem real-impl contract OK.')
