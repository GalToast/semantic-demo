<!--
  @components/Controls.svelte — Camera/interaction controls
-->
<script lang="ts">
  import { cameraState, setAutoRotate, startCameraTransition, resetCamera } from '@lib/stores/camera';
  import { navState, isOverview } from '@lib/stores/navigation';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { viewport, isCompact } from '@lib/stores/viewport';

  interface Props {
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  function toggleAutoRotate(): void {
    setAutoRotate(!$cameraState.autoRotate);
  }

  function zoomIn(): void {
    startCameraTransition(
      { position: $cameraState.position, target: $cameraState.target },
      300
    );
  }

  function zoomOut(): void {
    startCameraTransition(
      { position: $cameraState.position, target: $cameraState.target },
      300
    );
  }

  function resetView(): void {
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
    resetCamera();
  }

  function shareLink(): void {
    const url = window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
  }
</script>

{#if visible}
  <div
    class="controls"
    class:compact={$isCompact}
    id="camera-controls"
    role="toolbar"
    aria-label="Camera controls"
  >
    <button class="control-btn" onclick={zoomIn} title="Zoom in" aria-label="Zoom in">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M10.5 7.8v5.4M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>

    <button class="control-btn" onclick={zoomOut} title="Zoom out" aria-label="Zoom out">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>

    <button class="control-btn" onclick={resetView} title="Reset view" aria-label="Reset view">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8a7 7 0 1 1-1 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M7 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="control-divider"></div>

    <button
      class="control-btn"
      class:active={$cameraState.autoRotate}
      onclick={toggleAutoRotate}
      title="Toggle auto-rotate"
      aria-label="Toggle auto-rotate"
      aria-pressed={$cameraState.autoRotate}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 5v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <button class="control-btn" onclick={shareLink} title="Share link" aria-label="Share link">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="m8.8 11 6.4-4M8.8 13l6.4 4" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
    </button>
  </div>
{/if}

<style>
  .controls {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    z-index: var(--z-controls);
    display: flex;
    gap: 0.25rem;
    background: rgba(7, 16, 24, 0.88);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.3rem;
    border: 1px solid rgba(78, 205, 196, 0.12);
  }
  .controls.compact {
    bottom: 4.5rem;
    right: 0.5rem;
  }
  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: none;
    border: none;
    border-radius: 0.3rem;
    color: #b0d0d0;
    cursor: pointer;
    transition: all 0.15s;
  }
  .control-btn:hover {
    color: #e0f0f0;
    background: rgba(78, 205, 196, 0.1);
  }
  .control-btn.active {
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.15);
  }
  .control-divider {
    width: 1px;
    background: rgba(78, 205, 196, 0.15);
    margin: 0.25rem 0;
  }
</style>
