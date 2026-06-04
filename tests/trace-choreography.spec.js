import { test } from '@playwright/test';

test.describe('Choreography Trace', () => {
  test('Trace micro-demo choreography', async ({ browser, page }) => {
    await browser.startTracing(page, {
      path: 'tmp/choreography-trace.json',
      screenshots: true,
      categories: ['devtools.timeline', 'v8.execute', 'blink.user_timing', 'disabled-by-default-devtools.timeline.frame']
    });

    // Force demo to trigger
    await page.goto('http://127.0.0.1:8795/vector-explorer-polished.html?demo=force', { waitUntil: 'networkidle' });

    // Wait for the full demo lifecycle (approx 9 seconds based on MICRO-DEMO-SPEC)
    // plus a little buffer
    await page.waitForTimeout(11000);

    await browser.stopTracing();
  });
});
