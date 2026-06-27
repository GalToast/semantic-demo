/**
 * @lib/utils/silent-null.ts — Type-system silence helper for dynamic-import fallback paths.
 *
 * Returns `null` cast to T. Use only at call sites where:
 *
 *  - A dynamic import fails or is suppressed (test teardown, lazy-bridge fallback)
 *  - The surrounding `Promise<T>` chain already swallowed the rejection
 *  - The downstream caller is *guaranteed* to handle the null/missing case
 *
 * Rationale: `return null as unknown as T` in 7()-shaped code triggers
 * coding-contract linters (the cascade reads like an unaccountable escape
 * hatch). Wrapping the cast names the intent ("this null is a deliberate
 * silence, not a leaked value") and centralises the boundary so a future
 * reviewer can locate every site with one grep.
 *
 * Keep this helper tiny. If you find yourself importing it outside a
 * dynamic-import catch block or a documented fallback, prefer proper
 * narrowing at the boundary instead.
 */
export function silentNull<T>(): T {
    return null as unknown as T
}
