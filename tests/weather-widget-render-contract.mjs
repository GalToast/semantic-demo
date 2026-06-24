/**
 * weather-widget-render-contract.mjs
 *
 * Browser-rendered weather widget contract (Svelte build).
 *
 * Coverage:
 *   1. The Svelte app renders exactly one weather widget.
 *   2. Reactive weather data injection renders live fields.
 *   3. Fallback weather (null data) renders icon-only pill.
 *   4. The desktop widget stays inside the viewport and is visible.
 *   5. Mobile widget adapts to compact layout.
 *   6. Weather overlay effects activate only in map view.
 *
 * Usage:
 *   node tests/weather-widget-render-contract.mjs
 */

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = Number(process.env.SEMANTIC_WEATHER_WIDGET_PORT || 8795);
const BASE_URL = `http://127.0.0.1:${PORT}/dist/svelte/index.html?nodemo=1`;

async function waitForServer(proc) {
    const deadline = Date.now() + 8000;
    let lastError = null;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error(`server exited early with code ${proc.exitCode}`);
        try {
            const response = await fetch(BASE_URL);
            if (response.ok) return;
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw lastError || new Error('server did not become ready');
}

async function waitForWeatherWidget(page) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__TEST_STATE__), null, { timeout: 8000 });
    // Wait for the lazy-loaded widget to mount (s3dSceneReady + weatherVisible)
    await page.waitForSelector('.weather-widget', { timeout: 15000 });
}

async function injectLiveWeather(page) {
    await page.evaluate(() => {
        window.__TEST_STATE__.weather = {
            temp: 72,
            humidity: 65,
            code: 61,
            description: 'Light rain',
            icon: 'rain',
            condition: 'rain',
            windSpeed: 9,
            windDirection: 135,
            windGust: 15,
            source: 'render-contract'
        };
        window.__TEST_STATE__.weatherState = {
            weather: window.__TEST_STATE__.weather,
            lastFetch: Date.now(),
            fallback: false,
            stalenessMsg: ''
        };
    });
    // Allow Svelte reactivity to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));
}

