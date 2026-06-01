import { state } from '../../state.js';
import {
    search,
    clearSearch
} from '../search-state.js';
import { returnToOverview } from '../lifecycle.js';

export function updateHasQuery() {
    const searchInput = document.getElementById('search-input');
    const searchContainer = document.querySelector('.search-container');
    if (!searchInput) return;
    const hasQuery = searchInput.value.trim().length > 0;
    searchContainer?.classList.toggle('has-query', hasQuery);
}

export function bindSearchControls() {
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (!searchInput) return;

    searchInput.addEventListener('focus', () => {
        // Onboarding hint is intentionally left unimplemented; the onboarding surface
        // was not present in the shell; no orphan call should be made here.
    });
    const searchInputHandler = (e) => {
        if (!e?.target) return;
        const query = e.target.value;
        // Onboarding hint intentionally left unimplemented; quarantine per repair goals.
        clearTimeout(state.searchTimeout);
        updateHasQuery();
        if (!String(query || '').trim()) {
            state.searchTimeout = null;
            search(query);
            return;
        }
        state.searchTimeout = setTimeout(() => { search(query); }, 300);
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
            if (typeof returnToOverview === 'function') returnToOverview();
            else clearSearch();
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
