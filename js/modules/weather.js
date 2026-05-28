import { state } from '../state.js';

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
let lightningTimer = null;
let lightningGeneration = 0;
let stalenessIntervalId = null;

export function initWeather() {
    if (typeof window === 'undefined') return;
    if (state.weatherInitialized && weatherRefreshTimer && stalenessIntervalId) return;
    clearWeatherRefreshTimer();
    state.weatherInitialized = true;
    fetchWeather();
    weatherRefreshTimer = window.setInterval(fetchWeather, WEATHER_REFRESH_MS);
    stalenessIntervalId = window.setInterval(updateWeatherStaleness, 60000);
}

export function clearWeatherRefreshTimer() {
    if (weatherRefreshTimer) {
        window.clearInterval(weatherRefreshTimer);
        weatherRefreshTimer = null;
    }
    if (stalenessIntervalId) {
        window.clearInterval(stalenessIntervalId);
        stalenessIntervalId = null;
    }
    state.weatherInitialized = false;
}

export async function fetchWeather() {
    try {
        const payload = await fetchWeatherPayload();
        state.weather = normalizeWeatherPayload(payload);
        if (!state.weather) throw new Error('weather payload incomplete');
        state.lastSuccessfulFetch = Date.now();

        updateWeatherUi();
        if (state.currentView === 'map') {
            applyWeatherEffects();
        }
    } catch (error) {
        console.warn('Weather unavailable; continuing without live weather effects.', error);
        state.weather = null;
        renderWeatherFallback();
        clearWeatherEffects();
    }
}

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

export function updateWeatherUi() {
    if (!state.weather) {
        renderWeatherFallback();
        return;
    }

    revealWeatherWidget();
    const icon = normalizeWeatherIcon(state.weather.icon);
    const condition = state.weather.condition || icon;
    const desc = state.weather.description || getWeatherDescription(state.weather.code);
    const weatherIconEl = document.getElementById('weather-icon');
    const conditionUseEl = weatherIconEl?.querySelector('.weather-condition-icon use');
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const windSpeedEl = document.getElementById('wind-speed');
    const windArrowEl = document.getElementById('wind-arrow');

    if (conditionUseEl) conditionUseEl.setAttribute('href', `#icon-${icon}`);
    if (weatherIconEl) {
        weatherIconEl.setAttribute('role', 'img');
        weatherIconEl.setAttribute('aria-label', desc);
        weatherIconEl.dataset.condition = condition;
    }
    if (tempEl) tempEl.textContent = `${state.weather.temp}F`;
    if (descEl) descEl.textContent = desc;
    if (windSpeedEl) windSpeedEl.textContent = `${state.weather.windSpeed} mph`;
    if (windArrowEl && Number.isFinite(state.weather.windDirection)) {
        windArrowEl.style.transform = `rotate(${state.weather.windDirection}deg)`;
    }
    updateWeatherStaleness();
}

export function applyWeatherEffects() {
    if (state.currentView !== 'map' || !state.weather) return;

    const overlay = document.getElementById('weather-overlay');
    if (!overlay) return;

    overlay.classList.add('active');
    clearWeatherEffectNodes();

    const condition = state.weather.condition || normalizeWeatherIcon(state.weather.icon);
    if (condition === 'sun') {
        showById('sun-rays');
    }
    if (condition === 'fog') {
        showById('fog-overlay');
    }
    if (condition === 'rain' || condition === 'storm') {
        createRain();
    }
    if (condition === 'snow') {
        createSnow();
    }
    if (condition === 'storm') {
        scheduleLightning();
    }
}

export function clearWeatherEffects() {
    const overlay = document.getElementById('weather-overlay');
    if (overlay) overlay.classList.remove('active');
    clearWeatherEffectNodes();
}

