/**
 * @lib/journey/semantic-guide.ts — Semantic guide summary card and request lifecycle
 *
 * Ported from: (302 lines, 6 exports)
 *
 * Exports:
 *   - semanticGuideIcon(id, label?)          — SVG icon helper
 *   - setSemanticGuideButtonState(mode, opts?) — button mode/state setter
 *   - getSemanticGuideTitle(guide?)           — title string from guide config
 *   - showSummaryCard(config?)                — show the summary card
 *   - hideSummaryCard()                       — hide the summary card
 *   - requestSemanticGuide()                  — async request + render cycle
 *
 * Dependencies still in legacy path (will migrate later):
 *   - @lib/state/app.svelte (canonical AppState)
 * - ../../../ (buildSemanticGuideRequestPayload)
 * - ../../../ (updateLegendGuideState)
 * - ../../../ (showSemanticThreadsDetail)
 * - ../../../ (semanticGuideStateStore)
 */

import { appState } from '@lib/state/app.svelte'
import { escapeHtml } from '@lib/utils/dom-formatters'
import { buildSemanticGuideRequestPayload, type SemanticGuideRequestPayload } from '@lib/journey/semantic-guide-payload'
import { updateLegendGuideState } from '@lib/stores/legend-panel.svelte.ts'
import { showSemanticThreadsDetail } from '@lib/journey/connection-analysis'

// ── Types ────────────────────────────────────────────────────────────────────

interface SemanticGuideSuggestion {
    lead_id?: string | number | null
    label?: string
    name?: string
    city?: string
    reason?: string
    [key: string]: unknown
}

interface GuideConfig {
    title?: string
    text?: string
    summary?: string
    degraded?: boolean
    cached?: boolean
    suggestions?: SemanticGuideSuggestion[]
    laneStatus?: string
    instant?: boolean
    [key: string]: unknown
}

interface SemanticGuidePayloadRow {
    lead_id?: string | number | null
    cluster_label?: string
    city?: string
    name?: string
    [key: string]: unknown
}

interface SemanticGuidePayload {
    query?: string
    visible_matches?: number
    anchor_lead_id?: string | number | null
    results?: SemanticGuidePayloadRow[]
}

function getMostFrequent(values: Array<string | undefined | null>): string | null {
    if (!values?.length) return null
    const counts: Record<string, number> = values.reduce(
        (acc: Record<string, number>, value: string | undefined | null) => {
            if (!value) return acc
            acc[value] = (acc[value] || 0) + 1
            return acc
        },
        {}
    )
    return Object.keys(counts).reduce((a, b) => ((counts[a] ?? 0) > (counts[b] ?? 0) ? a : b))
}

function generateLogicalSynthesis(payload: SemanticGuidePayload): string {
    const results = Array.isArray(payload?.results) ? payload.results : []
    if (!results.length) return 'Search opens a trail — explore the neighborhood below.'

    const query = payload.query || 'this search'
    const clusters = results.map((row: SemanticGuidePayloadRow) => row.cluster_label).filter(Boolean)
    const cities = [...new Set(results.map((row: SemanticGuidePayloadRow) => row.city).filter(Boolean))]
    const topCluster = clusters.length ? getMostFrequent(clusters) : 'mixed themes'
    const citySummary =
        cities.length > 1
            ? `${cities.length} cities including ${cities.slice(0, 2).join(' and ')}`
            : cities[0] || 'Montgomery County'

    return `Logical mapping of ${payload.visible_matches || results.length} matches for "${query}". Strongest thematic overlap in ${topCluster} with signal across ${citySummary}. Trail anchored by ${results[0]?.name || 'the primary match'}.`
}

function buildClientSemanticGuideFallback(payload: SemanticGuidePayload): GuideConfig {
    const results = Array.isArray(payload?.results) ? payload.results : []
    const anchor =
        results.find((row: SemanticGuidePayloadRow) => String(row.lead_id) === String(payload?.anchor_lead_id)) ||
        results[0] ||
        null
    const suggestions = results.slice(0, 3).map(
        (row: SemanticGuidePayloadRow, index: number): SemanticGuideSuggestion => ({
            lead_id: row.lead_id,
            label: index === 0 ? 'Trail anchor' : index === 1 ? 'Next stop' : 'Side trail',
            name: row.name,
            city: row.city || '',
            reason:
                index === 0
                    ? 'Start with the strongest semantic anchor.'
                    : row.cluster_label
                      ? `Follow the ${row.cluster_label} trail.`
                      : 'Keep exploring the current semantic neighborhood.'
        })
    )

    return {
        title: anchor?.name ? `${anchor.name} anchors this trail` : `Guide for "${payload?.query || 'this trail'}"`,
        summary: generateLogicalSynthesis(payload),
        suggestions,
        degraded: true,
        cached: false,
        source: 'deterministic',
        mode: 'fallback'
    }
}

