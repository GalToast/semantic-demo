/**
 * @lib/keyboard/keyboard-help.ts — Native keyboard shortcut utilities
 *
 * Ported from js/modules/keyboard-help.ts.
 *
 * Pure utility functions for keyboard target detection.
 * DOM-heavy hint-panel functions remain delegated to the legacy module
 * until the panel is ported to a Svelte component.
 */

// ── Pure utilities (native, no legacy deps) ─────────────────────────────────

export function isKeyboardTextEntryTarget(target: EventTarget | null): target is HTMLElement {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tagName = el.tagName.toLowerCase();
  const type =
    typeof (el as HTMLInputElement).type === 'string'
      ? (el as HTMLInputElement).type.toLowerCase()
      : '';

  if (
    tagName === 'input' &&
    (type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === 'password')
  ) {
    return true;
  }
  if (tagName === 'textarea') return true;
  if (el.isContentEditable) return true;

  return false;
}

export function isKeyboardControlTarget(target: EventTarget | null): target is HTMLElement {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const tagName = (target as HTMLElement).tagName.toLowerCase();
  if (tagName === 'button' || tagName === 'select' || tagName === 'a') return true;
  return false;
}

// ── DOM delegation (imports legacy until panel becomes Svelte component) ──────

export {
  initKeyboardShortcutsHint,
  showKeyboardShortcutsHint,
  initKeyboardResetOwnership,
} from '@lib/engine/keyboard-help-bridge';
