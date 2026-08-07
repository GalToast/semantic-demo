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

  // W51-C4: roving tabindex for the camera toolbar (WAI-ARIA toolbar pattern).
  // The container is a non-tabbable toolbar (tabindex="-1"); exactly one
  // button holds the roving tab stop (tabindex="0") and Arrow/Home/End move
  // focus between buttons. Without this, keyboard users had to Tab through
  // all five buttons individually.
  let rovingIndex = $state(0);

  // P2-5 (component-remainder sweep): when visible→false with focus inside the
  // toolbar, stash document.activeElement and restore on re-show. Prevents focus
  // from dropping to <body> when compact mode / surface switch hides mid-focus.
  let savedFocusEl: HTMLElement | null = null;
  $effect(() => {
    if (visible) {
      // Re-show: restore focus if we stashed it AND it's still in the DOM.
      if (savedFocusEl && document.contains(savedFocusEl)) {
        savedFocusEl.focus();
      }
      savedFocusEl = null;
    } else {
      // About to hide: stash focus if it's inside the toolbar.
      const toolbar = document.getElementById('camera-controls');
      if (toolbar && toolbar.contains(document.activeElement)) {
        savedFocusEl = document.activeElement as HTMLElement;
      }
    }
  });

  function onCameraToolbarKeydown(e: KeyboardEvent): void {
    const toolbar = e.currentTarget as HTMLElement;
    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button.control-btn'));
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % buttons.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + buttons.length) % buttons.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = buttons.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    rovingIndex = next;
    buttons[next]?.focus();
  }
</script>

<div
    class="controls"
    class:compact={$viewport.isCompact}
    id="camera-controls"
    role="toolbar"
    aria-label="Camera controls"
    tabindex="-1"
    hidden={!visible}
    onkeydown={onCameraToolbarKeydown}
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
  >
    <button class="control-btn" onclick={zoomIn} title="Zoom in" aria-label="Zoom in" type="button" tabindex={rovingIndex === 0 ? 0 : -1}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M10.5 7.8v5.4M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="control-label">Zoom in</span>
    </button>

    <button class="control-btn" onclick={zoomOut} title="Zoom out" aria-label="Zoom out" type="button" tabindex={rovingIndex === 1 ? 0 : -1}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="control-label">Zoom out</span>
    </button>

    <button class="control-btn" onclick={resetView} title="Reset view" aria-label="Reset view" type="button" tabindex={rovingIndex === 2 ? 0 : -1}>
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
      tabindex={rovingIndex === 3 ? 0 : -1}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 5v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="control-label">Rotate</span>
    </button>

    <button class="control-btn" onclick={shareLink} title="Share link" aria-label="Share link" type="button" tabindex={rovingIndex === 4 ? 0 : -1}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="m8.8 11 6.4-4M8.8 13l6.4 4" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span class="control-label">Share</span>
    </button>
</div>

<!--
  P2-6 (component-remainder sweep): scoped <style> below re-declares
  .controls / .control-btn selectors that are OWNED by css/controls.css
  (per docs/css-ownership.md §2). The component deliberately overrides
  the module's position:fixed+column layout with position:absolute+row,
  and replaces glass-bg button styling with a transparent column layout.
  Module rules still apply to non-component .controls surfaces (map view).
  Keep both; this comment prevents future de-duplication accidents.
-->
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

  /* Reduced-motion: the control-button state transition is decorative;
     disable it for users who prefer reduced motion. Steady-state layout is
     unchanged. */
  @media (prefers-reduced-motion: reduce) {
    .control-btn {
      transition: none;
    }
  }
</style>
