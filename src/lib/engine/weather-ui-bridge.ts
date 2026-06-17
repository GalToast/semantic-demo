/**
 * @lib/engine/weather-ui-bridge.ts — Bridge for weather UI DOM functions.
 *
 * Re-exports weather-ui DOM manipulation functions consumed by
 * src/lib/utils/weather.ts so the canonical weather module does not
 * import directly from js/modules/weather-ui.
 */

export {
    applyWeatherEffects,
    clearWeatherEffects,
    renderWeatherFallback,
    updateWeatherStaleness,
    updateWeatherUi
} from '../../../js/modules/weather-ui'