export function semanticGuideIcon(id: string, label = ''): string {
    if (!id) return ''
    return `<svg class="ui-icon" aria-hidden="${label ? 'false' : 'true'}"${label ? ` aria-label="${escapeHtml(label)}"` : ''}><use href="#icon-${escapeHtml(id)}"></use></svg>`
}

export function setSemanticGuideButtonState(mode = 'ready', options: Record<string, unknown> = {}): void {
    appState.semanticGuideState.buttonMode = mode
    appState.semanticGuideState.buttonOptions = options
}

function getSemanticGuideLoadingCardConfig(): GuideConfig {
    return {
        title: 'READING CONNECTIONS',
        text: 'The semantic guide is reading this neighborhood and preparing the next three strongest stops.',
        suggestions: [],
        laneStatus: 'Preparing trail',
        instant: true
    }
}

export function getSemanticGuideTitle(guide: GuideConfig = {}): string {
    if (guide.title) return String(guide.title).toUpperCase()
    if (guide.degraded) return 'FAST FALLBACK'
    if (guide.cached) return 'SAVED SUMMARY'
    return 'SEARCH SUMMARY'
}

function getSemanticGuideLaneStatus(guide: GuideConfig = {}): string {
    if (guide.degraded) return 'Quick summary ready'
    return guide.cached ? 'Saved summary' : 'Fresh summary'
}

function buildSemanticGuideCardConfig(guide: GuideConfig = {}): GuideConfig {
    return {
        title: getSemanticGuideTitle(guide),
        text: guide.summary || 'The current neighborhood is ready.',
        suggestions: guide.suggestions || [],
        laneStatus: getSemanticGuideLaneStatus(guide)
    }
}

function buildSemanticGuideFallbackCardConfig(fallback: GuideConfig = {}): GuideConfig {
    return {
        title: (fallback.title || 'FAST FALLBACK').toUpperCase(),
        text: fallback.summary || 'Search opens a trail — explore the neighborhood below.',
        suggestions: fallback.suggestions || [],
        laneStatus: 'Deterministic fallback active',
        instant: true
    }
}

function normalizeSummaryCardConfig(config: GuideConfig | string = {}): GuideConfig {
    const settings = typeof config === 'string' ? { text: config } : config || {}
    return {
        ...settings,
        text: String(settings.text || ''),
        title: String(settings.title || 'Search').trim() || 'Search',
        laneStatus: String(settings.laneStatus || 'Ready').trim() || 'Ready',
        suggestions: Array.isArray(settings.suggestions) ? settings.suggestions : [],
        instant: !!settings.instant
    }
}

export function showSummaryCard(config: GuideConfig | string = {}): void {
    const settings = normalizeSummaryCardConfig(config)
    appState.summaryCardTypeToken = (appState.summaryCardTypeToken || 0) + 1

    appState.semanticGuideState.isVisible = true
    appState.semanticGuideState.config = settings
    appState.semanticGuideState.typeToken = appState.summaryCardTypeToken
}

export function hideSummaryCard(): void {
    appState.summaryCardTypeToken = (appState.summaryCardTypeToken || 0) + 1
    appState.semanticGuideState.isVisible = false
    appState.semanticGuideState.config = null
    appState.semanticGuideState.typeToken = appState.summaryCardTypeToken
    appState.semanticGuideState.isSynthesizing = false
}

/**
 * Read the semantic-guide request timeout (ms) from the developer override
 * \`window.__SEMANTIC_GUIDE_TIMEOUT_MS__\` (typed in window.d.ts), falling back
 * to a 30s default. The override is intentionally NOT exposed via the test
 * bridge (window-test-bridge.ts) — it's a local dev hook for tightening
 * the timeout during manual API testing.
 */
function getSemanticGuideTimeoutMs(): number {
    if (
        typeof window !== 'undefined' &&
        typeof window.__SEMANTIC_GUIDE_TIMEOUT_MS__ === 'number' &&
        window.__SEMANTIC_GUIDE_TIMEOUT_MS__ > 0
    ) {
        return window.__SEMANTIC_GUIDE_TIMEOUT_MS__
    }
    return 30000
}

