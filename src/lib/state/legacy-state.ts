/**
 * @deprecated — LegacyState has moved to @lib/state/state-types.
 * This re-export preserves the import path for engine files that cannot be
 * edited (three-engine-core.ts is off-limits). New code should import
 * LegacyState from @lib/state/state-types directly.
 */
export type { LegacyState } from './state-types'
