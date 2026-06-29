<!--
  @components/FocusPocketA11y.svelte — Keyboard/screen-reader surface for the focus pocket

  Phase 4 of the 3D-only focus-pocket migration (focus-pocket-rendering-decision-2026-06-12.md).
  Replaces the visible HTML overlay (removed in Phase 2) with an accessibility-first surface
  that satisfies WCAG 2.1 SC 2.1.1 (Keyboard), SC 4.1.2 (Name, Role, Value), and SC 1.3.1
  (Info and Relationships):

    * Shadow list (default): <ul role="list" aria-live="polite"> positioned offscreen
      so screen readers can navigate the constellation, but it adds no visual duplication.
    * Toggle button: small floating button in the bottom-right corner reveals the same
      list visibly for users who prefer text-based navigation.
    * Each <li> is a button with role + aria-label + tabindex; click and Enter dispatch
      `setFocusedIndex(node.index)` which re-fires the FocusPocket $effect chain and
      rebuilds the 3D pocket around the new anchor.

  This component is the ONLY place the FocusPocketNode list is rendered, and it reads from
  the Svelte focus store (populated by applyLocalNeighborhoodFocus → syncPocketNodesToStore).
-->
<script lang="ts">
  import { focusStore, setPocketListVisible } from '@lib/stores/focus.svelte';
  import { setFocusedIndex } from '@lib/stores/navigation.svelte.ts';
  import type { FocusPocketNode } from '@lib/types/state';

  // eslint-disable-next-line no-empty-pattern -- empty $props() destructuring is the Svelte 5 idiom for "no props accepted"
  let {} = $props();

  function focusOnNode(node: FocusPocketNode): void {
    setFocusedIndex(node.index);
  }

  function handleKeydown(event: KeyboardEvent, node: FocusPocketNode): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      focusOnNode(node);
    }
  }

  function toggleList(): void {
    setPocketListVisible(!focusStore().pocketListVisible);
  }

  // Reactive reads — use $focusStore so Svelte 5 tracks the store as a source.
  let pocketNodes = $derived($focusStore.pocketNodes);
  let isVisible = $derived($focusStore.focusState.pocketListVisible);
  let hasNodes = $derived(pocketNodes.length > 0);
</script>

<!--
  Shadow list — always present in the DOM so screen readers see it.
  When the user has not opted in to the visible list, the ul is positioned
  off-screen with the standard sr-only / clip pattern. No visual layout
  impact. When opted in, it appears as a floating panel in the bottom-right.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<ul
  id="focus-pocket-a11y"
  class="focus-pocket-a11y"
  class:visible={isVisible}
  role="list"
  aria-label="Neighborhood businesses"
  aria-live="polite"
  tabindex={isVisible ? -1 : undefined}
>
  {#each pocketNodes as node (node.index)}
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <li
      role="button"
      tabindex={0}
      aria-label="{node.label} ({node.role})"
      onclick={() => focusOnNode(node)}
      onkeydown={(event) => handleKeydown(event, node)}
    >
      <span class="role-dot" data-role={node.role} aria-hidden="true"></span>
      <span class="label">{node.label}</span>
    </li>
  {/each}
</ul>

<!--
  Toggle button — only shown when there's a focus pocket to enumerate.
  Anchored bottom-right to avoid the legend (top-left), weather (top-right),
  camera controls (right rail), and the trail (bottom-left).
-->
{#if hasNodes}
  <div class="focus-keyboard-hint" id="focus-keyboard-hint" aria-label="Keyboard shortcuts for focus mode">
    <kbd>Esc</kbd><span>overview</span><span class="hint-sep">·</span><kbd>?</kbd><span>shortcuts</span>
  </div>
  <button
    id="focus-pocket-list-toggle"
    class="focus-pocket-list-toggle"
    type="button"
    aria-expanded={isVisible}
    aria-controls="focus-pocket-a11y"
    aria-label={isVisible ? 'Hide focus pocket list' : 'Show focus pocket list'}
    onclick={toggleList}
  >
    {isVisible ? 'Hide list' : 'View as list'}
  </button>
{/if}

<style>
  .focus-pocket-a11y {
    /* Default: offscreen via the standard sr-only pattern.
       No impact on layout, no visual duplication of the 3D constellation. */
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    list-style: none;
  }

  .focus-pocket-a11y.visible {
    position: fixed;
    right: 0.75rem;
    bottom: 0.75rem;
    width: min(320px, calc(100vw - 1.5rem));
    max-height: min(50vh, 420px);
    overflow-y: auto;
    padding: 0.6rem 0.7rem;
    margin: 0;
    clip: auto;
    white-space: normal;
    background: rgba(7, 16, 24, 0.94);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.5rem;
    z-index: var(--z-panels);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .focus-pocket-a11y li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.35rem 0.4rem;
    border-radius: 0.3rem;
    cursor: pointer;
    color: rgba(224, 240, 240, 0.85);
    font-size: 0.75rem;
    line-height: 1.3;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .focus-pocket-a11y li:hover,
  .focus-pocket-a11y li:focus-visible {
    background: rgba(78, 205, 196, 0.08);
    color: var(--color-text-teal-light);
    outline: none;
  }

  .focus-pocket-a11y li:focus-visible {
    box-shadow: 0 0 0 1px rgba(78, 205, 196, 0.4);
  }

  .role-dot {
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(78, 205, 196, 0.4);
  }
  .role-dot[data-role='direct'] { background: var(--color-primary-alt); }
  .role-dot[data-role='support'] { background: #ffd93d; }
  .role-dot[data-role='civic'] { background: var(--status-danger); }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .focus-pocket-list-toggle {
    position: fixed;
    right: 0.75rem;
    bottom: 0.75rem;
    padding: 0.45rem 0.8rem;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.28);
    border-radius: 0.4rem;
    color: var(--color-primary-alt);
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    z-index: var(--z-panels);
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }

  .focus-pocket-list-toggle:hover,
  .focus-pocket-list-toggle:focus-visible {
    background: rgba(78, 205, 196, 0.12);
    border-color: rgba(78, 205, 196, 0.5);
    outline: none;
  }

  .focus-pocket-list-toggle:focus-visible {
    box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.4);
  }

  /* When the visible list is open, lift the toggle above it and re-anchor. */
  .focus-pocket-list-toggle[aria-expanded='true'] {
    bottom: auto;
    top: 0.75rem;
    right: 0.75rem;
  }

  .focus-keyboard-hint {
    position: fixed;
    right: 0.75rem;
    bottom: 2.7rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.65rem;
    background: rgba(7, 16, 24, 0.88);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.35rem;
    color: #8aaeae;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.6rem;
    z-index: var(--z-panels);
    pointer-events: none;
  }
  .focus-keyboard-hint kbd {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: #e0f0f0;
    background: rgba(78, 205, 196, 0.12);
    border: 1px solid rgba(78, 205, 196, 0.25);
    border-radius: 0.2rem;
    padding: 0.05rem 0.25rem;
  }
  .focus-keyboard-hint .hint-sep {
    opacity: 0.5;
  }
</style>
