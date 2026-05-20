import { state } from '../state.js';
import { isCompactFocusStageViewport } from '../utils.js';
import { syncFilterControls, switchView, resetExperienceState } from './lifecycle.js';
import { toggleAutoRotate, focusOnNode } from './camera-controls.js';
import {
    search,
    clearSearch,
    clearShortSemanticSearchState,
    clearSearchGlow,
    applyFilters
} from './search-state.js';

function bindClick(id, handler, options = {}) {
    const element = document.getElementById(id);
    if (!element) {
        if (!options.optional) console.warn('[event-bindings] button not found:', id);
        return;
    }
    element.onclick = handler;
}

function bindViewControls() {
    bindClick('btn-galaxy', () => switchView('galaxy'));
    bindClick('btn-map', () => switchView('map'));
    bindClick('btn-zoom-in', () => window.zoomCamera?.(0.84));
    bindClick('btn-zoom-out', () => window.zoomCamera?.(1.18));
    bindClick('btn-reset', () => resetExperienceState());
    bindClick('btn-rotate', () => toggleAutoRotate());
    bindClick('btn-share-view', () => {
        const btn = document.getElementById('btn-share-view');
        if (!btn) return;
        const originalHTML = btn.innerHTML;
        const originalLabel = btn.getAttribute('aria-label') || 'Copy current view link';
        if (typeof window.copyCurrentViewLink === 'function') {
            window.copyCurrentViewLink().then(() => {
                btn.innerHTML = `<span class="share-toggle-label" aria-hidden="true">Copied</span>`;
                btn.setAttribute('aria-label', 'Link copied to clipboard');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.setAttribute('aria-label', originalLabel);
                }, 2000);
            }).catch(() => {
                if (typeof window.showExperienceToast === 'function') window.showExperienceToast('Copy unavailable', 'Use the address bar to copy this current view.');
            });
        }
    }, { optional: true });
}

