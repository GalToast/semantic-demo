import { state } from '../state.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
import { isPointVisible } from './utils/geo-data.js';
import * as adapter from './journey-lifecycle-adapter.js';
import { describeCluster, updateDocumentMeta } from './utils/ui-presentation.js';
import { sanitizePublicFacingNote, getBusinessNamePresentation, escapeHtml, getPublicRecordStatusLabel } from './utils/dom-formatters.js';
import {
    renderSignalBadges,
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    syncSelectedCardContentVariant,
} from './ui-renderers.js';
import { applyClusterUiAccent } from './cluster-ui-accent.js';
import { isMapSummarySurface } from './environment.js';

const selectedCardAdapter = {
    getStrandArrivalNote: () => '',
    updateTraversalUi: () => {}
};

const COPY = Object.freeze({
    selectedFiledAs: (raw) => {
        if (!raw || raw === '-' || raw.trim() === '') return 'Not provided';
        return `Filed as ${raw}`;
    },
    selectedEmptyFacts: 'MoCo business record',
    selectedEmptyTheme: 'Theme',
    selectedEmptyStatus: 'Record status',
    selectedEmptyMap: 'No geocoded point yet',
    selectedEmptyThread: 'Waiting for a related path.',
    selectedEmptyName: 'Business Name',
    selectedEmptyWhat: 'What they do',
    selectedEmptyRole: 'Record',
});

