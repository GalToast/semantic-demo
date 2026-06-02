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
    if (searchInput._onKeydownHandler) {
        searchInput.removeEventListener('keydown', searchInput._onKeydownHandler);
    }
    searchInput._onKeydownHandler = (event) => {
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
    };
    searchInput.addEventListener('keydown', searchInput._onKeydownHandler);

    if (clearBtn) {
        if (clearBtn._onClickHandler) clearBtn.removeEventListener('click', clearBtn._onClickHandler);
        if (clearBtn._onKeydownHandler) clearBtn.removeEventListener('keydown', clearBtn._onKeydownHandler);

        const activateSearchClear = (event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            clearTimeout(state.searchTimeout);
            clearSearch();
            searchInput.focus();
            updateHasQuery();
        };

        clearBtn._onClickHandler = activateSearchClear;
        clearBtn._onKeydownHandler = (event) => {
            if (event.key === 'Enter' || event.key === ' ') activateSearchClear(event);
        };

        clearBtn.addEventListener('click', clearBtn._onClickHandler);
        clearBtn.addEventListener('keydown', clearBtn._onKeydownHandler);
    }
}