function bindFocusControls() {
    const runJourneyCompassAction = (action) => {
        if (action && typeof window.executeJourneyCompassAction === 'function') {
            window.executeJourneyCompassAction(action);
        }
    };

    bindClick('btn-focus-prev', () => window.traverseNeighbor(-1));
    bindClick('btn-focus-next', () => window.traverseNeighbor(1));
    bindClick('btn-focus-overview', () => { if (typeof window.resetExplorationFocus === 'function') window.resetExplorationFocus(); });
    bindClick('btn-focus-center', () => window.recenterFocusedNode());
    bindClick('btn-focus-expand', window.expandNeighborhoodFromCurrentNode);
    bindClick('btn-focus-dive', () => window.setSemanticDiveMode(!state.semanticDiveMode));
    bindClick('btn-inside-next', window.exploreInsideToNextStop, { optional: true });
    bindClick('btn-inside-county', window.returnToCountyView, { optional: true });
    bindClick('btn-journey-primary', (event) =>
        runJourneyCompassAction(event.currentTarget.dataset.journeyAction));
    bindClick('btn-journey-secondary', (event) =>
        runJourneyCompassAction(event.currentTarget.dataset.journeyAction));
    bindClick('btn-journey-tertiary', (event) =>
        runJourneyCompassAction(event.currentTarget.dataset.journeyAction));

    const actionMap = {
        overview: 'county-overview',
        search: 'focus-search',
        focus: 'center-anchor',
        inside: 'enter-inside',
        map: 'open-map'
    };

    if (!document.body?.dataset.journeyCompassStepDelegated) {
        document.addEventListener('click', (event) => {
            const step = event.target.closest?.('.journey-compass-step');
            if (!step) return;
            const action = actionMap[step.dataset.journeyStep];
            if (action && typeof window.executeJourneyCompassAction === 'function') {
                window.executeJourneyCompassAction(action);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const step = event.target.closest?.('.journey-compass-step');
            if (!step) return;
            event.preventDefault();
            const action = actionMap[step.dataset.journeyStep];
            if (action && typeof window.executeJourneyCompassAction === 'function') {
                window.executeJourneyCompassAction(action);
            }
        });
        if (document.body) document.body.dataset.journeyCompassStepDelegated = 'true';
    }

    bindClick('btn-explore-network', () => {
        // Network explorer: navigate to first cluster neighborhood if none active,
        // or clear the cluster filter to return to county overview.
        // Fallback: trigger the cluster list toggle. Quarantine: avoid routing to
        // random-business unless the shell proves that is the intended control.
        if (state.activeClusterFilter !== null) {
            if (typeof window.clearClusterFilter === 'function') window.clearClusterFilter();
        } else {
            const clusterList = document.getElementById('cluster-list');
            const firstClusterBtn = clusterList?.querySelector('[data-cluster]');
            if (firstClusterBtn) {
                firstClusterBtn.click();
            } else {
                if (typeof window.showExperienceToast === 'function') {
                    window.showExperienceToast('Network explorer', 'No semantic neighborhoods available in the current filter.');
                }
            }
        }
    }, { optional: true });
}

function bindSuggestionControls() {
    const focusRandomBusiness = () => {
        if (!state.points || state.points.length === 0) return;
        
        const btn = document.getElementById('btn-surprise') || document.getElementById('btn-launch');
        const originalText = btn ? btn.textContent : 'Random Business';
        
        if (btn) {
            btn.classList.add('is-loading');
            btn.setAttribute('aria-disabled', 'true');
            btn.textContent = 'Finding...';
        }

        setTimeout(() => {
            const eligible = state.points.filter(p => p && p.status !== 'disqualified');
            if (!eligible.length) {
                const summaryEl = document.getElementById('summary-text');
                if (summaryEl) summaryEl.textContent = 'No eligible businesses for surprise selection.';
                if (btn) {
                    btn.classList.add('disabled');
                    btn.setAttribute('aria-disabled', 'true');
                    btn.title = 'No eligible businesses for surprise selection';
                    btn.textContent = originalText;
                }
                return;
            }

            if (btn) {
                btn.classList.remove('is-loading');
                btn.classList.remove('disabled');
                btn.removeAttribute('aria-disabled');
                btn.removeAttribute('title');
                btn.textContent = originalText;
            }

            const rand = eligible[Math.floor(Math.random() * eligible.length)];
            const idx = state.points.indexOf(rand);
            
            if (idx >= 0) {
                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.value = '';
                clearShortSemanticSearchState();
                
                if (typeof window.focusOnNode === 'function') {
                    window.focusOnNode(idx, { fromCanvasNode: true });
                }
            }
        }, 800);
    };

    bindClick('btn-launch', focusRandomBusiness, { optional: true });
    bindClick('btn-surprise', focusRandomBusiness, { optional: true });

    bindClick('summary-suggestions', (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const focusedIdx = (Number.isFinite(state.navState?.focusedIndex))
            ? state.navState.focusedIndex
            : (Number.isFinite(state.focusedNode) ? state.focusedNode : null);

        if (action === 'similar') {
            if (focusedIdx === null) {
                const textEl = document.getElementById('summary-text');
                if (textEl) textEl.textContent = 'Select a business first to explore nearby groups.';
                if (btn) {
                    btn.classList.add('shake');
                    btn.title = 'Select a business first';
                    setTimeout(() => btn.classList.remove('shake'), 400);
                }
                return;
            }
            const cluster = state.points[focusedIdx]?.cluster;
            if (Number.isFinite(cluster)) {
                const sameCluster = state.points
                    .map((p, i) => ({ p, i }))
                    .filter(({ p, i }) => p && p.cluster === cluster && i !== focusedIdx);
                if (sameCluster.length) {
                    const { i } = sameCluster[Math.floor(Math.random() * sameCluster.length)];
                    if (typeof window.focusOnNode === 'function') window.focusOnNode(i, { fromCanvasNode: true });
                }
            }
        } else if (action === 'neighbor') {
            if (focusedIdx === null) {
                const textEl = document.getElementById('summary-text');
                if (textEl) textEl.textContent = 'Select a business first to find its nearest linked business.';
                if (btn) {
                    btn.classList.add('shake');
                    btn.title = 'Select a business first';
                    setTimeout(() => btn.classList.remove('shake'), 400);
                }
                return;
            }
            if (!state.points) return;
            const fp = state.points[focusedIdx];
            if (fp) {
                let nearest = null;
                let nearestDist = Infinity;
                state.points.forEach((p, i) => {
                    if (!p || i === focusedIdx) return;
                    const dx = p.x - fp.x;
                    const dy = p.y - fp.y;
                    const dz = p.z - fp.z;
                    const d = dx * dx + dy * dy + dz * dz;
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearest = i;
                    }
                });
                if (nearest !== null && window.focusOnNode) window.focusOnNode(nearest, { fromCanvasNode: true });
            }
        } else if (action === 'report') {
            if (typeof window.showSemanticThreadsDetail === 'function') window.showSemanticThreadsDetail();
        }
    });
}

