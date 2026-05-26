/**
 * weather-widget-render-contract.mjs
 *
 * Browser-rendered weather widget contract.
 *
 * Coverage:
 *   1. The app shell renders exactly one weather widget and one weather overlay.
 *   2. updateWeatherUi reveals the hidden widget and renders live weather fields.
 *   3. Fallback weather also reveals the widget and renders unavailable copy.
 *   4. The desktop widget stays inside the viewport and is visible only on owned surfaces.
 *   5. Mobile/focus/map task surfaces hide the widget through CSS, not duplicate DOM.
 *   6. Weather overlay effects activate only in map view and clear cleanly.
 *
 * Usage:
 *   node tests/weather-widget-render-contract.mjs
 */

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = Number(process.env.SEMANTIC_WEATHER_WIDGET_PORT || 8801);
const BASE_URL = `http://127.0.0.1:${PORT}/vector-explorer-polished.html?nodemo=1`;

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

async function waitForWeatherApi(page) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__TEST_STATE__ && window._weather?.updateWeatherUi), null, { timeout: 8000 });
}

async function injectLiveWeather(page) {
    await page.evaluate(() => {
        window.__TEST_STATE__.weather = {
            icon: 'rain',
            condition: 'rain',
            description: 'Light rain',
            code: 61,
            temp: 72,
            windSpeed: 9,
            windDirection: 135,
            source: 'render-contract'
        };
        window.__TEST_STATE__.lastSuccessfulFetch = Date.now();
        window._weather.updateWeatherUi();
    });
}

async function getWidgetState(page) {
    return page.evaluate(() => {
        const widget = document.querySelector('.weather-widget');
        const overlay = document.querySelector('#weather-overlay');
        const style = widget ? getComputedStyle(widget) : null;
        const rect = widget?.getBoundingClientRect();
        return {
            widgetCount: document.querySelectorAll('.weather-widget').length,
            overlayCount: document.querySelectorAll('#weather-overlay').length,
            hidden: widget?.hidden ?? null,
            display: style?.display ?? null,
            visibility: style?.visibility ?? null,
            pointerEvents: style?.pointerEvents ?? null,
            rect: rect ? {
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                height: rect.height
            } : null,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            temp: document.querySelector('#weather-temp')?.textContent ?? null,
            desc: document.querySelector('#weather-desc')?.textContent ?? null,
            wind: document.querySelector('#wind-speed')?.textContent ?? null,
            stale: document.querySelector('#weather-staleness')?.textContent ?? null,
            iconLabel: document.querySelector('#weather-icon')?.getAttribute('aria-label') ?? null,
            iconCondition: document.querySelector('#weather-icon')?.dataset.condition ?? null,
            overlayActive: overlay?.classList.contains('active') ?? null
        };
    });
}

function assert(condition, message, details = undefined) {
    if (!condition) {
        const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
        throw new Error(`${message}${suffix}`);
    }
}

function assertVisibleDesktopWidget(state) {
    assert(state.widgetCount === 1, 'expected exactly one weather widget', state);
    assert(state.overlayCount === 1, 'expected exactly one weather overlay', state);
    assert(state.hidden === false, 'weather widget should not keep hidden attribute after render', state);
    assert(state.display !== 'none', 'weather widget should be displayed on desktop idle/search surfaces', state);
    assert(state.visibility !== 'hidden', 'weather widget should be visible on desktop idle/search surfaces', state);
    assert(state.rect.width > 240 && state.rect.width <= 320, 'desktop weather widget should use compact app-chrome width', state);
    assert(state.rect.height >= 56 && state.rect.height <= 92, 'desktop weather widget should use compact app-chrome height', state);
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
        browser = await chromium.launch({ headless: true });

        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await waitForWeatherApi(page);

        await injectLiveWeather(page);
        let state = await getWidgetState(page);
        assertVisibleDesktopWidget(state);
        assert(state.temp === '72F', 'live weather should render temperature', state);
        assert(state.desc === 'Light rain', 'live weather should render description', state);
        assert(state.wind === '9 mph', 'live weather should render wind speed', state);
        assert(state.iconCondition === 'rain', 'live weather should set icon condition', state);
        assert(state.iconLabel === 'Light rain', 'live weather should set icon aria label', state);
        assert(/Updated just now|Updated 0 min ago/.test(state.stale || ''), 'live weather should render staleness text', state);

        await page.evaluate(() => {
            window.__TEST_STATE__.weather = null;
            window.__TEST_STATE__.lastSuccessfulFetch = 0;
            window._weather.updateWeatherUi();
        });
        state = await getWidgetState(page);
        assertVisibleDesktopWidget(state);
        assert(state.desc === 'Unavailable', 'fallback weather should render unavailable copy', state);
        assert(state.wind === '-- mph', 'fallback weather should render fallback wind copy', state);
        assert(state.iconCondition === 'cloud', 'fallback weather should use cloud condition', state);
        assert(state.iconLabel === 'Weather unavailable', 'fallback weather should set accessible fallback label', state);

        await page.evaluate(() => {
            document.body.dataset.panelSurface = 'focus-search';
            window.__TEST_STATE__.weather = {
                icon: 'cloud',
                condition: 'cloud',
                description: 'Cloudy',
                code: 3,
                temp: 66,
                windSpeed: 5,
                windDirection: 0
            };
            window._weather.updateWeatherUi();
        });
        state = await getWidgetState(page);
        assert(state.hidden === false, 'surface hiding should not re-hide the canonical widget attribute', state);
        assert(state.display === 'none', 'focus-search should hide weather widget through CSS', state);

        await page.evaluate(() => {
            document.body.dataset.panelSurface = 'map-trail';
            window._weather.updateWeatherUi();
        });
        state = await getWidgetState(page);
        assert(state.display === 'none', 'map task surfaces should hide weather widget through CSS', state);

        await page.evaluate(() => {
            document.body.dataset.panelSurface = 'semantic-dive';
            window._weather.updateWeatherUi();
        });
        state = await getWidgetState(page);
        assert(state.display === 'none', 'semantic-dive should hide weather widget through CSS', state);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
            document.body.dataset.panelSurface = 'idle';
            window._weather.updateWeatherUi();
        });
        state = await getWidgetState(page);
        assert(state.widgetCount === 1, 'mobile should keep a single weather widget in DOM', state);
        assert(state.display === 'none', 'mobile should hide desktop weather widget through CSS', state);

        await page.setViewportSize({ width: 1280, height: 800 });
        await page.evaluate(() => {
            document.body.dataset.panelSurface = 'idle';
            window.__TEST_STATE__.currentView = 'galaxy';
            window.__TEST_STATE__.weather = {
                icon: 'rain',
                condition: 'rain',
                description: 'Rain',
                code: 61,
                temp: 72,
                windSpeed: 9,
                windDirection: 135
            };
            window._weather.applyWeatherEffects();
        });
        state = await getWidgetState(page);
        assert(state.overlayActive === false, 'weather overlay should not activate outside map view', state);

        await page.evaluate(() => {
            window.__TEST_STATE__.currentView = 'map';
            window._weather.applyWeatherEffects();
        });
        state = await getWidgetState(page);
        assert(state.overlayActive === true, 'weather overlay should activate in map view with weather state', state);

        await page.evaluate(() => window._weather.clearWeatherEffects());
        state = await getWidgetState(page);
        assert(state.overlayActive === false, 'clearWeatherEffects should deactivate overlay', state);

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
