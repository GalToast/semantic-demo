/**
 * @lib/stores/weather.svelte.ts — Weather data store (Svelte 5 runes)
 *
 * Provides weather conditions for the Montgomery County TX area.
 * In production this would fetch from a weather API; currently provides
 * realistic mock data for UI rendering.
 */

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

// ── Store ─────────────────────────────────────────────────────────────────────

export let weatherData = $state<WeatherData>({ ...INITIAL_WEATHER });

// ── Derived ───────────────────────────────────────────────────────────────────

export function weatherTemperature(): number { return (weatherData as any).temperature; }
export function weatherCondition(): WeatherCondition { return (weatherData as any).condition; }
export function weatherLabel(): string { return (weatherData as any).label; }
export function weatherForecast(): string { return (weatherData as any).forecast; }
export function hasWeather(): boolean { return (weatherData as any).updatedAt > 0; }

// ── Condition icon mapping ────────────────────────────────────────────────────

export const CONDITION_ICONS: Record<WeatherCondition, string> = {
  clear: '\u2600',
  clouds: '\u2601',
  rain: '\u{1F327}',
  storm: '\u26C8',
  fog: '\u{1F32B}',
  wind: '\u{1F32C}'
};

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Update weather data. In production this would be called from a weather API
 * poller. For development, simulates realistic Montgomery County weather.
 */
export function updateWeather(data: Partial<WeatherData>): void {
  Object.assign(weatherData, data, { updatedAt: performance.now() });
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
