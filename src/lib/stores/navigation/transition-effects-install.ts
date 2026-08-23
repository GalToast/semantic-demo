/**
 * @lib/stores/navigation/transition-effects-install.ts — Arms transition effects
 *
 * Importing this module evaluates the four domain store modules whose
 * self-registrations arm the nav-transition effect registry
 * (navigation/transition-effects.ts).
 *
 * The navigation barrel (index.ts) imports it so every PRODUCT import path
 * gets a fully armed dispatcher while mode-transitions.svelte.ts itself stays
 * decoupled from the search/focus/journey module graphs (keeps the shared
 * mode-transitions chunk from re-forming — qa-budget rule).
 *
 * Tests that import mode-transitions.svelte.ts DIRECTLY (bypassing the barrel)
 * must import this module too when they assert RETURN_OVERVIEW/SET_SURFACE
 * side-effect chaining.
 */
import '@lib/stores/search-core'
import '@lib/stores/focus.svelte'
import '@lib/stores/journey.svelte'
import '@lib/search/search-panel-adapter'
