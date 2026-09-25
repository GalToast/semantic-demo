import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSearchCache } from '../../src/lib/search-cache'
import { performSearch } from '../../src/lib/search-engine'

describe('search-engine pagination', () => {
  beforeEach(() => {
    clearSearchCache()
    window.history.pushState({}, '', '/?staticDev=0')
  })

  afterEach(() => {
    clearSearchCache()
    vi.restoreAllMocks()
  })

  it('derives the API offset from the page when no explicit offset is supplied', async () => {
    const seenOffsets: number[] = []

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.href)
      const offset = Number(url.searchParams.get('offset'))
      seenOffsets.push(offset)

      return new Response(JSON.stringify({
        ok: true,
        results: [{
          lead_id: `row-${offset}`,
          name: `Result ${offset}`,
          score: 0.9,
          category: 'Test',
          public_note: `Offset ${offset}`
        }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }))

    const signal = new AbortController().signal

    const firstPage = await performSearch('coffee', signal, 0)
    const secondPage = await performSearch('coffee', signal, 1)

    expect(seenOffsets).toEqual([0, 18])
    expect(firstPage.map((result) => result.id)).toEqual(['row-0'])
    expect(secondPage.map((result) => result.id)).toEqual(['row-18'])
  })
})
