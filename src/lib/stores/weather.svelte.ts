/**
 * @lib/stores/weather.svelte.ts — Weather data store (Svelte 5 runes)
 *
 * W46-D4: thin adapter over the canonical Open-Meteo client at
 * `@lib/utils/weather`. The canonical owns the network call, backend
 * fallback, and writes its normalized shape to `appState.weather`. This
 * store exposes a stable getter API the widget already consumes.
 *
 * Canonical `appState.weather` shape → store getters:
 *   temp          → weatherTemperature()
 *   description   → weatherLabel()
 *   condition     → weatherCondition() (mapped through ICON_TO_CONDITION)
 *   icon          → weatherIconKey()    ('sun' | 'cloud' | 'rain')
 *   humidity      → weatherHumidity()
 *   windSpeed     → weatherWindSpeed()
 *   windDirection → weatherWindDirection() (deg → compass)
 */
import { appState } from '@lib/state/app.svelte.ts'
import { fetchWeather as fetchWeatherCanonical } from '@lib/utils/weather'

// ── Types ─────────────────────────────────────────────────────────────────────

/** UI-facing condition enum (stable API for the widget). */
export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'storm' | 'fog' | 'wind'

/** Canonical icon key, used by the widget to pick the inline SVG. */
export type WeatherIconKey = 'sun' | 'cloud' | 'rain'

/** Canonical (open-meteo) condition slug, used for the condition→icon map. */
export type CanonicalCondition = 'sun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm'

// ── Canonical shape (internal) ────────────────────────────────────────────────

interface CanonicalWeather {
    temp: number
    feelsLike: number
    humidity: number | null
    code: number
    description: string
    icon: WeatherIconKey
    condition: CanonicalCondition
    windSpeed: number
    windDirection: number
    windGust: number | null
    source: string
}

function readCanonical(): CanonicalWeather | null {
    const w = appState.weather
    if (!w) return null
    // Canonical Open-Meteo client writes this shape.
    if (typeof w.temp === 'number') {
        return w as CanonicalWeather
    }
    return null
}

function readLastFetch(): number {
    const ws = (appState as { weatherState?: { lastFetch?: number } }).weatherState
    return ws?.lastFetch ?? 0
}

// ── Maps ──────────────────────────────────────────────────────────────────────

/** Canonical condition slug → UI enum. */
const ICON_TO_CONDITION: Record<CanonicalCondition, WeatherCondition> = {
    sun: 'clear',
    cloud: 'clouds',
    fog: 'fog',
    rain: 'rain',
    snow: 'clouds',
    storm: 'storm'
}

/** Wind direction in degrees → compass string. */
function degToCompass(deg: number): string {
    if (!Number.isFinite(deg)) return '--'
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    return dirs[Math.round(deg / 22.5) % 16] ?? '--'
}

// ── Store proxy ──────────────────────────────────────────────────────────────

/**
 * Weather data proxy. Components read properties directly in Svelte 5.
 * Adapts the canonical `appState.weather` shape to the legacy field names
 * the widget already uses.
 */
export const weatherData = {
    get temperature(): number {
        return readCanonical()?.temp ?? 0
    },
    get feelsLike(): number {
        return readCanonical()?.feelsLike ?? readCanonical()?.temp ?? 0
    },
    get condition(): WeatherCondition {
        const c = readCanonical()?.condition
        return c ? ICON_TO_CONDITION[c] : 'clear'
    },
    get label(): string {
        return readCanonical()?.description ?? '--'
    },
    get forecast(): string {
        return ''
    },
    get updatedAt(): number {
        return readLastFetch() || (readCanonical() ? Date.now() : 0)
    }
}

// ── Initialization guard ──────────────────────────────────────────────────────

/** Whether weather has been initialized (prevents double-init). */
export function isWeatherInitialized(): boolean {
    return appState.weatherInitialized
}

/** Backward-compatible derived getter exported by the store barrel. */
export const weatherInitialized = isWeatherInitialized

/** Mark weather as initialized. */
export function setWeatherInitialized(value: boolean): void {
    appState.weatherInitialized = value
}

// ── Derived (UI-facing) ───────────────────────────────────────────────────────

export function weatherTemperature(): number {
    return weatherData.temperature
}
export function weatherFeelsLike(): number {
    return weatherData.feelsLike
}
export function weatherCondition(): WeatherCondition {
    return weatherData.condition
}
export function weatherLabel(): string {
    return weatherData.label
}
export function weatherForecast(): string {
    return weatherData.forecast
}
export function hasWeather(): boolean {
    return readCanonical() !== null
}
export function weatherHumidity(): number {
    return readCanonical()?.humidity ?? 0
}
export function weatherWindSpeed(): number {
    return readCanonical()?.windSpeed ?? 0
}
export function weatherWindDirection(): string {
    const deg = readCanonical()?.windDirection
    return typeof deg === 'number' ? degToCompass(deg) : '--'
}
export function weatherWindGust(): number {
    return readCanonical()?.windGust ?? 0
}
export function weatherIconKey(): WeatherIconKey {
    return readCanonical()?.icon ?? 'cloud'
}
export function weatherLocation(): string {
    return 'Montgomery County, TX'
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Fetch weather from the canonical Open-Meteo client.
 * The canonical handles the network call, error fallback, and writes its
 * normalized shape to `appState.weather` directly. We expose this as the
 * store's `fetchWeather` so the widget's `onMount` → `fetchWeather()` call
 * path keeps working.
 */
export async function fetchWeather(): Promise<void> {
    try {
        await fetchWeatherCanonical()
    } catch {
        // Canonical already catches its own errors and sets appState.weatherState.fallback.
        // Swallow here so the widget's onMount promise doesn't reject.
    }
}
