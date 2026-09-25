/**
 * @lib/engine/loading-ui-bridge.ts — Sanctioned passthrough for loading-ui module.
 *
 * Tracks the legacy loading-ui module consumption from the render loop's
 * _ensureModules(). Native port is deferred to W11-T10 Wave 3
 * (frame budget critical, 1-2 days).
 */
export * from '../ui/loading'