export function updateHasQuery() {
    const searchInput = document.getElementById('search-input');
    const searchContainer = document.querySelector('.search-container');
    if (!searchInput) return;
    const hasQuery = searchInput.value.trim().length > 0;
    searchContainer?.classList.toggle('has-query', hasQuery);
}

function bindSearchControls() {
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (!searchInput) return;

    searchInput.addEventListener('focus', () => {
        // Onboarding hint is intentionally left unimplemented; the onboarding surface
        // was not present in the shell; no orphan call should be made here.
    });
    const searchInputHandler = (e) => {
        // Onboarding hint intentionally left unimplemented; quarantine per repair goals.
        clearTimeout(state.searchTimeout);
        updateHasQuery();
        state.searchTimeout = setTimeout(() => { search(e.target.value); }, 300);
    };
    if (searchInput._onInputHandler) searchInput.removeEventListener('input', searchInput._onInputHandler);
    searchInput._onInputHandler = searchInputHandler;
    searchInput.addEventListener('input', searchInputHandler);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            clearTimeout(state.searchTimeout);
            searchInput.blur();
            search(searchInput.value);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            clearSearch();
            searchInput.blur();
        }
    });

    if (clearBtn) {
        const activateSearchClear = (event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            clearTimeout(state.searchTimeout);
            clearSearch();
            searchInput.focus();
            updateHasQuery();
        };
        clearBtn.addEventListener('click', activateSearchClear);
        clearBtn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') activateSearchClear(event);
        });
    }
}

function bindSemanticLaneControls(recordSemanticLaneSnapshot, setSemanticLaneUiState) {
    const retryBtn = document.getElementById('btn-semantic-lane-retry');
    if (retryBtn) {
        retryBtn.onclick = () => {
            recordSemanticLaneSnapshot({ state: 'reconnecting', attempted_warm: true });
            setSemanticLaneUiState('reconnecting', { label: 'Manual retry', title: 'Manual search retry is refreshing the background services.' });
            if (typeof window.loadSemanticThreads === 'function') window.loadSemanticThreads({ reason: 'manual-retry' }).catch(() => {});
            if (typeof window.probeSemanticLane === 'function') window.probeSemanticLane({ warm: true, reason: 'manual-retry' }).catch(() => {});
        };
    }
}

