/**
 * @lib/engine/state-selectors-bridge.ts - Sanctioned bridge to legacy state selectors.
 *
 * Prefer Svelte stores for new UI code. Use this adapter only while migrating
 * legacy engine-owned state selectors behind the engine bridge contract.
 *
 * W13-T2 (2026-06-15): navigation.js (28 selectors) and filter-mode.js (16 selectors)
 * now read from appState (Svelte 5) instead of the legacy state singleton.
 * The barrel re-export below chains through those updated modules.
 * T5 will delete the barrel and add explicit exports here.
 *
 * W13-T3 (2026-06-15): search.js (28 selectors) and animation.js (26 selectors)
 * now read from appState as well. Cumulative: 94 of the simple-state selectors
 * (navigation + filter-mode + search + animation) are now thin pass-throughs.
 * The remaining ~85 Three.js object selectors (renderer.js, config.js) wait for
 * W13-T4. T5 will retire the barrel once selectors are unreferenced.
 */

export * from '../../../js/state/selectors/index';
