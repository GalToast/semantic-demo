/**
 * weather-ui.ts
 *
 * TypeScript shadow for weather-ui.js
 * Weather widget DOM rendering and effects.
 */

import { weatherStateStore, compositionStore } from './stores.ts';
import { seededUnit } from './utils/seeded-random.ts';

let lightningTimer: number | null = null;
let lightningGeneration: number = 0;
let stalenessIntervalId: number | null = null;

function canUseWeatherDom(): boolean {
    return typeof document !== 'undefined'
        && typeof document.getElementById === 'function'
        && typeof document.querySelector === 'function';
}

function getStoreValue<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
    let value: T;
    store.subscribe((v: T) => { value = v; })();
    return value!;
}

interface WeatherStateValue {
    weather: Record<string, unknown> | null;
    lastFetch: number | null;
    fallback: boolean;
    stalenessMsg: string;
}

interface CompositionState {
    activeView: string;
}

weatherStateStore.subscribe((state: WeatherStateValue) => {
    if (!canUseWeatherDom() || !state) return;
    if (state.fallback) {
        renderWeatherFallback(state);
    } else if (state.weather) {
        updateWeatherUi(state);
    }
});

compositionStore.subscribe((comp: CompositionState) => {
    if (!canUseWeatherDom()) return;
    if (comp.activeView !== 'map') {
        clearWeatherEffects();
    } else {
        const weatherState = getStoreValue<WeatherStateValue>(weatherStateStore);
        if (weatherState?.weather && !weatherState.fallback) {
            applyWeatherEffects(weatherState.weather);
        }
    }
});

export function updateWeatherUi(state: WeatherStateValue): void {
    if (!canUseWeatherDom()) return;
    revealWeatherWidget();
    const weather = state.weather!;
    const icon = normalizeWeatherIcon(weather.icon as string);
    const condition = (weather.condition as string) || icon;
    const desc = (weather.description as string) || getWeatherDescription(weather.code as number);

    const weatherIconEl = document.getElementById('weather-icon');
    const conditionUseEl = weatherIconEl?.querySelector('.weather-condition-icon use') as SVGSVGElement | null;
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
    if (tempEl) tempEl.textContent = `${weather.temp}F`;
    if (descEl) descEl.textContent = desc;
    if (windSpeedEl) windSpeedEl.textContent = `${weather.windSpeed} mph`;
    if (windArrowEl && Number.isFinite(weather.windDirection)) {
        windArrowEl.style.transform = `rotate(${weather.windDirection}deg)`;
    }

    updateWeatherStaleness(state.lastFetch);

    const comp = getStoreValue<CompositionState>(compositionStore);
    if (comp.activeView === 'map') {
        applyWeatherEffects(weather);
    }

    if (!stalenessIntervalId && typeof window !== 'undefined') {
        stalenessIntervalId = window.setInterval(() => updateWeatherStaleness(getStoreValue<WeatherStateValue>(weatherStateStore)?.lastFetch), 60000);
    }
}

export function renderWeatherFallback(state: WeatherStateValue): void {
    if (!canUseWeatherDom()) return;
    revealWeatherWidget();
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const windSpeedEl = document.getElementById('wind-speed');
    const weatherIconEl = document.getElementById('weather-icon');
    const conditionUseEl = weatherIconEl?.querySelector('.weather-condition-icon use') as SVGSVGElement | null;
    const stalenessEl = document.getElementById('weather-staleness');

    if (conditionUseEl) conditionUseEl.setAttribute('href', '#icon-cloud');
    if (weatherIconEl) {
        weatherIconEl.setAttribute('aria-label', 'Weather unavailable');
        weatherIconEl.dataset.condition = 'cloud';
    }

    if (state.lastFetch) {
        if (descEl) descEl.textContent = 'Service lost';
        updateWeatherStaleness(state.lastFetch);
        if (stalenessEl) {
            stalenessEl.textContent += ' (Stale)';
            stalenessEl.style.color = '#ff9b9b';
        }
    } else {
        if (tempEl) tempEl.textContent = '';
        if (descEl) descEl.textContent = 'Unavailable';
        if (windSpeedEl) windSpeedEl.textContent = '-- mph';
        updateWeatherStaleness(state.lastFetch);
    }
    clearWeatherEffects();
}

