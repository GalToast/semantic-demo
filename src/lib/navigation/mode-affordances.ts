/**
 * @lib/navigation/mode-affordances.ts
 *
 * Cross-component helpers for navigation mode affordances (lock semantics,
 * selection guards). Pulled out of @lib/components/header/mode-nav.ts in
 * PR-D3 so non-Header consumers (notably @lib/ui/mode-bindings.ts) can
 * share the same SELECTION_DEPENDENT_MODES set + isModeLocked function
 * without depending on the Header component's module layout.
 *
 * The selection lock rule: `trail`, `focus`, `inside` require a focused
 * business node to be meaningful. Without one, the mode renders disabled
 * (aria-disabled, dimmed styling) and clicks no-op with a toast.
 */

import type { NavMode } from '@lib/types/state'

/**
 * Modes that require a focused business node to be meaningful. Matches the
 * selection guard in navigation.svelte.ts and mode-bindings.ts.
 */
export const SELECTION_DEPENDENT_MODES = new Set<string>(['trail', 'focus', 'inside'])

/** A mode is "locked" when it requires a focused business and none exists. */
export function isModeLocked(modeId: NavMode | 'map', hasSelection: boolean): boolean {
    return SELECTION_DEPENDENT_MODES.has(modeId) && !hasSelection
}
