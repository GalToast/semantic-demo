#!/usr/bin/env node
/**
 * scripts/test-help.mjs
 *
 * Prints the canonical test/QA entry points. Replaces the inline node -e
 * help string that drifted when referenced scripts were renamed (test:ci,
 * test:all, micro-demo*) — a real file keeps the package-script-targets
 * contract honest (no phantom npm run references in help text).
 *
 * Run: npm run test:help
 */

const LINES = [
    'npm test               - static checks + unit tests',
    'npm run test:fast      - alias for test:static',
    'npm run test:unit      - Vitest unit tests (4059 test baseline)',
    'npm run qa:contract    - ordered contract group run',
    'npm run qa:journey:headless - journey specs (GPU renderer)',
    'npm run build          - production build'
]

console.log('Available test commands:')
for (const line of LINES) console.log('  ' + line)
