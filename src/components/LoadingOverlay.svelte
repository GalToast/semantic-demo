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
  import type { LoadingPhase, LoadingPhaseMeta } from '@lib/types/state';

  interface Props {
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  // Phase definitions matching the legacy LOADING_PHASE_META order
  const PHASE_ORDER: readonly LoadingPhase[] = ['records', 'scene', 'restore', 'launch'];

  const phaseMeta: Record<LoadingPhase, LoadingPhaseMeta> = {
    records: { progress: 0.2, note: 'Gathering records...', foot: 'County records are arriving first.' },
    scene: { progress: 0.48, note: 'Raising the cloud...', foot: 'Shaping the scene.' },
    restore: { progress: 0.76, note: 'Restoring view...', foot: 'Restoring last known path.' },
    launch: { progress: 1, note: 'Awake.', foot: 'Threads are live.' }
  };

  // Read directly from the loadingPhase store — the 4-phase progression
  // (records→scene→restore→launch) is driven by data-store's initData().
  let phase = $derived($loadingPhaseStore);

  let progress = $derived(phaseMeta[phase as LoadingPhase]?.progress ?? 0);
  let note = $derived(phaseMeta[phase as LoadingPhase]?.note ?? '');
  let foot = $derived(phaseMeta[phase as LoadingPhase]?.foot ?? '');
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
      !(phase === 'launch')
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
        <div class="loading-kicker">Semantic Explorer</div>
        <div class="loading-title">Unable to load</div>
        <p id="loading-error-message" class="loading-note" role="alert" aria-live="assertive">
          <strong>{friendly?.title ?? 'Something went wrong'}</strong>
          {#if friendly?.detail}<br />{friendly.detail}{/if}
        </p>
        {#if friendly?.technical}
          <details class="loading-error-technical">
            <summary>Technical details</summary>
            <code>{friendly.technical}</code>
          </details>
        {/if}
        <button
          type="button"
          class="loading-retry-btn"
          onclick={() => window.location.reload()}
        >
          Reload
        </button>
        <p class="loading-foot">If the problem continues, check your connection and try again.</p>
      {:else}
        <!-- Kicker label -->
        <div class="loading-kicker">Semantic Explorer</div>

        <!-- Title -->
        <div class="loading-title">Loading business records…</div>

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
  .loading-overlay.is-error .loading-note {
    color: var(--status-danger, #ff6b6b);
  }
  .loading-retry-btn {
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--color-primary-alt, var(--color-primary-alt));
    border-radius: 0.375rem;
    background: transparent;
    color: var(--color-primary-alt, var(--color-primary-alt));
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .loading-error-technical {
    font-size: 0.7rem;
    color: rgba(255, 230, 230, 0.65);
    margin: 0.25rem 0 0.5rem;
  }
  .loading-error-technical summary {
    cursor: pointer;
    user-select: none;
    margin-bottom: 0.25rem;
  }
  .loading-error-technical code {
    display: block;
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    color: rgba(255, 230, 230, 0.5); /* a11y-ok: technical-only, rendered inside <details> collapsed by default */
    word-break: break-word;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 0.25rem;
  }
  .loading-retry-btn:hover {
    background: var(--color-primary-alt, var(--color-primary-alt));
    color: #071018;
  }
  .loading-retry-btn:focus-visible {
    outline: 2px solid var(--color-primary-alt, var(--color-primary-alt));
    outline-offset: 2px;
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
