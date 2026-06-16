/**
 * Minimal Svelte 5 rune globals for raw Node contract tests.
 *
 * Contract tests execute source modules directly through Node, not through the
 * Svelte compiler. These identity shims are intentionally non-reactive; they
 * only let rune-class state modules load so deterministic contracts can inspect
 * and exercise their imperative APIs.
 */

if (typeof globalThis.$state !== 'function') {
    globalThis.$state = Object.assign((value) => value, {
        raw: (value) => value,
        snapshot: (value) => value
    })
}

if (typeof globalThis.$derived !== 'function') {
    globalThis.$derived = Object.assign((value) => value, {
        by: (derive) => derive()
    })
}

if (typeof globalThis.$effect !== 'function') {
    globalThis.$effect = Object.assign((effect) => {
        const cleanup = effect?.()
        return typeof cleanup === 'function' ? cleanup : undefined
    }, {
        root: (effect) => {
            const cleanup = effect?.()
            return typeof cleanup === 'function' ? cleanup : () => {}
        }
    })
}
