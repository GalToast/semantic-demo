<script>
    import { onMount, onDestroy } from 'svelte';
    import { search, clearSearch } from '../search-state.js';
    import { returnToOverview } from '../lifecycle.js';
    import { isCompactSearchViewport } from '../utils/ui-presentation.js';
    import { setMobileSearchSheetMode, setSearchContainerState } from '../search-panel-adapter.js';

    let {
        debounceMs = 300,
        onSearch = null
    } = $props();

    let value = $state('');
    let inputEl;
    let debounceTimer = null;
    let inputHandler;
    let keydownHandler;
    let clearClickHandler;
    let clearKeydownHandler;
    let labelClickHandler;
    let labelKeydownHandler;
    let containerObserver = null;

    const hasQuery = $derived(value.trim().length > 0);

    $effect(() => {
        if (typeof setSearchContainerState === 'function') {
            setSearchContainerState({ hasQuery: hasQuery });
        }
    });

    $effect(() => {
        if (!inputEl) return;
        if (!inputHandler) {
            inputHandler = (event) => {
                value = event.target.value;
                if (debounceTimer) clearTimeout(debounceTimer);
                const next = value;
                if (!String(next || '').trim()) {
                    debounceTimer = null;
                    if (typeof search === 'function') search(next);
                    if (typeof onSearch === 'function') onSearch(next);
                    return;
                }
                debounceTimer = setTimeout(() => {
                    if (typeof search === 'function') search(next);
                    if (typeof onSearch === 'function') onSearch(next);
                }, debounceMs);
            };
            keydownHandler = (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (debounceTimer) clearTimeout(debounceTimer);
                    if (inputEl) inputEl.blur();
                    if (typeof search === 'function') search(value);
                    if (typeof onSearch === 'function') onSearch(value);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof returnToOverview === 'function') returnToOverview();
                    else if (typeof clearSearch === 'function') clearSearch();
                    if (inputEl) inputEl.blur();
                }
            };
            inputEl.addEventListener('input', inputHandler);
            inputEl.addEventListener('keydown', keydownHandler);
        }
    });

    function activateSearchClear(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (debounceTimer) clearTimeout(debounceTimer);
        value = '';
        if (typeof clearSearch === 'function') clearSearch();
        if (typeof setSearchContainerState === 'function') {
            setSearchContainerState({ hasQuery: false });
        }
        if (inputEl) inputEl.focus();
    }

    function toggleMobileSheet() {
        if (inputEl) inputEl.focus();
        if (typeof isCompactSearchViewport !== 'function' || !isCompactSearchViewport()) return;
        const searchContainer = inputEl?.closest('.search-container');
        if (!searchContainer?.classList.contains('has-query')) return;
        const isOpening = document.body?.dataset?.mobileSearchSheet !== 'expanded';
        const nextMode = isOpening ? 'expanded' : 'peek';
        if (typeof setMobileSearchSheetMode === 'function') {
            setMobileSearchSheetMode(nextMode, { userInitiated: true });
        }
    }

    function handleLabelKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleMobileSheet();
    }

    onMount(() => {
        const clearBtn = inputEl?.parentElement?.querySelector('#search-clear-btn');
        if (clearBtn) {
            clearClickHandler = activateSearchClear;
            clearKeydownHandler = (event) => {
                if (event.key === 'Enter' || event.key === ' ') activateSearchClear(event);
            };
            clearBtn.addEventListener('click', clearClickHandler);
            clearBtn.addEventListener('keydown', clearKeydownHandler);
        }
        const label = inputEl?.closest('.search-container')?.querySelector('.search-label');
        if (label && !label.dataset.chromeSvelteBound) {
            labelClickHandler = toggleMobileSheet;
            labelKeydownHandler = handleLabelKeydown;
            label.addEventListener('click', labelClickHandler);
            label.addEventListener('keydown', labelKeydownHandler);
            label.dataset.chromeSvelteBound = 'true';
        }
    });

    onDestroy(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (inputEl) {
            if (inputHandler) inputEl.removeEventListener('input', inputHandler);
            if (keydownHandler) inputEl.removeEventListener('keydown', keydownHandler);
        }
        const clearBtn = inputEl?.parentElement?.querySelector('#search-clear-btn');
        if (clearBtn) {
            if (clearClickHandler) clearBtn.removeEventListener('click', clearClickHandler);
            if (clearKeydownHandler) clearBtn.removeEventListener('keydown', clearKeydownHandler);
        }
        const label = inputEl?.closest('.search-container')?.querySelector('.search-label');
        if (label) {
            if (labelClickHandler) label.removeEventListener('click', labelClickHandler);
            if (labelKeydownHandler) label.removeEventListener('keydown', labelKeydownHandler);
            delete label.dataset.chromeSvelteBound;
        }
    });
</script>

<button class="search-label" type="button" aria-label="Toggle search sheet">
    <span class="search-label-text">Semantic Search</span>
    <span class="semantic-lane-pill" id="semantic-lane-pill" data-state="checking" title="Checking search readiness."></span>
</button>
<div class="search-input-wrapper">
    <span class="search-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-search"></use></svg></span>
    <input
        bind:this={inputEl}
        type="text"
        class="search-input"
        id="search-input"
        placeholder="Search by need or clue…"
        aria-label="Search businesses semantically by need, venue, service, or clue"
        aria-controls="search-results"
        aria-describedby="search-status-live"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        bind:value
    />
    <div class="search-spinner" id="search-spinner" aria-hidden="true"></div>
    <button class="search-clear-btn" id="search-clear-btn" type="button" aria-label="Clear search">
        <svg class="ui-icon" aria-hidden="true"><use href="#icon-close"></use></svg>
    </button>
</div>
