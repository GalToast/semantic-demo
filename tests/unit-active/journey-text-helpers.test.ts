import { describe, it, expect } from 'vitest'
import { truncateMicrocopy } from '@lib/journey/text-helpers'

describe('truncateMicrocopy', () => {
    it('returns empty string for null/undefined/empty', () => {
        expect(truncateMicrocopy(null)).toBe('')
        expect(truncateMicrocopy(undefined)).toBe('')
        expect(truncateMicrocopy('   ')).toBe('')
    })

    it('returns the string unchanged when within the max', () => {
        expect(truncateMicrocopy('short', 100)).toBe('short')
        expect(truncateMicrocopy('exactlyten', 10)).toBe('exactlyten')
    })

    it('truncates with ellipsis when exceeding the max', () => {
        expect(truncateMicrocopy('hello world', 5)).toBe('hello…')
        expect(truncateMicrocopy('a'.repeat(100), 74)).toBe('a'.repeat(74) + '…')
    })

    it('uses default max of 74', () => {
        expect(truncateMicrocopy('a'.repeat(74))).toBe('a'.repeat(74))
        expect(truncateMicrocopy('a'.repeat(75))).toBe('a'.repeat(74) + '…')
    })
})
