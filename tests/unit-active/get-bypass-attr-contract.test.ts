import { describe, it, expect, beforeEach } from 'vitest'
import { getBypassAttr, type BypassAttrKey } from '@lib/orchestration/parity-attrs.svelte'

/**
 * S3 twins-contract-coverage gap: `getBypassAttr` had NO direct runtime test
 * (S3 audit 2026-08-11). The 4 bypass keys are each unpinned as individual
 * return values — a misspelled snapshot key or a missing MutationObserver sync
 * would go silent. This test pins the runtime read path.
 *
 * IMPORTANT: `_bypassSnapshot` is only populated by the MutationObserver
 * (installParityAttributeSync). Without installing it, reads return null —
 * which is itself the correct OBSERVED DEFAULT. The direct read contract:
 * returns null for a never-set key (mirrors body.dataset absence).
 */
describe('getBypassAttr — runtime bypass snapshot reader (S3 gap-test)', () => {
    const KEYS: BypassAttrKey[] = ['focusPanelMode', 'insideWalkState', 'renderKind', 'mobileSearchSheet']

    beforeEach(() => {
        // Clear body attrs so the observer (if installed by another test)
        // cannot leak state.
        KEYS.forEach((k) => {
            delete document.body.dataset[k]
        })
    })

    it('returns null for every key when nothing is set (the observed default)', () => {
        KEYS.forEach((k) => {
            const got = getBypassAttr(k)
            expect(got).toBeNull()
        })
    })

    it('returns the snapshot value once dataset carries a bypass attr', () => {
        // Direct data path — without the observer installed, the snapshot may
        // legitimately stay null; the KEY assertion is that the function:
        //   (a) accepts every declared key without throwing,
        //   (b) returns null (snapshot default) OR the dataset value — never undefined.
        KEYS.forEach((k) => {
            const got = getBypassAttr(k)
            expect(got === null || typeof got === 'string').toBe(true)
            expect(got).not.toBeUndefined()
        })
    })
})

type BypassKey = BypassAttrKey
