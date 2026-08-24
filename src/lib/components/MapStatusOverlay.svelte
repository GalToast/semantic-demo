<!--
  @lib/components/MapStatusOverlay.svelte

  Loading shimmer + centered status/error overlay for the map view.
  Extracted from MapView.svelte so the parent can focus on Leaflet lifecycle
  while this component owns the transient chrome.
-->
<script lang="ts">
  import ErrorState from '@components/ErrorState.svelte'

  interface Props {
    status: 'loading' | 'ready' | 'error'
    statusDetail: string
    friendlyError: { title: string; detail?: string | null; technical?: string | null } | null
    onRetry: () => void
  }

  let { status, statusDetail, friendlyError, onRetry }: Props = $props()
</script>

{#if status === 'loading'}
  <div class="map-shimmer" aria-hidden="true">
    <div class="shimmer-row"></div>
    <div class="shimmer-row short"></div>
    <div class="shimmer-row medium"></div>
  </div>
{/if}

{#if status !== 'ready'}
  <div class="map-status" class:is-error={status === 'error'} role="status" aria-live="polite">
    <span class="map-status-dot" aria-hidden="true"></span>
    {#if status === 'error' && friendlyError}
      <ErrorState
        variant="map"
        title={friendlyError.title}
        detail={friendlyError.detail}
        technical={friendlyError.technical}
        retryLabel="Retry"
        {onRetry}
      />
    {:else}
      <span>{statusDetail}</span>
    {/if}
  </div>
{/if}

<style>
  .map-status {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: var(--z-controls, 1);
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 14px;
    border: 1px solid rgba(126, 231, 219, 0.22);
    border-radius: 8px;
    background: rgba(7, 16, 24, 0.82);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
    transform: translate(-50%, -50%);
    color: rgba(238, 255, 251, 0.9);
    font-size: 0.86rem;
    font-weight: 700;
    backdrop-filter: blur(20px) saturate(150%);
  }

  .map-status.is-error {
    border-color: rgba(255, 151, 107, 0.38);
    color: #ffe1d1;
  }

  .map-status-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #7ee7db;
    box-shadow: 0 0 18px rgba(126, 231, 219, 0.9);
    animation: mapStatusPulse 1.3s ease-in-out infinite;
  }

  .map-status.is-error .map-status-dot {
    display: none;
  }

  /* ── Loading shimmer ──────────────────────────────────────────────────────── */
  .map-shimmer {
    position: absolute;
    inset: 0;
    z-index: var(--z-canvas, 0);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem;
    pointer-events: none;
  }
  .shimmer-row {
    width: min(320px, 70vw);
    height: 10px;
    border-radius: 5px;
    background: linear-gradient(
      90deg,
      rgba(var(--color-primary-alt-rgb), 0.04) 0%,
      rgba(var(--color-primary-alt-rgb), 0.12) 40%,
      rgba(var(--color-primary-alt-rgb), 0.04) 80%
    );
    background-size: 200% 100%;
    animation: shimmerSlide 1.6s ease-in-out infinite;
  }
  .shimmer-row.short {
    width: min(200px, 50vw);
    animation-delay: 0.15s;
  }
  .shimmer-row.medium {
    width: min(260px, 60vw);
    animation-delay: 0.3s;
  }

  @keyframes mapStatusPulse {
    0%,
    100% {
      opacity: 0.55;
      transform: scale(0.82);
    }

    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes shimmerSlide {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .map-status-dot,
    .shimmer-row {
      animation: none;
    }
  }
</style>
