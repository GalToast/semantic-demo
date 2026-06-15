/**
 * @lib/engine/scene-reveal-bridge.ts — Sanctioned passthrough for scene-reveal module.
 *
 * Tracks the legacy scene-reveal module consumption from the render loop's
 * _ensureModules(). The Svelte 5 port @lib/engine/scene-reveal exists but the
 * render loop's namespace-import + typecast pattern is deferred to Wave 3.
 */
export * from '../../../js/modules/scene-reveal';
