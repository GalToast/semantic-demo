/**
 * @lib/engine/index.ts — Engine bridge public API
 *
 * Re-exports the bridge factory and all consumer-facing types.
 *
 * Usage:
 * ```ts
 * import { createEngineBridge } from '@lib/engine';
 * import type { EngineBridge, EngineCallbacks } from '@lib/engine';
 * ```
 */

export { createEngineBridge } from './bridge';

export type {
  EngineBridge,
  EngineCallbacks,
  EngineStatus,
  FocusNodeOptions,
  SearchCorridorOptions,
  FilterOptions,
  SceneDiagnostics,
} from './bridge';
