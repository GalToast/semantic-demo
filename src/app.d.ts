// Svelte types are imported below as `import type { ComponentType } from 'svelte'`,
// so the legacy triple-slash ambient reference is no longer required.

/**
 * @/src/app.d.ts — Ambient type declarations for the Svelte project
 */

// Declare Svelte module for TypeScript
declare module '*.svelte' {
    import type { ComponentType } from 'svelte'
    const component: ComponentType
    export default component
}

// Declare CSS modules
declare module '*.css' {
    const content: string
    export default content
}

// Window augmentation for app-level globals
interface Window {
    /** Debug reference to init timings */
    __initTimings?: Array<{ step: string; ms: number }>
    /** Mutation guard for state.js compatibility */
    withStateMutation?: <T>(fn: () => T) => T
    /**
     * Leaflet global injected at runtime by the asset loader
 * (:loadLeafletAssets). The local LeafletApi
     * interface narrows the cast site; declaring it as `unknown` here
     * keeps the global permissive without pulling the upstream @types/leaflet.
     */
    L?: unknown
}
