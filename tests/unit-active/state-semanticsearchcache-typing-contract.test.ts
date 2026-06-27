/**
 * @file state-semanticsearchcache-typing-contract.test.ts
 *
 * Lock-in test for the engine-boundary refactor Phase 2-4: semanticSearchResultCache
 * field tightening. Ensures the appState.semanticSearchResultCache field is typed
 * `Map<string, CacheEntry>` (not `Map<string, unknown>`), and that consumers no
 * longer use `(state.semanticSearchResultCache as unknown as Map<string, CacheEntry>)`
 * escape hatches.
 *
 * CacheEntry already exists in src/lib/search/cache.ts with .storedAt,
 * .lastAccessedAt, .payload fields. Phase 2-4 re-exports it from state-types.ts
 * so appState can declare the field's value type.
 *
 * Run: npx vitest run tests/unit-active/state-semanticsearchcache-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('engine-boundary refactor / Phase 2-4 / semanticSearchResultCache field typing', () => {
    it('appState declares semanticSearchResultCache with Map<string, CacheEntry>', () => {
        const appState = readSource('src/lib/state/app.svelte.ts')
        const declMatch = appState.match(/semanticSearchResultCache\s*=\s*\$state<Map<string,\s*CacheEntry>>\(/)
        expect(declMatch, 'appState.semanticSearchResultCache declaration not found (pattern: $state<Map<string, CacheEntry>>)').not.toBeNull()
        // Verify it doesn't match the loose-type pattern
        const looseMatch = appState.match(/semanticSearchResultCache\s*=\s*\$state<Map<string,\s*unknown>>\(/)
        expect(looseMatch, 'appState.semanticSearchResultCache is still typed Map<string, unknown>').toBeNull()
    })

    it('state-types.ts re-exports CacheEntry from search/cache', () => {
        const stateTypes = readSource('src/lib/state/state-types.ts')
        expect(stateTypes).toMatch(/export\s+type\s*\{[^}]*\bCacheEntry\b[^}]*\}\s+from\s+['"][^'"]*search\/cache['"]/)
    })

    it('CacheEntry interface has expected fields', () => {
        const cache = readSource('src/lib/search/cache.ts')
        expect(cache).toMatch(/export\s+interface\s+CacheEntry\b/)
        expect(cache).toMatch(/interface\s+CacheEntry\s*\{[\s\S]*storedAt\s*:\s*number/)
        expect(cache).toMatch(/interface\s+CacheEntry\s*\{[\s\S]*lastAccessedAt\s*:\s*number/)
        expect(cache).toMatch(/interface\s+CacheEntry\s*\{[\s\S]*payload\s*:\s*SearchPayload/)
    })

    it('cache.ts drops all (state.semanticSearchResultCache as unknown as Map<string, CacheEntry>) escape hatches', () => {
        const cache = readSource('src/lib/search/cache.ts')
        // The triple-cast pattern must be gone (we tightened it across all sites)
        expect(cache).not.toMatch(/state\.semanticSearchResultCache\s+as\s+unknown\s+as\s+Map<string,\s*CacheEntry>/)
        expect(cache).not.toMatch(/appState\s+as\s+unknown\s+as\s+SemanticState/)
        // Direct typed access via appState.semanticSearchResultCache must be present
        expect(cache).toMatch(/appState\.semanticSearchResultCache/)
    })

    it('cache.ts initSearchCache() still initializes Map<string, CacheEntry>', () => {
        const cache = readSource('src/lib/search/cache.ts')
        expect(cache).toMatch(/appState\.semanticSearchResultCache\s*=\s*new\s+Map<string,\s*CacheEntry>\(\)/)
    })
})