/**
 * @lib/engine/micro-demo-choreography-bridge.ts - Legacy micro-demo choreography bridge.
 *
 * Re-exports the subset of js/modules/micro-demo-choreography consumed by
 * src/lib/demo/choreography.ts. Keeps direct legacy imports behind the
 * engine boundary.
 */

export {
  setDemoNodeIndex,
  runDemo,
  cancelChoreography,
} from '../../../js/modules/micro-demo-choreography';
