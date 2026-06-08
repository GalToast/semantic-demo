import { weatherStateStore } from './stores.js';
import { compositionStore } from './stores.js';
import { seededUnit } from './utils/seeded-random.js';

let lightningTimer = null;
let lightningGeneration = 0;
let stalenessIntervalId = null;

function canUseWeatherDom() {
    return typeof document !== 'undefined'
        && typeof document.getElementById === 'function'
        && typeof document.querySelector === 'function';
}

// The UI layer subscribes to the stores and reacts purely to state changes
weatherStateStore.subscribe((state) => {
    if (!canUseWeatherDom() || !state) return;
    if (state.fallback) {
        renderWeatherFallback(state);
    } else if (state.weather) {
        updateWeatherUi(state);
    }
});

compositionStore.subscribe((comp) => {
    if (!canUseWeatherDom()) return;
    // If the view changes away from map, we clear weather effects.
    if (comp.activeView !== 'map') {
        clearWeatherEffects();
    } else {
        // Re-apply if we return to map
        const weatherState = getStoreValue(weatherStateStore);
        if (weatherState?.weather && !weatherState.fallback) {
            applyWeatherEffects(weatherState.weather);
        }
    }
});

function getStoreValue(store) {
    let value;
    store.subscribe((v) => { value = v; })();
    return value;
}

export function updateWeatherUi(state) {
    if (!canUseWeatherDom()) return;
    revealWeatherWidget();
    const weather = state.weather;
    const icon = normalizeWeatherIcon(weather.icon);
    const condition = weather.condition || icon;
    const desc = weather.description || getWeatherDescription(weather.code);

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
    if (tempEl) tempEl.textContent = `${weather.temp}F`;
    if (descEl) descEl.textContent = desc;
    if (windSpeedEl) windSpeedEl.textContent = `${weather.windSpeed} mph`;
    if (windArrowEl && Number.isFinite(weather.windDirection)) {
        windArrowEl.style.transform = `rotate(${weather.windDirection}deg)`;
    }

    updateWeatherStaleness(state.lastFetch);

    // Only apply effects if map view is active
    const comp = getStoreValue(compositionStore);
    if (comp.activeView === 'map') {
        applyWeatherEffects(weather);
    }

    if (!stalenessIntervalId && typeof window !== 'undefined') {
        stalenessIntervalId = window.setInterval(() => updateWeatherStaleness(getStoreValue(weatherStateStore)?.lastFetch), 60000);
    }
}

export function renderWeatherFallback(state) {
    if (!canUseWeatherDom()) return;
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

function revealWeatherWidget() {
    if (!canUseWeatherDom()) return;
    const widget = document.querySelector('.weather-widget');
    if (widget) {
        if (!document.fonts || document.fonts.status === 'loaded') {
            widget.hidden = false;
        } else {
            document.fonts.ready.then(() => { widget.hidden = false; });
        }
    }
}

function normalizeWeatherIcon(icon) {
    return ['sun', 'cloud', 'rain'].includes(icon) ? icon : 'cloud';
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

export function updateWeatherStaleness(lastFetch) {
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

export function applyWeatherEffects(weather) {
    if (!weather || !canUseWeatherDom()) return;
    const overlay = document.getElementById('weather-overlay');
    if (!overlay) return;

    if (overlay.classList?.add) overlay.classList.add('active');
    clearWeatherEffectNodes();

    const condition = weather.condition || normalizeWeatherIcon(weather.icon);
    if (condition === 'sun') showById('sun-rays');
    if (condition === 'fog') showById('fog-overlay');
    if (condition === 'rain' || condition === 'storm') createRain();
    if (condition === 'snow') createSnow();
    if (condition === 'storm') scheduleLightning();
}

export function clearWeatherEffects() {
    if (!canUseWeatherDom()) return;
    const overlay = document.getElementById('weather-overlay');
    if (overlay?.classList?.remove) overlay.classList.remove('active');
    clearWeatherEffectNodes();
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

function showById(id) {
    const el = document.getElementById(id);
    if (el?.style) el.style.display = 'block';
}

function hideById(id) {
    const el = document.getElementById(id);
    if (el?.style) el.style.display = 'none';
}

function clearChildren(id) {
    const el = document.getElementById(id);
    if (el?.replaceChildren) el.replaceChildren();
}

function createRain() {
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

function createSnow() {
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

function scheduleLightning() {
    if (typeof window === 'undefined') return;
    const generation = lightningGeneration + 1;
    lightningGeneration = generation;
    const flash = () => {
        if (generation !== lightningGeneration) return;
        const comp = getStoreValue(compositionStore);
        if (comp.activeView !== 'map') return;
        const lightning = document.getElementById('lightning-flash');
        if (lightning) {
            lightning.classList.add('flash');
            window.setTimeout(() => lightning.classList.remove('flash'), 200);
        }
        if (generation === lightningGeneration) lightningTimer = window.setTimeout(flash, 5000 + Math.random() * 15000); // intentionally non-deterministic — lightning should feel organic
    };
    lightningTimer = window.setTimeout(flash, 3000);
}
