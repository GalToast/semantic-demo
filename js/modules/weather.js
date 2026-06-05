import { state } from '../state.js';
import { getCurrentView, getWeather, getWeatherInitialized } from '../state/selectors/index.js';
import { weatherStateStore } from './stores.js';
import {
    applyWeatherEffects as applyWeatherEffectsForWeather,
    clearWeatherEffects,
    renderWeatherFallback as renderWeatherFallbackState,
    updateWeatherStaleness as updateWeatherStalenessForTimestamp,
    updateWeatherUi as updateWeatherUiState
} from './weather-ui.js';

const WEATHER_REFRESH_MS = 5 * 60 * 1000;
const DEFAULT_WEATHER_COORDS = { latitude: 30.3119, longitude: -95.4561 };
const OPEN_METEO_CURRENT_FIELDS = [
    'temperature_2m',
    'relative_humidity_2m',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
].join(',');
let weatherRefreshTimer = null;

export function initWeather() {
    if (typeof window === 'undefined') return;
    if (getWeatherInitialized() && weatherRefreshTimer) return;
    clearWeatherRefreshTimer();
    state.weatherInitialized = true;
    fetchWeather();
    weatherRefreshTimer = window.setInterval(fetchWeather, WEATHER_REFRESH_MS);
}

export function clearWeatherRefreshTimer() {
    if (weatherRefreshTimer) {
        window.clearInterval(weatherRefreshTimer);
        weatherRefreshTimer = null;
    }
    state.weatherInitialized = false;
}

export async function fetchWeather() {
    try {
        const payload = await fetchWeatherPayload();
        state.weather = normalizeWeatherPayload(payload);
        if (!state.weather) throw new Error('weather payload incomplete');
        state.lastSuccessfulFetch = Date.now();

        weatherStateStore.set({
            weather: getWeather(),
            lastFetch: state.lastSuccessfulFetch,
            fallback: false,
            stalenessMsg: ''
        });
    } catch (_error) {
        // Weather is non-critical — continue without live effects
        state.weather = null;

        weatherStateStore.set({
            weather: null,
            lastFetch: state.lastSuccessfulFetch || null,
            fallback: true,
            stalenessMsg: ''
        });
    }
}

export function updateWeatherUi() {
    if (!getWeather()) {
        renderWeatherFallback();
        return;
    }
    updateWeatherUiState({
        weather: getWeather(),
        lastFetch: state.lastSuccessfulFetch,
        fallback: false,
        stalenessMsg: ''
    });
}

export function renderWeatherFallback() {
    renderWeatherFallbackState({
        weather: null,
        lastFetch: state.lastSuccessfulFetch || null,
        fallback: true,
        stalenessMsg: ''
    });
}

export function updateWeatherStaleness() {
    updateWeatherStalenessForTimestamp(state.lastSuccessfulFetch || null);
}

export function applyWeatherEffects() {
    if (getCurrentView() !== 'map' || !getWeather()) return;
    applyWeatherEffectsForWeather(state.weather);
}

export { clearWeatherEffects };

async function fetchWeatherPayload() {
    if (!shouldPreferBackendWeather()) {
        try {
            return await fetchOpenMeteoWeather();
        } catch (openMeteoError) {
            const payload = await fetchBackendWeather();
            payload.client_error = openMeteoError instanceof Error ? openMeteoError.message : String(openMeteoError);
            return payload;
        }
    }

    try {
        return await fetchBackendWeather();
    } catch (backendError) {
        const payload = await fetchOpenMeteoWeather();
        payload.backend_error = backendError instanceof Error ? backendError.message : String(backendError);
        return payload;
    }
}

function shouldPreferBackendWeather() {
    return new URLSearchParams(window.location.search).get('weather') === 'backend';
}

async function fetchBackendWeather() {
    const response = await fetch('api.php?action=weather', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload?.current) {
        throw new Error(payload?.error || `weather response ${response.status}`);
    }
    return payload;
}

async function fetchOpenMeteoWeather() {
    const params = new URLSearchParams({
        latitude: String(DEFAULT_WEATHER_COORDS.latitude),
        longitude: String(DEFAULT_WEATHER_COORDS.longitude),
        current: OPEN_METEO_CURRENT_FIELDS,
        temperature_unit: 'fahrenheit',
        wind_speed_unit: 'mph',
        timezone: 'America/Chicago'
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        mode: 'cors'
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.current) {
        throw new Error(`open-meteo response ${response.status}`);
    }
    return buildOpenMeteoPayload(payload);
}

function buildOpenMeteoPayload(payload) {
    const current = payload.current || {};
    const code = Number(current.weather_code ?? -1);
    const condition = describeWeatherCode(code);
    return {
        ok: true,
        source: 'open-meteo-client',
        location: {
            label: 'Conroe, TX',
            latitude: payload.latitude ?? DEFAULT_WEATHER_COORDS.latitude,
            longitude: payload.longitude ?? DEFAULT_WEATHER_COORDS.longitude,
            timezone: payload.timezone || 'America/Chicago'
        },
        current: {
            time: current.time || null,
            temperature_f: current.temperature_2m,
            humidity: current.relative_humidity_2m,
            weather_code: code,
            description: condition.label,
            icon: condition.icon,
            condition: condition.condition,
            wind_mph: current.wind_speed_10m,
            wind_direction: current.wind_direction_10m,
            wind_gust_mph: current.wind_gusts_10m ?? null
        }
    };
}

function normalizeWeatherPayload(payload) {
    const current = payload?.current;
    if (!current) return null;
    const temp = Number(current.temperature_f);
    const windSpeed = Number(current.wind_mph);
    const windDirection = Number(current.wind_direction);
    if (!Number.isFinite(temp) || !Number.isFinite(windSpeed) || !Number.isFinite(windDirection)) {
        return null;
    }
    return {
        temp: Math.round(temp),
        humidity: current.humidity ?? null,
        code: Number(current.weather_code) || 0,
        description: current.description || 'Current weather',
        icon: normalizeWeatherIcon(current.icon),
        condition: current.condition || normalizeWeatherIcon(current.icon),
        windSpeed: Math.round(windSpeed),
        windDirection,
        windGust: current.wind_gust_mph === null ? null : Math.round(Number(current.wind_gust_mph)),
        source: payload.source || 'weather'
    };
}

function normalizeWeatherIcon(icon) {
    return ['sun', 'cloud', 'rain'].includes(icon) ? icon : 'cloud';
}

export function describeWeatherCode(code) {
    if (code === 0) return { label: 'Clear', icon: 'sun', condition: 'sun' };
    if (code <= 3) return { label: 'Partly cloudy', icon: 'cloud', condition: 'cloud' };
    if (code <= 49) return { label: 'Fog', icon: 'cloud', condition: 'fog' };
    if (code <= 59) return { label: 'Drizzle', icon: 'rain', condition: 'rain' };
    if (code <= 69) return { label: 'Rain', icon: 'rain', condition: 'rain' };
    if (code <= 79) return { label: 'Snow', icon: 'cloud', condition: 'snow' };
    if (code <= 82) return { label: 'Rain showers', icon: 'rain', condition: 'rain' };
    if (code <= 86) return { label: 'Snow showers', icon: 'cloud', condition: 'snow' };
    if (code <= 99) return { label: 'Thunderstorm', icon: 'rain', condition: 'storm' };
    return { label: 'Current weather', icon: 'cloud', condition: 'cloud' };
}

// Window exports retired 2026-05-28
