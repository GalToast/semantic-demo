/**
 * @lib/engine/weather-bridge.ts - Bridge adapter for legacy weather module.
 *
 * Re-exports initWeather consumed by src/lib/ui/loading.ts.
 * Keeps direct legacy imports behind the engine boundary.
 */

export { initWeather } from '../utils/weather';
