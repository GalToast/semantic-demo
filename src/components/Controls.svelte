<!--
  @components/Controls.svelte — Camera/interaction controls
-->
<script lang="ts">
  import { cameraState, setAutoRotate, startCameraTransition, resetCamera, CAMERA_CONFIG } from '@lib/stores/camera.svelte.ts';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { showToast, showErrorToast } from '@lib/stores/toast.svelte';

  interface Props {
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  function toggleAutoRotate(): void {
    setAutoRotate(!cameraState.autoRotate);
  }

  /**
   * Step the camera distance from the target by `factor`. factor < 1 zooms in,
   * factor > 1 zooms out. Clamped to the orbit distance limits so the camera
   * never crosses through the target or escapes the scene bounds.
   */
  function zoomBy(factor: number): void {
    const [px, py, pz] = cameraState.position;
    const [tx, ty, tz] = cameraState.target;
    const dx = px - tx;
    const dy = py - ty;
    const dz = pz - tz;
    const currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (currentDistance < 1e-6) return; // camera coincides with target, nothing to dolly
    const min = CAMERA_CONFIG.ORBIT_MIN_DISTANCE_DEFAULT;
    const max = CAMERA_CONFIG.ORBIT_MAX_DISTANCE_DEFAULT;
    const nextDistance = Math.min(max, Math.max(min, currentDistance * factor));
    if (nextDistance === currentDistance) return; // already at the clamp
    const scale = nextDistance / currentDistance;
    const nextPosition: [number, number, number] = [
      tx + dx * scale,
      ty + dy * scale,
      tz + dz * scale
    ];
    startCameraTransition(
      { position: nextPosition, target: cameraState.target },
      300
    );
  }

  function zoomIn(): void {
    zoomBy(1 / 1.2);
  }

  function zoomOut(): void {
    zoomBy(1.2);
  }

  function resetView(): void {
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
    resetCamera();
  }

  /**
   * Legacy fallback for browsers (or insecure contexts) where the async
   * Clipboard API is unavailable. Uses a hidden textarea + execCommand('copy'),
   * which still works in non-secure contexts and old Safari.
   * Returns true on success, false on failure.
   */
  function legacyCopyToClipboard(text: string): boolean {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.left = '0'
      ta.style.opacity = '0'
      ta.style.pointerEvents = 'none'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  /**
   * Copy the current page URL to the clipboard and ALWAYS give the user
   * feedback (a toast on success or an error toast on failure). The previous
   * implementation silently swallowed the clipboard failure with .catch(() => {})
   * and gave no success indication, so users had no way to know whether the
   * "Share link" button had done anything.
   */
  async function shareLink(): Promise<void> {
    const url = window.location.href
    let copied = false
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        copied = true
      } catch {
        // Fall through to the legacy fallback below.
      }
    }
    if (!copied) {
      copied = legacyCopyToClipboard(url)
    }
    if (copied) {
      showToast('Link copied', 'Share this URL to send someone the same view.')
    } else {
      showErrorToast('Copy failed', 'Clipboard access was blocked. Long-press the address bar to copy the URL instead.')
    }
  }
</script>

<div
    class="controls"
    class:compact={$viewport.isCompact}
    id="camera-controls"
    role="toolbar"
    aria-label="Camera controls"
    tabindex="0"
    hidden={!visible}
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
  >
    <button class="control-btn" onclick={zoomIn} title="Zoom in" aria-label="Zoom in" type="button">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M10.5 7.8v5.4M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="control-label">Zoom in</span>
    </button>

    <button class="control-btn" onclick={zoomOut} title="Zoom out" aria-label="Zoom out" type="button">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="control-label">Zoom out</span>
    </button>

    <button class="control-btn" onclick={resetView} title="Reset view" aria-label="Reset view" type="button">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8a7 7 0 1 1-1 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M7 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="control-label">Reset</span>
    </button>

    <div class="control-divider"></div>

    <button
      class="control-btn"
      class:active={cameraState.autoRotate}
      onclick={toggleAutoRotate}
      title="Toggle auto-rotate"
      aria-label="Toggle auto-rotate"
      aria-pressed={cameraState.autoRotate}
      type="button"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 5v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="control-label">Rotate</span>
    </button>

    <button class="control-btn" onclick={shareLink} title="Share link" aria-label="Share link" type="button">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="m8.8 11 6.4-4M8.8 13l6.4 4" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span class="control-label">Share</span>
    </button>
</div>

<style>
  .controls {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    z-index: var(--z-controls);
    display: flex;
    gap: 0.25rem;
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    border-radius: var(--glass-radius-action);
    padding: 0.3rem;
    border: var(--glass-border);
    box-shadow: var(--shadow-glass);
  }
  .controls[hidden] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  .controls.compact {
    bottom: 4.5rem;
    right: 0.5rem;
  }
  @media (max-width: 768px) {
    :global(body.surface-idle) .controls {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  }
  .control-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    width: 2.75rem;
    min-height: 4rem;
    background: none;
    border: none;
    border-radius: 0.3rem;
    color: var(--color-text-teal-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .control-label {
    font-size: 0.7rem;
    color: var(--color-text-teal-muted);
    line-height: 1;
    pointer-events: none;
    user-select: none;
  }
  .control-btn:hover .control-label {
    color: var(--color-text-teal-light);
  }
  .control-btn.active .control-label {
    color: var(--color-primary-alt);
  }
  .control-btn:hover {
    color: var(--color-text-teal-light);
    background: rgba(78, 205, 196, 0.1);
  }
  .control-btn.active {
    color: var(--color-primary-alt);
    background: rgba(78, 205, 196, 0.15);
  }
  .control-btn:focus-visible {
    outline: 2px solid rgba(78, 205, 196, 0.6);
    outline-offset: 2px;
  }
  .control-divider {
    width: 1px;
    background: rgba(78, 205, 196, 0.15);
    margin: 0.25rem 0;
  }
</style>
