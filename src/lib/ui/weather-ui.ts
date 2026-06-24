/**
 * @lib/ui/weather-ui.ts
 *
 * Ported from: js/modules/weather-ui.ts
 * Weather widget DOM rendering and effects.
 */

import { appState } from '@lib/state/app.svelte'
import type { WeatherData } from '@lib/utils/weather'
import { seededUnit } from '@lib/utils/seeded-random'

let lightningTimer: number | null = null
let lightningGeneration: number = 0
let stalenessIntervalId: number | null = null

function clearStalenessInterval(): void {
    if (stalenessIntervalId !== null) {
        window.clearInterval(stalenessIntervalId)
        stalenessIntervalId = null
    }
}

function canUseWeatherDom(): boolean {
    return (
        typeof document !== 'undefined' &&
        typeof document.getElementById === 'function' &&
        typeof document.querySelector === 'function'
    )
}

interface WeatherStateValue {
    weather: WeatherData | null
    lastFetch: number | null
    fallback: boolean
    stalenessMsg: string
}

/** Reactive handler — call whenever appState.weatherState changes. */
export function onWeatherStateChange(): void {
    if (!canUseWeatherDom()) return
    const state = appState.weatherState
    if (state.fallback) {
        renderWeatherFallback(state)
    } else if (state.weather) {
        updateWeatherUi(state)
    }
}

/** Reactive handler — call whenever appState.composition changes. */
export function onCompositionChange(): void {
    if (!canUseWeatherDom()) return
    const state = appState.weatherState
    if (appState.composition.activeView === 'map' && state.weather) {
        applyWeatherEffects(state.weather as unknown as Record<string, unknown>)
    } else {
        clearWeatherEffects()
    }
}

export function updateWeatherStaleness(lastFetch: number | null): void {
    const el = document.getElementById('weather-staleness')
    if (!el) return
    if (!lastFetch) {
        el.textContent = ''
        return
    }
    const age = Math.floor((Date.now() - lastFetch) / 60000)
    if (age < 5) {
        el.textContent = ''
    } else if (age < 30) {
        el.textContent = `Updated ${age}m ago`
    } else if (age < 120) {
        el.textContent = `Updated ${Math.floor(age / 60)}h ago`
    } else {
        el.textContent = 'Stale data — refresh for latest'
    }
}

export function updateWeatherUi(state: WeatherStateValue): void {
    if (!canUseWeatherDom()) return
    const weather = state.weather
    if (!weather) return

    const tempEl = document.getElementById('weather-temp')
    const descEl = document.getElementById('weather-desc')
    const windSpeedEl = document.getElementById('wind-speed')
    const windArrowEl = document.getElementById('wind-arrow')
    const weatherIconEl = document.getElementById('weather-icon')
    const conditionUseEl = weatherIconEl?.querySelector('.weather-condition-icon use') as SVGSVGElement | null

    const temp = Number(weather.temp)
    const condition = String(weather.condition || '')
    const icon = String(weather.icon || 'clear')
    const windSpeed = Number(weather.windSpeed)
    const windDirection = Number(weather.windDirection)

    if (tempEl) tempEl.textContent = `${temp}°F`
    if (descEl) descEl.textContent = condition
    if (windSpeedEl) windSpeedEl.textContent = `${windSpeed} mph`
    if (windArrowEl && Number.isFinite(windDirection)) {
        windArrowEl.style.transform = `rotate(${windDirection}deg)`
    }

    updateWeatherStaleness(state.lastFetch)

    if (appState.composition.activeView === 'map') {
        applyWeatherEffects(weather as unknown as Record<string, unknown>)
    }

    if (!stalenessIntervalId && typeof window !== 'undefined') {
        clearStalenessInterval()
        stalenessIntervalId = window.setInterval(() => updateWeatherStaleness(appState.weatherState?.lastFetch), 60000)
    }
}

