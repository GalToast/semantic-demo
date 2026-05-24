/**
 * search-state-focus-clear-owner-contract.mjs
 *
 * Proves that focus/search-selection direct writes inside search-state.js are
 * contained inside `clearSearchRelatedFocusState`, while nav/trail fields route
 * through lifecycle/navigation owner APIs. No other function in search-state.js
 * may directly assign to those fields.
 *
 * Run:  node tests/search-state-focus-clear-owner-contract.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCE = fs.readFileSync(
    path.resolve(__dirname, '../js/modules/search-state.js'),
    'utf8'
);

// Fields that may only be written inside clearSearchRelatedFocusState
const PROTECTED_FIELDS = [
    'state.selectedPoint',
    'state.focusedNode',
    'state.navState.lastTraversalReason',
    'state.trailIndices',
];

// These navState fields are intentionally cleared through the injected
// lifecycle dispatcher, not by direct assignment in search-state.js.
const DISPATCH_ROUTED_FIELDS = [
    'state.navState.mode',
    'state.navState.focusedIndex',
    'state.navState.explorationHistoryIndices',
];

// These trail/thread nav fields are owned by navigation-state.js and must clear
// through clearTrailThreadState(), not direct assignment in search-state.js.
const TRAIL_OWNER_ROUTED_FIELDS = [
    'state.navState.trailSeedIndex',
    'state.navState.trailNeighborIndices',
    'state.navState.trailCursor',
];

// Patterns that signal direct writes to protected fields
const DIRECT_WRITE_PATTERNS = [
    /state\.selectedPoint\s*=\s*/,
    /state\.focusedNode\s*=\s*/,
    /state\.navState\.mode\s*=\s*/,
    /state\.navState\.focusedIndex\s*=\s*/,
    /state\.navState\.trailSeedIndex\s*=\s*/,
    /state\.navState\.trailNeighborIndices\s*=\s*/,
    /state\.navState\.trailCursor\s*=\s*/,
    /state\.navState\.explorationHistoryIndices\s*=\s*/,
    /state\.navState\.lastTraversalReason\s*=\s*/,
    /state\.trailIndices\.clear\s*\(/,
];

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

/**
 * Extract the line range of clearSearchRelatedFocusState by scanning from the
 * function signature until the brace depth returns to 0.
 */
function getHelperLineRange() {
    const lines = SOURCE.split('\n');
    let start = -1;
    let end = -1;

    for (let i = 0; i < lines.length; i++) {
        if (/export\s+function\s+clearSearchRelatedFocusState/.test(lines[i])) {
            start = i;
            let depth = 0;
            for (let j = i; j < lines.length; j++) {
                const stripped = lines[j].replace(/\/\/.*$/, '');
                for (const ch of stripped) {
                    if (ch === '{') depth++;
                    else if (ch === '}') depth--;
                }
                if (depth === 0 && j > i) {
                    end = j;
                    return { start, end };
                }
            }
        }
    }
    return { start: -1, end: -1 };
}

/**
 * Find every occurrence of a direct write pattern outside clearSearchRelatedFocusState.
 * Returns array of { pattern, line, snippet }
 */
function findDirectWrites() {
    const lines = SOURCE.split('\n');
    const { start: helperStart, end: helperEnd } = getHelperLineRange();
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip lines inside the helper function body
        if (i >= helperStart && i <= helperEnd) continue;

        for (const pattern of DIRECT_WRITE_PATTERNS) {
            if (pattern.test(line)) {
                issues.push({ pattern: pattern.toString(), line: i + 1, snippet: line });
            }
        }
    }
    return issues;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('Verifying clearSearchRelatedFocusState is exported...');
assert(
    /export\s+function\s+clearSearchRelatedFocusState/.test(SOURCE),
    'clearSearchRelatedFocusState is not exported from search-state.js'
);
console.log('  found export function clearSearchRelatedFocusState');