export function initJourneySelectedCard(deps = {}) {
    initJourneySelectedCardAdapter(deps);

    // Phase 3: Declarative synchronization
    const sync = () => {
        updateSelectedBusiness(state.selectedPoint || null, { skipHydrate: true });
    };

    subscribeKeyed('journey-selected-card:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('journey-selected-card:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('journey-selected-card:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('journey-selected-card:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('journey-selected-card:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('journey-selected-card:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('journey-selected-card:composition-updated', EVENTS.COMPOSITION_UPDATED, sync);
    subscribeKeyed('journey-selected-card:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
    subscribeKeyed('journey-selected-card:search-focus-transition-settled', EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, sync);
    subscribeKeyed('journey-selected-card:exploration-focus-sync', EVENTS.EXPLORATION_FOCUS_SYNC, (payload) => {
        updateSelectedBusiness(payload.point, payload.options || {});
    });
}

export function initJourneySelectedCardAdapter(deps = {}) {
    if (typeof deps.getStrandArrivalNote === 'function') {
        selectedCardAdapter.getStrandArrivalNote = deps.getStrandArrivalNote;
    }
    if (typeof deps.updateTraversalUi === 'function') {
        selectedCardAdapter.updateTraversalUi = deps.updateTraversalUi;
    }
}

export function syncFocusStage(point) {
    if (!state.points) return;
    const stage = document.getElementById('focus-stage');
    const stageCard = stage?.querySelector('.focus-stage-card');
    if (!stage || !stageCard) return;

    const cleanupFocusStageTrap = () => {
        if (stage._focusStageKeydownListener) {
            stage.removeEventListener('keydown', stage._focusStageKeydownListener);
            stage._focusStageKeydownListener = null;
        }
        if (adapter.getPreviouslyFocusedFocusStage()) {
            try {
                adapter.getPreviouslyFocusedFocusStage().focus();
            } catch (e) {
                console.warn('Failed to restore focus stage previous element:', e);
            }
            adapter.setPreviouslyFocusedFocusStage(null);
        }
    };

    if (point === null) {
        applyClusterUiAccent(stageCard, null);
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        return;
    }

    const effectivePoint = point
        || state.selectedPoint
        || ((state.focusedNode !== null && state.focusedNode !== undefined && Number.isFinite(state.focusedNode) && state.focusedNode >= 0 && state.focusedNode < state.points.length) ? state.points[state.focusedNode] : null);

    const effectiveIndex = Number.isFinite(state.focusedNode) && state.points[state.focusedNode] === effectivePoint
        ? state.focusedNode
        : state.points.indexOf(effectivePoint);
    const isFilteredOut = Number.isFinite(effectiveIndex)
        && effectiveIndex >= 0
        && !isPointVisible(effectiveIndex, state.points, state.activeClusterFilter, state.activeFilters);

    if (!effectivePoint || state.currentView !== 'galaxy' || state.focusedNode === null || isFilteredOut) {
        applyClusterUiAccent(stageCard, null);
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        return;
    }

    const wasActive = !stage.hidden;

    applyClusterUiAccent(stageCard, effectivePoint);
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');

    if (!wasActive) {
        adapter.setPreviouslyFocusedFocusStage(document.activeElement);

        const keydownHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = Array.from(
                stage.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => {
                if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            });
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        };

        if (stage._focusStageKeydownListener) {
            stage.removeEventListener('keydown', stage._focusStageKeydownListener);
        }
        stage._focusStageKeydownListener = keydownHandler;
        stage.addEventListener('keydown', keydownHandler);
    }

    const presentation = getBusinessNamePresentation(effectivePoint.name);
    const filedEl = document.getElementById('focus-stage-filed');
    const metaEl = document.getElementById('focus-stage-meta');
    const noteEl = document.getElementById('focus-stage-note');

    const nameEl = document.getElementById('focus-stage-name');
    const whatEl = document.getElementById('focus-stage-what');
    const badgesEl = document.getElementById('focus-stage-badges');
    const triviaEl = document.getElementById('focus-stage-trivia');

    if (nameEl) nameEl.textContent = presentation.display;
    if (whatEl) whatEl.textContent = sanitizePublicFacingNote(effectivePoint.what) || 'Montgomery County business record';

    if (badgesEl && typeof renderSignalBadges === 'function') {
        badgesEl.innerHTML = renderSignalBadges(effectivePoint);
        badgesEl.hidden = !badgesEl.innerHTML;
    }

    const focusSensitivityEl = document.getElementById('focus-stage-sensitivity');
    if (focusSensitivityEl) {
        const sensitivityBadges = [];
        if (effectivePoint.weather_sensitive) {
            sensitivityBadges.push('<span class="signal-badge weather">Weather Sensitive</span>');
        }
        if (effectivePoint.sensitivity_flags && effectivePoint.sensitivity_flags.length) {
            effectivePoint.sensitivity_flags.forEach((flag) => {
                sensitivityBadges.push(`<span class="signal-badge flag">${escapeHtml(flag)}</span>`);
            });
        }
        focusSensitivityEl.innerHTML = sensitivityBadges.join('');
        focusSensitivityEl.hidden = !sensitivityBadges.length;
    }

    if (triviaEl && typeof adapter.getInterestingBusinessNote === 'function') {
        const interestingNote = adapter.getInterestingBusinessNote(effectivePoint);
        const matchNarrative = typeof adapter.buildSelectedMatchNarrative === 'function' ? adapter.buildSelectedMatchNarrative(effectivePoint) : '';
        const showTrivia = interestingNote && !matchNarrative.includes(interestingNote);
        triviaEl.textContent = showTrivia ? interestingNote : '';
        if (showTrivia) {
            triviaEl.removeAttribute('hidden');
        } else {
            triviaEl.setAttribute('hidden', '');
        }
    }

    const pageTitle = `Focus: ${presentation.display} | Semantic Explorer`;
    const pageDesc = sanitizePublicFacingNote(effectivePoint.what) || 'Exploring Montgomery County business records through semantic search and visualization.';

    // 10/10 Polish: Ensure title is updated even during early boot restoration
    if (document.title !== pageTitle) {
        updateDocumentMeta(pageTitle, pageDesc);
    }

    if (filedEl) {
        if (presentation.showRaw && presentation.raw) {
            filedEl.textContent = COPY.selectedFiledAs(presentation.raw);
            filedEl.removeAttribute('hidden');
        } else {
            filedEl.setAttribute('hidden', '');
            filedEl.textContent = '';
        }
    }

    if (metaEl) {
        const chips = [
            effectivePoint.city || 'Montgomery County',
            describeCluster(effectivePoint.cluster),
            getPublicRecordStatusLabel(effectivePoint.status)
        ];
        metaEl.innerHTML = chips.map((chip) => `<span class="focus-stage-chip">${escapeHtml(chip)}</span>`).join('');
    }

    if (noteEl) {
        const strandArrivalNote = selectedCardAdapter.getStrandArrivalNote(effectivePoint);
        if (strandArrivalNote) {
            noteEl.textContent = strandArrivalNote;
        } else if (typeof adapter.hasColdDegradedSemanticFallback === 'function' && adapter.hasColdDegradedSemanticFallback()) {
            const copyFn = adapter.getColdDegradedRouteCopy;
            noteEl.textContent = (copyFn && copyFn())?.focusStageNote || '';
        } else if (state.navState.threadSource === 'semantic') {
            noteEl.textContent = state.currentSearchSummary
                ? 'Connections are live here. The route stays active while this stage keeps the node centered.'
                : 'Connections are live here. Overview steps back to the county; Refocus Neighborhood re-frames the local field around the selected business.';
        } else if (state.semanticThreadsStatus === 'loading') {
            noteEl.textContent = 'Connections are still loading, so this stage is using the live cloud for now.';
        } else {
            noteEl.textContent = 'Connections are not ready here yet, so this stage is using the live cloud as an approximate guide.';
        }
    }

    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    const onboardingHint = document.getElementById('onboarding-hint');
    if (onboardingHint) {
        onboardingHint.classList.remove('visible');
        onboardingHint.setAttribute('aria-hidden', 'true');
        onboardingHint._dismissedThisSession = true;
        if (onboardingHint._autoHideTimer) clearTimeout(onboardingHint._autoHideTimer);
    }
}

export function updateSelectedBusiness(point, options = {}) {
    const emptyEl = document.getElementById('selected-empty');
    const detailsEl = document.getElementById('selected-details');
    const cardEl = document.getElementById('selected-card');
    if (!emptyEl || !detailsEl) return;

    if (typeof updateSelectedCardHeading === 'function') updateSelectedCardHeading(point || null);

    if (!point) {
        if (cardEl) cardEl.style.opacity = '0';
        setTimeout(() => {
            if (cardEl && cardEl.style.opacity !== '1') cardEl.style.opacity = '1';
        }, 180);
        emptyEl.style.display = '';
        detailsEl.hidden = true;
        detailsEl.classList.remove('active');
        if (cardEl) applyClusterUiAccent(cardEl, null);
        if (typeof renderSelectedMetaStrip === 'function') renderSelectedMetaStrip(null);
        if (typeof renderSelectedMatchPanel === 'function') renderSelectedMatchPanel(null);
        if (typeof renderSelectedActionRow === 'function') renderSelectedActionRow(null);
        if (typeof syncSelectedCardContentVariant === 'function') syncSelectedCardContentVariant(null);
        const roleEl = document.getElementById('selected-role-badge');
        if (roleEl) roleEl.textContent = COPY.selectedEmptyRole;
        const nameEl = document.getElementById('selected-name');
        if (nameEl) nameEl.textContent = COPY.selectedEmptyName;
        const whatEl = document.getElementById('selected-what');
        if (whatEl) whatEl.textContent = COPY.selectedEmptyWhat;
        const badgesEl = document.getElementById('selected-badges');
        if (badgesEl) badgesEl.innerHTML = '';
        const triviaEl = document.getElementById('selected-trivia');
        if (triviaEl) {
            triviaEl.textContent = '';
            triviaEl.style.display = 'none';
        }
        const factsEl = document.getElementById('selected-facts');
        if (factsEl) factsEl.textContent = COPY.selectedEmptyFacts;
        const sensitivityEl = document.getElementById('selected-sensitivity');
        if (sensitivityEl) { sensitivityEl.innerHTML = ''; sensitivityEl.style.display = 'none'; }
        const themeEl = document.getElementById('selected-theme');
        if (themeEl) themeEl.textContent = COPY.selectedEmptyTheme;
        const statusEl = document.getElementById('selected-status');
        if (statusEl) statusEl.textContent = COPY.selectedEmptyStatus;
        const mapEl = document.getElementById('selected-map');
        if (mapEl) mapEl.textContent = COPY.selectedEmptyMap;
        const threadEl = document.getElementById('selected-thread');
        if (threadEl) threadEl.textContent = COPY.selectedEmptyThread;
        const trailContextEl = document.getElementById('trail-context');
        if (trailContextEl) {
            trailContextEl.textContent = '';
            trailContextEl.style.display = 'none';
        }
        const filedAsEl = document.getElementById('selected-filed-as');
        if (filedAsEl) {
            filedAsEl.hidden = true;
            filedAsEl.textContent = '';
        }
        syncFocusStage(null);
        selectedCardAdapter.updateTraversalUi();
        document.title = 'Semantic Explorer | MoCo Business Mycelium';
        return;
    }

    // Detect transition into populated state by reading the rendered
    // visibility of the details panel (single source of truth for the
    // card's empty/populated visibility, set by setSurfaceHidden).
    const mapSummarySurface = isMapSummarySurface();
    const cardWasEmpty = detailsEl && window.getComputedStyle(detailsEl).display === 'none';
    if (cardWasEmpty && !mapSummarySurface) {
        cardEl.style.opacity = '0';
        setTimeout(() => {
            if (cardEl && cardEl.style.opacity !== '1') cardEl.style.opacity = '1';
        }, 180);
    }
    if (cardEl) applyClusterUiAccent(cardEl, point);
    emptyEl.style.display = 'none';
    detailsEl.hidden = false;
    detailsEl.classList.add('active');

    const cascadeBg = document.getElementById('vector-cascade-bg');
    if (cascadeBg) {
        cascadeBg.innerHTML = '';
        cascadeBg.classList.remove('active');
        cascadeBg.classList.add('active');
        const generateVectorLine = () => Array.from({length: 6}, () => (Math.random() * 2 - 1).toFixed(3)).join('  ');
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const line = document.createElement('div');
                line.className = 'vector-cascade-line';
                line.textContent = generateVectorLine();
                cascadeBg.appendChild(line);
                setTimeout(() => line.remove(), 3000);
            }, i * 150);
        }
        setTimeout(() => cascadeBg.classList.remove('active'), 2000);
    }

    const namePresentation = getBusinessNamePresentation(point.name);
    const nameEl = document.getElementById('selected-name');
    if (nameEl) nameEl.textContent = namePresentation.display;

    const pageTitle = `${namePresentation.display} | Semantic Explorer`;
    const pageDesc = sanitizePublicFacingNote(point.what) || 'Montgomery County business record details.';
    updateDocumentMeta(pageTitle, pageDesc);

    const roleEl = document.getElementById('selected-role-badge');
    if (roleEl && typeof adapter.getSelectedBusinessRoleLabel === 'function') roleEl.textContent = adapter.getSelectedBusinessRoleLabel(point);
    const filedAsEl = document.getElementById('selected-filed-as');
    if (filedAsEl) {
        const raw = namePresentation.raw;
        const isEmptyRaw = !raw || raw === '-' || raw.trim() === '';
        if (namePresentation.showRaw && !isEmptyRaw) {
            filedAsEl.textContent = COPY.selectedFiledAs(raw);
            filedAsEl.hidden = false;
        } else {
            filedAsEl.hidden = true;
            filedAsEl.textContent = '';
        }
    }
    const whatEl = document.getElementById('selected-what');
    if (whatEl) whatEl.textContent = sanitizePublicFacingNote(point.what) || 'Montgomery County business record';
    if (typeof renderSignalBadges === 'function') {
        const badgesEl = document.getElementById('selected-badges');
        if (badgesEl) badgesEl.innerHTML = renderSignalBadges(point);
    }
    if (typeof renderSelectedMetaStrip === 'function') renderSelectedMetaStrip(point);
    if (typeof renderSelectedMatchPanel === 'function') renderSelectedMatchPanel(point);
    if (typeof renderSelectedActionRow === 'function') renderSelectedActionRow(point);
    if (typeof syncSelectedCardContentVariant === 'function') syncSelectedCardContentVariant(point);

    const factsEl = document.getElementById('selected-facts');
    const themeEl = document.getElementById('selected-theme');
    const statusEl = document.getElementById('selected-status');
    const mapEl = document.getElementById('selected-map');
    const threadEl = document.getElementById('selected-thread');

    const triviaEl = document.getElementById('selected-trivia');
    if (!factsEl) return;

    const interestingNote = typeof adapter.getInterestingBusinessNote === 'function' ? adapter.getInterestingBusinessNote(point) : null;
    if (triviaEl) {
        const matchNarrative = typeof adapter.buildSelectedMatchNarrative === 'function' ? adapter.buildSelectedMatchNarrative(point) : '';
        const showTrivia = interestingNote && !matchNarrative.includes(interestingNote);
        triviaEl.textContent = showTrivia ? interestingNote : '';
        triviaEl.style.display = showTrivia ? 'block' : 'none';
    }

    const suppressAutoRevealForFieldNode = options.revealCard !== true && typeof adapter.isFieldNodeFocusContext === 'function' && adapter.isFieldNodeFocusContext();
    if (options.revealCard !== false && !suppressAutoRevealForFieldNode) {
        if (typeof adapter.revealSelectedBusinessCard === 'function') adapter.revealSelectedBusinessCard();
    }
    syncFocusStage(point);

    const factParts = [];
    if (point.city) factParts.push(point.city);
    if (point.website) {
        const websiteLabel = escapeHtml(point.website.replace(/^https?:\/\//, '').replace(/\/$/, ''));
        const href = point.website.match(/^https?:\/\//)
            ? point.website
            : `https://${point.website}`;
        factParts.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${websiteLabel}</a>`);
    }
    if (point.email) factParts.push(`<a href="mailto:${escapeHtml(point.email)}">${escapeHtml(point.email)}</a>`);
    if (point.phone) factParts.push(`<a href="tel:${escapeHtml(point.phone)}">${escapeHtml(point.phone)}</a>`);
    factsEl.innerHTML = factParts.length
        ? factParts.join(' &nbsp;|&nbsp; ')
        : '<span class="facts-none">No contact info on file</span>';

    const sensitivityEl = document.getElementById('selected-sensitivity');
    if (sensitivityEl) {
        const sensitivityBadges = [];
        if (point.weather_sensitive) {
            sensitivityBadges.push('<span class="signal-badge weather">Weather Sensitive</span>');
        }
        if (point.sensitivity_flags && point.sensitivity_flags.length) {
            point.sensitivity_flags.forEach((flag) => {
                sensitivityBadges.push(`<span class="signal-badge flag">${escapeHtml(flag)}</span>`);
            });
        }
        sensitivityEl.innerHTML = sensitivityBadges.join('');
        sensitivityEl.style.display = sensitivityBadges.length ? '' : 'none';
    }

    themeEl.textContent = describeCluster(point.cluster);
    statusEl.textContent = getPublicRecordStatusLabel(point.status);

    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
        mapEl.textContent = `Mapped at ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
    } else {
        mapEl.textContent = 'No geocoded point';
    }

    if (threadEl && typeof adapter.describeThreadLensForPoint === 'function') {
        threadEl.textContent = adapter.describeThreadLensForPoint(point);
    }

    selectedCardAdapter.updateTraversalUi();

    if (!options.skipHydrate && !interestingNote && !point.website && !point.email && !point.phone) {
        if (typeof adapter.hydrateLeadContext === 'function') void adapter.hydrateLeadContext(point, { refreshSelected: true });
    }
}
