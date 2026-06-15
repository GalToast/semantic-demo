/**
 * @lib/stores/weather.svelte.ts — Weather data store (Svelte 5 runes)
 *
 * Provides weather conditions for the Montgomery County TX area.
 * In production this would fetch from a weather API; currently provides
 * realistic mock data for UI rendering.
 */
import { appState } from '@lib/state/app.svelte.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'storm' | 'fog' | 'wind';

export interface WeatherData {
  /** Current temperature in Fahrenheit */
  temperature: number;
  /** Feels-like temperature in Fahrenheit */
  feelsLike: number;
  /** Weather condition keyword */
  condition: WeatherCondition;
  /** Human-readable condition label */
  label: string;
  /** Humidity percentage */
  humidity: number;
  /** Wind speed in mph */
  windSpeed: number;
  /** Wind direction */
  windDirection: string;
  /** Short forecast text */
  forecast: string;
  /** Location name */
  location: string;
  /** Last updated timestamp */
  updatedAt: number;
}

// ── Default (idle) state ──────────────────────────────────────────────────────

const INITIAL_WEATHER: WeatherData = {
  temperature: 0,
  feelsLike: 0,
  condition: 'clear',
  label: '--',
  humidity: 0,
  windSpeed: 0,
  windDirection: '--',
  forecast: 'Loading weather...',
  location: 'Montgomery County, TX',
  updatedAt: 0
};

// ── Store (reactive binding) ──────────────────────────────────────────────────

/** 
 * Weather data proxy. In Svelte 5, components can read properties directly.
 * We cast appState.weather (which is unknown in the kernel) to WeatherData.
 */
export const weatherData = {
  get temperature() { return (appState.weather as WeatherData)?.temperature ?? 0; },
  get condition() { return (appState.weather as WeatherData)?.condition ?? 'clear'; },
  get label() { return (appState.weather as WeatherData)?.label ?? '--'; },
  get forecast() { return (appState.weather as WeatherData)?.forecast ?? ''; },
  get updatedAt() { return (appState.weather as WeatherData)?.updatedAt ?? 0; }
};

// ── Initialization guard ──────────────────────────────────────────────────────

/** Whether weather has been initialized (prevents double-init). */
export function isWeatherInitialized(): boolean { return appState.weatherInitialized; }

/** Backward-compatible derived getter exported by the store barrel. */
export const weatherInitialized = isWeatherInitialized;

/** Mark weather as initialized. Called after first successful initWeather(). */
export function setWeatherInitialized(value: boolean): void { 
  appState.withMutation(() => {
    appState.weatherInitialized = value;
  });
}

// ── Derived ───────────────────────────────────────────────────────────────────

export function weatherTemperature(): number { return weatherData.temperature; }
export function weatherCondition(): WeatherCondition { return weatherData.condition; }
export function weatherLabel(): string { return weatherData.label; }
export function weatherForecast(): string { return weatherData.forecast; }
export function hasWeather(): boolean { return weatherData.updatedAt > 0; }

// ── Condition icon mapping ────────────────────────────────────────────────────

export const CONDITION_ICONS: Record<WeatherCondition, string> = {
  clear: '\u2600',
  clouds: '\u2601',
  rain: '\u{1F327}',
  storm: '\u2608',
  fog: '\u{1F32B}',
  wind: '\u{1F32C}'
};

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Update weather data. In production this would be called from a weather API
 * poller. For development, simulates realistic Montgomery County weather.
 */
export function updateWeather(data: Partial<WeatherData>): void {
  appState.withMutation(() => {
    const current = (appState.weather as WeatherData) || { ...INITIAL_WEATHER };
    appState.weather = { ...current, ...data, updatedAt: performance.now() };
    appState.weatherInitialized = true;
  });
}

/**
 * Fetch weather (simulated). Returns mock data for Montgomery County TX.
 */
export async function fetchWeather(): Promise<void> {
  // Simulate a brief network delay
  await new Promise((resolve) => setTimeout(resolve, 120));

  const conditions: WeatherCondition[] = ['clear', 'clouds', 'rain', 'wind'];
  const condition = conditions[Math.floor(Math.random() * conditions.length)] ?? 'clear';
  const baseTemp = 72 + Math.floor(Math.random() * 20) - 5;

  const LABELS: Record<WeatherCondition, string> = {
    clear: 'Clear Sky',
    clouds: 'Partly Cloudy',
    rain: 'Light Rain',
    storm: 'Thunderstorm',
    fog: 'Morning Fog',
    wind: 'Breezy'
  };

  updateWeather({
    temperature: baseTemp,
    feelsLike: baseTemp + Math.floor(Math.random() * 6) - 3,
    condition,
    label: LABELS[condition],
    humidity: 55 + Math.floor(Math.random() * 30),
    windSpeed: 5 + Math.floor(Math.random() * 15),
    windDirection: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)] ?? 'N',
    forecast: `Montgomery County: ${LABELS[condition]}, ${baseTemp}\u00B0F`
  });
}
