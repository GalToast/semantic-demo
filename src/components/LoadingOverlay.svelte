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
  import { loadingPhaseStore } from '@lib/data-store';
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
  let actuallyVisible = $derived(visible && phase !== 'launch');

  /** Derive the active index for chip highlighting */
  let activePhaseIndex = $derived(PHASE_ORDER.indexOf(phase));

  // NOTE: body.dataset attributes (loadingOverlay, sceneReady, viewHandoffActive,
  // cameraAssist, graphicsMode) are now owned exclusively by parity-attrs.svelte.ts.
  // This component only controls its own DOM structure and visibility.
</script>

{#if actuallyVisible}
  <div
    class="loading-overlay"
    id="loading-overlay"
    role="progressbar"
    aria-valuenow={Math.round(progress * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label="Loading semantic explorer"
    data-loading-phase={phase}
    data-loading-state="active"
    transition:fade={{ duration: 600 }}
  >
    <div class="loading-shell">
      <!-- Kicker label -->
      <div class="loading-kicker">Semantic Explorer</div>

      <!-- Title -->
      <div class="loading-title">Loading the field</div>

      <!-- SVG logo -->
      <div class="loading-logo">
        <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="2.2" fill="#4ecdc4"/>
          <circle cx="5" cy="6" r="1.6" fill="#4ecdc4" opacity="0.6"/>
          <circle cx="19" cy="7" r="1.6" fill="#4ecdc4" opacity="0.6"/>
          <circle cx="6" cy="18" r="1.6" fill="#4ecdc4" opacity="0.6"/>
          <circle cx="18" cy="18" r="1.6" fill="#4ecdc4" opacity="0.6"/>
          <path d="M10.3 10.5 6.3 7.2M13.8 10.7l3.9-2.8M10.2 13.4 7.1 17M13.7 13.5l3 3.2"
            fill="none" stroke="#4ecdc4" stroke-width="1" opacity="0.5"/>
        </svg>
      </div>

      <p class="loading-note">{note}</p>

      <!-- Progress bar -->
      <div class="loading-bar-track">
        <div class="loading-bar-fill" id="loading-progress-bar" style="width: {Math.round(progress * 100)}%"></div>
      </div>

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
    </div>
  </div>
{/if}

<style>
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: var(--z-loading, 3000);
    background: #071018;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .loading-shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    max-width: 300px;
    text-align: center;
    padding: 1rem;
  }
  .loading-kicker {
    font-family: 'Nunito Sans', system-ui, sans-serif;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(78, 205, 196, 0.5);
    font-weight: 600;
  }
  .loading-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: #e0f0f0;
  }
  .loading-logo {
    opacity: 0.8;
    animation: pulse 2s ease-in-out infinite;
  }
  .loading-note {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 1rem;
    font-weight: 600;
    color: #e0f0f0;
    margin: 0;
  }
  .loading-bar-track {
    width: 200px;
    height: 2px;
    background: rgba(78, 205, 196, 0.15);
    border-radius: 1px;
    overflow: hidden;
  }
  .loading-bar-fill {
    height: 100%;
    background: #4ecdc4;
    border-radius: 1px;
    transition: width 0.4s ease;
  }
  .loading-phase-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }
  .loading-phase-chip {
    font-size: 0.6rem;
    font-family: 'Nunito Sans', system-ui, sans-serif;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.45rem;
    border-radius: 0.25rem;
    background: rgba(78, 205, 196, 0.08);
    color: rgba(224, 240, 240, 0.3);
    border: 1px solid rgba(78, 205, 196, 0.1);
    transition: all 0.2s ease;
  }
  .loading-phase-chip.is-active {
    background: rgba(78, 205, 196, 0.2);
    color: #4ecdc4;
    border-color: rgba(78, 205, 196, 0.5);
  }
  .loading-phase-chip.is-complete {
    background: rgba(150, 206, 180, 0.12);
    color: #96ceb4;
    border-color: rgba(150, 206, 180, 0.3);
  }
  .loading-foot {
    font-size: 0.75rem;
    color: #6a8a8a;
    margin: 0;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.4; }
  }
</style>
