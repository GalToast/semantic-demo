<!--
  @components/FocusPocket.svelte — Focus pocket DOM anchor (post-Phase-2 hollow shell)

  Phase 1 of the 3D-only focus-pocket migration (focus-pocket-rendering-decision-2026-06-12.md)
  landed role color tinting on the 3D spore render. Phase 2 removes the visible HTML overlay
  and the `mirrorFocusPocketToSvelteStore` indirection. This component remains as a DOM
  contract anchor (#focus-pocket element) that thread-inspector and other tests rely on as
  a parent element, but it no longer renders focus nodes. The constellation is 3D-only;
  the keyboard/screen-reader surface lives in `FocusPocketA11y.svelte`.

  The $effect below still rebuilds the focus pocket when `focusedIndex()` changes, so the
  a11y shadow list and the 3D engine stay in lockstep. Clicking a node in the a11y list
  calls `setFocusedIndex()` → this effect fires → `applyLocalNeighborhoodFocus` rebuilds.
-->
<script lang="ts">
  import { hasFocus, focusedIndex } from '@lib/stores/navigation';
  import { applyLocalNeighborhoodFocus } from '@lib/focus/pocket';
  import { clearPocketNodes } from '@lib/stores/focus.svelte';
  import { getDataLoadState } from '@lib/data-store.svelte';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  // Track the last focused index to avoid redundant rebuilds
  let lastFocusIndex: number | null = null;

  $effect(() => {
    // Read _dataLoadState.status directly so the $effect re-fires once
    // initData() resolves. The data store mutates the $state's .status field
    // when loading completes; reading the property inside a Svelte 5 $effect
    // tracks that mutation. Without this dep, the URL ?q=...&anchor=...
    // restore path races the data load: the SEARCH_FOCUS_REQUESTED trigger
    // updates the Svelte nav store at module-init time (before initData runs),
    // the $effect captures focusedIndex=519, but applyLocalNeighborhoodFocus
    // early-returns because state.points is still null. The effect would never
    // re-fire because no Svelte-tracked dep changes after data loads.
    const dataReady = getDataLoadState().status === 'ready';
    const idx = focusedIndex();
    const focused = hasFocus();

    if (!dataReady) return;

    if (focused && Number.isFinite(idx) && idx !== null && idx !== lastFocusIndex) {
      lastFocusIndex = idx;
      applyLocalNeighborhoodFocus(idx);
    } else if (!focused && lastFocusIndex !== null) {
      lastFocusIndex = null;
      clearPocketNodes();
    }
  });
</script>

{#if visible && hasFocus()}
  <!--
    Hollow #focus-pocket element. Preserved as a parent DOM hook for the
    thread-inspector contract test and any other contract that queries
    #focus-pocket as an ancestor. The constellation is rendered by Three.js;
    the keyboard/screen-reader list lives in FocusPocketA11y.svelte.
  -->
  <div id="focus-pocket" aria-hidden="true"></div>
{/if}
