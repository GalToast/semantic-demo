/**
 * Regression test: semantic-threads `?? ''` mask on a neighbor leadId.
 *
 * `normalizeLeadId` returns `string | null`. The old code coerced a missing
 * neighbor leadId to the empty string (`?? ''`), which made a neighbor appear
 * to belong to `leadId: ''`. The fix preserves `null`.
 *
 * This test guards the fix at the source level (the normalizer is private):
 *  - semantic-threads.ts must no longer mask the neighbor leadId with `?? ''`
 *  - SemanticNeighborDetail.leadId must be `string | null` (business.ts)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

describe('t1 semantic-threads neighbor leadId null (no empty-string mask)', () => {
    it("semantic-threads.ts no longer masks neighbor leadId with ?? ''", () => {
        // The normalizer moved to semantic-threads-normalize.ts (carve e352336a);
        // the hub re-exports the cached wrapper but the expression lives in the module.
        const src = read('../../src/lib/engine/semantic-threads-normalize.ts')
        const match = src.match(/leadId:\s*_?normalizeLeadId\([^)]*\)\s*\?\?\s*(''|null)/)
        expect(match, 'expected `leadId: normalizeLeadId(...) ?? null`').not.toBeNull()
        expect(match?.[1]).toBe('null')
    })

    it('SemanticNeighborDetail.leadId is string | null (business.ts)', () => {
        const src = read('../../src/lib/types/business.ts')
        const block = src.slice(src.indexOf('export interface SemanticNeighborDetail'))
        const leadLine = block.split('\n').find((l) => l.includes('leadId:'))
        expect(leadLine, 'SemanticNeighborDetail.leadId not found').toBeDefined()
        expect(leadLine).toMatch(/leadId:\s*string\s*\|\s*null/)
    })
})
