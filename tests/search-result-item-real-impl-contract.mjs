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
    itemSrc.includes('getSearchResultStrength(presentationResult, topScore)') ||
        itemSrc.includes('getSearchResultStrength(resultItem, topScore)'),
    'SearchResultItem.svelte must call getSearchResultStrength(result, topScore), not the mock single-arg form'
)
assert(
    itemSrc.includes('getSearchResultCardClasses(orderIdx, isAnchor)') ||
        itemSrc.includes('getSearchResultCardClasses(order, isAnchor)'),
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

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME BEHAVIORAL TESTS (Wave 7a P3 hardening)
// ═══════════════════════════════════════════════════════════════════════════

// These runtime tests import the real pure functions from result-presentation.ts
// and verify their behavioral contracts (not just source strings).
// The functions are deterministic: same input → same output, no DOM, no state.

const rt = { passed: 0, failed: 0, failures: [] }
function rtPass(name) { rt.passed++; console.log(`  PASS  runtime  ${name}`) }
function rtFail(name, msg) { rt.failed++; rt.failures.push({ name, msg }); console.error(`  FAIL  runtime  ${name} — ${msg}`) }

const presMod = await import('../src/lib/search/result-presentation.ts')

// R1: getSearchResultStrength — null result returns floor (14)
{
  const val = presMod.getSearchResultStrength(null, 100)
  if (val === 14) rtPass('R1:getSearchResultStrength null-guard returns 14')
  else rtFail('R1:getSearchResultStrength null-guard', `expected 14, got ${val}`)
}

// R2: getSearchResultStrength — normalizes score relative to topScore [14,100]
{
  const result = { id: 'x', name: 'Test', index: 0, score: 0.75, category: '', snippet: '' }
  const val = presMod.getSearchResultStrength(result, 1.0)
  if (val === 75) rtPass('R2:getSearchResultStrength normalizes 0.75/1.0 → 75')
  else rtFail('R2:getSearchResultStrength normalization', `expected 75, got ${val}`)
}

// R3: getSearchResultStrength — clamps at floor 14 even for very weak matches
{
  const result = { id: 'x', name: 'Test', index: 0, score: 0.01, category: '', snippet: '' }
  const val = presMod.getSearchResultStrength(result, 100)
  if (val === 14) rtPass('R3:getSearchResultStrength clamps floor at 14')
  else rtFail('R3:getSearchResultStrength floor clamp', `expected 14, got ${val}`)
}

// R4: getSearchResultStrength — clamps at ceiling 100
{
  const result = { id: 'x', name: 'Test', index: 0, score: 999, category: '', snippet: '' }
  const val = presMod.getSearchResultStrength(result, 1.0)
  if (val === 100) rtPass('R4:getSearchResultStrength clamps ceiling at 100')
  else rtFail('R4:getSearchResultStrength ceiling clamp', `expected 100, got ${val}`)
}

// R5: getSearchResultStrength — non-finite topScore returns 14
{
  const result = { id: 'x', name: 'Test', index: 0, score: 50, category: '', snippet: '' }
  const val = presMod.getSearchResultStrength(result, NaN)
  if (val === 14) rtPass('R5:getSearchResultStrength NaN topScore → 14')
  else rtFail('R5:getSearchResultStrength NaN guard', `expected 14, got ${val}`)
}

// R6: getSearchResultCardClasses — anchor result (order 0, isAnchor true)
{
  const cls = presMod.getSearchResultCardClasses(0, true)
  if (cls === 'search-result-item top-result is-anchor') rtPass('R6:getSearchResultCardClasses anchor (order=0,isAnchor=true)')
  else rtFail('R6:getSearchResultCardClasses anchor', `got "${cls}"`)
}

// R7: getSearchResultCardClasses — secondary result (order 1, isAnchor false)
{
  const cls = presMod.getSearchResultCardClasses(1, false)
  if (cls === 'search-result-item is-secondary') rtPass('R7:getSearchResultCardClasses secondary (order=1,isAnchor=false)')
  else rtFail('R7:getSearchResultCardClasses secondary', `got "${cls}"`)
}

// R8: getSearchResultCardClasses — top result non-anchor (order 0, isAnchor false)
{
  const cls = presMod.getSearchResultCardClasses(0, false)
  if (cls === 'search-result-item top-result is-secondary') rtPass('R8:getSearchResultCardClasses top non-anchor (order=0,isAnchor=false)')
  else rtFail('R8:getSearchResultCardClasses top non-anchor', `got "${cls}"`)
}

// R9: getSearchResultStrengthLabel — label vocabulary
{
  const l0 = presMod.getSearchResultStrengthLabel(0, 50)   // order 0 always 'Best match'
  const l1 = presMod.getSearchResultStrengthLabel(1, 95)   // ≥90 → 'Strong match'
  const l2 = presMod.getSearchResultStrengthLabel(2, 80)   // ≥75 → 'Good match'
  const l3 = presMod.getSearchResultStrengthLabel(3, 60)   // ≥50 → 'Related'
  const l4 = presMod.getSearchResultStrengthLabel(4, 30)   // <50 → 'Broader match'
  if (l0 === 'Best match' && l1 === 'Strong match' && l2 === 'Good match' && l3 === 'Related' && l4 === 'Broader match')
    rtPass('R9:getSearchResultStrengthLabel vocabulary correct')
  else rtFail('R9:getSearchResultStrengthLabel vocabulary', `got "${l0}"|"${l1}"|"${l2}"|"${l3}"|"${l4}"`)
}

// R10: buildSearchResultSnippet — returns string (not null/undefined)
{
  const result = { id: 'x', name: 'Test', index: 0, score: 1, category: '', snippet: '' }
  const snippet = presMod.buildSearchResultSnippet(result)
  if (typeof snippet === 'string' && snippet.length > 0)
    rtPass('R10:buildSearchResultSnippet returns non-empty string')
  else rtFail('R10:buildSearchResultSnippet', `got ${typeof snippet}: "${snippet}"`)
}

console.log(`\nruntime results: ${rt.passed}/${rt.passed + rt.failed} passed`)
if (rt.failed > 0) {
  console.error(`${rt.failed} runtime test(s) FAILED`)
  process.exit(1)
}
console.log('All runtime behavioral tests passed.')
