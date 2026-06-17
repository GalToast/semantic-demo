/**
 * dom-builder.ts — Thin re-export shim
 *
 * Canonical implementation moved to src/lib/utils/dom-builder.ts (W11-T1b).
 * This shim preserves backward compatibility for engine kernel importers.
 */

export { el, setChildren } from '@lib/utils/dom-builder';
export type { DomChild, DomEventHandler, DomAttributes } from '@lib/utils/dom-builder';