function revealWeatherWidget(): void {
    if (!canUseWeatherDom()) return;
    const widget = document.querySelector<HTMLElement>('.weather-widget');
    if (widget) {
        if (!document.fonts || document.fonts.status === 'loaded') {
            widget.hidden = false;
        } else {
            document.fonts.ready.then(() => { widget.hidden = false; });
        }
    }
}

function normalizeWeatherIcon(icon: string): string {
    return ['sun', 'cloud', 'rain'].includes(icon) ? icon : 'cloud';
}

function getWeatherDescription(code: number): string {
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

export function updateWeatherStaleness(lastFetch: number | null): void {
    if (!canUseWeatherDom()) return;
    const el = document.getElementById('weather-staleness');
    if (!el) return;
    if (!lastFetch) {
        el.textContent = '';
        el.removeAttribute('aria-label');
        return;
    }
    const mins = Math.floor((Date.now() - lastFetch) / 60000);
    if (mins < 1) {
        el.textContent = 'Updated just now';
    } else if (mins === 1) {
        el.textContent = 'Updated 1 min ago';
    } else {
        el.textContent = `Updated ${mins} min ago`;
    }
    el.setAttribute('aria-label', el.textContent);
}

export function applyWeatherEffects(weather: Record<string, unknown>): void {
    if (!weather || !canUseWeatherDom()) return;
    const overlay = document.getElementById('weather-overlay');
    if (!overlay) return;

    if (overlay.classList) overlay.classList.add('active');
    clearWeatherEffectNodes();

    const condition = (weather.condition as string) || normalizeWeatherIcon(weather.icon as string);
    if (condition === 'sun') showById('sun-rays');
    if (condition === 'fog') showById('fog-overlay');
    if (condition === 'rain' || condition === 'storm') createRain();
    if (condition === 'snow') createSnow();
    if (condition === 'storm') scheduleLightning();
}

export function clearWeatherEffects(): void {
    if (!canUseWeatherDom()) return;
    const overlay = document.getElementById('weather-overlay');
    if (overlay?.classList) overlay.classList.remove('active');
    clearWeatherEffectNodes();
}

function clearWeatherEffectNodes(): void {
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

function showById(id: string): void {
    const el = document.getElementById(id);
    if (el?.style) el.style.display = 'block';
}

function hideById(id: string): void {
    const el = document.getElementById(id);
    if (el?.style) el.style.display = 'none';
}

function clearChildren(id: string): void {
    const el = document.getElementById(id);
    if (el?.replaceChildren) el.replaceChildren();
}

function createRain(): void {
    const container = document.getElementById('rain-container');
    if (!container) return;
    for (let i = 0; i < 80; i += 1) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = `${seededUnit(i, 0xA111) * 100}%`;
        drop.style.animationDuration = `${0.5 + seededUnit(i, 0xA112) * 0.5}s`;
        drop.style.animationDelay = `${seededUnit(i, 0xA113) * 2}s`;
        container.appendChild(drop);
    }
}

function createSnow(): void {
    const container = document.getElementById('snow-container');
    if (!container) return;
    for (let i = 0; i < 42; i += 1) {
        const flake = document.createElement('div');
        flake.className = 'snow-flake';
        flake.style.left = `${seededUnit(i, 0xBEEF) * 100}%`;
        flake.style.animationDuration = `${3 + seededUnit(i, 0xCAFE) * 4}s`;
        flake.style.animationDelay = `${seededUnit(i, 0xDEAD) * 5}s`;
        flake.style.width = `${4 + seededUnit(i, 0xF00D) * 6}px`;
        flake.style.height = flake.style.width;
        container.appendChild(flake);
    }
}

function scheduleLightning(): void {
    if (typeof window === 'undefined') return;
    const generation = lightningGeneration + 1;
    lightningGeneration = generation;
    const flash = (): void => {
        if (generation !== lightningGeneration) return;
        const comp = getStoreValue<CompositionState>(compositionStore);
        if (comp.activeView !== 'map') return;
        const lightning = document.getElementById('lightning-flash');
        if (lightning) {
            lightning.classList.add('flash');
            window.setTimeout(() => lightning.classList.remove('flash'), 200);
        }
        if (generation === lightningGeneration) lightningTimer = window.setTimeout(flash, 5000 + Math.random() * 15000);
    };
    lightningTimer = window.setTimeout(flash, 3000);
}
