/**
 * @lib/engine/focus-pocket-bridge.ts — Sanctioned passthrough for focus-pocket module.
 *
 * Tracks the legacy focus-pocket module consumption from the render loop's
 * _ensureModules(). The Svelte 5 port @lib/focus/pocket exists but the render
 * loop's namespace-import + typecast pattern is deferred to Wave 3.
 */
export * from '../../../js/modules/focus-pocket';
