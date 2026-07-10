<!--
  @components/FocusPocket.svelte — Focus pocket DOM anchor

  Pure 3D decision: this component renders no HTML overlay. Its sole job is to provide
  the #focus-pocket DOM element that contract tests and thread-inspector rely on as a
  parent hook. The 3D constellation is driven by the $effect below, which calls into
  applyLocalNeighborhoodFocus / clearPocketNodes. Keyboard/screen-reader surface lives
  in FocusPocketA11y.svelte.

  navState is read directly from appState (a Svelte 5 rune-backed $state) via $derived,
  so no svelte/store subscribe mirror is needed.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { applyLocalNeighborhoodFocus } from '@lib/journey/focus-pocket';
  import { clearPocketNodes } from '@lib/stores/focus.svelte';
  import { dataLoadState } from '@lib/data-store';
  import { engineStatusStore, type EngineStatus } from '@lib/stores/engine.svelte.ts';
  import { appState } from '@lib/state/app.svelte';

  // navState is a Svelte 5 rune-backed $state on appState — read it directly via $derived.
  let nav = $derived(appState.navState);

  const focusedIndex_ = $derived(
    typeof nav.focusedIndex === 'number' && Number.isFinite(nav.focusedIndex)
      ? nav.focusedIndex
      : null
  );
  const hasFocus_ = $derived(
    nav.mode === 'focus' || nav.mode === 'inside' || focusedIndex_ != null
  );

  // W46: also react to threadCandidates so the pocket is rebuilt after the
  // deferred setTrailFromSeed populates the candidate list.
  const threadCandidates_ = $derived(
    Array.isArray(nav.threadCandidates) ? nav.threadCandidates : []
  );

  // Loading state: true while data is loading and focus is active.
  // M7/M8: read the reactive $state-backed store (auto-subscribed via
  // `$dataLoadState`) instead of the non-reactive getDataLoadState() snapshot,
  // so this $derived re-runs when the data flips ready.
  let isLoading = $derived(
    hasFocus_ && !($dataLoadState.status === 'ready')
  );

  let engineStatus = $state<EngineStatus>('idle');
  $effect(() => {
    const unsub = engineStatusStore.subscribe((s) => { engineStatus = s; });
    return unsub;
  });

  // Last-applied index prevents redundant rebuilds on data-status ticks;
  // lastCandidateSignature lets us rebuild when deferred setTrailFromSeed
  // populates the candidate list after the initial focus.
  let lastFocusIndex: number | null = null;
  let lastCandidateSignature: string | null = null;

  $effect(() => {
    if (!($dataLoadState.status === 'ready')) return;
    if (!(engineStatus === 'ready')) return;
    const idx = focusedIndex_;
    const signature = threadCandidates_.map((c: { index?: number }) => c.index).join(',') || '';
    if (
      hasFocus_ &&
      idx != null &&
      (!(idx === lastFocusIndex) || signature !== lastCandidateSignature)
    ) {
      const ok = applyLocalNeighborhoodFocus(idx);
      if (ok) {
        lastFocusIndex = idx;
        lastCandidateSignature = signature;
      }
    } else if (!hasFocus_ && lastFocusIndex != null) {
      lastFocusIndex = null;
      lastCandidateSignature = null;
      clearPocketNodes();
    }
  });

  onDestroy(() => {
    clearPocketNodes();
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

  @media (prefers-reduced-motion: reduce) {
    .pocket-shimmer {
      animation: none;
    }
  }

  @keyframes pocketShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