console.log('\nScanning for direct writes to protected fields...');
const issues = findDirectWrites();

if (issues.length === 0) {
    console.log('  PASS — no direct writes found outside clearSearchRelatedFocusState');
} else {
    console.error('  FAIL — direct writes found:');
    for (const issue of issues) {
        console.error(`    line ${issue.line}: ${issue.snippet}`);
    }
    process.exit(1);
}

// Verify the helper covers all protected fields
console.log('\nVerifying helper body contains all protected field writes...');
const { start: hs, end: he } = getHelperLineRange();
assert(hs !== -1, 'Could not locate clearSearchRelatedFocusState');
const helperBody = lines(hs, he + 1).join('\n');

for (const field of PROTECTED_FIELDS) {
    const escaped = field.replace('.', '\\.');
    const re = new RegExp(escaped.replace(/\\\./, '\\.'));
    assert(re.test(helperBody), `Helper does not write ${field} — may be missing from contract`);
    console.log(`  ${field} -> covered`);
}

assert(
    /adapter_dispatchNavTransition\s*\(\s*['"]RESET_FOCUS['"]\s*\)/.test(helperBody),
    'Helper must route navState.mode/focusedIndex/explorationHistoryIndices clearing through adapter_dispatchNavTransition("RESET_FOCUS")'
);
for (const field of DISPATCH_ROUTED_FIELDS) {
    const directWrite = new RegExp(field.replace(/\./g, '\\.') + '\\s*=');
    assert(
        !directWrite.test(helperBody),
        `Helper must not directly write ${field}; it is dispatch-routed`
    );
    console.log(`  ${field} -> dispatch-routed via RESET_FOCUS`);
}

assert(
    /clearTrailThreadState\s*\(\s*\)/.test(helperBody),
    'Helper must route trail/thread field clearing through clearTrailThreadState()'
);
for (const field of TRAIL_OWNER_ROUTED_FIELDS) {
    const directWrite = new RegExp(field.replace(/\./g, '\\.') + '\\s*=');
    assert(
        !directWrite.test(helperBody),
        `Helper must not directly write ${field}; it is navigation-state routed`
    );
    console.log(`  ${field} -> routed via clearTrailThreadState()`);
}

// Verify applyFilters routes through the helper (not direct writes)
console.log('\nVerifying applyFilters routes through clearSearchRelatedFocusState...');
const applyFiltersMatch = SOURCE.match(/export\s+function\s+applyFilters[\s\S]*?\n}(?=\n|$)/m);
assert(applyFiltersMatch, 'Could not extract applyFilters body');
const applyFiltersBody = applyFiltersMatch[0];
assert(
    /clearSearchRelatedFocusState/.test(applyFiltersBody),
    'applyFilters does not call clearSearchRelatedFocusState'
);
assert(
    !/state\.(selectedPoint|focusedNode)\s*=\s*null/.test(applyFiltersBody),
    'applyFilters still has direct write to selectedPoint/focusedNode'
);
assert(
    !/state\.navState\.(mode|focusedIndex|trailSeedIndex|trailNeighborIndices|trailCursor|explorationHistoryIndices|lastTraversalReason)\s*=/.test(applyFiltersBody),
    'applyFilters still has direct write to navState fields'
);
assert(
    !/state\.trailIndices\.clear/.test(applyFiltersBody),
    'applyFilters still has direct write to trailIndices'
);
console.log('  PASS — applyFilters routes through clearSearchRelatedFocusState');

// Verify no other function contains direct writes to the protected fields
console.log('\nVerifying no other function contains direct writes...');
const otherDirectWrites = findDirectWrites();
assert(otherDirectWrites.length === 0, `Other functions contain direct writes: ${JSON.stringify(otherDirectWrites)}`);
console.log('  PASS — no other function contains direct writes');

console.log('\nsearch-state-focus-clear-owner-contract passed');

function lines(start, end) {
    return SOURCE.split('\n').slice(start, end);
}
