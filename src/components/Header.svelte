<!--
  @components/Header.svelte — App header bar with mode chips

  Ported from:
 - (mode chip click handling)
 - (mode label rendering)

  Contains the mode chip rail and the app title.
  Sits above the canvas at the top of the viewport.
-->
<script lang="ts">
  import type { NavMode } from '@lib/types/state';
  import {
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS,
  } from '@lib/stores/navigation.svelte.ts';
  import { appState } from '@lib/state/app.svelte';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { legendOpen, toggleLegend } from '@lib/stores/legend.svelte';
  import { updateUrlState } from '@lib/orchestration/url-state';
  import { initKeyboardShortcutsHint, toggleKeyboardShortcutsHint } from '@lib/keyboard/keyboard-help';
  import { debugWarn } from '@lib/utils/debug'
  import { modes } from '@lib/components/header/mode-constants';
  import { getActiveDescription, selectMode as applyModeSelect } from '@lib/components/header/mode-nav';
  import { executeJourneyCompassAction } from '@lib/orchestration/compass-controller';
  import ModeChipRail from '@lib/components/header/ModeChipRail.svelte';
  import HelpDialog from '@lib/components/header/HelpDialog.svelte';
  import { JOURNEY_ACTIONS } from '@lib/journey/compass-state';

  interface Props {
    /** Whether the header is visible */
    visible?: boolean;
    /** Render only floating utility controls, without brand or mode chips */
    utilityOnly?: boolean;
  }

  let { visible = true, utilityOnly = false }: Props = $props();

  // Read directly from appState.navState (Svelte 5 rune-backed $state) — no mirror needed.
  let activeMode = $derived(appState.navState.mode ?? 'overview');
  let activeView = $derived(appState.navState.currentView ?? 'galaxy');
  let hasSelection = $derived(
    appState.navState.focusedIndex != null && Number.isFinite(appState.navState.focusedIndex as number)
  );
  let activeDescription = $derived(getActiveDescription(activeMode, activeView));

  let helpDialogComp: HelpDialog | undefined;

  function selectMode(modeId: NavMode | 'map'): void {
    applyModeSelect(modeId, hasSelection, {
      navActions: NAV_TRANSITION_ACTIONS,
      dispatchNavTransition: dispatchNavTransition as unknown as (
        _action: unknown,
        _payload?: Record<string, unknown>
      ) => unknown,
      updateUrlState: updateUrlState as unknown as (..._args: unknown[]) => void,
      debugWarn: debugWarn as unknown as (..._args: unknown[]) => void
    });
    // Bug 2 fix: selecting "Inside" must also engage the semantic-dive surface
    // (ENTRY_INSIDE). On desktop the journey-compass "Step Inside" button is
    // display:none, so this is the only path that reveals #focus-pocket there.
    // Roving tabindex (keyboardFocusIndex) now lives in ModeChipRail, set via
    // focusin before click fires, so nothing to harvest here.
    if (modeId === 'inside') {
      executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE);
    }
  }

  function openKeyboardHelp(): void {
    try {
      initKeyboardShortcutsHint();
      toggleKeyboardShortcutsHint();
    } catch (error) {
      debugWarn('Header.openKeyboardHelp: keyboard help unavailable', error);
    }
  }

</script>

{#if visible}
  <header
    class="app-header"
    class:compact={$viewport.isCompact}
    class:utility-only={utilityOnly}
    id="app-header"
  >
    <div class="header-brand" class:utility-only={utilityOnly}>
      {#if !utilityOnly}
        <span class="brand-mark">SE</span>
        {#if !$viewport.isCompact}
          <span class="brand-label">Semantic Explorer</span>
        {/if}
      {/if}
      <button
        id="btn-legend"
        class="legend-toggle"
        class:active={$legendOpen}
        onclick={toggleLegend}
        type="button"
        aria-expanded={$legendOpen}
        aria-label={$legendOpen ? 'Close category legend' : 'Open category legend'}
        title={$legendOpen ? 'Close legend' : 'Open legend'}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
          <rect x="1" y="9" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
          <rect x="7" y="1" width="6" height="4" rx="1" fill="currentColor" opacity="0.6"/>
          <rect x="7" y="9" width="6" height="4" rx="1" fill="currentColor" opacity="0.6"/>
        </svg>
      </button>
      <button
        id="btn-keyboard-help"
        class="help-toggle"
        onclick={openKeyboardHelp}
        type="button"
        aria-label="Open keyboard shortcuts"
        title="Keyboard shortcuts"
      >
        <!-- 2026-07-03: replaced the prior `?`-in-a-circle glyph (which
             read identically to the Help button's `i`-in-a-circle next
             to it) with a Lucide-style keyboard silhouette so the two
             help affordances are visually distinct at a glance.
             aria-label/title are unchanged, so the existing
             #btn-keyboard-help tests (which key on the id and on the
             panel's `region[aria-label*="keyboard"|"shortcut"]`)
             continue to pass. -->
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01" />
          <path d="M7 18h10" />
        </svg>
      </button>
      <button
        id="btn-app-help"
        class="help-toggle app-help-toggle"
        onclick={() => helpDialogComp?.toggleHelpDialog()}
        type="button"
        aria-label="Help — What is Semantic Explorer?"
        title="Help — What is this?"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5.75" stroke="currentColor" stroke-width="1.25"/>
          <circle cx="7" cy="4.8" r="0.7" fill="currentColor"/>
          <path d="M7 7v3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
        </svg>
        {#if !$viewport.isCompact}
          <span class="app-help-label">Help</span>
        {/if}
      </button>
    </div>

    <!-- Mode chips radiogroup extracted to ModeChipRail.svelte (W52). Props
         mirror Header's derived nav values; selectMode is the single funnel. -->
    <ModeChipRail {modes} {activeMode} {hasSelection} {activeView} {selectMode} />

    {#if activeDescription && !$viewport.isCompact}
      <span class="header-description">{activeDescription}</span>
    {:else if activeDescription}
      <!-- PR-B (2026-06-30): show the mode description on mobile too.
           On mobile (compact viewport) the header chips + utility buttons
           already fill the row width, so the description wraps to its
           own row below the chips via `flex-wrap: wrap` + `flex-basis: 100%`
           in header.css. -->
      <span class="header-description">{activeDescription}</span>
    {/if}
  </header>

    <HelpDialog bind:this={helpDialogComp} />
{/if}

<style>
  @import '@lib/components/header/header.css';
</style>
