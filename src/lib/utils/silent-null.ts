/**
 * @lib/utils/silent-null.ts — Type-system silence helper for dynamic-import fallback paths.
 *
 * Was: `return null as unknown as T`, which vendored a null as type T and let
 * it crash downstream when a caller forgot to handle the missing case.
 *
 * Now: the silent-fallback path fails loud with a typed Error instead of
 * hiding behind a cast. The surrounding dynamic-import `.catch()` becomes an
 * observable rejection (surfaced by the global 'unhandledrejection' sink in
 * main.ts) rather than a silently-typed null that crashes later.
 *
 * Keep this helper tiny. If you find yourself importing it outside a
 * dynamic-import catch block or a documented fallback, prefer proper
 * narrowing at the boundary instead.
 */
export function silentNull<T>(): T {
    // Runtime guard: a "silent" null is a real failure that must not be
    // smuggled through the type system. Fail loud so the missing-value case
    // is observable and catchable at the call site instead of crashing later.
    throw new TypeError(
        'silentNull: no typed fallback value is available; the dynamic-import ' +
            'fallback resolved to null/undefined. Handle the missing-value case ' +
            'explicitly at the call site instead of relying on a silent null.'
    )
}
