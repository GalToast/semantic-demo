/**
 * @lib/engine/keyboard-help-bridge.ts - Bridge for keyboard-help legacy module.
 *
 * Re-exports keyboard help functions consumed by src/lib/keyboard/keyboard-help.ts.
 */

export {
  initKeyboardShortcutsHint,
  showKeyboardShortcutsHint,
  initKeyboardResetOwnership,
} from '../../../js/modules/keyboard-help';
