/**
 * @lib/engine/state-selectors-bridge.ts - Sanctioned bridge to legacy state selectors.
 *
 * Prefer Svelte stores for new UI code. Use this adapter only while migrating
 * legacy engine-owned state selectors behind the engine bridge contract.
 */

export * from '../../../js/state/selectors/index';
