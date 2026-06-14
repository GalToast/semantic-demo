/**
 * @lib/engine/micro-demo-choreography-bridge.ts — Bridge for micro-demo choreography.
 *
 * Re-exports the subset of js/modules/micro-demo-choreography consumed by
 * src/lib/demo/choreography.ts, keeping the direct legacy import behind the
 * engine boundary.
 */

export {
  setDemoNodeIndex,
  runDemo,
  cancelChoreography,
} from '../../../js/modules/micro-demo-choreography';
