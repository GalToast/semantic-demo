<!--
  @components/LoadingOverlay.svelte — Loading phases

  Mirrors the legacy #loading-overlay DOM structure for contract test compat.
  Reads from loadingPhaseStore for the 4-phase loading progression
  (records → scene → restore → launch). Body dataset attrs are owned
  exclusively by parity-attrs.svelte.ts — this component only controls its own
  DOM structure and visibility.
  Shows kicker, title, note, progress bar, phase chips, and foot text.

  Phase chips: records → scene → restore → launch
  DOM ids/classes expected by contract tests:
    #loading-overlay, .loading-shell, .loading-kicker, .loading-title,
    .loading-note, #loading-progress-bar, #loading-phase-row,
    .loading-phase-chip[data-loading-phase], #loading-foot,
    data-loading-phase, data-loading-state
-->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { loadingPhaseStore, dataLoadState } from '@lib/data-store';
  import { friendlyErrorMessage } from '@lib/utils/error-messages';
  import ErrorState from '@components/ErrorState.svelte';
  import { LOADING_PHASE_META, PHASE_ORDER } from '@lib/ui/loading';

  interface Props {
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  // F5 (data-pipeline bugsweep 2026-08-08): phase meta + order are imported
  // from @lib/ui/loading (single source of truth). The local copies were
  // removed after they drifted from the component copy (launch foot).

  // Read directly from the loadingPhase store — the 4-phase progression
  // (records→scene→restore→launch) is driven by data-store's initData().
  let phase = $derived($loadingPhaseStore);

  let progress = $derived(LOADING_PHASE_META[phase]?.progress ?? 0);
  let note = $derived(LOADING_PHASE_META[phase]?.note ?? '');
  let foot = $derived(LOADING_PHASE_META[phase]?.foot ?? '');
  // W47-D: hide on launch (success). On error, stay visible and switch to the
  // error state so the user knows what happened and can reload.
  let isError = $derived($dataLoadState.status === 'error');
  // W48-H: surface user-friendly error copy (was: raw $dataLoadState.error
  // like "Failed to fetch" or "Unexpected token < in JSON at position 0").
  // The raw message is preserved in friendly.technical for diagnostics and
  // for the optional <details> expansion; the headline + detail come from
  // the shared friendlyErrorMessage() normalizer so all error surfaces
  // (LoadingOverlay, MapView, SearchResults) speak in one voice.
  let friendly = $derived(isError ? friendlyErrorMessage($dataLoadState.error) : null);
  let actuallyVisible = $derived(
    visible &&
      !(phase === 'launch' && !isError)
  );
  /** Derive the active index for chip highlighting */
  let activePhaseIndex = $derived(PHASE_ORDER.indexOf(phase));

  // NOTE: body.dataset attributes (loadingOverlay, sceneReady, viewHandoffActive,
  // cameraAssist, graphicsMode) are now owned exclusively by parity-attrs.svelte.ts.
  // This component only controls its own DOM structure and visibility.
</script>

{#if actuallyVisible}
  <div
    class="loading-overlay"
    class:is-error={isError}
    id="loading-overlay"
    role={isError ? 'alert' : 'progressbar'}
    aria-describedby={isError ? 'loading-error-message' : undefined}
    aria-valuenow={isError ? null : Math.round(progress * 100)}
    aria-valuemin={isError ? null : 0}
    aria-valuemax={isError ? null : 100}
    aria-label={isError ? 'Loading failed' : 'Loading…'}
    data-loading-phase={phase}
    data-loading-state={isError ? 'error' : 'active'}
    transition:fade={{ duration: 600 }}
  >
    <div class="loading-shell">
      {#if isError}
        <ErrorState
          variant="overlay"
          kicker="Semantic Explorer"
          heading="Unable to load"
          title={friendly?.title ?? 'Something went wrong'}
          detail={friendly?.detail}
          technical={friendly?.technical}
          retryLabel="Reload"
          onRetry={() => window.location.reload()}
          footer="If the problem continues, check your connection and try again."
        />
      {:else}
        <!-- Kicker label -->
        <div class="loading-kicker">Semantic Explorer</div>

        <!-- Title -->
        <div class="loading-title">Loading businesses…</div>

        <!-- SVG logo -->
        <div class="loading-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="2.2" fill="var(--color-primary-alt)"/>
            <circle cx="5" cy="6" r="1.6" fill="var(--color-primary-alt)" opacity="0.6"/>
            <circle cx="19" cy="7" r="1.6" fill="var(--color-primary-alt)" opacity="0.6"/>
            <circle cx="6" cy="18" r="1.6" fill="var(--color-primary-alt)" opacity="0.6"/>
            <circle cx="18" cy="18" r="1.6" fill="var(--color-primary-alt)" opacity="0.6"/>
            <path d="M10.3 10.5 6.3 7.2M13.8 10.7l3.9-2.8M10.2 13.4 7.1 17M13.7 13.5l3 3.2"
              fill="none" stroke="var(--color-primary-alt)" stroke-width="1" opacity="0.5"/>
          </svg>
        </div>

        <p class="loading-note">{note}</p>

        <!-- Progress bar -->
        <div id="loading-progress-bar" class="loading-progress">
          <div class="loading-progress-bar" style="width: {Math.round(progress * 100)}%"></div>
        </div>
        <span class="loading-progress-text" id="loading-progress-text">{Math.round(progress * 100)}%</span>

        <!-- Phase row with chips -->
        <div id="loading-phase-row" class="loading-phase-row">
          {#each PHASE_ORDER as phaseKey, idx (phaseKey)}
            <span
              class="loading-phase-chip"
              class:is-active={phaseKey === phase}
              class:is-complete={idx < activePhaseIndex}
              data-loading-phase={phaseKey}
            >
              {phaseKey === 'records' ? 'Data' : phaseKey === 'scene' ? 'Assets' : phaseKey === 'restore' ? 'Restore' : 'Ready'}
            </span>
          {/each}
        </div>

        <p class="loading-foot" id="loading-foot">{foot}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  /*
    Visual distinction (gradient background, glass shell, progress-bar glow,
    phase-chip states) is owned by css/loading.css. The component styles below
    only cover elements that are not styled by the global sheet: the SVG logo
    animation, the percentage text, error-state copy, and the retry button.
  */
  .loading-logo {
    opacity: 0.8;
    animation: pulse 2s ease-in-out infinite;
  }
  .loading-progress-text {
    font-size: 0.7rem;
    color: var(--color-primary-alt);
    margin-top: 0.25rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .loading-logo {
      animation: none;
    }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.4; }
  }
</style>
