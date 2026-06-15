/**
 * @lib/engine/state-bridge.ts - Sanctioned bridge to the legacy state singleton.
 *
 * Prefer Svelte stores for new UI code. Use this adapter only while migrating
 * legacy engine-owned state consumers behind the engine bridge contract.
 */

export { state, withStateMutation } from '../../../js/state';
export type * from '../../../js/state';
