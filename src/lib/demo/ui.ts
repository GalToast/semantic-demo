/**
 * @lib/demo/ui.ts — DOM UI helpers for the micro-demo
 *
 * Ported from: js/modules/micro-demo-ui.js
 *
 * DOM UI helpers for the demo overlay. During migration,
 * actual UI rendering is handled by the DemoChoreography.svelte component.
 */

/**
 * Show or hide the demo veil.
 * Ported from micro-demo-ui.js showVeil().
 */
export function showVeil(active: boolean): void {
  const veil = document.getElementById('micro-demo-veil');
  if (!veil) return;
  if (active) {
    veil.classList.add('active');
    veil.removeAttribute('aria-hidden');
  } else {
    veil.classList.remove('active');
    veil.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Hide the demo veil.
 * Ported from micro-demo-ui.js hideVeil().
 */
export function hideVeil(): void {
  showVeil(false);
}

let _inputCleanup: (() => void) | null = null;

/**
 * Bind an input interceptor that cancels the demo on user interaction.
 * Ported from micro-demo-ui.js bindInputInterceptor().
 */
export function bindInputInterceptor(onCancel?: (reason: string) => void): void {
  if (_inputCleanup) {
    _inputCleanup();
    _inputCleanup = null;
  }

  const canvasOverlay = document.createElement('div');
  canvasOverlay.id = 'micro-demo-blocker';
  Object.assign(canvasOverlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9',
    pointerEvents: 'all',
    cursor: 'default',
    background: 'transparent'
  });
  document.body.appendChild(canvasOverlay);

  function onInput(e: Event): void {
    const target = e.target as HTMLElement;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (target?.closest('#info-panel') || target?.closest('.journey-compass')) return;
    if (onCancel) onCancel('user-input');
  }

  document.addEventListener('mousedown', onInput, { capture: true });
  document.addEventListener('touchstart', onInput, { capture: true });

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && onCancel) onCancel('escape-key');
  };
  document.addEventListener('keydown', onKeydown, { capture: true });

  _inputCleanup = () => {
    document.removeEventListener('mousedown', onInput, { capture: true });
    document.removeEventListener('touchstart', onInput, { capture: true });
    document.removeEventListener('keydown', onKeydown, { capture: true });
    const existing = document.getElementById('micro-demo-blocker');
    if (existing) existing.remove();
    _inputCleanup = null;
  };
}

/**
 * Unbind the input interceptor.
 * Ported from micro-demo-ui.js unbindInputInterceptor().
 */
export function unbindInputInterceptor(): void {
  if (_inputCleanup) {
    _inputCleanup();
    _inputCleanup = null;
  }
}

/**
 * Show the demo pill with a skip button.
 * Ported from micro-demo-ui.js showPill().
 */
export function showPill(
  _text: string,
  _onSkip?: (reason: string) => void
): HTMLElement | null {
  return null;
}

/**
 * Remove the demo pill.
 * Ported from micro-demo-ui.js removePill().
 */
export function removePill(): void {
  const pill = document.getElementById('micro-demo-pill');
  if (pill) pill.remove();
}

/**
 * Show the end-of-demo toast.
 * Ported from micro-demo-ui.js showEndToast().
 */
export function showEndToast(): HTMLElement | null {
  removePill();
  const toast = document.createElement('div');
  toast.id = 'micro-demo-toast';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9997',
    background: 'rgba(17, 24, 39, 0.9)',
    backdropFilter: 'blur(10px)',
    borderRadius: '9999px',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: '#e5e7eb'
  });
  toast.appendChild(document.createTextNode("That's the basics — explore freely"));

  const closeBtn = document.createElement('button');
  closeBtn.setAttribute('aria-label', 'Dismiss');
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '2px 4px',
    lineHeight: '1'
  });
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => toast.remove());
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
  return toast;
}

/**
 * Inject micro-demo CSS keyframes.
 * Ported from micro-demo-ui.js injectMicroDemoStyles().
 */
export function injectMicroDemoStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('micro-demo-styles')) return;

  const style = document.createElement('style');
  style.id = 'micro-demo-styles';
  style.textContent = `
@keyframes microDemoPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.6); opacity: 0.7; }
}
@keyframes microDemoPillIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes microDemoToastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`;
  document.head?.appendChild(style);
}
