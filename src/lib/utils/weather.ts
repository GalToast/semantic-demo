/**
 * weather.ts — Canonical home for weather data fetching, normalization, and state management.
 *
 * Ported from js/modules/weather.ts (W15 Wave D).
 * Zero logic changes — only import paths adapted for src/lib/utils/ location.
 */

import { state } from '@lib/engine/state-bridge'

import { appState } from '@lib/state/app.svelte';
import {
    applyWeatherEffects as applyWeatherEffectsForWeather,
    clearWeatherEffects,
    renderWeatherFallback as renderWeatherFallbackState,
    updateWeatherStaleness as updateWeatherStalenessForTimestamp,
    updateWeatherUi as updateWeatherUiState
} from '@lib/ui/weather-ui'

const WEATHER_REFRESH_MS: number = 5 * 60 * 1000;
const DEFAULT_WEATHER_COORDS = { latitude: 30.3119, longitude: -95.4561 } as const;
const OPEN_METEO_CURRENT_FIELDS: string = [
    'temperature_2m',
    'relative_humidity_2m',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
].join(',');
let weatherRefreshTimer: number | null = null;

export interface WeatherData {
    temp: number;
    humidity: number | null;
    code: number;
    description: string;
    icon: string;
    condition: string;
    windSpeed: number;
    windDirection: number;
    windGust: number | null;
    source: string;
}

export interface WeatherCondition {
    label: string;
    icon: string;
    condition: string;
}

export function initWeather(): void {
    if (typeof window === 'undefined') return;
    if (appState.weatherInitialized && weatherRefreshTimer) return;
    clearWeatherRefreshTimer();
    state.weatherInitialized = true;
    fetchWeather();
    weatherRefreshTimer = window.setInterval(fetchWeather, WEATHER_REFRESH_MS);
}

export function clearWeatherRefreshTimer(): void {
    if (weatherRefreshTimer) {
        window.clearInterval(weatherRefreshTimer);
        weatherRefreshTimer = null;
    }
    state.weatherInitialized = false;
}

export async function fetchWeather(): Promise<void> {
    try {
        const payload = await fetchWeatherPayload();
        const normalized = normalizeWeatherPayload(payload);
        state.weather = normalized;
        if (!normalized) throw new Error('weather payload incomplete');
        (state as Record<string, unknown>).lastSuccessfulFetch = Date.now();

        appState.weatherState = {
            weather: appState.weather as Record<string, unknown> | null,
            lastFetch: (state as Record<string, unknown>).lastSuccessfulFetch as number,
            fallback: false,
            stalenessMsg: ''
        };
    } catch (_error: unknown) {
        state.weather = null;

        appState.weatherState = {
            weather: null,
            lastFetch: (state as Record<string, unknown>).lastSuccessfulFetch as number | null || null,
            fallback: true,
            stalenessMsg: ''
        };
    }
}

export function updateWeatherUi(): void {
    if (!appState.weather) {
        renderWeatherFallback();
        return;
    }
    updateWeatherUiState({
        weather: appState.weather as unknown as Record<string, unknown>,
        lastFetch: (state as Record<string, unknown>).lastSuccessfulFetch as number,
        fallback: false,
        stalenessMsg: ''
    });
}

export function renderWeatherFallback(): void {
    renderWeatherFallbackState({
        weather: null,
        lastFetch: (state as Record<string, unknown>).lastSuccessfulFetch as number | null || null,
        fallback: true,
        stalenessMsg: ''
    });
}

export function updateWeatherStaleness(): void {
    updateWeatherStalenessForTimestamp((state as Record<string, unknown>).lastSuccessfulFetch as number | null || null);
}

export function applyWeatherEffects(): void {
    if (appState.currentView !== 'map' || !appState.weather) return;
    applyWeatherEffectsForWeather(appState.weather as unknown as Record<string, unknown>);
}

export { clearWeatherEffects };

async function fetchWeatherPayload(): Promise<Record<string, unknown>> {
    if (!shouldPreferBackendWeather()) {
        try {
            return await fetchOpenMeteoWeather();
        } catch (openMeteoError: unknown) {
            const payload = await fetchBackendWeather();
            payload.client_error = openMeteoError instanceof Error ? openMeteoError.message : String(openMeteoError);
            return payload;
        }
    }

    try {
        return await fetchBackendWeather();
    } catch (backendError: unknown) {
        const payload = await fetchOpenMeteoWeather();
        payload.backend_error = backendError instanceof Error ? backendError.message : String(backendError);
        return payload;
    }
}

function shouldPreferBackendWeather(): boolean {
    return new URLSearchParams(window.location.search).get('weather') === 'backend';
}

async function fetchBackendWeather(): Promise<Record<string, unknown>> {
    const response = await fetch('api.php?action=weather', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload?.ok || !payload?.current) {
        throw new Error((payload?.error as string) || `weather response ${response.status}`);
    }
    return payload;
}

async function fetchOpenMeteoWeather(): Promise<Record<string, unknown>> {
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
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload?.current) {
        throw new Error(`open-meteo response ${response.status}`);
    }
    return buildOpenMeteoPayload(payload);
}

function buildOpenMeteoPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const current = (payload.current || {}) as Record<string, unknown>;
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

function normalizeWeatherPayload(payload: Record<string, unknown>): WeatherData | null {
    const current = payload?.current as Record<string, unknown> | undefined;
    if (!current) return null;
    const temp = Number(current.temperature_f);
    const windSpeed = Number(current.wind_mph);
    const windDirection = Number(current.wind_direction);
    if (!Number.isFinite(temp) || !Number.isFinite(windSpeed) || !Number.isFinite(windDirection)) {
        return null;
    }
    return {
        temp: Math.round(temp),
        humidity: (current.humidity as number) ?? null,
        code: Number(current.weather_code) || 0,
        description: (current.description as string) || 'Current weather',
        icon: normalizeWeatherIcon(current.icon as string),
        condition: (current.condition as string) || normalizeWeatherIcon(current.icon as string),
        windSpeed: Math.round(windSpeed),
        windDirection,
        windGust: current.wind_gust_mph === null ? null : Math.round(Number(current.wind_gust_mph)),
        source: (payload.source as string) || 'weather'
    };
}

function normalizeWeatherIcon(icon: string): string {
    return ['sun', 'cloud', 'rain'].includes(icon) ? icon : 'cloud';
}

export function describeWeatherCode(code: number): WeatherCondition {
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
