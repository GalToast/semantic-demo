/**
 * @lib/orchestration/url-restore-deep-link.ts — anchor/focus restore
 *
 * Restores focus for `?anchor=<id>` / `?record=<lead_id>` deep links:
 * validate the index, publish focus, build the focus pocket, frame the
 * camera, and re-fire the constellation once semantic threads arrive.
 *
 * All functions are module-private; the orchestrator imports them directly.
 *
 * Extracted from url-restore.ts (shittiest-parts W3, 2026-08-17).
 */

import { get, type Unsubscriber } from 'svelte/store'
import { navStore, writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { animateCameraToNode } from '@lib/engine/camera-choreography/focus'
import { refreshFocusSemanticOverlay, updateFocusSemanticOverlayPositions } from '@lib/engine/journey-webgl-lazy'
import { applyPointFilterColors } from '@lib/journey/point-color'
import { appState } from '@lib/state/app.svelte'
import { debugWarn } from '@lib/utils/debug'
import { DisposableRegistry } from '@lib/utils/disposable-registry'
import { showExperienceToast } from '@lib/orchestration/toast'
import { semanticNeighborMap } from '@lib/data-store'
import { isRestoreStale } from './url-restore-state'

// ── Anchor validation ─────────────────────────────────────────────────────────

/**
 * Parse and validate a numeric anchor id against the loaded dataset.
 * Returns `{ valid: false }` if the id is non-numeric or out of range
 * (after writing fallback state and stripping the URL param).
 */
function _validateAnchorIndex(anchorId: string): { valid: false } | { valid: true; numericId: number } {
    const numericId = Number(anchorId)
    if (!Number.isFinite(numericId)) return { valid: false }

    // A3-3: Validate the anchor index against the loaded dataset.
    // Out-of-range, negative, or dataset-not-yet-loaded indices fall back to
    // overview so the app never hangs in a broken focus state.
    const pointCount = appState?.points?.length ?? 0
    if (pointCount === 0 || numericId < 0 || numericId >= pointCount) {
        debugWarn(
            '[url-state] A3-3: anchor',
            numericId,
            'out of range (dataset has',
            pointCount,
            'points) — falling back to overview'
        )
        showExperienceToast('Anchor not available', `Business #${numericId} isn't available in this dataset.`)
        // Return to overview mode so the app is usable.
        writeNavStateMirror({
            mode: 'overview',
            focusedIndex: null,
            surface: 'idle'
        })
        // Strip the invalid ?anchor= from the URL so refresh doesn't repeat.
        try {
            const url = new URL(window.location.href)
            url.searchParams.delete('anchor')
            window.history.replaceState(window.history.state ?? {}, '', `${url.pathname}${url.search}`)
        } catch {
            // URL rewrite is best-effort
        }
        return { valid: false }
    }

    return { valid: true, numericId }
}

// ── Focus state + camera ──────────────────────────────────────────────────────

/**
 * PR-B4: write focus state directly and publish the focus event.
 * The legacy URL writes `record=<lead_id>` when a business is focused, and
 * the focus state must be restored even if triggers.ts is still loading via
 * requestIdleCallback.
 */
function _restoreFocusStateForAnchor(numericId: number): void {
    writeNavStateMirror({
        focusedIndex: numericId,
        mode: 'focus',
        surface: 'focus-search',
        trailDepth: 1,
        trailSeedIndex: numericId
    })

    publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: numericId })
}

/**
 * shittiest-parts #1: deep-link focus built the pocket + connection rays but never
 * framed the camera, so they sat off-screen in the full mycelium cloud. Frame the
 * camera on the focused anchor/pocket once the pocket is built. Idempotent + guarded
 * inside animateCameraToNode (no-op if camera/controls aren't ready yet). Related
 * helpers are imported directly so the camera frame + overlay refresh stay in one
 * place. Also guarantees the anchor→satellite rays are (re)built for this pocket even
 * if the focus-ui effect hasn't fired yet on a deep-link boot.
 */
