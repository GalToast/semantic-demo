/**
 *
 *
 * Connection Report / Semantic Threads Detail
 * Fetches and renders the full Semantic Connection Path report for a trail
 * or focused node. Triggered by the Full report button in the summary
 * suggestions row.
 *
 * Canonical TS module — preserves export/import parity with the prior
 * connection-analysis.js twin.
 */

import { appState } from '@lib/state/app.svelte'
import { apiUrl } from '@lib/utils/api-url'
import { buildSemanticGuidePayloadResult, buildSemanticGuideRequestPayload } from './semantic-guide-payload'

// ── Local boundary types ────────────────────────────────────────────────────

/** Shape of a single result entry in the semantic guide payload. */
interface SemanticGuideResult {
    lead_id: string | number
    name: string
    city?: string
    cluster_label?: string
    status?: string
    public_note?: string
    public_detail?: string
    address?: string
    naics?: string
    [key: string]: unknown
}

/** Shape of the semantic guide request payload sent to the API. */
interface SemanticGuidePayload {
    query?: string
    view?: string
    anchor_lead_id?: string | number | null
    anchor_name?: string
    visible_matches?: number
    results: SemanticGuideResult[]
    [key: string]: unknown
}

/** Shape of the API response for the semantic trail story endpoint. */
interface TrailStoryResponse {
    ok?: boolean
    error?: string
    mode?: string
    story?: string
    source?: string
    cache_age_seconds?: number
    [key: string]: unknown
}

// ── Module-scoped mutable state ─────────────────────────────────────────────

let semanticThreadsDetailController: AbortController | null = null

function setStoryLoading(): void {
    appState.semanticGuideState.showStory = true
    appState.semanticGuideState.storyText = 'Loading the full connection report...'
    appState.semanticGuideState.storySource = ''
    appState.semanticGuideState.isSynthesizing = true
}

function clearStoryLoading(): void {
    appState.semanticGuideState.isSynthesizing = false
}

function _hideStory(): void {
    appState.semanticGuideState.showStory = false
}

function setStoryText(text: string, source: string): void {
    appState.semanticGuideState.storyText = text
    appState.semanticGuideState.storySource = source
}

// ── Public API (export parity with connection-analysis.js) ──────────────────

/**
 * Fetches and renders the full Semantic Connection Path report for a trail or focused node.
 * Triggered by the Full report button in the summary suggestions row.
 */
export function showSemanticThreadsDetail(): Promise<void> {
    async function inner(): Promise<void> {
        let payload: SemanticGuidePayload | null = buildSemanticGuideRequestPayload() as SemanticGuidePayload | null
        if (!payload || !payload.results?.length) {
            const focusedIdx = appState.focusedNode
            const points = appState.points
            if (!Number.isFinite(focusedIdx) || !points?.[focusedIdx as number]) {
                const config = { ...appState.semanticGuideState.config }
                config.text = 'Select a business first to load its full connection report.'
                appState.semanticGuideState.config = config
                // P1: the early return must not leave a stale essay (or spinner)
                // from a previous report visible — tear the story state down
                // consistently with setStoryLoading()/clearStoryLoading() on the
                // normal path.
                _hideStory()
                clearStoryLoading()
                return
            }
            const focusedResult = buildSemanticGuidePayloadResult(focusedIdx as number)
            if (!focusedResult) {
                const config = { ...appState.semanticGuideState.config }
                config.text = 'Select a business first to load its full connection report.'
                appState.semanticGuideState.config = config
                _hideStory()
                clearStoryLoading()
                return
            }
            payload = payload || { results: [] }
            payload.results = [focusedResult as SemanticGuideResult]
            payload.query = 'connection report'
            payload.anchor_lead_id = focusedResult.lead_id
            payload.anchor_name = focusedResult.name
        }

        if (semanticThreadsDetailController) {
            semanticThreadsDetailController.abort()
        }
        const controller = new AbortController()
        semanticThreadsDetailController = controller

        setStoryLoading()

        try {
            const response = await fetch(apiUrl('api.php?action=semantic_trail_story'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                cache: 'no-store',
                body: JSON.stringify(payload),
                signal: controller.signal
            })

            let result: TrailStoryResponse | null = null
            try {
                result = (await response.json()) as TrailStoryResponse
            } catch (jsonErr: unknown) {
                Object.defineProperty(jsonErr, 'correlationId', {
                    value: crypto.randomUUID(),
                    writable: false,
                    configurable: true
                })
                throw new Error('Connection report returned invalid JSON.', { cause: jsonErr })
            }

            if (!response.ok || !result?.ok) {
                const err = new Error(result?.error || 'Connection report is unavailable right now.')
                Object.defineProperty(err, 'correlationId', {
                    value: crypto.randomUUID(),
                    writable: false,
                    configurable: true
                })
                throw err
            }

            const cachedStoryMode = result?.mode === 'cached_trail_story' || result?.mode === 'cached_gemma_story'
            const story = cachedStoryMode ? result.story : ''
            if (story) {
                const src = result.source || 'semantic-guide-engine'
                const age = result.cache_age_seconds
                if (age !== null && age !== undefined) {
                    const mins = Math.round(age / 60)
                    if (mins < 60) {
                        setStoryText(story, `${src} cached ${mins}m ago`)
                    } else {
                        setStoryText(story, `${src} cached ${Math.round(mins / 60)}h ago`)
                    }
                } else {
                    setStoryText(story, src)
                }
            } else {
                setStoryText('The connection report is still being prepared. Try again in a moment.', '')
            }
        } catch (err: unknown) {
            if ((err as Error).name === 'AbortError') return
            setStoryText('Connection report unavailable: ' + (err as Error).message, 'Connection report unavailable')
        } finally {
            if (semanticThreadsDetailController === controller) {
                semanticThreadsDetailController = null
            }
            clearStoryLoading()
        }
    }

    return inner()
}
