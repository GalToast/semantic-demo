/// <reference types="vite/client" />

/**
 * @lib/utils/env-flag.ts — Typed reader for string-valued Vite env flags.
 *
 * Reading `import.meta.env` from a `Record<string, string>` perspective
 * normally requires an `as unknown as { env?: Record<string, string> }` escape
 * hatch at every call site. Centralizing the access here keeps a single,
 * narrowly-typed boundary instead of scattering `as unknown` casts.
 *
 * `import.meta.env` is undefined in Node / test environments and when no Vite
 * client types are injected, so the access is guarded and coerced. A flag that
 * is entirely absent returns `undefined`; a present-but-empty flag returns `''`.
 */
export function getEnvFlag(flag: string): string | undefined {
    try {
        const value = import.meta.env?.[flag]
        return value === undefined ? undefined : String(value)
    } catch {
        return undefined
    }
}