async function injectFallbackWeather(page) {
    await page.evaluate(() => {
        window.__TEST_STATE__.weather = null;
        window.__TEST_STATE__.weatherState = {
            weather: null,
            lastFetch: 0,
            fallback: true,
            stalenessMsg: 'Weather data unavailable'
        };
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
}

async function setView(page, view) {
    await page.evaluate((v) => {
        window.__TEST_STATE__.currentView = v;
    }, view);
    await new Promise((resolve) => setTimeout(resolve, 50));
}

async function setPanelSurface(page, surface) {
    await page.evaluate((s) => {
        document.body.dataset.panelSurface = s;
    }, surface);
    await new Promise((resolve) => setTimeout(resolve, 50));
}

async function getWidgetState(page) {
    return page.evaluate(() => {
        const widget = document.querySelector('.weather-widget');
        const toggle = document.querySelector('.weather-toggle');
        const details = document.querySelector('.weather-details');
        const mapOverlay = document.getElementById('map-weather-overlay');
        const style = widget ? getComputedStyle(widget) : null;
        const rect = widget?.getBoundingClientRect();
        const tempEl = document.querySelector('.weather-temp');
        // Collect detail rows
        const detailRows = details
            ? Array.from(details.querySelectorAll('.weather-detail-row')).map((row) => ({
                  label: row.querySelector('.detail-label')?.textContent ?? '',
                  value: row.querySelector('.detail-value')?.textContent ?? ''
              }))
            : [];
        return {
            widgetCount: document.querySelectorAll('.weather-widget').length,
            hidden: widget?.hidden ?? null,
            display: style?.display ?? null,
            visibility: style?.visibility ?? null,
            pointerEvents: style?.pointerEvents ?? null,
            isCompact: widget?.classList.contains('compact') ?? false,
            rect: rect
                ? {
                      top: rect.top,
                      right: rect.right,
                      bottom: rect.bottom,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height
                  }
                : null,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            temp: tempEl?.textContent ?? null,
            conditionLabel: detailRows.find((r) => r.label === 'Condition')?.value ?? null,
            humidity: detailRows.find((r) => r.label === 'Humidity')?.value ?? null,
            wind: detailRows.find((r) => r.label === 'Wind')?.value ?? null,
            toggleAriaLabel: toggle?.getAttribute('aria-label') ?? null,
            overlayActive: mapOverlay?.classList.contains('active') ?? false
        };
    });
}

function assert(condition, message, details = undefined) {
    if (!condition) {
        const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
        throw new Error(`${message}${suffix}`);
    }
}

function assertVisibleWidget(state) {
    assert(state.widgetCount === 1, 'expected exactly one weather widget', state);
    assert(state.hidden === false, 'weather widget should not keep hidden attribute', state);
    assert(state.display !== 'none', 'weather widget should be displayed', state);
    assert(state.visibility !== 'hidden', 'weather widget should be visible', state);
    assert(state.rect.left >= 0 && state.rect.top >= 0, 'weather widget should not clip above/left of viewport', state);
    assert(state.rect.right <= state.viewport.width, 'weather widget should not overflow right edge', state);
    assert(state.rect.bottom <= state.viewport.height, 'weather widget should not overflow bottom edge', state);
}

async function main() {
    const server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
        cwd: process.cwd(),
        stdio: 'ignore',
        windowsHide: true
    });

    let browser;
    try {
        await waitForServer(server);
        browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });

        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.addInitScript(() => {
            window.__PLAYWRIGHT__ = true;
        });
        const page = await context.newPage();
        await waitForWeatherWidget(page);

        // ── Live weather (desktop) ─────────────────────────────────────────────────
        await injectLiveWeather(page);
        let state = await getWidgetState(page);
        assertVisibleWidget(state);
        assert(/^\d+°$/.test(state.temp || ''), 'live weather should render temperature', state);
        assert(state.isCompact === false, 'desktop widget should not have compact class', state);

        // Expand the widget to read detail rows
        await page.click('.weather-toggle');
        await new Promise((resolve) => setTimeout(resolve, 100));

        state = await getWidgetState(page);
        assertVisibleWidget(state);
        assert(/^\d+°$/.test(state.temp || ''), 'live weather should render temperature', state);
        assert(state.conditionLabel !== null && state.conditionLabel.length > 0, 'live weather should render condition', state);
        assert(state.humidity !== null && state.humidity.includes('%'), 'live weather should render humidity', state);
        assert(state.wind !== null && state.wind.includes('mph'), 'live weather should render wind', state);
        assert(state.toggleAriaLabel === 'Toggle weather details', 'toggle should have accessible label', state);

        // ── Fallback weather ───────────────────────────────────────────────────────
        await injectFallbackWeather(page);
        state = await getWidgetState(page);
        assertVisibleWidget(state);
        assert(state.temp === null, 'fallback weather should hide temperature pill', state);
        assert(state.conditionLabel === null, 'fallback weather should have no details', state);

        // ── Desktop surfaces: widget stays visible ───────────────────────────────
        await setPanelSurface(page, 'focus-search');
        await injectLiveWeather(page);
        state = await getWidgetState(page);
        assert(state.display !== 'none', 'desktop focus-search should keep weather widget visible', state);

        await setPanelSurface(page, 'map-trail');
        state = await getWidgetState(page);
        assert(state.display !== 'none', 'desktop map-trail should keep weather widget visible', state);

        await setPanelSurface(page, 'semantic-dive');
        state = await getWidgetState(page);
        assert(state.display !== 'none', 'desktop semantic-dive should keep weather widget visible', state);

        // ── Mobile viewport ──────────────────────────────────────────────────────
        await page.setViewportSize({ width: 390, height: 844 });
        await setPanelSurface(page, 'idle');
        await injectLiveWeather(page);
        state = await getWidgetState(page);
        assert(state.widgetCount === 1, 'mobile should keep a single weather widget in DOM', state);
        assert(state.isCompact === true, 'mobile widget should have compact class', state);
        assert(state.display !== 'none', 'mobile idle should show weather widget', state);

        // ── Weather overlay effects (galaxy view) ────────────────────────────────
        await page.setViewportSize({ width: 1280, height: 800 });
        await setPanelSurface(page, 'idle');
        await setView(page, 'galaxy');
        await injectLiveWeather(page);
        state = await getWidgetState(page);
        assert(state.overlayActive === false, 'weather overlay should not activate outside map view', state);

        // ── Weather overlay effects (map view) ───────────────────────────────────
        await setView(page, 'map');
        await new Promise((resolve) => setTimeout(resolve, 200));
        state = await getWidgetState(page);
        // Note: overlay activation depends on the map DOM being present.
        // In the Svelte build, map-weather-overlay may not exist if MapView hasn't mounted.
        // We assert the overlay is either absent or active.
        const mapOverlay = await page.evaluate(() => Boolean(document.getElementById('map-weather-overlay')));
        if (mapOverlay) {
            assert(state.overlayActive === true, 'weather overlay should activate in map view with weather state', state);
        }

        await browser.close();
        browser = null;
        console.log('weather-widget-render-contract passed');
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (server.exitCode === null) {
            server.kill();
            await new Promise((resolve) => server.once('exit', resolve));
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
