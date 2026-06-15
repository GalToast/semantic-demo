import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * @vitest-environment jsdom
 */

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

const mockState = vi.hoisted(() => ({
  weather: null as any,
  weatherInitialized: false,
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get weather() { return mockState.weather; },
    set weather(v: any) { mockState.weather = v; },
    get weatherInitialized() { return mockState.weatherInitialized; },
    set weatherInitialized(v: boolean) { mockState.weatherInitialized = v; },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  weatherData,
  weatherCondition,
  weatherLabel,
  weatherForecast,
  weatherTemperature,
  hasWeather,
  isWeatherInitialized,
  setWeatherInitialized,
  updateWeather,
  CONDITION_ICONS,
  type WeatherData,
  type WeatherCondition,
} from '@lib/stores/weather.svelte.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_WEATHER: WeatherData = {
  temperature: 72,
  feelsLike: 74,
  condition: 'clear' as WeatherCondition,
  label: 'Clear Sky',
  humidity: 55,
  windSpeed: 5,
  windDirection: 'N',
  forecast: 'Clear skies today',
  location: 'Montgomery County, TX',
  updatedAt: 1,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('weather store — state-class appState regression', () => {
  beforeEach(() => {
    mockState.weather = null;
    mockState.weatherInitialized = false;
  });

  it('weatherData getters return defaults when appState.weather is null', () => {
    expect(weatherData.temperature).toBe(0);
    expect(weatherData.condition).toBe('clear');
    expect(weatherData.label).toBe('--');
    expect(weatherData.forecast).toBe('');
    expect(weatherData.updatedAt).toBe(0);
  });

  it('weatherData getters read from appState when set', () => {
    mockState.weather = FAKE_WEATHER;
    expect(weatherData.temperature).toBe(72);
    expect(weatherData.condition).toBe('clear');
    expect(weatherData.label).toBe('Clear Sky');
    expect(weatherData.forecast).toBe('Clear skies today');
    expect(weatherData.updatedAt).toBe(1);
  });

  it('derived getters read from appState', () => {
    mockState.weather = FAKE_WEATHER;
    expect(weatherTemperature()).toBe(72);
    expect(weatherCondition()).toBe('clear');
    expect(weatherLabel()).toBe('Clear Sky');
    expect(weatherForecast()).toBe('Clear skies today');
  });

  it('hasWeather returns false when weather is null', () => {
    expect(hasWeather()).toBe(false);
  });

  it('hasWeather returns true when updatedAt > 0', () => {
    mockState.weather = FAKE_WEATHER;
    expect(hasWeather()).toBe(true);
  });

  it('isWeatherInitialized reflects appState flag', () => {
    expect(isWeatherInitialized()).toBe(false);
    mockState.weatherInitialized = true;
    expect(isWeatherInitialized()).toBe(true);
  });

  it('setWeatherInitialized writes to appState', () => {
    setWeatherInitialized(true);
    expect(mockState.weatherInitialized).toBe(true);
    setWeatherInitialized(false);
    expect(mockState.weatherInitialized).toBe(false);
  });

  it('updateWeather merges into appState and sets initialized', () => {
    updateWeather({ temperature: 85, condition: 'rain', label: 'Light Rain' });
    const w = mockState.weather as WeatherData;
    expect(w.temperature).toBe(85);
    expect(w.condition).toBe('rain');
    expect(w.label).toBe('Light Rain');
    expect(mockState.weatherInitialized).toBe(true);
  });

  it('updateWeather preserves untouched fields', () => {
    mockState.weather = FAKE_WEATHER;
    updateWeather({ temperature: 90 });
    const w = mockState.weather as WeatherData;
    expect(w.temperature).toBe(90);
    expect(w.condition).toBe('clear');
    expect(w.windSpeed).toBe(5);
  });

  it('CONDITION_ICONS contains unicode icons for each condition', () => {
    expect(CONDITION_ICONS.clear).toBeTruthy();
    expect(CONDITION_ICONS.clouds).toBeTruthy();
    expect(CONDITION_ICONS.rain).toBeTruthy();
    expect(CONDITION_ICONS.storm).toBeTruthy();
    expect(CONDITION_ICONS.fog).toBeTruthy();
    expect(CONDITION_ICONS.wind).toBeTruthy();
  });
});
