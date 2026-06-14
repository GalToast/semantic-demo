/**
 * @lib/engine/ui-renderers-bridge.ts - Bridge adapter for legacy UI renderer functions.
 *
 * Re-exports the subset of ui-renderers consumed by src/lib/ui/.
 * Keeps direct legacy imports behind the engine boundary.
 */

export { setActiveSearchResultRow, updateSearchTrailCue } from '../../../js/modules/ui-renderers';
