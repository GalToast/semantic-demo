/**
 * webgl-restore-adapter.ts — Thin re-export shim
 *
 * Canonical implementation moved to src/lib/utils/webgl-restore-adapter.ts (W11-T1b).
 * This shim preserves backward compatibility for engine kernel importers.
 */

export { setWebGLContextRestoreHandler, restoreWebGLContext } from '../src/lib/utils/webgl-restore-adapter';