function bindModeAndPromptControls(setMyceliumMode) {
    document.querySelectorAll('[data-mode]').forEach((button) => {
        button.onclick = () => {
            if (button.dataset.story && typeof window.applyStoryPrompt === 'function') {
                if (button.dataset.story === 'trail' && state.focusedNode === null) {
                    if (typeof window.showExperienceToast === 'function') window.showExperienceToast('Trail locked', 'Select a business first.');
                    return;
                }
                window.applyStoryPrompt(button.dataset.story);
                return;
            }
            const mode = button.dataset.mode || 'default';
            if (mode === 'trail' && state.focusedNode === null) {
                if (typeof window.showExperienceToast === 'function') window.showExperienceToast('Trail locked', 'Select a business first.');
                return;
            }
            setMyceliumMode(mode);
        };
    });

    document.querySelectorAll('[data-demo-query]').forEach((button) => {
        button.onclick = () => {
            const query = button.dataset.demoQuery || '';
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = query;
                if (typeof window.focusSearchInputForReplacement === 'function') window.focusSearchInputForReplacement();
            }
            document.querySelectorAll('[data-demo-query]').forEach((chip) => {
                chip.classList.remove('active', 'is-loading');
                chip.removeAttribute('aria-disabled');
            });
            button.classList.add('is-loading');
            button.setAttribute('aria-disabled', 'true');
            const originalText = button.textContent.trim();
            button.textContent = 'Finding...';

            const cueEl = document.getElementById('search-trail-cue');
            if (cueEl) {
                cueEl.hidden = false;
                cueEl.classList.add('active');
                cueEl.querySelectorAll('.search-trail-cue-step').forEach((el) => {
                    el.classList.toggle('active', el.dataset.cueStage === 'query');
                });
            }

            let restoreTimer = setTimeout(() => {
                button.classList.remove('is-loading');
                button.removeAttribute('aria-disabled');
                button.textContent = originalText;
            }, 4000);

            const wrappedSearch = (...args) => {
                clearTimeout(restoreTimer);
                return search(...args);
            };
            wrappedSearch(query);
        };
    });

    document.querySelectorAll('[data-story]').forEach((button) => {
        button.onclick = () => {
            if (typeof window.applyStoryPrompt === 'function') window.applyStoryPrompt(button.dataset.story || '');
        };
    });
}

function bindFilterControls() {
    const refreshActiveSearchResults = () => {
        const searchInput = document.getElementById('search-input');
        const query = searchInput?.value?.trim() || '';
        if (!query) return;
        search(query);
    };

    const handleFilter = (filterFn, updateReason) => {
        state.activeStoryPrompt = null;
        state.filterVersion++;
        if (typeof syncFilterControls === 'function') syncFilterControls();
        clearSearchGlow();
        clearTimeout(state.searchTimeout);
        state.searchTimeout = setTimeout(() => {
            applyFilters();
            if (typeof window.updateUrlState === 'function') window.updateUrlState({}, { reason: updateReason });
            refreshActiveSearchResults();
        }, 150);
    };

    document.querySelectorAll('[data-status-filter]').forEach((button) => {
        button.onclick = () => {
            state.activeFilters.status = button.dataset.statusFilter || 'all';
            handleFilter(null, 'status-filter');
        };
    });

    document.querySelectorAll('[data-signal-filter]').forEach((button) => {
        button.onclick = () => {
            const key = button.dataset.signalFilter;
            state.activeFilters[key] = !state.activeFilters[key];
            handleFilter(null, 'signal-filter');
        };
    });

    const cityFilter = document.getElementById('city-filter');
    if (cityFilter) {
        cityFilter.onchange = (e) => {
            state.activeFilters.city = e.target.value || 'all';
            handleFilter(null, 'city-filter');
        };
    }

    const cityFilterPills = document.getElementById('city-filter-pills');
    if (cityFilterPills) {
        cityFilterPills.onclick = (e) => {
            const btn = e.target.closest('[data-city-filter]');
            if (!btn) return;
            state.activeFilters.city = btn.dataset.cityFilter || 'all';
            handleFilter(null, 'city-filter-pill');
        };
    }

    const clearFiltersBtn = document.getElementById('filter-clear-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.onclick = () => {
            state.activeFilters.status = 'all';
            state.activeFilters.city = 'all';
            state.activeFilters.website = false;
            state.activeFilters.email = false;
            state.activeFilters.geocoded = false;
            if (typeof window.updateUrlState === 'function') window.updateUrlState({}, { reason: 'filter-clear' });
            handleFilter(null, 'filter-clear');
        };
    }
}

