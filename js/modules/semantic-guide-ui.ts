// @ts-nocheck
/**
 * semantic-guide-ui.ts
 *
 * TypeScript shadow for semantic-guide-ui.js
 * UI orchestration for the semantic guide summary card.
 */

import { semanticGuideStateStore } from './stores.ts';
import { state } from '../state.ts';
import { search, beginSearchFocusTransition } from './search-state.ts';
import { semanticGuideIcon } from './semantic-guide.ts';
import { escapeHtml } from './utils/dom-formatters.ts';

interface SummaryCardElements {
    card: HTMLElement | null;
    textEl: HTMLElement | null;
    suggestions: HTMLElement | null;
    titleEl: HTMLElement | null;
    laneStatusEl: HTMLElement | null;
    isReady: boolean;
}

interface SummaryTrailStoryElements {
    note: HTMLElement | null;
    text: HTMLElement | null;
    source: HTMLElement | null;
    isReady: boolean;
}

interface GuideState {
    isVisible: boolean;
    isSynthesizing: boolean;
    config: Record<string, unknown> | null;
    typeToken: number;
    buttonMode: string;
    buttonOptions?: Record<string, unknown>;
}

interface SuggestionItem {
    lead_id: string | number;
    label?: string;
    name?: string;
    reason?: string;
}

function canUseSemanticGuideDom(): boolean {
    return typeof document !== 'undefined' && typeof document.getElementById === 'function';
}

semanticGuideStateStore.subscribe((guideState: unknown) => {
    const gs = guideState as GuideState | null;
    if (!canUseSemanticGuideDom() || !gs) return;

    updateSemanticGuideButtonState(gs.buttonMode, gs.buttonOptions ?? {});

    const elements = getSummaryCardElements();
    if (!elements.isReady) return;

    if (gs.isSynthesizing) {
        if (elements.card?.classList) elements.card.classList.add('is-synthesizing');
    } else {
        if (elements.card?.classList) elements.card.classList.remove('is-synthesizing');
    }

    setSummaryCardVisibility(elements, gs.isVisible);

    if (gs.isVisible && gs.config) {
        const config = gs.config;
        if (gs.typeToken !== (state as Record<string, unknown>).lastRenderedTypeToken) {
            (state as Record<string, unknown>).lastRenderedTypeToken = gs.typeToken;
            resetSummaryCardContent(elements, config);

            if (config.instant) {
                if (elements.textEl) elements.textEl.textContent = config.text as string;
                revealSummaryCardSuggestions(elements, config.suggestions as SuggestionItem[]);
            } else {
                typeSummaryCardText(elements, config.text as string, config.suggestions as SuggestionItem[], gs.typeToken);
            }
        }
    } else {
        hideSummaryTrailStoryNote();
        if (elements.suggestions) {
            elements.suggestions.innerHTML = '';
            if (elements.suggestions.classList) elements.suggestions.classList.remove('active');
        }
    }
});

function getSummaryCardElements(): SummaryCardElements {
    const card = document.getElementById('semantic-summary-card');
    const textEl = document.getElementById('summary-text');
    const suggestions = document.getElementById('summary-suggestions');
    const titleEl = document.getElementById('summary-card-title-text');
    const laneStatusEl = document.getElementById('summary-lane-status');

    return {
        card,
        textEl,
        suggestions,
        titleEl,
        laneStatusEl,
        isReady: !!(card && textEl && suggestions && card.classList && suggestions.classList)
    };
}

function updateSemanticGuideButtonState(mode: string, options: Record<string, unknown> = {}): void {
    const button = document.getElementById('btn-synthesize') as HTMLButtonElement | null;
    if (!button) return;
    const isLoading = mode === 'loading';
    button.disabled = Object.prototype.hasOwnProperty.call(options, 'disabled') ? !!options.disabled : isLoading;
    if (button.classList) button.classList.toggle('is-loading', isLoading);
    button.innerHTML = getSemanticGuideButtonHtml(mode);
}

