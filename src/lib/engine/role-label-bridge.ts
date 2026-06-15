/**
 * @lib/engine/role-label-bridge.ts — Bridge for the role-label display helper.
 *
 * Re-exports the engine-kernel symbol consumed by
 * `src/lib/orchestration/adapter-deps.ts` so Svelte-layer code does not
 * import directly from `js/`. Matches the pattern of the 12+ existing
 * bridge files in `src/lib/engine/`.
 */
export { _getSelectedBusinessRoleLabel } from '../../../js/modules/role-label';