function bindWindowControlFunctions(resetExperienceState, resetNodePositions) {
    window.resetNodePositions = resetNodePositions;

    window.revealSelectedBusinessCard = function () {
        if (typeof window.setInfoPanelOpen === 'function') {
            window.setInfoPanelOpen(true);
        }
    };

    window.zoomCamera = function (multiplier) {
        if (state.currentView === 'map' && typeof window.zoomMap === 'function') {
            window.zoomMap(multiplier);
            return;
        }
        if (!state.camera || !state.controls) return;
        const target = state.controls.target;
        const direction = state.camera.position.clone().sub(target).normalize();
        const currentDistance = state.camera.position.distanceTo(target);
        const newDistance = currentDistance * multiplier;
        const minDist = state.controls.minDistance || state.ORBIT_MIN_DISTANCE_DEFAULT;
        const maxDist = state.controls.maxDistance || state.ORBIT_MAX_DISTANCE_DEFAULT;
        const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance));
        state.camera.position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)));
    };

    window.expandNeighborhoodFromCurrentNode = function () {
        const index = state.focusedNode;
        if (!Number.isFinite(index)) return;
        if (typeof window.applyLocalNeighborhoodFocus === 'function') window.applyLocalNeighborhoodFocus(index);
    };

    window.recenterFocusedNode = function () {
        const index = state.focusedNode;
        if (!Number.isFinite(index)) return;
        if (typeof window.animateCameraToNode === 'function') window.animateCameraToNode(index, { transitionStyle: 'focus' });
    };

    window.returnToCountyView = function () {
        if (typeof window.resetExplorationFocus === 'function') {
            window.resetExplorationFocus();
        } else if (typeof resetNodePositions === 'function') {
            resetNodePositions({ preserveSearch: true });
        }
    };

    window.setInfoPanelOpen = function (open, options = {}) {
        const panel = document.querySelector('.info-panel');
        if (!panel) return false;
        const isOpen = panel.classList.contains('active');
        const shouldBeOpen = open !== undefined ? open : !isOpen;
        const restoreFocus = options.restoreFocus === true || open === undefined;

        const infoPanelToggle = document.getElementById('info-panel-toggle');
        const panelBtn = document.getElementById('btn-panel');
        if (shouldBeOpen && restoreFocus) {
            window._previouslyFocusedInfoPanel = document.activeElement || infoPanelToggle || panelBtn;
        }

        panel.classList.toggle('active', shouldBeOpen);
        document.body.dataset.focusPanelMode = shouldBeOpen ? 'manual-panel' : 'manual-collapsed';

        if (panelBtn) {
            panelBtn.classList.toggle('is-collapsed', !shouldBeOpen);
            panelBtn.setAttribute('aria-expanded', String(shouldBeOpen));
        }

        const infoToggleIcon = document.getElementById('info-toggle-icon');
        if (infoToggleIcon) infoToggleIcon.classList.toggle('is-collapsed', !shouldBeOpen);
        if (infoPanelToggle) infoPanelToggle.setAttribute('aria-expanded', String(shouldBeOpen));

        if (!shouldBeOpen && restoreFocus) {
            const prevFocus = window._previouslyFocusedInfoPanel || infoPanelToggle || panelBtn;
            if (prevFocus && typeof prevFocus.focus === 'function') {
                prevFocus.focus({ preventScroll: true });
            }
            window._previouslyFocusedInfoPanel = null;
        } else if (!shouldBeOpen) {
            window._previouslyFocusedInfoPanel = null;
        }

        return shouldBeOpen;
    };
}

let _activeResizeHandler = null;

function bindPanelControls(onWindowResize) {
    if (_activeResizeHandler) {
        window.removeEventListener('resize', _activeResizeHandler);
    }
    _activeResizeHandler = onWindowResize;
    window.addEventListener('resize', onWindowResize);

    bindClick('info-panel-toggle', () => {
        window.setInfoPanelOpen();
    });

    bindClick('btn-panel', () => {
        const panelOpen = window.setInfoPanelOpen();
        if (isCompactFocusStageViewport() && panelOpen) {
            const legendPanel = document.getElementById('legend-panel');
            const legendToggle = document.getElementById('btn-legend');
            if (legendPanel?.classList.contains('active')) {
                legendPanel.classList.remove('active');
                legendPanel.setAttribute('aria-hidden', 'true');
                document.documentElement.dataset.legendActive = 'false';
                if (legendToggle) legendToggle.setAttribute('aria-expanded', 'false');
            }
            const infoToggle = document.getElementById('info-panel-toggle');
            if (infoToggle) infoToggle.setAttribute('aria-expanded', 'true');
        }
    });
}

