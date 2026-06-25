/**
 * @lib/demo/ui.ts — DOM UI helpers for the micro-demo
 *
 * Port of
 *
 * Veil, input interceptor, pill, end toast, and keyframe injection for the micro-demo overlay.
 */
let _inputCleanup: (() => void) | null = null;

export function hideVeil(): void {
  showVeil(false);
}

export function showVeil(active: boolean): void {
  const veil = document.getElementById('micro-demo-veil');
  if (!veil) return;
  if (active) {
    void (veil as HTMLElement & { offsetWidth: number }).offsetWidth;
    veil.classList.add('active');
    veil.removeAttribute('aria-hidden');
  } else {
    veil.classList.remove('active');
    veil.setAttribute('aria-hidden', 'true');
  }
}

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
  } as Record<string, string>);
  document.body.appendChild(canvasOverlay);

  const onInput = (e: Event): void => {
    const target = e.target as HTMLElement;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (target?.closest('#info-panel') || target?.closest('.journey-compass')) return;
    if (onCancel) onCancel('user-input');
  };

  document.addEventListener('mousedown', onInput, { capture: true });
  document.addEventListener('touchstart', onInput, { capture: true, passive: true });

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && onCancel) onCancel('escape-key');
  };
  document.addEventListener('keydown', onKeydown, { capture: true });

  _inputCleanup = (): void => {
    document.removeEventListener('mousedown', onInput, { capture: true });
    document.removeEventListener('touchstart', onInput, { capture: true });
    document.removeEventListener('keydown', onKeydown, { capture: true });
    const existing = document.getElementById('micro-demo-blocker');
    if (existing) existing.remove();
    _inputCleanup = null;
  };
}

export function unbindInputInterceptor(): void {
  if (_inputCleanup) {
    _inputCleanup();
    _inputCleanup = null;
  }
}

export function showPill(text: string, onSkip?: (reason: string) => void): HTMLElement {
  const pill = document.createElement('div');
  pill.id = 'micro-demo-pill';
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'polite');
  Object.assign(pill.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9997',
    background: 'rgba(17, 24, 39, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(78, 205, 196, 0.3)',
    borderRadius: '9999px',
    padding: '6px 12px 6px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#e5e7eb',
    fontFamily: 'inherit',
    animation: 'microDemoPillIn 0.3s ease-out forwards'
  } as Record<string, string>);

  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#4ecdc4',
    animation: 'microDemoPulse 1.2s ease-in-out infinite',
    flexShrink: '0'
  } as Record<string, string>);
  pill.appendChild(dot);
  pill.appendChild(document.createTextNode(text));

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.setAttribute('aria-label', 'Skip demo');
  Object.assign(skipBtn.style, {
    background: 'rgba(78, 205, 196, 0.18)',
    border: '1px solid rgba(78, 205, 196, 0.45)',
    borderRadius: '9999px',
    color: '#d1fae5',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'inherit',
    padding: '4px 12px',
    cursor: 'pointer',
    marginLeft: '4px',
    transition: 'background 0.15s ease, color 0.15s ease',
    flexShrink: '0'
  } as Record<string, string>);
  skipBtn.textContent = 'Skip';
  skipBtn.addEventListener('mouseenter', () => {
    skipBtn.style.background = 'rgba(78, 205, 196, 0.32)';
    skipBtn.style.color = '#ecfeff';
  });
  skipBtn.addEventListener('mouseleave', () => {
    skipBtn.style.background = 'rgba(78, 205, 196, 0.18)';
    skipBtn.style.color = '#d1fae5';
  });
  skipBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    if (onSkip) onSkip('skip-button');
  });

  pill.appendChild(skipBtn);
  document.body.appendChild(pill);
  return pill;
}

export function removePill(): void {
  const pill = document.getElementById('micro-demo-pill');
  if (pill) pill.remove();
}

export function showEndToast(): HTMLElement {
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
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(78, 205, 196, 0.4)',
    borderRadius: '9999px',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#e5e7eb',
    fontFamily: 'inherit',
    animation: 'microDemoToastIn 0.2s ease-out forwards'
  } as Record<string, string>);
  toast.appendChild(document.createTextNode("That's the basics \u2014 explore freely"));

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '2px 4px',
    lineHeight: '1',
    minWidth: '24px',
    minHeight: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  } as Record<string, string>);
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => toast.remove());
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);

  const autoRemove = window.setTimeout(() => toast.remove(), 3000);
  (toast as HTMLElement & { _autoRemove?: number })._autoRemove = autoRemove;
  return toast;
}

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
  if (document.head) {
    document.head.appendChild(style);
  }
}
