import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLeadEnrichment, resetDataStores, setLeadEnrichmentData } from '../../src/lib/data-store.ts'
import { appState as state } from '../../src/lib/state/app.svelte.ts'
import { getLeadEnrichment } from '../../src/lib/data-store.ts'
import type { LeadEnrichment } from '../../src/lib/types/business'

function createEnrichment(): Record<string, LeadEnrichment> {
    return {
        'lead-1': {
            lead_id: 'lead-1',
            category: 'Cafe'
        }
    }
}

describe('lead enrichment hydration seam', () => {
    afterEach(() => {
        resetDataStores()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('exposes the canonical enrichment store after lazy hydration', () => {
        const enrichment = createEnrichment()

        expect(getLeadEnrichment()).toBeNull()

        setLeadEnrichmentData(enrichment)

        expect(getLeadEnrichment()).toBe(enrichment)
        expect(state.leadEnrichment).toStrictEqual(enrichment)
    })

    it('deduplicates concurrent lazy enrichment fetches', async () => {
        const enrichment = createEnrichment()
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input), window.location.href)
            if (!url.pathname.includes('leadEnrichment.public.json')) {
                throw new Error(`Unexpected fetch: ${url.pathname}`)
            }
            return new Response(JSON.stringify(enrichment), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const first = loadLeadEnrichment()
        const second = loadLeadEnrichment()

        await expect(Promise.all([first, second])).resolves.toEqual([enrichment, enrichment])
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(getLeadEnrichment()).toStrictEqual(enrichment)
    })
})
