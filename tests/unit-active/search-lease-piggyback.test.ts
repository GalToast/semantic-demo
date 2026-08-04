import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { isSearchInFlight, resetSearchAbort, startSearch } from '@lib/search/search-abort'

describe('search lease piggyback lifecycle', () => {
    beforeEach(() => {
        resetSearchAbort()
    })

    it('keeps a newer query owned when an older lease settles late', () => {
        const older = startSearch('coffee')
        const newer = startSearch('tea')

        older.release()

        expect(newer.signal.aborted).toBe(false)
        expect(isSearchInFlight('tea')).toBe(true)

        newer.release()
        expect(isSearchInFlight()).toBe(false)
    })

    it('lets URL-style piggyback leases observe without releasing the owner', () => {
        const owner = startSearch('coffee')
        const piggyback = startSearch('coffee')

        expect(piggyback.isNew).toBe(false)
        piggyback.release()
        expect(isSearchInFlight('coffee')).toBe(true)

        owner.release()
        expect(isSearchInFlight()).toBe(false)
    })

    it('creates a fresh same-query lease after the previous owner releases', () => {
        const first = startSearch('coffee')
        first.release()

        const second = startSearch('coffee')

        expect(second.isNew).toBe(true)
        expect(second.signal).not.toBe(first.signal)
        expect(second.signal.aborted).toBe(false)
    })

    it('keeps URL restoration on the piggyback wait path', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/lib/orchestration/url-state.ts'), 'utf8')

        expect(source).toMatch(/const \{ isNew, release \} = startSearch\(query\)/)
        expect(source).toMatch(/if \(isNew\) \{[\s\S]*?runSearch\(query, searchSignal\)/)
        expect(source).toMatch(/else \{[\s\S]*?waitForSearchSettle\(searchStore\)/)
        expect(source).toMatch(/releaseSearch\(\)/)
    })
})
