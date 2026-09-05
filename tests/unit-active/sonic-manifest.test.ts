/**
 * Unit tests for sonic-manifest v2: parsing, variant determinism, back-compat.
 * Pure-function coverage — no DOM/WebGL needed.
 */
import { describe, it, expect } from 'vitest'
import { parseManifest, pickVariantForNode, hashString } from '../../src/lib/sonic/sonic-manifest'

const V2 = {
    version: 2,
    clusters: {
        'Food & Hospitality': {
            prompt: 'warm acoustic guitar campfire',
            variants: [
                {
                    id: 'food-s7',
                    file: 'sonic/clips/food-s7.wav',
                    seed: 7,
                    seconds: 8,
                    ear: { score: 100, grade: 'S', motif: 0.15, beat: 0.36 }
                },
                {
                    id: 'food-s13',
                    file: 'sonic/clips/food-s13.wav',
                    seed: 13,
                    seconds: 8,
                    ear: { score: 95, grade: 'S', motif: 0.2, beat: 0.4 }
                },
                {
                    id: 'food-s21',
                    file: 'sonic/clips/food-s21.wav',
                    seed: 21,
                    seconds: 8,
                    ear: { score: 98, grade: 'S', motif: 0.18, beat: 0.5 }
                }
            ]
        }
    }
}

describe('sonic-manifest parseManifest', () => {
    it('rejects non-object and empty payloads', () => {
        expect(parseManifest(null)).toBeNull()
        expect(parseManifest({})).toBeNull()
        expect(parseManifest({ version: 2 })).toBeNull()
    })

    it('parses v2 clusters with variants ranked best-first', () => {
        const m = parseManifest(V2)
        expect(m).not.toBeNull()
        expect(m!.clusters['Food & Hospitality'].variants).toHaveLength(3)
        expect(m!.clusterMap['Food & Hospitality'].id).toBe('food-s7')
        expect(m!.defaultClip?.id).toBe('food-s7')
    })

    it('parses v1 flat manifests through the back-compat view', () => {
        const m = parseManifest({
            version: 1,
            defaultClip: 'food',
            clips: [{ id: 'food', file: 'sonic/clips/food.wav', seed: 7, seconds: 8, ear: { score: 100, grade: 'S' } }],
            clusterMap: { 'Food & Hospitality': 'food' }
        })
        expect(m).not.toBeNull()
        expect(m!.clusterMap['Food & Hospitality']?.id).toBe('food')
        expect(m!.defaultClip?.id).toBe('food')
    })
})

describe('pickVariantForNode determinism', () => {
    const m = parseManifest(V2)!
    it('assigns the same variant for the same leadId', () => {
        const a = pickVariantForNode(m, 'Food & Hospitality', '6218')
        const b = pickVariantForNode(m, 'Food & Hospitality', '6218')
        expect(a?.id).toBe(b?.id)
    })
    it('spreads distinct leadIds across variants (more than one variant used)', () => {
        const used = new Set<string>()
        for (let i = 0; i < 60; i++) {
            const v = pickVariantForNode(m, 'Food & Hospitality', `lead-${i}`)
            if (v) used.add(v.id)
        }
        expect(used.size).toBeGreaterThan(1)
    })
    it('falls back to default when cluster is unknown', () => {
        const v = pickVariantForNode(m, 'Nonexistent Cluster', '6218')
        expect(v?.id).toBe('food-s7') // default = first cluster's best
    })
})

describe('hashString', () => {
    it('is stable across calls and differs across inputs', () => {
        expect(hashString('6218')).toBe(hashString('6218'))
        expect(hashString('6218')).not.toBe(hashString('6219'))
    })
})