function _frameCameraOnAnchor(index: number, restoreToken: number): void {
    if (!Number.isFinite(index)) return

    // PR-B4 follow-up: applyUrlState() runs as soon as data is ready, but the
    // WebGL Canvas initializes asynchronously. The engine creates camera/controls
    // mid-init and then finishes by setting the default overview camera position.
    // If we call animateCameraToNode too early, the move is overwritten. We poll
    // until camera/controls exist, wait one extra tick for the engine to settle, and
    // only then frame the focused anchor.
    const reg = new DisposableRegistry({ label: '_frameCameraOnAnchor' })
    let attempts = 0
    const maxAttempts = 200
    const tryFrame = () => {
        // M10 stale-restore liveness guard: a newer applyUrlState may have
        // bumped urlStateRestoreToken while we polled for camera/controls. If
        // so, bail before animating — otherwise animateCameraToNode(index)
        // yanks the camera back to a now-stale anchor the user navigated away
        // from. Matches the F3 postprocessing liveness-guard pattern (f907e0f5).
        if (isRestoreStale(restoreToken)) {
            reg.disposeAll()
            return
        }
        // The user can change focus without starting another URL restore. Stop
        // polling in that case so a delayed frame cannot resurrect the old
        // anchor after an ordinary in-app navigation.
        if (appState.navState.focusedIndex !== index) {
            reg.disposeAll()
            return
        }
        attempts += 1
        if (!appState.camera || !appState.controls) {
            if (attempts <= maxAttempts) {
                reg.schedule(100, tryFrame)
            } else {
                debugWarn('[url-state] camera frame on anchor timed out waiting for camera/controls', index)
                reg.disposeAll()
            }
            return
        }

        // Camera/controls exist, but the engine may still be settling its initial
        // overview framing. Wait 500ms before animating so the camera move sticks.
        reg.schedule(500, () => {
            reg.disposeAll()
            // M10: re-check staleness after the 500ms settle — the user may
            // have navigated between camera-ready and this callback firing.
            // A normal focus change does not necessarily bump the restore
            // token, so the focused-index guard is required as well.
            if (isRestoreStale(restoreToken) || appState.navState.focusedIndex !== index) return
            try {
                animateCameraToNode(index, { transitionStyle: 'focus' })
            } catch (e) {
                debugWarn('[url-state] camera frame on anchor failed', index, e)
            }
            try {
                refreshFocusSemanticOverlay()
                updateFocusSemanticOverlayPositions(performance.now())
            } catch (e) {
                debugWarn('[url-state] focus semantic overlay refresh failed', index, e)
            }
            try {
                applyPointFilterColors()
            } catch (e) {
                debugWarn('[url-state] point-color refresh failed', index, e)
            }
        })
    }
    tryFrame()
}

// ── Focus pocket + deferred refire ────────────────────────────────────────────

/**
 * W44-S5: dynamic import keeps Three.js + focus-pocket geometry off the
 * cold-load modulepreload list. Returns `true` if the focus-pocket was
 * applied (or skipped because no import was needed), `false` if a newer
 * restore superseded this one (caller should bail).
 */
async function _applyFocusPocketForAnchor(
    numericId: number,
    restoreToken: number,
    _signal: AbortSignal
): Promise<boolean> {
    try {
        // Pass signal so a newer applyUrlState aborts the dynamic import
        // mid-flight rather than completing a now-stale focus-pocket mutation.
        // ImportCallOptions.signal is supported at runtime (Node 17+, all modern browsers)
        // but isn't in @types/node ImportCallOptions in this TS version. `as never`
        // bridges the type-only gap; the runtime call is well-defined.
        const _focusPocketMod = (await import('@lib/focus/pocket', { signal: _signal } as never)) as {
            applyLocalNeighborhoodFocus: (index: number) => void
        }
        const applyLocalNeighborhoodFocus = _focusPocketMod.applyLocalNeighborhoodFocus
        // Token-abort: bail before the focus-pocket mutation if a newer
        // applyUrlState bumped the token while the dynamic import resolved.
        if (isRestoreStale(restoreToken)) return false
        applyLocalNeighborhoodFocus(numericId)
        _frameCameraOnAnchor(numericId, restoreToken)
    } catch (e) {
        debugWarn('[url-state] applyLocalNeighborhoodFocus failed for anchor', numericId, e)
    }
    return true
}

/**
 * PR-B5: deep-link constellation race fix.
 *
 * The initial focus dispatch above runs immediately after `initData()`
 * resolves, but `initData()` explicitly does NOT wait for the 40 MB
 * semantic-thread artifact — see data-store.ts:initData():
 *   "Semantic threads are deferred to engine/lifecycle.ts so the main
 *    startup path does not block on the 40 MB thread artifact."
 * Threads load later (requestIdleCallback → loadSemanticThreads),
 * populating `semanticNeighborMap`. At the time this function runs,
 * `semanticNeighborMap` is empty, so the `SEARCH_FOCUS_REQUESTED`
 * subscriber's `buildNeighborhoodManifest` call resolves 0 semantic
 * neighbors and writes empty `threadCandidates`. The FocusPocket
 * `$effect` builds an empty/geom-fallback constellation, and nothing
 * re-fires focus when threads arrive — so `?record=N` deep-links show
 * "0 visible neighbors" / "No neighboring stops found in this area".
 *
 * The normal click flow doesn't hit this: by the time a user clicks,
 * threads are loaded, so `getSemanticThreadCandidates` returns real
 * neighbors. The deep-link path runs at boot, before threads.
 *
 * Fix: if threads aren't loaded yet, subscribe to `semanticNeighborMap`
 * and re-fire the focus pipeline (SEARCH_FOCUS_REQUESTED +
 * applyLocalNeighborhoodFocus) EXACTLY ONCE when it becomes non-empty.
 * This is idempotent:
 *   - The triggers.ts subscriber overwrites `threadCandidates` on each
 *     publish (no accumulation).
 *   - FocusPocket.svelte's `$effect` dedupes rebuilds by candidate
 *     signature (`lastCandidateSignature`), so a no-op re-fire is cheap.
 *   - We guard on `focusedIndex === numericId` so a user navigation away
 *     from the deep-linked business cancels the deferred re-fire.
 *   - We guard on the restore token so a newer applyUrlState supersedes
 *     this one (the subscription is torn down before firing).
 */
