// W62-B search-render bugsweep journey (mock-shadow regression) — text-based
// regression-prevention, vitest-spec shape.
//
// Bug surface (ling w62-b findings + main-lane source verification):
//   - `SearchResultItem.svelte` previously had inline mock stubs for
//     `getSearchResultStrength` (`(r) => r.score || 0`) and
//     `getSearchResultCardClasses` (`() => 'search-result'`), dropping both
//     the [14..100] strength normalization *and* the top-result / is-anchor /
//     is-secondary class discrimination at runtime. Mock-vs-real divergence
//     was silent because no test asserted use of real impls at the consumer.
//   - Strength bar width rendered as `${r.score || 0}%` (often <1) instead of
//     normalized [14..100]% — visually a 1px-hair strength bar everywhere.
//   - Button class `'search-result search-result-item'` had no top-result /
//     is-anchor / is-secondary discrimination — CSS rules targeting these
//     classes were inert at runtime.
//
// Mirrors `tests/search-result-item-real-impl-contract.mjs` `node`-direct
// contract for cross-tool resilience (vitest-spec as canonical regression; the
// node-direct .mjs as parallel Playwright/contract-test style sanity check).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const itemPath = path.join(root, 'src/components/SearchResultItem.svelte');
const listPath = path.join(root, 'src/lib/components/search/SearchResultList.svelte');
const presPath = path.join(root, 'src/lib/search/result-presentation.ts');

const itemSrc = fs.readFileSync(itemPath, 'utf8');
const listSrc = fs.readFileSync(listPath, 'utf8');
const presSrc = fs.readFileSync(presPath, 'utf8');

describe('W62-B search-render bugsweep (mock-shadow regression)', () => {
  it('SearchResultItem.svelte imports real impls from @lib/search/result-presentation', () => {
    expect(itemSrc).toContain(
      "import { getSearchResultStrength, getSearchResultCardClasses } from '@lib/search/result-presentation';"
    );
  });

  it('SearchResultItem.svelte drops the inline mock getSearchResultStrength stub', () => {
    expect(itemSrc).not.toContain(
      'getSearchResultStrength: (r: SearchResult) => r.score || 0'
    );
  });

  it('SearchResultItem.svelte drops the inline mock getSearchResultCardClasses stub', () => {
    expect(itemSrc).not.toContain("getSearchResultCardClasses: () => 'search-result'");
  });

  it('SearchResultItem.svelte removes the redundant ` search-result-item` literal from cardClasses (real impl already emits it)', () => {
    expect(itemSrc).not.toContain(
      '`${deps.getSearchResultCardClasses()} search-result-item`'
    );
  });

  it('SearchResultItem.svelte invokes real getSearchResultStrength(resultItem, topScore) with arity-2', () => {
    expect(itemSrc).toContain('getSearchResultStrength(resultItem, topScore)');
  });

  it('SearchResultItem.svelte invokes real getSearchResultCardClasses(orderIdx, isAnchor) with arity-2', () => {
    expect(itemSrc).toContain('getSearchResultCardClasses(orderIdx, isAnchor)');
  });

  it('SearchResultItem Props declares topScore and isAnchor', () => {
    expect(itemSrc).toContain('topScore');
    expect(itemSrc).toContain('isAnchor');
    // Match either `topScore: number` OR `topScore?: number` (optional `?` then required `:`).
    expect(itemSrc).toMatch(/topScore\??:\s*number/);
    expect(itemSrc).toMatch(/isAnchor\??:\s*boolean/);
  });

  it('SearchResultItem $props() destructures topScore + isAnchor', () => {
    expect(itemSrc).toContain('topScore');
    expect(itemSrc).toContain('isAnchor');
    const destructuredMatch = itemSrc.match(
      /let\s*\{[^}]+\}\s*:\s*Props\s*=\s*\$props\(\)/
    );
    expect(
      destructuredMatch,
      'expected destructured $props() form to be found in SearchResultItem.svelte'
    ).toBeDefined();
    expect(destructuredMatch?.[0] ?? '').toContain('topScore');
    expect(destructuredMatch?.[0] ?? '').toContain('isAnchor');
  });

  it('result-presentation.ts preserves top-result/is-anchor/is-secondary discrimination + [14,100] strength clamp', () => {
    expect(presSrc).toContain("order === 0 ? 'top-result' : ''");
    expect(presSrc).toContain("isAnchor ? 'is-anchor' : 'is-secondary'");
    expect(presSrc).toContain('Math.max(14, Math.min(100,');
  });

  it('SearchResultList threads topScore + isAnchor to <SearchResultItem>', () => {
    expect(listSrc).toContain('topScore={renderContext.topScore ?? 0}');
    expect(listSrc).toContain('isAnchor={result.index === renderContext.anchorIndex}');
    expect(listSrc).toContain(
      'renderContext: { trimmedQuery: string; topScore?: number; anchorIndex?: number | null };'
    );
  });
});
