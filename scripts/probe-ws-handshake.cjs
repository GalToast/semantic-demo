// Probe: does a REAL browser WebSocket connect to the live jam?
// No mocks — exercises the true handshake incl. Sec-WebSocket-Accept.
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({
        args: ['--enable-unsafe-swiftshader', '--use-angle=d3d11'],
    });
    const page = await browser.newPage();
    const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8841';
    await page.goto(`${BASE}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(
        () =>
            new Promise((resolve) => {
                const out = { open: false, error: null, closed: false, messages: [] };
                let ws;
                try {
                    ws = new WebSocket('ws://127.0.0.1:8083/');
                } catch (e) {
                    out.error = 'ctor:' + (e && e.message);
                    resolve(out);
                    return;
                }
                const to = setTimeout(() => {
                    try {
                        ws.close();
                    } catch {}
                    out.timeout = true;
                    resolve(out);
                }, 12000);
                ws.onopen = () => {
                    out.open = true;
                    ws.send(JSON.stringify({ type: 'uiReady' }));
                };
                ws.onerror = () => {
                    out.error = 'onerror';
                };
                ws.onclose = (ev) => {
                    out.closed = true;
                    out.code = ev.code;
                    out.reason = ev.reason;
                    clearTimeout(to);
                    resolve(out);
                };
                ws.onmessage = (ev) => {
                    out.messages.push(String(ev.data).slice(0, 120));
                    if (out.messages.length >= 3) {
                        clearTimeout(to);
                        try {
                            ws.close();
                        } catch {}
                        setTimeout(() => resolve(out), 500);
                    }
                };
            })
    );
    console.log(JSON.stringify(result, null, 1));
    await browser.close();
})().catch((e) => {
    console.error('PROBE FAILED:', e.message);
    process.exit(1);
});
