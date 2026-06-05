// Svelte migration visual verification
// Loads the app and confirms all 4 Svelte islands mount their components.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'reports', 'screenshots', 'playwright');

const URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
const TIMEOUT = 15000;

const ISLAND_SLOTS = [
    { name: 'SearchChrome', slotId: 'search-chrome-slot', expectedChild: '#search-input', alwaysRendered: false },
    { name: 'SearchResultsList', slotId: 'search-results', expectedChild: '#search-results-count', alwaysRendered: false },
    { name: 'FilterChrome', slotId: 'filter-chrome-slot', expectedChild: '#filter-clear-btn', alwaysRendered: true },
    { name: 'SelectedBusinessDetails', slotId: 'selected-details', expectedChild: '#selected-name, #selected-empty', alwaysRendered: false },
];

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const consoleLogs = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
        if (msg.text().includes('[island-mount-helper]') || msg.text().includes('[search-results-island]')) {
            consoleLogs.push(msg.text());
        }
    });

    console.log(`[verify-svelte] navigating to ${URL}`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    console.log('[verify-svelte] waiting for app-root to populate...');
    await page.waitForSelector('#app-root *', { timeout: TIMEOUT });

    const results = [];
    for (const island of ISLAND_SLOTS) {
        let slotExists = (await page.locator(`#${island.slotId}`).count()) > 0;
        let mounted = false;
        let childSelectorHit = false;
        let childInfo = '';
        let lateMounted = false;

        if (slotExists) {
            const childCount = await page.locator(`#${island.slotId} *`).count();
            mounted = childCount > 0;
            const expected = page.locator(`#${island.slotId} ${island.expectedChild}`).first();
            childSelectorHit = (await expected.count()) > 0;
            childInfo = `slotChildren=${childCount} expectedChildHit=${childSelectorHit}`;
        }

        if (!island.alwaysRendered && !slotExists) {
            const mountResult = await page.evaluate(async (slotId) => {
                const div = document.createElement('div');
                div.id = slotId;
                document.body.appendChild(div);
                await new Promise((r) => setTimeout(r, 800));
                const slot = document.getElementById(slotId);
                const flag = slot ? slot.dataset.svelteMounted : null;
                return { hasChildren: slot ? slot.children.length : -1, flag };
            }, island.slotId);
            lateMounted = Boolean(mountResult.flag);
            childInfo = `flag=${mountResult.flag} children=${mountResult.hasChildren}`;
            childSelectorHit = lateMounted;
            mounted = lateMounted;
            await page.evaluate((slotId) => {
                const div = document.getElementById(slotId);
                if (div) div.remove();
            }, island.slotId);
        }

        results.push({
            island: island.name,
            slotId: island.slotId,
            slotFound: slotExists,
            alwaysRendered: island.alwaysRendered,
            mounted,
            lateMounted,
            childSelectorHit,
            childInfo,
        });
    }

    await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'svelte-migration-verify.png'),
        fullPage: false,
    });

    console.log('\n[verify-svelte] === RESULTS ===');
    let allPass = true;
    for (const r of results) {
        const ok = r.alwaysRendered
            ? (r.slotFound && r.mounted && r.childSelectorHit)
            : r.lateMounted;
        const status = ok ? 'PASS' : 'FAIL';
        if (status === 'FAIL') allPass = false;
        const note = r.alwaysRendered ? '(always-rendered surface)' : '(late-mounted via MutationObserver)';
        console.log(`  [${status}] ${r.island} (#${r.slotId}) ${r.childInfo} ${note}`);
    }

    if (consoleErrors.length > 0) {
        console.log('\n[verify-svelte] console errors:');
        for (const err of consoleErrors) console.log(`  - ${err}`);
    } else {
        console.log('\n[verify-svelte] no console errors');
    }

    if (consoleLogs.length > 0) {
        console.log('\n[verify-svelte] relevant console logs:');
        for (const log of consoleLogs) console.log(`  - ${log}`);
    }

    await browser.close();
    process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
    console.error('[verify-svelte] fatal:', err);
    process.exit(2);
});