function getSemanticGuideButtonHtml(mode: string = 'ready'): string {
    if (mode === 'loading') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Reading connections...`;
    if (mode === 'refresh') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Refresh Suggestions`;
    return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Summarize Results<span class="guide-btn-hint"> — explain the strongest connections</span>`;
}

function setSummaryCardVisibility(elements: SummaryCardElements, isVisible: boolean): void {
    if (isVisible && elements.card) elements.card.hidden = false;
    if (elements.card?.classList) elements.card.classList.toggle('hidden', !isVisible);
    if (elements.card?.setAttribute) elements.card.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if (!isVisible && elements.card) elements.card.hidden = true;
}

function getSummaryTrailStoryElements(): SummaryTrailStoryElements {
    const note = document.getElementById('summary-gemma-story') || document.getElementById('summary-trail-story');
    return {
        note,
        text: document.getElementById('summary-gemma-story-text') || document.getElementById('summary-trail-story-text'),
        source: document.getElementById('summary-gemma-story-source') || document.getElementById('summary-trail-story-source'),
        isReady: !!note
    };
}

function hideSummaryTrailStoryNote(): void {
    const elements = getSummaryTrailStoryElements();
    if (!elements.isReady) return;
    if (elements.note?.classList) elements.note.classList.add('hidden');
    if (elements.note?.setAttribute) elements.note.setAttribute('aria-hidden', 'true');
    if (elements.text) elements.text.textContent = '';
    if (elements.source) elements.source.textContent = '';
}

function resetSummaryCardContent(elements: SummaryCardElements, settings: Record<string, unknown>): void {
    if (elements.textEl) elements.textEl.textContent = '';
    hideSummaryTrailStoryNote();
    if (elements.suggestions?.classList) elements.suggestions.classList.remove('active');
    renderSummarySuggestions(elements.suggestions, settings.suggestions as SuggestionItem[]);
    if (elements.titleEl) elements.titleEl.textContent = settings.title as string;
    if (elements.laneStatusEl) elements.laneStatusEl.textContent = settings.laneStatus as string;
}

function revealSummaryCardSuggestions(elements: SummaryCardElements, suggestions: SuggestionItem[] = []): void {
    if (suggestions.length && elements.suggestions?.classList) elements.suggestions.classList.add('active');
}

function typeSummaryCardText(elements: SummaryCardElements, text: string, suggestions: SuggestionItem[], typeToken: number): void {
    let index = 0;
    const speed = 16;

    function type(): void {
        let currentToken: number | undefined;
        semanticGuideStateStore.subscribe((s: unknown) => { currentToken = (s as GuideState).typeToken; })();
        if (typeToken !== currentToken) return;

        if (index < text.length) {
            if (elements.textEl) elements.textEl.textContent += text.charAt(index);
            index += 1;
            window.setTimeout(type, speed);
        } else {
            revealSummaryCardSuggestions(elements, suggestions);
        }
    }

    type();
}

function renderSummarySuggestions(suggestionsEl: HTMLElement | null, items: SuggestionItem[] = []): void {
    if (!suggestionsEl) return;
    const suggestions = normalizeSummarySuggestions(items);
    suggestionsEl.innerHTML = suggestions.map(buildSummarySuggestionButtonHtml).join('');
    bindSummarySuggestionClicks(suggestionsEl);
}

function normalizeSummarySuggestions(items: SuggestionItem[] = []): SuggestionItem[] {
    return Array.isArray(items) ? items.filter((item) => item && item.lead_id) : [];
}

function buildSummarySuggestionButtonHtml(item: SuggestionItem = {} as SuggestionItem): string {
    const label = item.label || 'Related record';
    const name = item.name || 'Open record';
    return `
        <button class="suggestion-btn" type="button" data-lead-id="${escapeHtml(String(item.lead_id))}" data-name="${escapeHtml(name)}" aria-label="${escapeHtml(label)}: ${escapeHtml(name)}">
            <span>${getSummarySuggestionIcon(item.label)}</span>
            <span class="suggestion-copy">
                <span class="suggestion-label">${escapeHtml(label)}</span>
                <span class="suggestion-name">${escapeHtml(name)}</span>
                <span class="suggestion-reason">${escapeHtml(item.reason || '')}</span>
            </span>
        </button>
    `;
}

function getSummarySuggestionIcon(label: string = ''): string {
    if (label === 'Trail anchor') return semanticGuideIcon('guide', 'Trail anchor');
    if (label === 'Next stop') return semanticGuideIcon('arrow-right', 'Next stop');
    return semanticGuideIcon('mycelium', 'Related record');
}

function bindSummarySuggestionClicks(suggestionsEl: HTMLElement): void {
    if (!suggestionsEl) return;
    suggestionsEl.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((button) => {
        button.onclick = () => focusSummarySuggestion(button.dataset.leadId, button);
    });
}

function focusSummarySuggestion(leadId: string | undefined, sourceEl: HTMLElement | null = null): boolean {
    const targetIndex = (state as Record<string, unknown>).pointIndexByLeadId instanceof Map
        ? ((state as Record<string, unknown>).pointIndexByLeadId as Map<string | number, number>).get(String(leadId))
        : undefined;
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    if (!(state as Record<string, unknown>).currentSearchSummary) {
        const name = sourceEl?.dataset?.name || '';
        if (name) {
            search(name);
            return true;
        }
        return false;
    }
    if (targetIndex === undefined || !resultsEl || !statusEl) return false;
    const point = state.points[targetIndex];
    if (!point) return false;
    beginSearchFocusTransition(resultsEl, statusEl, (state as Record<string, unknown>).currentSearchSummary as Record<string, unknown>, targetIndex, point, sourceEl);
    return true;
}
