/**
 * @lib/orchestration/share-copy.ts — share-link clipboard helpers
 *
 * Extracted from url-state.ts (Phase 8 split, 2026-08-09).
 * copyCurrentViewLink builds a clean shareable URL and copies it to the clipboard.
 * _showToast is a thin wrapper around the experience toast system.
 */

import { get } from 'svelte/store'
import { navStore } from '@lib/stores/navigation.svelte.ts'
import { appState } from '@lib/state/app.svelte'
import { getLocationHref } from '@lib/orchestration/url-params'
import { showExperienceToast } from '@lib/orchestration/toast'
import { debugWarn } from '@lib/utils/debug'

/**
 * Minimal toast notification. Ported to Svelte Toast component
 * (see src/components/Toast.svelte, src/lib/orchestration/toast.ts).
 */
function _showToast(title: string, message: string): void {
    showExperienceToast(title, message)
}

/**
 * Copy a shareable URL for the current view state to the clipboard.
 */
export async function copyCurrentViewLink(): Promise<string | null> {
    let shareUrl: URL
    try {
        shareUrl = new URL(getLocationHref())
    } catch {
        _showToast('Copy unavailable', 'Could not read the current page URL.')
        return null
    }

    const $nav = get(navStore)

    shareUrl.searchParams.delete('cb')
    shareUrl.searchParams.delete('lead')
    shareUrl.searchParams.set('view', $nav.currentView || 'galaxy')

    if ($nav.myceliumMode && $nav.myceliumMode !== 'default') {
        shareUrl.searchParams.set('mode', $nav.myceliumMode)
    }

    // BS-B6: Convert opaque ?anchor=<bufferIndex> to stable ?record=<lead_id>
    // in the clipboard URL only. A reordered corpus breaks anchor-index links,
    // but record=<lead_id> is the canonical stable identity. The in-app URL
    // retains ?anchor= for internal routing; this rewrite is clipboard-only.
    const anchor = shareUrl.searchParams.get('anchor')
    if (anchor != null) {
        const anchorIndex = Number(anchor)
        const points = appState.points
        if (Number.isFinite(anchorIndex) && points && anchorIndex >= 0 && anchorIndex < points.length) {
            const leadId = points[anchorIndex]?.lead_id
            if (leadId != null) {
                shareUrl.searchParams.set('record', String(leadId))
                shareUrl.searchParams.delete('anchor')
            }
        }
    }

    const href = shareUrl.toString()
    try {
        await navigator.clipboard.writeText(href)
    } catch (err) {
        debugWarn('Clipboard write failed:', err)
        _showToast('Copy unavailable', 'Could not write to clipboard.')
        return null
    }

    _showToast('View link copied', 'Link copied to clipboard.')
    return href
}
