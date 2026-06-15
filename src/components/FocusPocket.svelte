<!--
  @components/FocusPocket.svelte — Focus pocket DOM anchor (post-Phase-2 hollow shell)

  Phase 1 of the 3D-only focus-pocket migration (focus-pocket-rendering-decision-2026-06-12.md)
  landed role color tinting on the 3D spore render. Phase 2 removes the visible HTML overlay
  and the `mirrorFocusPocketToSvelteStore` indirection. This component remains as a DOM
  contract anchor (#focus-pocket element) that thread-inspector and other tests rely on as
  a parent element, but it no longer renders focus nodes. The constellation is 3D-only;
  the keyboard/screen-reader surface lives in `FocusPocketA11y.svelte`.

  The rebuild $effect below is triggered through a `navStore` → `$state` mirror, because
  `navStore` is a regular svelte/store writable and reading it via `get(navStore)` inside
  an `$effect` does NOT register a tracked dependency under Svelte 5 runes. The mirror
  is the same bridge shape App.svelte uses for its nav-store surface sync.
-->
<script lang="ts">
  import { navStore } from '@lib/stores/navigation.svelte.ts';
  import { applyLocalNeighborhoodFocus } from '@lib/focus/pocket';
  import { clearPocketNodes } from '@lib/stores/focus.svelte';
  import { getDataLoadState } from '@lib/data-store.svelte';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  // Reactive navStore mirror — bridge from svelte/store writable (non-tracking)
  // into a Svelte 5 $state rune (tracks inside $effect).
  let nav = $state(navStore());
  $effect(() => navStore.subscribe(($s) => (nav = $s)));

  // Same shape as navStore's focusedIndex()/hasFocus() readers, kept local so
  // $derived composes cleanly with $effect's tracked deps.
  const focusedIndex_ = $derived.by(() => {
    if (typeof nav.focusedIndex === 'number' && Number.isFinite(nav.focusedIndex)) {
      return nav.focusedIndex;
    }
    try {
      const legacyWindow = window as Window & {
        __APP_STATE__?: { navState?: { focusedIndex?: unknown } };
      };
      const legacy = (typeof window !== 'undefined')
        ? legacyWindow.__APP_STATE__?.navState?.focusedIndex
        : null;
      return typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : null;
    } catch {
      return null;
    }
  });
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

{#if visible && hasFocus_}
  <!--
    Hollow #focus-pocket element. Preserved as a parent DOM hook for the
    thread-inspector contract test and any other contract that queries
    #focus-pocket as an ancestor. The constellation is rendered by Three.js;
    the keyboard/screen-reader list lives in FocusPocketA11y.svelte.
  -->
  <div id="focus-pocket" aria-hidden="true"></div>
{/if}

