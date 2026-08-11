import { describe, it, expect } from 'vitest'
import { PARITY_ATTRIBUTES, type ParityAttributeDescriptor } from '@lib/orchestration/parity-attrs.svelte'

/**
 * S3 twins-contract-coverage gap #3 (2026-08-11): the `ParityAttributeDescriptor`
 * interface + the PARITY_ATTRIBUTES manifest were unpinned — a shape change to
 * key/description/source, a dup key, or a non-string field would go silent.
 *
 * Static-only: no DOM, no store mocking. If the manifest or descriptor shape
 * drifts (the residual-window-bridge class), these tests fail loudly.
 */
describe('ParityAttributeDescriptor + PARITY_ATTRIBUTES manifest (S3 gap-test)', () => {
    it('descriptor shape: key/description/source are present and strings', () => {
        expect(PARITY_ATTRIBUTES.length).toBeGreaterThan(0)
        PARITY_ATTRIBUTES.forEach((d: ParityAttributeDescriptor, i) => {
            expect(typeof d.key, `desc[${i}].key`).toBe('string')
            expect(typeof d.description, `desc[${i}].description`).toBe('string')
            expect(typeof d.source, `desc[${i}].source`).toBe('string')
        })
    })

    it('manifest keys are unique (no duplicate data-attrs written)', () => {
        const seen = new Set<string>()
        PARITY_ATTRIBUTES.forEach((d) => {
            expect(seen.has(d.key), `duplicate manifest key: ${d.key}`).toBe(false)
            seen.add(d.key)
        })
        // Sanity: the manifest is not trivially empty.
        expect(seen.size).toBe(PARITY_ATTRIBUTES.length)
    })

    it('key is the body data-attr id without the data- prefix (camelCase contract)', () => {
        // The apply loop writes `data-${key}`; keys must be plain camelCase
        // identifiers (no data- prefix, no spaces) so the data-attr round-trip
        // is lossless.
        PARITY_ATTRIBUTES.forEach((d) => {
            expect(/^[a-zA-Z][a-zA-Z0-9]*$/.test(d.key), `key: ${d.key}`).toBe(true)
        })
    })

    it('declared descriptor interface is structurally complete (compile pin)', () => {
        // Type-level pin: if the interface loses a field, this assignment fails
        // to compile (the lane's residual-drift class caught at compile time).
        const d: ParityAttributeDescriptor = { key: 'x', description: 'd', source: 's' }
        expect(d.key).toBe('x')
        expect(d.description).toBe('d')
        expect(d.source).toBe('s')
    })
})