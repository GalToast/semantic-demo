import { chromium } from 'playwright';
import fs from 'fs';
import { spawn } from 'child_process';

const outDir = 'reports/screenshots/visual-qa-bugsweep';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Start HTTP server as child process
const server = spawn('python', ['-m', 'http.server', '8795', '--bind', '127.0.0.1'], {
  cwd: 'C:\\Users\\HP\\Desktop\\Temp while my comp is at the shop\\semantic-explorer',
  stdio: 'pipe'
});

// Wait for server to be ready
function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      fetch(url).then(res => {
        if (res.ok || res.status === 200) resolve();
        else throw new Error('Not ready');
      }).catch(() => {
        if (Date.now() - start > timeout) reject(new Error('Server timeout'));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}

await waitForServer('http://127.0.0.1:8795/');
console.log('Server ready');

const browser = await chromium.launch();
const context = await browser.newContext();

// 1. Desktop idle
const pageDesktop = await context.newPage({ viewport: { width: 1440, height: 900 } });
await pageDesktop.goto('http://127.0.0.1:8795/vector-explorer-polished.html', { waitUntil: 'networkidle' });
await pageDesktop.waitForTimeout(3000);
await pageDesktop.screenshot({ path: `${outDir}/desktop-idle.png`, fullPage: true });
console.log('desktop-idle done');

// 2. Mobile idle
await pageDesktop.setViewportSize({ width: 375, height: 812 });
await pageDesktop.reload({ waitUntil: 'networkidle' });
await pageDesktop.waitForTimeout(3000);
await pageDesktop.screenshot({ path: `${outDir}/mobile-idle.png`, fullPage: true });
console.log('mobile-idle done');

// 3. Mobile landscape
await pageDesktop.setViewportSize({ width: 900, height: 430 });
await pageDesktop.reload({ waitUntil: 'networkidle' });
await pageDesktop.waitForTimeout(3000);
await pageDesktop.screenshot({ path: `${outDir}/mobile-landscape.png`, fullPage: true });
console.log('mobile-landscape done');

// 4. Search results - desktop
await pageDesktop.setViewportSize({ width: 1440, height: 900 });
await pageDesktop.reload({ waitUntil: 'networkidle' });
await pageDesktop.waitForTimeout(2000);
await pageDesktop.fill('input[type="search"], .search-input, #search-input, [placeholder*="Search"]', 'cafe');
await pageDesktop.waitForTimeout(1500);
await pageDesktop.screenshot({ path: `${outDir}/search-results.png`, fullPage: true });
console.log('search-results done');

await browser.close();
server.kill();
console.log('Done with first batch');
