// js/modules/connection-analysis.js — Connection Report / Semantic Threads Detail
import { state } from '../state.js';
import {
    getConnectionStateSnapshot,
    getSummaryTextEl,
    getSummaryCardEl,
    getStoryNoteEl,
    getStoryTextEl,
    getStorySourceEl,
} from './connection-analysis-adapter.js';
import {
    buildSemanticGuidePayloadResult,
    buildSemanticGuideRequestPayload
} from './semantic-guide-payload.js';

let semanticThreadsDetailController = null;

// === Connection Analysis / Reporter ===

/**
 * Fetches and renders the full Semantic Connection Path report for a trail or focused node.
 * Triggered by the Full report button in the summary suggestions row.
 */
export function showSemanticThreadsDetail() {
    async function inner() {
        let payload = buildSemanticGuideRequestPayload();
        if (!payload || !payload.results?.length) {
            const { focusedNode: focusedIdx, points } = getConnectionStateSnapshot();
            if (!Number.isFinite(focusedIdx) || !points?.[focusedIdx]) {
                const textEl = getSummaryTextEl();
                if (textEl) textEl.textContent = 'Select a business first to load its full connection report.';
                return;
            }
            const focusedResult = buildSemanticGuidePayloadResult(focusedIdx);
            if (!focusedResult) {
                const textEl = getSummaryTextEl();
                if (textEl) textEl.textContent = 'Select a business first to load its full connection report.';
                return;
            }
            payload = payload || {};
            payload.results = [focusedResult];
            payload.query = 'connection report';
            payload.anchor_lead_id = focusedResult.lead_id;
            payload.anchor_name = focusedResult.name;
        }

        if (semanticThreadsDetailController) {
            semanticThreadsDetailController.abort();
        }
        const controller = new AbortController();
        semanticThreadsDetailController = controller;
        const card = getSummaryCardEl();
        if (card) card.classList.add('is-synthesizing');
        const storyNoteEl = getStoryNoteEl();
        const storyTextEl = getStoryTextEl();
        const storySourceEl = getStorySourceEl();
        if (storyNoteEl) {
            storyNoteEl.classList.remove('hidden');
            storyNoteEl.setAttribute('aria-hidden', 'false');
        }
        if (storyTextEl) storyTextEl.textContent = 'Loading the full connection report...';
        if (storySourceEl) storySourceEl.textContent = '';

        try {
            const response = await fetch('api.php?action=semantic_trail_story', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                cache: 'no-store',
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            let result = null;
            try {
                result = await response.json();
            } catch (jsonErr) {
                Object.defineProperty(jsonErr, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                throw new Error('Connection report returned invalid JSON.', { cause: jsonErr });
            }

            if (!response.ok || !result?.ok) {
                const err = new Error(result?.error || 'Connection report is unavailable right now.');
                Object.defineProperty(err, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
                throw err;
            }

            const cachedStoryMode = result?.mode === 'cached_trail_story' || result?.mode === 'cached_gemma_story';
            const story = cachedStoryMode ? result.story : '';
            if (story && storyTextEl) {
                storyTextEl.textContent = story;
                if (storySourceEl) {
                    const src = result.source || 'semantic-guide-engine';
                    const age = result.cache_age_seconds;
                    if (age !== null && age !== undefined) {
                        const mins = Math.round(age / 60);
                        storySourceEl.textContent = mins < 60
                            ? src + ' cached ' + mins + 'm ago'
                            : src + ' cached ' + Math.round(mins / 60) + 'h ago';
                    } else {
                        storySourceEl.textContent = src;
                    }
                }
            } else if (storyTextEl) {
                storyTextEl.textContent = 'The connection report is still being prepared. Try again in a moment.';
                if (storySourceEl) storySourceEl.textContent = '';
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            if (storyTextEl) storyTextEl.textContent = 'Connection report unavailable: ' + err.message;
            if (storySourceEl) storySourceEl.textContent = 'Connection report unavailable';
        } finally {
            if (semanticThreadsDetailController === controller) {
                semanticThreadsDetailController = null;
            }
            if (card) card.classList.remove('is-synthesizing');
        }
    }

    return inner();
}
