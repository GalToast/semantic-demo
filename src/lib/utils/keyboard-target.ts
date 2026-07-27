/**
 * @lib/utils/keyboard-target.ts — Canonical keyboard-target type predicate
 *
 * Extracted from `@lib/keyboard/keyboard-help.ts:16-32` (W7 F6 — duplicate-definition removal).
 * Single source of truth for "is this keyboard target a text-entry element?" so the keyboard-help
 * + orchestration/triggers code paths can't drift (W7 Finding 6 — fix-wave 2026-07-25).
 *
 * Type-predicate form (`target is HTMLElement`) so callers gain a narrowed element type
 * when the predicate succeeds. The triggers.ts callsite wraps with `!!` if a plain boolean is needed.
 */

export function isKeyboardTextEntryTarget(target: EventTarget | null): target is HTMLElement {
    if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
    const el = target as HTMLElement
    const tagName = el.tagName.toLowerCase()
    const type = typeof (el as HTMLInputElement).type === 'string' ? (el as HTMLInputElement).type.toLowerCase() : ''

    if (
        tagName === 'input' &&
        (type === 'text' ||
            type === 'search' ||
            type === 'email' ||
            type === 'url' ||
            type === 'password' ||
            type === 'number' ||
            type === 'date' ||
            type === 'time' ||
            type === 'tel' ||
            type === 'range' ||
            type === 'color')
    ) {
        return true
    }
    if (tagName === 'textarea') return true
    if (el?.isContentEditable) return true

    return false
}
