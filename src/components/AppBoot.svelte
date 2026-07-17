<!--
  @components/AppBoot.svelte — App lifecycle bootstrap

  Extracted from App.svelte (W48-T2). Owns:
  - Playwright pre-load for tests
  - Test-only `__forceSemanticDiveContractSurface` global hook
  - Deferred triggers.ts subscription (post-FCP via requestIdleCallback)
  - Global error handler install/teardown
  - Global keyboard shortcuts install
  - App shell teardown on unmount

  Renders nothing — pure lifecycle side-effect component.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { setSemanticDiveMode } from '@lib/stores/focus.svelte';
  import { resetSemanticThreadWorker } from '@lib/engine/semantic-threads';
  import { teardownAppShell } from '@lib/orchestration/app-init';
  import { setupGlobalShortcuts } from '@lib/keyboard/global-shortcuts';
  import { installErrorHandlers } from '@lib/error-boundary';
  import { disposeWeatherUi } from '@lib/ui/weather-ui';
  import { debugError } from '@lib/utils/debug';

  type ContractWindow = Window & {
    __forceSemanticDiveContractSurface?: () => void;
  };

  interface Props {
    /** Toggle weather widget visibility — owned by App.svelte's weatherVisible state */
    toggleWeather: () => void;
    /** Toggle audio mute — dispatches to audio-scape store */
    toggleAudioMute: () => void;
    /**
     * Callback invoked when the test contract surface forces semantic-dive
     * visibility. App.svelte owns the `semanticDiveContractForced` state that
     * is read by FocusCard's `forceSemanticDiveVisible` prop.
     */
    onContractSurfaceForced: () => void;
  }

  let { toggleWeather, toggleAudioMute, onContractSurfaceForced }: Props = $props();

  onMount(() => {
    // ── Test-only contract surface ────────────────────────────────────────────
    // parity-attrs.svelte.ts (installed via main.ts:67 → app-init.ts:251)
    // writes testReady to body.dataset on its first sync, before App.svelte's
    // onMount fires. Tests polling for testReady see it set by parity-attrs.
    const contractWindow = window as ContractWindow;
    contractWindow.__forceSemanticDiveContractSurface = () => {
      setSemanticDiveMode(true);
      onContractSurfaceForced();
      document.body.classList.add('is-active');
      document.body.classList.add('surface-semantic-dive');
      document.body.classList.remove('surface-idle', 'surface-focus', 'surface-focus-search');
      // F1 (W53): match production's post-settle focus-transition state. The
      // real dive entry writes `focus-transition-active` via the focus store's
      // transition state machine; without it the stage sits in the parity
      // "parked pre-transition" state carrying a translateY(18px) transform,
      // so the stage measures +18px past the viewport bottom. Replicating the
      // settled class here makes the contract measure the *production* geometry
      // (flush) instead of a transient parked state. (Test-only calibration;
      // see `tmp/w53-visual-audit-report.md` F1 — not a product bug.)
      document.body.classList.remove('focus-transition-idle', 'focus-transition-arriving');
      document.body.classList.add('focus-transition-active');
      document.body.dataset.activeView = 'galaxy';
      document.body.dataset.graphContext = 'focus';
      document.body.dataset.semanticDive = 'active';
      document.body.dataset.panelSurface = 'semantic-dive';
      document.body.dataset.panelSurfaceDetail = 'none';

      const focusStage = document.querySelector<HTMLElement>('#focus-stage');
      if (focusStage) {
        focusStage.hidden = false;
        focusStage.setAttribute('aria-hidden', 'false');
        focusStage.style.removeProperty('display');
        focusStage.style.removeProperty('visibility');
        focusStage.style.removeProperty('opacity');
        // F1 (W53): clear any parked transition transform left by the
        // focus-transition phase system (belt-and-suspenders alongside the
        // `focus-transition-active` class flip above).
        focusStage.style.removeProperty('transform');
      }

      for (const selector of ['#focus-stage-inside-status', '#focus-stage-inside-controls']) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          el.hidden = false;
          el.setAttribute('aria-hidden', 'false');
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
        }
      }

      const insideControls = document.querySelector<HTMLElement>('#focus-stage-inside-controls');
      if (insideControls) {
        for (const btn of insideControls.querySelectorAll<HTMLButtonElement>('button[hidden]')) {
          btn.hidden = false;
        }
      }
    };

    // ── Defer triggers.ts subscribe() registration until after FCP ──────────
    // The 15+ subscribe() calls in triggers.ts register handlers that synchronously
    // call refreshCompositionState(), updateJourneyCompass(), navStore.update(), etc.
    // At module load time this blocks the main thread for ~7s. Deferring via
    // requestIdleCallback moves it off the cold-load critical path.
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(
        () => import('@lib/orchestration/triggers'),
        { timeout: 3000 }
      );
    } else {
      // Fallback: setTimeout 0 (still async, still off critical path).
      setTimeout(() => import('@lib/orchestration/triggers'), 0);
    }

    // ── Error handlers ────────────────────────────────────────────────────────
    const errorHandlerHandle = installErrorHandlers();

    return () => {
      errorHandlerHandle.uninstall();
      delete contractWindow.__forceSemanticDiveContractSurface;
      teardownAppShell();
      resetSemanticThreadWorker();
      // W49c: previously a dynamic import inside teardown — race condition
      // plus `.catch(() => {})` that silently swallowed import failures.
      // If the import ever failed, the 60-second weather staleness interval
      // would leak forever. Now: direct call, no dynamic import, no silent
      // catch. If dispose throws, log it (don't swallow) so HMR/dev tools
      // surface the issue.
      try {
        disposeWeatherUi();
      } catch (err) {
        debugError('[AppBoot] disposeWeatherUi failed:', err);
      }
    };
  });

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  // W46-B3: handler extracted to src/lib/keyboard/global-shortcuts.ts so the
  // keyboard concern has a single source of truth. AppBoot wires the callbacks
  // that toggle weather visibility and audio mute.
  $effect(() =>
    setupGlobalShortcuts({
      toggleWeather,
      toggleAudioMute
    })
  );
</script>

<!-- Pure side-effect component; no DOM output -->