function bindLegendControls() {
    const infoPanel = document.querySelector('.info-panel');
    const panelBtn = document.getElementById('btn-panel');
    const legendPanel = document.getElementById('legend-panel');
    const legendToggle = document.getElementById('btn-legend');

    const restoreLegendCollapsedPanel = () => {
        if (!isCompactFocusStageViewport() || document.body.dataset.focusPanelMode !== 'legend-open') return;
        if (infoPanel) infoPanel.classList.add('active');
        document.body.dataset.focusPanelMode = 'overview';
        if (panelBtn) panelBtn.setAttribute('aria-expanded', 'true');
    };
    window.restoreLegendCollapsedPanel = restoreLegendCollapsedPanel;

    if (legendToggle && legendPanel) {
        legendToggle.onclick = () => {
            const isOpening = !legendPanel.classList.contains('active');
            if (isOpening) {
                window._previouslyFocusedLegend = document.activeElement || legendToggle;
            }
            legendPanel.classList.toggle('active', isOpening);
            legendPanel.setAttribute('aria-hidden', isOpening ? 'false' : 'true');
            document.documentElement.dataset.legendActive = isOpening ? 'true' : 'false';
            legendToggle.setAttribute('aria-expanded', String(isOpening));
            if (isCompactFocusStageViewport() && isOpening) {
                if (infoPanel?.classList.contains('active')) {
                    infoPanel.classList.remove('active');
                    document.body.dataset.focusPanelMode = 'legend-open';
                    if (panelBtn) panelBtn.setAttribute('aria-expanded', 'false');
                    const infoToggle = document.getElementById('info-panel-toggle');
                    if (infoToggle) infoToggle.setAttribute('aria-expanded', 'false');
                }
            } else if (!isOpening) {
                restoreLegendCollapsedPanel();
            }
        };
    }

    if (!state.registeredEvents.has('legend-interaction')) {
        state.registeredEvents.add('legend-interaction');
        document.addEventListener('pointerdown', (e) => {
            if (!legendPanel?.classList.contains('active')) return;
            if (legendPanel.contains(e.target) || legendToggle?.contains(e.target)) return;
            const prevFocus = window._previouslyFocusedLegend || legendToggle;
            legendPanel.classList.remove('active');
            legendPanel.setAttribute('aria-hidden', 'true');
            document.documentElement.dataset.legendActive = 'false';
            if (legendToggle) legendToggle.setAttribute('aria-expanded', 'false');
            restoreLegendCollapsedPanel();
            if (prevFocus && typeof prevFocus.focus === 'function') {
                prevFocus.focus({ preventScroll: true });
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && legendPanel?.classList.contains('active')) {
                if (typeof window.closeLegendGuide === 'function') window.closeLegendGuide({ restoreFocus: true });
            }
        });
    }
}

function bindGlobalEvents() {
    if (!state.registeredEvents.has('global-interaction')) {
        state.registeredEvents.add('global-interaction');
        document.addEventListener('keydown', (e) => {
            const button = e.target instanceof HTMLButtonElement ? e.target : null;
            if (button && !button.disabled && (e.key === ' ' || e.code === 'Space')) {
                e.preventDefault();
                e.stopPropagation();
                button.click();
            }
        }, true);
        window.addEventListener('keydown', (e) => { if (typeof window.handleGalaxyKeydown === 'function') window.handleGalaxyKeydown(e); });
        window.addEventListener('focus', () => { if (typeof window.handleSemanticLaneWindowFocus === 'function') window.handleSemanticLaneWindowFocus(); });
        window.addEventListener('popstate', (e) => {
            if (typeof window.applyUrlState === 'function') window.applyUrlState({ fromHistory: true, historyState: e.state }).catch(() => {});
        });
        document.addEventListener('visibilitychange', () => { if (typeof window.handleSemanticLaneVisibilityChange === 'function') window.handleSemanticLaneVisibilityChange(); });
    }
}

