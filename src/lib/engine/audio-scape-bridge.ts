/**
 * @lib/engine/audio-scape-bridge.ts — Sanctioned passthrough (W11-T10 Wave 1).
 * Re-exports the legacy audio-scape module. Will retire when T10-Wave 3
 * ports the module natively.
 */
export {
  initAudio,
  setAudioMuted,
  triggerCorridorBloom,
  trigger,
  play,
  disposeAudio,
} from '../../../js/modules/audio-scape';
