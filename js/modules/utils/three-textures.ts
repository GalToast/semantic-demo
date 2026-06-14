/**
 * three-textures.ts — Thin re-export shim
 *
 * Canonical implementation moved to src/lib/utils/three-textures.ts (W11-T1b).
 * This shim preserves backward compatibility for engine kernel importers.
 *
 * Note: The src/ version imports CanvasTexture directly from 'three' instead of
 * accepting the THREE namespace as a parameter. Callers that pass THREE will have
 * the extra argument silently ignored — no behavioral change.
 */

export { createSporeTexture, createFocusRingTexture, createFocusNextCueTexture } from '../../../src/lib/utils/three-textures';