export function renderWeatherFallback(state: WeatherStateValue): void {
    if (!canUseWeatherDom()) return
    revealWeatherWidget()
    const tempEl = document.getElementById('weather-temp')
    const descEl = document.getElementById('weather-desc')
    const windSpeedEl = document.getElementById('wind-speed')
    const weatherIconEl = document.getElementById('weather-icon')
    const conditionUseEl = weatherIconEl?.querySelector('.weather-condition-icon use') as SVGSVGElement | null

    if (tempEl) tempEl.textContent = '--°F'
    if (descEl) descEl.textContent = state.stalenessMsg || 'Weather unavailable'
    if (windSpeedEl) windSpeedEl.textContent = '-- mph'
    if (conditionUseEl) conditionUseEl.setAttribute('xlink:href', '#weather-icon-unknown')
}

export function applyWeatherEffects(weather: Record<string, unknown>): void {
    if (!canUseWeatherDom()) return
    clearWeatherEffects()

    const condition = String(weather.condition || '').toLowerCase()
    const container = document.getElementById('map-weather-overlay')
    if (!container) return

    if (condition.includes('rain') || condition.includes('storm')) {
        createRain()
        if (condition.includes('storm')) scheduleLightning()
    } else if (condition.includes('snow')) {
        createSnow()
    } else if (condition.includes('fog') || condition.includes('mist')) {
        container.classList.add('fog-active')
    }

    const brightness = Number(weather.brightness) || 1
    container.style.filter = `brightness(${brightness})`
}

export function clearWeatherEffects(): void {
    if (!canUseWeatherDom()) return
    const rainContainer = document.getElementById('rain-container')
    const snowContainer = document.getElementById('snow-container')
    const mapOverlay = document.getElementById('map-weather-overlay')
    if (rainContainer) rainContainer.replaceChildren()
    if (snowContainer) snowContainer.replaceChildren()
    if (mapOverlay) {
        mapOverlay.classList.remove('fog-active')
        mapOverlay.style.filter = ''
    }
    if (lightningTimer !== null) {
        window.clearTimeout(lightningTimer)
        lightningTimer = null
    }
}

function revealWeatherWidget(): void {
    const el = document.getElementById('weather-widget')
    if (el?.style) el.style.display = 'block'
}

function hideById(id: string): void {
    const el = document.getElementById(id)
    if (el?.style) el.style.display = 'none'
}

function clearChildren(id: string): void {
    const el = document.getElementById(id)
    if (el?.replaceChildren) el.replaceChildren()
}

function createRain(): void {
    const container = document.getElementById('rain-container')
    if (!container) return
    for (let i = 0; i < 80; i += 1) {
        const drop = document.createElement('div')
        drop.className = 'rain-drop'
        drop.style.left = `${seededUnit(i, 0xa111) * 100}%`
        drop.style.animationDuration = `${0.5 + seededUnit(i, 0xa112) * 0.5}s`
        drop.style.animationDelay = `${seededUnit(i, 0xa113) * 2}s`
        container.appendChild(drop)
    }
}

function createSnow(): void {
    const container = document.getElementById('snow-container')
    if (!container) return
    for (let i = 0; i < 42; i += 1) {
        const flake = document.createElement('div')
        flake.className = 'snow-flake'
        flake.style.left = `${seededUnit(i, 0xbeef) * 100}%`
        flake.style.animationDuration = `${3 + seededUnit(i, 0xcafe) * 4}s`
        flake.style.animationDelay = `${seededUnit(i, 0xdead) * 5}s`
        flake.style.width = `${4 + seededUnit(i, 0xf00d) * 6}px`
        flake.style.height = flake.style.width
        container.appendChild(flake)
    }
}

function scheduleLightning(): void {
    if (typeof window === 'undefined') return
    const generation = lightningGeneration + 1
    lightningGeneration = generation
    let flashCount = 0
    const flash = (): void => {
        if (generation !== lightningGeneration) return
        if (appState.composition.activeView !== 'map') return
        const lightning = document.getElementById('lightning-flash')
        if (lightning) {
            lightning.classList.add('flash')
            window.setTimeout(() => lightning.classList.remove('flash'), 200)
        }
        if (generation === lightningGeneration) {
            flashCount += 1
            lightningTimer = window.setTimeout(flash, 5000 + seededUnit(flashCount, 0x71cd) * 15000)
        }
    }
    lightningTimer = window.setTimeout(flash, 3000)
}

export function disposeWeatherUi(): void {
    clearStalenessInterval()
    if (lightningTimer !== null) {
        window.clearTimeout(lightningTimer)
        lightningTimer = null
    }
}