async function fetchSemanticGuide(
    payload: SemanticGuideRequestPayload,
    signal: AbortSignal | undefined
): Promise<unknown> {
    const timeoutController = new AbortController()
    let timedOut = false
    const timeoutMs = getSemanticGuideTimeoutMs()
    const timeoutId = window.setTimeout(() => {
        timedOut = true
        timeoutController.abort()
    }, timeoutMs)
    const abortFromRequest = () => timeoutController.abort(signal?.reason)

    if (signal?.aborted) {
        abortFromRequest()
    } else {
        signal?.addEventListener('abort', abortFromRequest, { once: true })
    }

    let response: Response
    try {
        response = await fetch('api.php?action=semantic_guide', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            cache: 'no-store',
            body: JSON.stringify(payload),
            signal: timeoutController.signal
        })
    } catch (error) {
        if (timedOut) {
            const timeoutError = new Error('Guide response timed out. Showing a local summary instead.')
            Object.defineProperty(timeoutError, 'correlationId', {
                value: crypto.randomUUID(),
                writable: false,
                configurable: false
            })
            throw timeoutError
        }
        throw error
    } finally {
        window.clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortFromRequest)
    }

    let result: unknown
    try {
        result = await response.json()
    } catch (jsonErr) {
        Object.defineProperty(jsonErr, 'correlationId', {
            value: crypto.randomUUID(),
            writable: false,
            configurable: false
        })
        throw new Error('Guide response returned invalid JSON.', { cause: jsonErr })
    }

    if (!response.ok || !(result as { ok?: boolean })?.ok) {
        const err = new Error((result as { error?: string })?.error || 'Guide response is unavailable right now.')
        Object.defineProperty(err, 'correlationId', {
            value: crypto.randomUUID(),
            writable: false,
            configurable: false
        })
        throw err
    }

    return result
}

function startSemanticGuideRequest(): { requestId: number; controller: AbortController } {
    if (appState.semanticGuideAbortController) {
        appState.semanticGuideAbortController.abort()
        appState.semanticGuideAbortController = null
    }
    const requestId = (appState.semanticGuideRequestSequence = (appState.semanticGuideRequestSequence || 0) + 1)
    const controller = new AbortController()
    appState.semanticGuideAbortController = controller
    setSemanticGuideButtonState('loading')

    appState.semanticGuideState.isSynthesizing = true

    showSummaryCard(getSemanticGuideLoadingCardConfig())

    return { requestId, controller }
}

function isSemanticGuideRequestCurrent(requestId: number): boolean {
    return requestId === appState.semanticGuideRequestSequence
}

function isSemanticGuideRequestCancelled(requestId: number, controller: AbortController): boolean {
    return controller.signal.aborted || !isSemanticGuideRequestCurrent(requestId)
}

function showSemanticGuideSuccess(guide: GuideConfig | unknown): void {
    showSummaryCard(buildSemanticGuideCardConfig(guide as GuideConfig))
}

function showSemanticGuideFailure(payload: SemanticGuideRequestPayload, _error: unknown): void {
    appState.semanticGuideState.isSynthesizing = false
    const fallback = buildClientSemanticGuideFallback(payload as unknown as SemanticGuidePayload)
    showSummaryCard(buildSemanticGuideFallbackCardConfig(fallback))
}

function finishSemanticGuideRequest(controller: AbortController): void {
    if (appState.semanticGuideAbortController === controller) {
        appState.semanticGuideAbortController = null
    }
    setSemanticGuideButtonState('refresh', { disabled: false })
    if (typeof updateLegendGuideState === 'function') updateLegendGuideState()
}

function ensureSemanticGuideCorrelationId(error: unknown): void {
    if (!error || typeof error !== 'object' || Object.prototype.hasOwnProperty.call(error, 'correlationId')) return
    Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: false })
}

export async function requestSemanticGuide(): Promise<void> {
    const payload = buildSemanticGuideRequestPayload()
    if (!payload) return

    const { requestId, controller } = startSemanticGuideRequest()

    try {
        const guide = await fetchSemanticGuide(payload, controller.signal)
        if (!isSemanticGuideRequestCurrent(requestId)) return
        showSemanticGuideSuccess(guide)
        if (typeof showSemanticThreadsDetail === 'function') {
            showSemanticThreadsDetail()
        }
    } catch (error) {
        if (isSemanticGuideRequestCancelled(requestId, controller)) return
        ensureSemanticGuideCorrelationId(error)
        showSemanticGuideFailure(payload, error)
    } finally {
        finishSemanticGuideRequest(controller)
    }
}
