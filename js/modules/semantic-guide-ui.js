import { semanticGuideStateStore } from './stores.js';
import { state } from '../state.js';
import { search, beginSearchFocusTransition } from './search-state.js';
import { semanticGuideIcon } from './semantic-guide.js';
import { escapeHtml } from './utils/dom-formatters.js';

function canUseSemanticGuideDom() {
    return typeof document !== 'undefined' && typeof document.getElementById === 'function';
}

semanticGuideStateStore.subscribe((guideState) => {
    if (!canUseSemanticGuideDom() || !guideState) return;

    updateSemanticGuideButtonState(guideState.buttonMode, guideState.buttonOptions);

    const elements = getSummaryCardElements();
    if (!elements.isReady) return;

    if (guideState.isSynthesizing) {
        if (elements.card.classList?.add) elements.card.classList.add('is-synthesizing');
    } else {
        if (elements.card.classList?.remove) elements.card.classList.remove('is-synthesizing');
    }

    setSummaryCardVisibility(elements, guideState.isVisible);

    if (guideState.isVisible && guideState.config) {
        const config = guideState.config;
        if (guideState.typeToken !== state.lastRenderedTypeToken) {
            state.lastRenderedTypeToken = guideState.typeToken;
            resetSummaryCardContent(elements, config);

            if (config.instant) {
                elements.textEl.textContent = config.text;
                revealSummaryCardSuggestions(elements, config.suggestions);
            } else {
                typeSummaryCardText(elements, config.text, config.suggestions, guideState.typeToken);
            }
        }
    } else {
        hideSummaryTrailStoryNote();
        if (elements.suggestions) {
            elements.suggestions.innerHTML = '';
            if (elements.suggestions.classList?.remove) elements.suggestions.classList.remove('active');
        }
    }
});

function getSummaryCardElements() {
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

function updateSemanticGuideButtonState(mode, options = {}) {
    const button = document.getElementById('btn-synthesize');
    if (!button) return;
    const isLoading = mode === 'loading';
    button.disabled = Object.prototype.hasOwnProperty.call(options, 'disabled') ? !!options.disabled : isLoading;
    if (button.classList?.toggle) button.classList.toggle('is-loading', isLoading);
    button.innerHTML = getSemanticGuideButtonHtml(mode);
}

function getSemanticGuideButtonHtml(mode = 'ready') {
    if (mode === 'loading') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Reading connections...`;
    if (mode === 'refresh') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Refresh Suggestions`;
    return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Summarize Results<span class="guide-btn-hint"> — explain the strongest connections</span>`;
}

function setSummaryCardVisibility(elements, isVisible) {
    if (isVisible) elements.card.hidden = false;
    if (elements.card.classList?.toggle) elements.card.classList.toggle('hidden', !isVisible);
    if (elements.card.setAttribute) elements.card.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if (!isVisible) elements.card.hidden = true;
}

function getSummaryTrailStoryElements() {
    const note = document.getElementById('summary-gemma-story') || document.getElementById('summary-trail-story');
    return {
        note,
        text: document.getElementById('summary-gemma-story-text') || document.getElementById('summary-trail-story-text'),
        source: document.getElementById('summary-gemma-story-source') || document.getElementById('summary-trail-story-source'),
        isReady: !!note
    };
}

function hideSummaryTrailStoryNote() {
    const elements = getSummaryTrailStoryElements();
    if (!elements.isReady) return;
    if (elements.note.classList?.add) elements.note.classList.add('hidden');
    if (elements.note.setAttribute) elements.note.setAttribute('aria-hidden', 'true');
    if (elements.text) elements.text.textContent = '';
    if (elements.source) elements.source.textContent = '';
}

function resetSummaryCardContent(elements, settings) {
    elements.textEl.textContent = '';
    hideSummaryTrailStoryNote();
    if (elements.suggestions.classList?.remove) elements.suggestions.classList.remove('active');
    renderSummarySuggestions(elements.suggestions, settings.suggestions);
    if (elements.titleEl) elements.titleEl.textContent = settings.title;
    if (elements.laneStatusEl) elements.laneStatusEl.textContent = settings.laneStatus;
}

function revealSummaryCardSuggestions(elements, suggestions = []) {
    if (suggestions.length && elements.suggestions.classList?.add) elements.suggestions.classList.add('active');
}

function typeSummaryCardText(elements, text, suggestions, typeToken) {
    let index = 0;
    const speed = 16;

    function type() {
        let currentToken;
        semanticGuideStateStore.subscribe(s => currentToken = s.typeToken)();
        if (typeToken !== currentToken) return;

        if (index < text.length) {
            elements.textEl.textContent += text.charAt(index);
            index += 1;
            window.setTimeout(type, speed);
        } else {
            revealSummaryCardSuggestions(elements, suggestions);
        }
    }

    type();
}

function renderSummarySuggestions(suggestionsEl, items = []) {
    if (!suggestionsEl) return;
    const suggestions = normalizeSummarySuggestions(items);
    suggestionsEl.innerHTML = suggestions.map(buildSummarySuggestionButtonHtml).join('');
    bindSummarySuggestionClicks(suggestionsEl);
}

function normalizeSummarySuggestions(items = []) {
    return Array.isArray(items) ? items.filter((item) => item && item.lead_id) : [];
}

function buildSummarySuggestionButtonHtml(item = {}) {
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

function getSummarySuggestionIcon(label = '') {
    if (label === 'Trail anchor') return semanticGuideIcon('guide', 'Trail anchor');
    if (label === 'Next stop') return semanticGuideIcon('arrow-right', 'Next stop');
    return semanticGuideIcon('mycelium', 'Related record');
}

function bindSummarySuggestionClicks(suggestionsEl) {
    if (!suggestionsEl) return;
    suggestionsEl.querySelectorAll('[data-lead-id]').forEach((button) => {
        button.onclick = () => focusSummarySuggestion(button.dataset.leadId, button);
    });
}

function focusSummarySuggestion(leadId, sourceEl = null) {
    const targetIndex = state.pointIndexByLeadId?.get?.(String(leadId));
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    // During degraded state (no active search), use the suggestion's name to trigger a search
    if (!state.currentSearchSummary) {
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
    beginSearchFocusTransition(resultsEl, statusEl, state.currentSearchSummary.resultIndices, targetIndex, point, sourceEl);
    return true;
}
