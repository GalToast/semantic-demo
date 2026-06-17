<!--
  @components/FocusPocket.svelte — Focus pocket DOM anchor

  Pure 3D decision: this component renders no HTML overlay. Its sole job is to provide
  the #focus-pocket DOM element that contract tests and thread-inspector rely on as a
  parent hook. The 3D constellation is driven by the $effect below, which calls into
  applyLocalNeighborhoodFocus / clearPocketNodes. Keyboard/screen-reader surface lives
  in FocusPocketA11y.svelte.

  The navStore → $state mirror is required because navStore is a svelte/store writable;
  reading it via get() inside $effect does NOT register a tracked dependency under
  Svelte 5 runes.
-->
<script lang="ts">
  import { navStore } from '@lib/stores/navigation.svelte.ts';
  import { applyLocalNeighborhoodFocus } from '@lib/focus/pocket';
  import { clearPocketNodes } from '@lib/stores/focus.svelte';
  import { getDataLoadState } from '@lib/data-store.svelte';

  // Reactive navStore mirror — bridge svelte/store writable into Svelte 5 $state.
  let nav = $state(navStore());
  $effect(() => navStore.subscribe(($s) => (nav = $s)));

  const focusedIndex_ = $derived(
    typeof nav.focusedIndex === 'number' && Number.isFinite(nav.focusedIndex)
      ? nav.focusedIndex
      : null
  );
  const hasFocus_ = $derived(
    nav.mode === 'focus' || nav.mode === 'inside' || focusedIndex_ !== null
  );

  // Last-applied index prevents redundant rebuilds on data-status ticks.
  let lastFocusIndex: number | null = null;

  $effect(() => {
    if (getDataLoadState().status !== 'ready') return;
    const idx = focusedIndex_;
    if (hasFocus_ && idx !== null && idx !== lastFocusIndex) {
      lastFocusIndex = idx;
      applyLocalNeighborhoodFocus(idx);
    } else if (!hasFocus_ && lastFocusIndex !== null) {
      lastFocusIndex = null;
      clearPocketNodes();
    }
  });
</script>

{#if hasFocus_}
  <div id="focus-pocket" aria-hidden="true"></div>
{/if}

