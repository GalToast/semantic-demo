import { describe, it, expect } from 'vitest'
import { parseManifest } from '../../src/lib/sonic/sonic-manifest'

const MISORDERED = {
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
                    ear: { score: 84, grade: 'S', motif: 0.15, beat: 0.36 }
                },
                {
                    id: 'food-z12',
                    file: 'sonic/clips/food-z12.wav',
                    seed: 7,
                    seconds: 8,
                    ear: { score: 100, grade: 'S', motif: 0.102, beat: 0.476 }
                },
                {
                    id: 'food-s13',
                    file: 'sonic/clips/food-s13.wav',
                    seed: 13,
                    seconds: 8,
                    ear: { score: 73, grade: 'S', motif: 0.09, beat: 0.31 }
                }
            ]
        }
    }
}

describe('parseManifest guards the variants[0] default', () => {
    it('picks the highest-scoring variant as default even when the file is misordered', () => {
        const m = parseManifest(MISORDERED)
        expect(m).not.toBeNull()
        expect(m!.clusterMap['Food & Hospitality']?.id).toBe('food-z12')
    })

    it('does not mutate the caller input array order', () => {
        const input = JSON.parse(JSON.stringify(MISORDERED))
        const before = input.clusters['Food & Hospitality'].variants.map(function (v) {
            return v.id
        })
        parseManifest(input)
        const after = input.clusters['Food & Hospitality'].variants.map(function (v) {
            return v.id
        })
        expect(after).toEqual(before)
    })

    it('prefers Z12 (pure-prior) on a score tie', () => {
        const tied = {
            version: 2,
            clusters: {
                Tie: {
                    prompt: 'p',
                    variants: [
                        {
                            id: 'tie-s7',
                            file: 'a.wav',
                            seed: 7,
                            seconds: 8,
                            ear: { score: 100, grade: 'S', motif: 0.2, beat: 0.5 }
                        },
                        {
                            id: 'tie-z12',
                            file: 'b.wav',
                            seed: 7,
                            seconds: 8,
                            ear: { score: 100, grade: 'S', motif: 0.1, beat: 0.6 }
                        }
                    ]
                }
            }
        }
        const m = parseManifest(tied)
        expect(m).not.toBeNull()
        expect(m!.clusterMap['Tie']?.id).toBe('tie-z12')
    })

    it('falls back to beat, then motif, then seed on a full tie', () => {
        const fullTie = {
            version: 2,
            clusters: {
                Tie: {
                    prompt: 'p',
                    variants: [
                        {
                            id: 'a-s13',
                            file: 'a.wav',
                            seed: 13,
                            seconds: 8,
                            ear: { score: 100, grade: 'S', motif: 0.3, beat: 0.4 }
                        },
                        {
                            id: 'b-s7',
                            file: 'b.wav',
                            seed: 7,
                            seconds: 8,
                            ear: { score: 100, grade: 'S', motif: 0.3, beat: 0.4 }
                        }
                    ]
                }
            }
        }
        const m = parseManifest(fullTie)
        expect(m).not.toBeNull()
        expect(m!.clusterMap['Tie']?.id).toBe('b-s7')
    })
})
