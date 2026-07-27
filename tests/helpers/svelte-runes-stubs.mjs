/**
 * Svelte 5 rune stubs for Node-side contract/audit imports.
 *
 * The real Svelte 5 runtime rewrites these runes at compile time; when Node loads
 * project .ts source directly (for visual audits, contracts, etc.) the bare rune
 * identifiers are undefined. The ts-resolve-loader prepends an import of this
 * module to any source file that uses runes or import.meta.env so the module
 * evaluates safely.
 */

if (typeof globalThis !== 'undefined' && globalThis.__importMetaEnv == null) {
    globalThis.__importMetaEnv = {
        DEV: false,
        MODE: 'production',
        PROD: true,
        SSR: false,
        BASE_URL: '/',
        get(key) {
            return process.env[key] ?? undefined
        }
    }
}

export function $state(initial) {
    return typeof initial === 'function' ? initial() : (initial ?? null)
}
$state.snapshot = (value) => value
$state.frozen = (initial) => (typeof initial === 'function' ? initial() : (initial ?? null))
$state.raw = (initial) => (typeof initial === 'function' ? initial() : (initial ?? null))

export function $derived(source) {
    return typeof source === 'function' ? source() : source
}
$derived.by = (source) => (typeof source === 'function' ? source() : source)

export function $effect(fn) {
    // no-op in Node
}
$effect.pre = () => {}
$effect.root = (fn) => fn()

export function $inspect() {
    return { with: () => {} }
}

export function $props() {
    return {}
}

export function $bindable() {
    return undefined
}
