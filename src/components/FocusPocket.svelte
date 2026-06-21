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
  import { applyLocalNeighborhoodFocus } from '@lib/journey/focus-pocket';
  import { clearPocketNodes } from '@lib/stores/focus.svelte';
  import { getDataLoadState } from '@lib/data-store';

  // Reactive navStore mirror — bridge svelte/store writable into Svelte 5 $state.
  let nav = $state(navStore());
  $effect(() => navStore.subscribe(($s) => (nav = $s)));

  const focusedIndex_ = $derived(
    typeof nav.focusedIndex === 'number' && Number.isFinite(nav.focusedIndex)
      ? nav.focusedIndex
      : null
  );
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
  const hasFocus_ = $derived(
    nav.mode === 'focus' || nav.mode === 'inside' || focusedIndex_ != null
  );

  // Loading state: true while data is loading and focus is active
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use positive equality + negation instead.
  let isLoading = $derived(
    hasFocus_ && !(getDataLoadState().status === 'ready')
  );

  // Last-applied index prevents redundant rebuilds on data-status ticks.
  let lastFocusIndex: number | null = null;

  $effect(() => {
    if (!(getDataLoadState().status === 'ready')) return;
    const idx = focusedIndex_;
    if (hasFocus_ && idx != null && !(idx === lastFocusIndex)) {
      lastFocusIndex = idx;
      applyLocalNeighborhoodFocus(idx);
    } else if (!hasFocus_ && lastFocusIndex != null) {
      lastFocusIndex = null;
      clearPocketNodes();
    }
  });
</script>

{#if hasFocus_}
  <div
    id="focus-pocket"
    role="region"
    aria-label="Focus pocket — neighborhood constellation"
    tabindex="-1"
  >
    {#if isLoading}
      <div class="focus-pocket-loading" aria-label="Loading neighborhood data" role="status">
        <div class="pocket-shimmer"></div>
        <div class="pocket-shimmer short"></div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .focus-pocket-loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    pointer-events: none;
  }
  .pocket-shimmer {
    width: 60px;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      90deg,
      rgba(78, 205, 196, 0.06) 0%,
      rgba(78, 205, 196, 0.18) 40%,
      rgba(78, 205, 196, 0.06) 80%
    );
    background-size: 200% 100%;
    animation: pocketShimmer 1.4s ease-in-out infinite;
  }
  .pocket-shimmer.short {
    width: 40px;
    animation-delay: 0.2s;
  }
  @keyframes pocketShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