function _setupDeferredNeighborRefire(
    numericId: number,
    restoreToken: number,
    signal: AbortSignal,
    timeoutMs = 30000
): void {
    if (get(semanticNeighborMap).size === 0) {
        let unsub: Unsubscriber | null = null
        let timeoutSignal: AbortSignal | null = null

        const onRestoreAbort = (): void => cleanup()
        const onTimeoutAbort = (): void => cleanup()

        const cleanup = (): void => {
            unsub?.()
            unsub = null
            signal.removeEventListener('abort', onRestoreAbort)
            timeoutSignal?.removeEventListener('abort', onTimeoutAbort)
            timeoutSignal = null
        }

        const refire = async (): Promise<void> => {
            // Teardown the subscription once the map has fired its one
            // allowed notification, regardless of whether the refire itself
            // later bails on stale token/focus.
            cleanup()

            // Bail if the user navigated away or a newer restore superseded us.
            if (appState.navState.focusedIndex !== numericId) return
            if (isRestoreStale(restoreToken)) return
            try {
                publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: numericId })
                const _focusPocketMod = (await import('@lib/focus/pocket')) as {
                    applyLocalNeighborhoodFocus: (index: number) => void
                }
                // Re-check staleness after the await — the user may have
                // navigated or a newer restore may have started during the
                // dynamic import resolution.
                if (appState.navState.focusedIndex !== numericId) return
                if (isRestoreStale(restoreToken)) return
                _focusPocketMod.applyLocalNeighborhoodFocus(numericId)
                _frameCameraOnAnchor(numericId, restoreToken)
            } catch (e) {
                debugWarn('[url-state] deferred constellation rebuild failed for anchor', numericId, e)
            }
        }
        unsub = semanticNeighborMap.subscribe((map) => {
            if (map.size > 0) {
                // Threads just became available — fire once and tear down.
                cleanup()
                void refire()
            }
        })

        // If the caller's restore was already superseded before we subscribed,
        // tear down immediately instead of leaking a listener forever.
        if (signal.aborted) {
            cleanup()
            return
        }

        // Supersession / caller abort: a newer applyUrlState aborts this
        // signal, so we must remove the subscription instead of leaving it
        // for the lifetime of the page.
        signal.addEventListener('abort', onRestoreAbort, { once: true })

        // Bounded never-load cleanup: if threads never arrive, remove the
        // subscription after the existing URL-restore timeout convention
        // (matches the 30s deadline in _restoreSearchFromParams).
        timeoutSignal = AbortSignal.timeout(timeoutMs)
        timeoutSignal.addEventListener('abort', onTimeoutAbort, { once: true })
    }
}

// ── Anchor restore entry point ────────────────────────────────────────────────

/**
 * _restoreAnchorFromParams — restore focus for a numeric anchor id,
 * independent of any `q` query.
 *
 * Why a separate helper: the previous design routed anchor handling through
 * `_restoreSearchFromParams`, which only ran when `q?.trim().length >= 2`.
 * Bare `?anchor=<id>` URLs (no query) silently skipped focus dispatch and the
 * focus pocket never rebuilt. Splitting the path means anchor restoration now
 * runs whenever `?anchor` is present, regardless of whether a query followed.
 *
 * Numeric anchor flow:
 *   1. Publish `SEARCH_FOCUS_REQUESTED` from the mounted URL-state replay path
 *      after data is available and Svelte has an active component context.
 *   2. Direct `applyLocalNeighborhoodFocus` call as a defensive reflection of
 *      the FocusPocket `$effect` rebuild — closes the URL→focus race even
 *      when the navStore update races the data-ready transition.
 *
 * Non-numeric ids (e.g. a lead_id string) are resolved against search results
 * inside `_restoreSearchFromParams` after the search round-trip, because they
 * need a result list to map against.
 */
async function _restoreAnchorFromParams(anchorId: string, restoreToken: number, signal: AbortSignal): Promise<void> {
    const validation = _validateAnchorIndex(anchorId)
    if (!validation.valid) return

    _restoreFocusStateForAnchor(validation.numericId)
    const applied = await _applyFocusPocketForAnchor(validation.numericId, restoreToken, signal)
    if (!applied) return
    _setupDeferredNeighborRefire(validation.numericId, restoreToken, signal)
}

/**
 * Re-export the public surface so callers that historically imported these
 * helpers directly from url-restore.ts keep working. The orchestrator
 * (`applyUrlState`) imports them; external callers should not depend on
 * this private surface.
 */
export { _restoreAnchorFromParams }

/** PUBLIC camera-frame wrapper for the search-restore path (W61). */
export function frameCameraOnRestoredAnchor(index: number, restoreToken: number): void {
    _frameCameraOnAnchor(index, restoreToken)
}
