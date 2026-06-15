/**
 * @lib/engine/journey-selected-card-bridge.ts - Legacy selected-card bridge.
 *
 * Keep direct legacy imports behind the engine boundary while the Svelte
 * journey layer is still being ported.
 */

export {
	syncFocusStage,
	updateSelectedBusiness
} from '../../../js/modules/journey-selected-card';