function renderWeatherFallback() {
    revealWeatherWidget();
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const windSpeedEl = document.getElementById('wind-speed');
    const weatherIconEl = document.getElementById('weather-icon');
    const conditionUseEl = weatherIconEl?.querySelector('.weather-condition-icon use');
    const stalenessEl = document.getElementById('weather-staleness');

    if (conditionUseEl) conditionUseEl.setAttribute('href', '#icon-cloud');
    if (weatherIconEl) {
        weatherIconEl.setAttribute('aria-label', 'Weather unavailable');
        weatherIconEl.dataset.condition = 'cloud';
    }

    // 10/10 Polish: Differentiate between total failure and loss of signal
    if (state.lastSuccessfulFetch) {
        if (descEl) descEl.textContent = 'Service lost';
        updateWeatherStaleness();
        if (stalenessEl) {
            stalenessEl.textContent += ' (Stale)';
            stalenessEl.style.color = '#ff9b9b';
        }
    } else {
        if (tempEl) tempEl.textContent = '';
        if (descEl) descEl.textContent = 'Unavailable';
        if (windSpeedEl) windSpeedEl.textContent = '-- mph';
        updateWeatherStaleness();
    }
}

function revealWeatherWidget() {
    const widget = document.querySelector('.weather-widget');
    if (widget) widget.hidden = false;
}

function normalizeWeatherIcon(icon) {
    return ['sun', 'cloud', 'rain'].includes(icon) ? icon : 'cloud';
}

export function updateWeatherStaleness() {
    const el = document.getElementById('weather-staleness');
    if (!el) return;
    const ts = state.lastSuccessfulFetch;
    if (!ts) {
        el.textContent = '';
        el.removeAttribute('aria-label');
        return;
    }
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) {
        el.textContent = 'Updated just now';
    } else if (mins === 1) {
        el.textContent = 'Updated 1 min ago';
    } else {
        el.textContent = `Updated ${mins} min ago`;
    }
    el.setAttribute('aria-label', el.textContent);
}

// Window exports retired 2026-05-28 — all consumers migrated to direct imports:
// updateWeatherStaleness → internal only (weather.js calls it directly)
// refreshWeatherStalenessIndicator → alias, no consumers
// clearWeatherRefreshTimer → lifecycle.js direct import (line 67)

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

function getWeatherDescription(code) {
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 49) return 'Fog';
    if (code <= 59) return 'Drizzle';
    if (code <= 69) return 'Rain';
    if (code <= 79) return 'Snow';
    if (code <= 82) return 'Rain showers';
    if (code <= 86) return 'Snow showers';
    if (code <= 99) return 'Thunderstorm';
    return 'Current weather';
}

function showById(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
}

function clearWeatherEffectNodes() {
    hideById('sun-rays');
    hideById('fog-overlay');
    clearChildren('rain-container');
    clearChildren('snow-container');
    lightningGeneration += 1;
    if (lightningTimer && typeof window !== 'undefined') {
        window.clearTimeout(lightningTimer);
        lightningTimer = null;
    }
}

function hideById(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function clearChildren(id) {
    const el = document.getElementById(id);
    if (el) el.replaceChildren();
}

function createRain() {
    const container = document.getElementById('rain-container');
    if (!container) return;
    for (let i = 0; i < 80; i += 1) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = `${Math.random() * 100}%`;
        drop.style.animationDuration = `${0.5 + Math.random() * 0.5}s`;
        drop.style.animationDelay = `${Math.random() * 2}s`;
        container.appendChild(drop);
    }
}

function createSnow() {
    const container = document.getElementById('snow-container');
    if (!container) return;
    for (let i = 0; i < 42; i += 1) {
        const flake = document.createElement('div');
        flake.className = 'snow-flake';
        flake.style.left = `${Math.random() * 100}%`;
        flake.style.animationDuration = `${3 + Math.random() * 4}s`;
        flake.style.animationDelay = `${Math.random() * 5}s`;
        flake.style.width = `${4 + Math.random() * 6}px`;
        flake.style.height = flake.style.width;
        container.appendChild(flake);
    }
}

function scheduleLightning() {
    if (typeof window === 'undefined') return;
    const generation = lightningGeneration + 1;
    lightningGeneration = generation;
    const flash = () => {
        if (generation !== lightningGeneration) return;
        if (state.currentView !== 'map') return;
        const lightning = document.getElementById('lightning-flash');
        if (lightning) {
            lightning.classList.add('flash');
            window.setTimeout(() => lightning.classList.remove('flash'), 200);
        }
        if (generation === lightningGeneration) lightningTimer = window.setTimeout(flash, 5000 + Math.random() * 15000);
    };
    lightningTimer = window.setTimeout(flash, 3000);
}

// Window exports retired 2026-05-28
