/**
 * @lib/ui/weather-ui.ts
 *
 * Weather widget DOM rendering and effects.
 *
 * W49c: replaced module-level `let stalenessIntervalId` / `lightningTimer`
 * with a module-owned DisposableRegistry. The previous design was
 * singleton-soup: timers tracked with module-level `let` variables,
 * never registered with DisposableRegistry, with a dynamic-import
 * teardown path that swallowed errors. If the dynamic import failed
 * (network blip, bundling issue), the 60-second staleness interval
 * would leak forever.
 *
 * Now: all timers go through `_registry.timer()` / `_registry.schedule()`,
 * and `disposeWeatherUi()` is a synchronous `_registry.disposeAll()`
 * call. AppBoot.svelte can import it directly (no dynamic import).
 *
 * `lightningGeneration` stays as a module-level `let` because it's a
 * generation counter for cancellation, not a disposable resource.
 * `_stalenessActive` is a dedupe flag for the 60-second polling timer;
 * reset to false in `disposeWeatherUi()` so re-mount restarts the timer.
 */

import { appState } from '@lib/state/app.svelte'
import type { WeatherData } from '@lib/utils/weather'
import { seededUnit } from '@lib/utils/seeded-random'
import { createDisposableRegistry, type DisposableRegistry } from '@lib/utils/disposable-registry'

/** Generation counter for the lightning loop — bumped on each scheduleLightning()
 *  call so a stale flash chain self-aborts. Module-level because it's a
 *  counter, not a disposable resource. */
let lightningGeneration: number = 0

/** Dedupe flag for the 60-second staleness polling timer. Reset to false
 *  in `disposeWeatherUi()` so re-mount restarts the timer. */
let _stalenessActive: boolean = false

/** Module-owned disposable registry. Owns the staleness interval and the
 *  lightning flash timers. Created at module load, cleared by
 *  `disposeWeatherUi()`. Replaces the previous module-level `let`s. */
const _registry: DisposableRegistry = createDisposableRegistry({ label: 'weather-ui' })

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

/** Reactive handler — call whenever the active view changes. */
export function onCompositionChange(): void {
    if (!canUseWeatherDom()) return
    const state = appState.weatherState
    if (appState.currentView === 'map' && state.weather) {
        applyWeatherEffects(state.weather)
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

/** Start the 60-second staleness polling timer. Idempotent — if already
 *  running, this is a no-op. Caller doesn't need to track; the registry
 *  owns the interval. */
function startStalenessPolling(): void {
    if (_stalenessActive || _registry.isDisposed || typeof window === 'undefined') return
    _stalenessActive = true
    _registry.timer(
        window.setInterval(
            () => updateWeatherStaleness(appState.weatherState?.lastFetch),
            60000
        ) as unknown as ReturnType<typeof setTimeout>
    )
}

export function updateWeatherUi(state: WeatherStateValue): void {
    if (!canUseWeatherDom()) return
    const weather = state.weather
    if (!weather) return

    const tempEl = document.getElementById('weather-temp')
    const descEl = document.getElementById('weather-desc')
    const windSpeedEl = document.getElementById('wind-speed')
    const windArrowEl = document.getElementById('wind-arrow')

    const temp = Number(weather.temp)
    const condition = String(weather.condition || '')
    const windSpeed = Number(weather.windSpeed)
    const windDirection = Number(weather.windDirection)

    if (tempEl) tempEl.textContent = `${temp}°F`
    if (descEl) descEl.textContent = condition
    if (windSpeedEl) windSpeedEl.textContent = `${windSpeed} mph`
    if (windArrowEl && Number.isFinite(windDirection)) {
        windArrowEl.style.transform = `rotate(${windDirection}deg)`
    }

    updateWeatherStaleness(state.lastFetch)

    if (appState.currentView === 'map') {
        applyWeatherEffects(weather)
    }

    startStalenessPolling()
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

export function applyWeatherEffects(weather: WeatherData): void {
    if (!canUseWeatherDom()) return
    clearWeatherEffects()

    const condition = (weather.condition || '').toLowerCase()
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
}

function revealWeatherWidget(): void {
    const el = document.getElementById('weather-widget')
    if (el?.style) el.style.display = 'block'
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
        if (appState.currentView !== 'map') return
        const lightning = document.getElementById('lightning-flash')
        if (lightning) {
            lightning.classList.add('flash')
            // 200ms flash removal — track with registry so disposal cancels it.
            _registry.timer(
                window.setTimeout(() => lightning.classList.remove('flash'), 200) as unknown as ReturnType<
                    typeof setTimeout
                >
            )
        }
        if (generation === lightningGeneration) {
            flashCount += 1
            _registry.timer(
                window.setTimeout(flash, 5000 + seededUnit(flashCount, 0x71cd) * 15000) as unknown as ReturnType<
                    typeof setTimeout
                >
            )
        }
    }
    _registry.timer(window.setTimeout(flash, 3000) as unknown as ReturnType<typeof setTimeout>)
}

/**
 * Synchronously tear down all weather-ui timers and DOM state.
 *
 * W49c: replaces the previous implementation that manually tracked
 * `stalenessIntervalId` / `lightningTimer` and the dynamic-import teardown
 * path in AppBoot.svelte that swallowed errors. Now we delegate to the
 * module-owned DisposableRegistry, which clears every registered timer
 * in reverse order.
 *
 * Safe to call multiple times (registry's disposeAll is idempotent).
 */
export function disposeWeatherUi(): void {
    _registry.disposeAll()
    _stalenessActive = false
}
