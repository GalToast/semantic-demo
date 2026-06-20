/**
 * @lib/focus/geometry.ts — Thin re-export from journey/focus-pocket-geometry.ts
 *
 * W7-B Pair 2: the canonical geometry implementation now lives in
 * @lib/journey/focus-pocket-geometry. This file is kept as a forwarding
 * module so existing import paths continue to resolve.
 *
 * NOTE: the seededUnit export below comes from @lib/utils/seeded-random
 * (canonical 2-argument implementation), shadowing the 4+ argument
 * inline version currently present in journey/focus-pocket-geometry.
 * When journey/ is cleaned up (remove inline seededUnit), this file
 * can become a pure re-export.
 */

// Override: maintain canonical 2-argument seededUnit.
export { seededUnit } from '@lib/utils/seeded-random'

// Everything else from the canonical home.
export * from '@lib/journey/focus-pocket-geometry'
