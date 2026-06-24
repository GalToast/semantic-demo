/**
 * component-WeatherWidget.test.ts — Component test for WeatherWidget.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports stores from
 * @lib/stores/weather.svelte and @lib/stores/viewport.svelte which hit
 * circular dependency chains in the vitest environment.
 *
 * Verifies:
 *  1. Root #weather-widget has aria-label="Weather conditions"
 *  2. Root has .weather-widget class
 *  3. Toggle button has class="weather-toggle" with aria-label="Toggle weather details"
 *  4. Toggle button has type="button" to prevent form submission
 *  5. Toggle contains .weather-icon span
 *  6. Expanded panel .weather-details has 4 detail rows (Condition, Feels like, Humidity, Wind)
 *  7. Each detail row has .detail-label and .detail-value spans
 *  8. Widget supports .compact class for viewport state
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const WEATHER_WIDGET_PATH = resolve(__dirname, '../../src/components/WeatherWidget.svelte');

function readSource(): string {
    return readFileSync(WEATHER_WIDGET_PATH, 'utf-8');
}

describe('WeatherWidget component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root #weather-widget has aria-label="Weather conditions"', () => {
        expect(source).toContain('id="weather-widget"');
        expect(source).toContain('aria-label="Weather conditions"');
    });

    it('root element has .weather-widget class', () => {
        expect(source).toContain('class="weather-widget"');
    });

    it('toggle button has aria-label="Toggle weather details"', () => {
        expect(source).toContain('class="weather-toggle"');
        expect(source).toContain('aria-label="Toggle weather details"');
    });

    it('toggle button has type="button" to prevent form submission', () => {
        expect(source).toContain('type="button"');
    });

    it('toggle contains .weather-icon span and .weather-temp span', () => {
        expect(source).toContain('class="weather-icon"');
        expect(source).toContain('class="weather-temp"');
    });

    it('expanded panel .weather-details has 4 detail rows', () => {
        expect(source).toContain('class="weather-details"');
        const detailRows = source.match(/class="weather-detail-row"/g);
        expect(detailRows).toBeTruthy();
        expect(detailRows!.length).toBe(4);
    });

    it('each detail row has .detail-label and .detail-value spans', () => {
        expect(source).toContain('class="detail-label"');
        expect(source).toContain('class="detail-value"');
        // Check specific labels — W46-D4 widget design: Condition, Feels like,
        // Humidity, Wind (FORECAST row intentionally removed; temperature is
        // always visible in the pill, so a Feels like row covers delta only).
        expect(source).toContain('>Condition<');
        expect(source).toContain('>Feels like<');
        expect(source).toContain('>Humidity<');
        expect(source).toContain('>Wind<');
    });

    it('widget supports .compact class for viewport state', () => {
        expect(source).toContain('class:compact');
        expect(source).toContain('.weather-widget.compact');
    });
});