function bindUtilityButtons() {
    bindClick('btn-close-summary', () => {
        if (typeof window.hideSummaryCard === 'function') window.hideSummaryCard();
        if (typeof window.closeLegendGuide === 'function') window.closeLegendGuide();
    });
    bindClick('btn-synthesize', window.requestSemanticGuide);
    bindClick('btn-prev-node', () => { if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(-1); });
    bindClick('btn-next-node', () => { if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(1); });
    bindClick('btn-overview', () => { if (typeof window.resetExplorationFocus === 'function') window.resetExplorationFocus(); }, { optional: true });
}

let _onboardingIdleTimer = null;
function shouldShowOnboardingHint() {
    const onboarding = document.getElementById('onboarding-hint');
    if (!onboarding || onboarding._dismissedThisSession || state.currentView !== 'galaxy' || state.currentSearchSummary) return false;
    if (state.applyingUrlState || state._deferredUrlState || state.semanticDiveMode || state.restoringBrowserHistory) return false;
    if (document.body?.dataset?.graphContext && document.body.dataset.graphContext !== 'idle') return false;
    return !(Number.isFinite(state.focusedNode) || Number.isFinite(state.navState?.focusedIndex));
}

function resetOnboardingIdleTimer() {
    if (_onboardingIdleTimer) clearTimeout(_onboardingIdleTimer);
    _onboardingIdleTimer = setTimeout(() => {
        const onboarding = document.getElementById('onboarding-hint');
        if (onboarding && shouldShowOnboardingHint()) {
            onboarding.classList.add('visible');
            onboarding.setAttribute('aria-hidden', 'false');
            if (onboarding._autoHideTimer) clearTimeout(onboarding._autoHideTimer);
            onboarding._autoHideTimer = setTimeout(() => {
                onboarding.classList.remove('visible');
                onboarding.setAttribute('aria-hidden', 'true');
                onboarding._autoHideTimer = null;
            }, 6000);
        }
        resetOnboardingIdleTimer();
    }, 120000);
}

function scheduleOnboardingHint() {
    const onboarding = document.getElementById('onboarding-hint');
    setTimeout(() => {
        if (onboarding && shouldShowOnboardingHint()) {
            onboarding.classList.add('visible');
            onboarding.setAttribute('aria-hidden', 'false');
        }
    }, 1500);
    setTimeout(() => {
        if (onboarding) {
            onboarding.classList.remove('visible');
            onboarding.setAttribute('aria-hidden', 'true');
        }
    }, 7500);
    resetOnboardingIdleTimer();
    ['mousemove', 'keydown', 'click'].forEach(evt => document.addEventListener(evt, resetOnboardingIdleTimer, { passive: true }));
}

export function initEventListeners({
    onWindowResize,
    recordSemanticLaneSnapshot,
    resetExperienceState,
    resetNodePositions,
    setMyceliumMode,
    setSemanticLaneUiState
}) {
    if (state.eventListenersInitialized) return;
    state.eventListenersInitialized = true;

    bindWindowControlFunctions(resetExperienceState, resetNodePositions);
    bindViewControls();
    bindFocusControls();
    bindSuggestionControls();
    bindSearchControls();
    bindSemanticLaneControls(recordSemanticLaneSnapshot, setSemanticLaneUiState);
    bindGlobalEvents();
    bindModeAndPromptControls(setMyceliumMode);
    bindUtilityButtons();
    bindFilterControls();
    bindPanelControls(onWindowResize);
    bindLegendControls();

    if (typeof window.buildLegend === 'function') window.buildLegend();
    if (typeof window.syncClusterSectionState === 'function') window.syncClusterSectionState();
    scheduleOnboardingHint();
}
