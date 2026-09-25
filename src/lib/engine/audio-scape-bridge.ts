/**
 * audio-scape-bridge.ts
 *
 * Imperative bridge: re-exports canonical audio-scape for legacy callers.
 * Canonical source: src/lib/audio/audio-scape.ts
 */

export { initAudio, setAudioMuted, triggerCorridorBloom, trigger, play, disposeAudio } from '@lib/audio/audio-scape'
