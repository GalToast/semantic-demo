// tests/_fixtures/mobile-premium-split.mjs
// Shared fixture for the css/mobile_premium__*.css split.
//
// After the 2026-06-03 un-collapse, the seven files below are the current
// mobile owner (was css/mobile_premium.css from 2026-06-02 → 2026-06-03).
// Tests that previously hard-coded the list should import MOBILE_PREMIUM_SPLIT
// and MOBILE_PREMIUM_PATHS from this fixture so a future split rearrangement
// only updates one place.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export const MOBILE_PREMIUM_SPLIT = Object.freeze([
    'mobile_premium__focus-dive.css',
    'mobile_premium__chrome.css',
    'mobile_premium__state.css',
    'mobile_premium__idle.css',
    'mobile_premium__map.css',
    'mobile_premium__surfaces.css',
    'mobile_premium__narrow.css',
]);

export const MOBILE_PREMIUM_PATHS = Object.freeze(
    MOBILE_PREMIUM_SPLIT.map((file) => path.join(ROOT, 'css', file))
);
