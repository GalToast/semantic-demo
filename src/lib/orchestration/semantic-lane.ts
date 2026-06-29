/**
 * @lib/orchestration/semantic-lane.ts — Semantic lane readiness, probing, UI state, and ops mode.
 *
 * Manages the readiness health-check loop for semantic search, including
 * warming logic, DOM pill/assist/ops panel state, and ops-mode refresh.
 *
 * All window/document accesses are guarded with typeof checks.
 *
 * Ported from (Wave H, W15).
 */
import { appState as _state } from '@lib/state/app.svelte'
import { withStateMutation } from '@lib/state/with-state-mutation'
const state = _state
import { detectStaticDevPHP, allowsStaticDevFallback, shouldLogStaticDevFallback } from '@lib/utils/ui-presentation'
import { debugWarn } from '@lib/utils/debug'

// ── Window augmentation (semantic-lane helpers attached by lifecycle.js) ────

declare global {
    interface Window {
        scheduleSemanticLaneCooldownProbe?: (payload: Record<string, unknown>) => void
        updateSemanticLaneAssistUi?: () => void
        clearSemanticLaneCooldownProbeTimer?: () => void
        fetchSemanticLaneOpsSummary?: () => Promise<unknown>
        renderSemanticLaneOpsSummary?: (summary: unknown) => void
    }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface LaneHealthPayload {
    ok?: boolean
    state?: string
    provenance?: { label?: string; detail?: string }
    is_mock?: boolean
    error?: string
    retry_source?: string | null
    retry_count?: number | null
    retry_total?: number | null
    retry_wait_until?: number | null
    retry_reason?: string | null
    cooldown_wait_until?: number | null
    search_ok?: boolean
    embed_ok?: boolean
    attempted_warm?: boolean
    checked_at?: string
    query?: string
    rail_mode?: string
    requested_anchor_lead_id?: string | number | null
    [key: string]: unknown
}

export interface LaneProbeOptions {
    warm?: boolean
    reason?: string
}

export interface LaneUiOptions {
    label?: string
    title?: string
}

// ── Module State ───────────────────────────────────────────────────────────

let legendGuideStateUpdater: (() => void) | null = null
let staticDevFallbackWarningShown = false

export function initSemanticLaneAdapter({
    updateLegendGuideState
}: { updateLegendGuideState?: () => void } = {}): void {
    legendGuideStateUpdater = typeof updateLegendGuideState === 'function' ? updateLegendGuideState : null
}

function getWindow(): Window | null {
    return typeof window !== 'undefined' ? window : null
}

function getDocument(): Document | null {
    return typeof document !== 'undefined' ? document : null
}

// ── Inline state-mutator (only consumer of updateSemanticLaneState) ────────

function updateSemanticLaneState(newState: string): void {
    withStateMutation(() => {
        state.semanticLaneState = newState
    })
}

// ── Health Fetch ───────────────────────────────────────────────────────────

export async function fetchSemanticLaneHealth({
    warm = false,
    signal = null
}: { warm?: boolean; signal?: AbortSignal | null } = {}): Promise<LaneHealthPayload> {
    const response = await fetch(`api.php?action=semantic_lane_health&warm=${warm ? '1' : '0'}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal
    })

    const responseText = await response.text()
    let payload: LaneHealthPayload

    if (detectStaticDevPHP(responseText) && allowsStaticDevFallback()) {
        if (!staticDevFallbackWarningShown) {
            if (shouldLogStaticDevFallback()) {
                debugWarn(
                    '[semantic-lane] Detected raw PHP response. Assuming static dev server. Returning mock healthy state.'
                )
            }
            staticDevFallbackWarningShown = true
        }
        payload = {
            ok: true,
            state: 'healthy',
            provenance: {
                label: 'Static Dev Mode',
                detail: 'Local development mock active.'
            },
            is_mock: true
        }
    } else if (detectStaticDevPHP(responseText)) {
        const error: Error & { correlationId?: string } = new Error(
            'Semantic search readiness check returned raw PHP source.'
        )
        Object.defineProperty(error, 'correlationId', {
            value: crypto.randomUUID(),
            writable: false,
            configurable: true
        })
        throw error
    } else {
        try {
            payload = JSON.parse(responseText)
        } catch (error) {
            Object.defineProperty(error as object, 'correlationId', {
                value: crypto.randomUUID(),
                writable: false,
                configurable: true
            })
            throw new Error('Semantic search readiness check returned invalid JSON.', { cause: error })
        }
    }

    if (!response.ok || !payload?.ok) {
        const err: Error & { correlationId?: string } = new Error(
            payload?.error || 'Semantic search readiness check failed.'
        )
        Object.defineProperty(err, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true })
        throw err
    }

    return payload
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isStaticDevLaneFallbackActive(): boolean {
    const snapshot = state.semanticLaneSnapshot as Record<string, unknown> | null
    return (
        allowsStaticDevFallback() &&
        snapshot?.is_mock === true &&
        (snapshot?.provenance as Record<string, unknown> | null)?.label === 'Static Dev Mode'
    )
}

/**
 * Sanitize provenance label to prevent internal implementation details from leaking into user-facing UI.
 */
function sanitizeProvenanceLabel(raw: unknown): string | null {
    if (!raw || typeof raw !== 'string') return null
    const lower = raw.toLowerCase()
    if (
        lower.includes('lane:') ||
        lower.includes('semantic lane:') ||
        lower.includes('ops:') ||
        lower.includes('probing') ||
        lower.includes('cold') ||
        lower.includes('warm') ||
        lower.includes('thread') ||
        lower.includes('embed') ||
        lower.includes('static') ||
        lower.includes('dev mode') ||
        lower.includes('semanticlaneops') ||
        lower.includes('semantic_lane_ops')
    ) {
        return null
    }
    if (raw !== raw.trim() || raw.length > 60) return null
    return raw
}

/**
 * Sanitize provenance detail text. Rejects any string that exposes internal implementation details.
 */
function sanitizeProvenanceDetail(raw: unknown): string | null {
    if (!raw || typeof raw !== 'string') return null
    const lower = raw.toLowerCase()
    if (
        lower.includes('lane:') ||
        lower.includes('semantic lane:') ||
        lower.includes('ops:') ||
        lower.includes('probing') ||
        lower.includes('cold') ||
        lower.includes('thread') ||
        lower.includes('embed') ||
        lower.includes('warming') ||
        lower.includes('optimized') ||
        lower.includes('getting ready') ||
        lower.includes('semanticlaneops') ||
        lower.includes('semantic_lane_ops') ||
        lower.includes('0 threads') ||
        lower.includes('ops mode')
    ) {
        return null
    }
    if (raw !== raw.trim() || raw.length > 120) return null
    return raw
}

// ── Health Payload Application ─────────────────────────────────────────────

export function applySemanticLaneHealthPayload(
    payload: LaneHealthPayload | null | undefined,
    options: LaneUiOptions = {}
): void {
    recordSemanticLaneSnapshot(payload || {})
    const win = getWindow()
    if (typeof win?.scheduleSemanticLaneCooldownProbe === 'function')
        win.scheduleSemanticLaneCooldownProbe(payload || {})
    if (state.semanticLaneOpsMode) {
        refreshSemanticLaneOpsSummary().catch((err: unknown) => {
            debugWarn('refreshSemanticLaneOpsSummary failed:', err)
        })
    }
    const laneState = payload?.state || 'degraded'
    const rawProvenanceLabel = payload?.provenance?.label || null
    const rawProvenanceDetail = payload?.provenance?.detail || null
    const provenanceLabel = sanitizeProvenanceLabel(rawProvenanceLabel)
    const provenanceDetail = sanitizeProvenanceDetail(rawProvenanceDetail)

    // Track only true warming probes for stuck detection. A degraded lane can
    // run indefinitely on text fallback and should not be presented as warming.
    if (laneState === 'warming') {
        state.semanticLaneWarmingCounter = (state.semanticLaneWarmingCounter ?? 0) + 1
    } else {
        state.semanticLaneWarmingCounter = 0
    }

    // If warming persists beyond 3 consecutive probes, mark as stuck
    if (state.semanticLaneWarmingCounter >= 3) {
        setSemanticLaneUiState('stuck', {
            label: options.label || provenanceLabel || 'Service Busy',
            title:
                options.title || provenanceDetail || 'Semantic search is taking longer than expected. Click to reload.'
        })
        return
    }

    if (laneState === 'healthy') {
        recordSemanticLaneSnapshot({
            retry_source: null,
            retry_count: null,
            retry_total: null,
            retry_wait_until: null,
            retry_reason: null,
            cooldown_wait_until: null
        })
        setSemanticLaneUiState('healthy', {
            label: options.label || provenanceLabel || 'Search ready',
            title: options.title || provenanceDetail || 'Semantic search is ready.'
        })
        return
    }

    if (laneState === 'reconnecting') {
        const reconnectLabel = options.label || provenanceLabel || 'Refreshing search'
        setSemanticLaneUiState('reconnecting', {
            label: reconnectLabel,
            title: options.title || provenanceDetail || 'Semantic search is refreshing in the background.'
        })
        return
    }

    setSemanticLaneUiState('degraded', {
        label: options.label || provenanceLabel || 'Search degraded',
        title: options.title || provenanceDetail || 'Using text search while semantic search reconnects.'
    })
}

// ── Warmth Logic ───────────────────────────────────────────────────────────

export function shouldWarmSemanticLane(reason = 'interval'): boolean {
    if (reason === 'focus' || reason === 'visibility') return true
    const doc = getDocument()
    if (doc && doc.visibilityState !== 'visible') return false
    const inputValue = (doc?.getElementById?.('search-input') as HTMLInputElement | null)?.value?.trim() || ''
    return !!state.searchState.currentSearchSummary || inputValue.length >= 2
}

// ── Probe ──────────────────────────────────────────────────────────────────

export async function probeSemanticLane({
    warm = false,
    reason = 'interval'
}: LaneProbeOptions = {}): Promise<LaneHealthPayload | null> {
    const win = getWindow()
    if (state.semanticLaneProbePromise) {
        state.semanticLanePendingWarm = state.semanticLanePendingWarm || warm
        if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi()
        return state.semanticLaneProbePromise as Promise<LaneHealthPayload | null>
    }

    const effectiveWarm = warm || state.semanticLanePendingWarm
    state.semanticLanePendingWarm = false
    const trackWarmupAttempt =
        effectiveWarm ||
        state.semanticLaneState !== 'healthy' ||
        reason === 'manual-retry' ||
        reason === 'focus' ||
        reason === 'visibility' ||
        reason === 'queued-warm'

    if (trackWarmupAttempt) {
        const snap = state.semanticLaneSnapshot as Record<string, unknown> | null
        const priorWarmupCount = snap?.retry_source === 'warmup' ? Number(snap.retry_count || 0) : 0
        recordSemanticLaneSnapshot({
            retry_source: 'warmup',
            retry_count: priorWarmupCount + 1,
            retry_total: null,
            retry_wait_until: null,
            retry_reason: reason,
            attempted_warm: effectiveWarm
        })
    }
    if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi()

    state.semanticLaneProbePromise = (async () => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // eslint-disable-line no-restricted-syntax -- local Promise timeout, cleared in finally
        try {
            const payload = await fetchSemanticLaneHealth({ warm: effectiveWarm, signal: controller.signal })
            applySemanticLaneHealthPayload(payload)
            return payload
        } catch (err: unknown) {
            const isTimeout = (err as Error)?.name === 'AbortError'
            if (isTimeout) {
                debugWarn('Semantic lane probe timed out after 5s')
            }

            if (
                reason === 'focus' ||
                reason === 'visibility' ||
                effectiveWarm ||
                isTimeout ||
                state.semanticLaneState === 'checking' ||
                state.semanticLaneState === 'degraded' ||
                state.semanticLaneState === 'unavailable'
            ) {
                recordSemanticLaneSnapshot({
                    state: 'unavailable',
                    search_ok: false,
                    embed_ok: false,
                    attempted_warm: effectiveWarm,
                    retry_wait_until: null,
                    cooldown_wait_until: null
                })
                if (typeof win?.clearSemanticLaneCooldownProbeTimer === 'function')
                    win.clearSemanticLaneCooldownProbeTimer()
                setSemanticLaneUiState('unavailable', {
                    title: 'Search health check failed to connect.'
                })
            }
            return null
        } finally {
            clearTimeout(timeoutId)
            state.semanticLaneProbePromise = null
            if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi()
            if (state.semanticLanePendingWarm) {
                const pendingWarm = state.semanticLanePendingWarm
                state.semanticLanePendingWarm = false
                probeSemanticLane({ warm: pendingWarm, reason: 'queued-warm' })
            }
        }
    })()

    if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi()

    return state.semanticLaneProbePromise as Promise<LaneHealthPayload | null>
}

// ── Monitor ────────────────────────────────────────────────────────────────

export function scheduleSemanticLaneMonitor(): void {
    const win = getWindow()
    if (state.semanticLaneMonitorTimer) {
        clearInterval(state.semanticLaneMonitorTimer)
    }

    state.semanticLaneMonitorTimer =
        typeof win?.setInterval === 'function'
            ? setInterval(() => { // eslint-disable-line no-restricted-syntax -- periodic refresh; lifecycle owned by state.semanticLaneMonitorTimer
                  if (isStaticDevLaneFallbackActive()) return
                  probeSemanticLane({
                      warm: shouldWarmSemanticLane('interval'),
                      reason: 'interval'
                  })
              }, 45000)
            : null
}

// ── UI State ───────────────────────────────────────────────────────────────

export function setSemanticLaneUiState(laneState: string, options: LaneUiOptions = {}): void {
    const doc = getDocument()
    updateSemanticLaneState(laneState)
    const pill = doc?.getElementById?.('semantic-lane-pill') || null
    const container = doc?.querySelector?.('.search-container') || null
    if (container) {
        ;(container as HTMLElement).dataset.laneState = laneState
    }
    if (!pill) return

    let label = 'Checking search'
    let title = 'Checking search readiness.'
    if (laneState === 'healthy') {
        label = options.label || 'Search: ready'
        title = options.title || 'Search is ready.'
    } else if (laneState === 'reconnecting') {
        label = options.label || 'Search: reconnecting'
        title = options.title || 'Search is refreshing in the background.'
    } else if (laneState === 'degraded') {
        label = options.label || 'Search: degraded'
        title = options.title || 'Using text search while semantic search reconnects.'
    } else if (laneState === 'unavailable') {
        label = options.label || 'Search: unavailable'
        title = options.title || 'Search is unavailable. Try again in a moment.'
    } else if (laneState === 'stuck') {
        label = options.label || 'Service Busy'
        title = options.title || 'Semantic search is taking longer than expected. Click to reload.'
    }

    const pillEl = pill as HTMLElement
    pillEl.dataset.state = laneState
    const assistEl = doc?.getElementById?.('semantic-lane-assist') || null
    if (assistEl) {
        const hasFocusedRecord =
            Boolean(state.selectedPoint) ||
            (state.focusedNode !== null && state.focusedNode !== undefined) ||
            (state.navState?.focusedIndex !== null && state.navState?.focusedIndex !== undefined)
        const focusOwnsRail =
            doc?.body?.dataset?.graphContext === 'focus-search' ||
            doc?.body?.dataset?.graphContext === 'focus' ||
            hasFocusedRecord
        const hasVisibleResults = Boolean(state.searchState.currentSearchSummary)
        // Hide the assist card once results are visible: the pill at the top of
        // the search surface already communicates the degraded lane state, and
        // stacking the inline card above results paints over the first result
        // row on narrow viewports.
        if (laneState === 'healthy' || focusOwnsRail || hasVisibleResults) {
            assistEl.hidden = true
            assistEl.dataset.state = 'idle'
            ;(assistEl as HTMLElement).style.display = 'none'
        } else {
            assistEl.hidden = false
            assistEl.dataset.state = 'degraded'
            ;(assistEl as HTMLElement).style.display = ''
            const assistCopyEl = doc?.getElementById?.('semantic-lane-assist-copy') || null
            const assistMetaEl = doc?.getElementById?.('semantic-lane-assist-meta') || null
            if (assistCopyEl) {
                assistCopyEl.textContent =
                    'Semantic search readiness is temporarily unavailable. The visualization remains available while recovery checks continue in the background.'
            }
            if (assistMetaEl) {
                assistMetaEl.textContent = 'Offline or blocked request detected just now.'
            }
        }
    }
    if (state.semanticLaneOpsMode) {
        pillEl.textContent = label
        pillEl.title = title
        pillEl.setAttribute('aria-label', title)
        pillEl.hidden = false
    } else {
        if (laneState === 'unavailable') {
            pillEl.textContent = ''
            pillEl.removeAttribute('title')
            pillEl.removeAttribute('aria-label')
            pillEl.hidden = true
        } else if (laneState === 'stuck') {
            pillEl.textContent = label
            pillEl.title = title
            pillEl.setAttribute('aria-label', title)
            pillEl.hidden = false
            pillEl.style.cursor = 'pointer'
        } else {
            pillEl.textContent = label
            pillEl.title = title
            pillEl.setAttribute('aria-label', title)
            pillEl.hidden = false
        }
    }
    if (legendGuideStateUpdater) legendGuideStateUpdater()
}

// ── Snapshot ───────────────────────────────────────────────────────────────

export function recordSemanticLaneSnapshot(partial: LaneHealthPayload = {}): LaneHealthPayload {
    state.semanticLaneSnapshot = {
        ...(state.semanticLaneSnapshot || {}),
        ...partial,
        checked_at: partial.checked_at || new Date().toISOString()
    }
    return state.semanticLaneSnapshot as LaneHealthPayload
}

// ── Ops Mode ───────────────────────────────────────────────────────────────

export function setSemanticLaneOpsMode(enabled: boolean): void {
    const win = getWindow()
    const doc = getDocument()
    state.semanticLaneOpsMode = !!enabled
    const panel = doc?.getElementById?.('semantic-lane-ops') || null
    if (panel) {
        panel.hidden = !state.semanticLaneOpsMode
    }
    if (!state.semanticLaneOpsMode) {
        if (state.semanticLaneOpsRefreshTimer) {
            clearInterval(state.semanticLaneOpsRefreshTimer)
            state.semanticLaneOpsRefreshTimer = null
        }
        return
    }
    if (!state.semanticLaneOpsRefreshTimer && typeof win?.setInterval === 'function') {
        state.semanticLaneOpsRefreshTimer = setInterval(() => { // eslint-disable-line no-restricted-syntax -- periodic refresh; lifecycle owned by state.semanticLaneOpsRefreshTimer
            refreshSemanticLaneOpsSummary()
        }, 60000)
    }
}

// ── Ops Summary ────────────────────────────────────────────────────────────

export async function refreshSemanticLaneOpsSummary(): Promise<unknown> {
    const win = getWindow()
    const doc = getDocument()
    if (!state.semanticLaneOpsMode) return null
    if (state.semanticLaneOpsFetchPromise) return state.semanticLaneOpsFetchPromise

    state.semanticLaneOpsFetchPromise = (async () => {
        try {
            const summary = await (typeof win?.fetchSemanticLaneOpsSummary === 'function'
                ? win.fetchSemanticLaneOpsSummary()
                : Promise.resolve(null))
            if (typeof win?.renderSemanticLaneOpsSummary === 'function') win.renderSemanticLaneOpsSummary(summary)
            return summary
        } catch {
            const metaEl = doc?.getElementById?.('semantic-lane-ops-meta') || null
            if (metaEl && state.semanticLaneOpsMode) {
                metaEl.textContent = 'Search readiness summary failed to load.'
            }
            return null
        } finally {
            state.semanticLaneOpsFetchPromise = null
        }
    })()

    return state.semanticLaneOpsFetchPromise
}
