/**
 * focus-selection-owner-contract.mjs
 *
 * Source-level contract proving that lifecycle.js routes all direct writes to
 * focusedNode, selectedPoint, and related navState focus/trail fields through
 * the named owner API clearExplorationFocusSelection().
 *
 * Run:  node tests/focus-selection-owner-contract.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(
    path.resolve(__dirname, '../js/modules/lifecycle.js'),
    'utf8'
);

// Fields that may only be written inside clearExplorationFocusSelection
const PROTECTED_FIELDS = [
    'state.focusedNode',
    'state.selectedPoint',
    'state.navState.focusedIndex',
    'state.navState.trailSeedIndex',
    'state.navState.trailNeighborIndices',
    'state.navState.trailCursor',
    'state.navState.explorationHistoryIndices',
    'state.navState.lastTraversalReason',
    'state.trailIndices',
];

// Patterns that signal direct writes to protected fields (outside the helper).
// Only flags sentinel-value clears: = null, = -1, = [], .clear()
// Allows: valid setter assignments (= point), comparison operators (===, ==, !==, !=)
const DIRECT_WRITE_PATTERNS = [
    // Null assignments — excludes comparisons: === null, == null, !== null, != null
    /state\.focusedNode\s*=\s*null\b[^;]*;/,
    /state\.selectedPoint\s*=\s*null\b[^;]*;/,
    /state\.navState\.focusedIndex\s*=\s*null\b[^;]*;/,
    /state\.navState\.trailSeedIndex\s*=\s*null\b[^;]*;/,
    /state\.navState\.trailNeighborIndices\s*=\s*\[\][^;]*;/,
    // trailCursor = -1 (but not === -1 or !== -1 or == -1 comparisons)
    /state\.navState\.trailCursor\s*=\s*-1\b[^;]*;/,
    /state\.navState\.explorationHistoryIndices\s*=\s*\[\][^;]*;/,
    /state\.navState\.lastTraversalReason\s*=\s*null\b[^;]*;/,
    // trailIndices.clear() — direct mutation, never allowed outside helper
    /state\.trailIndices\.clear\s*\(\s*\)/,
];

function assert(condition, message) {
    if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

/**
 * Extract the line range of clearExplorationFocusSelection by scanning from the
 * function signature until the brace depth returns to 0.
 */
function getHelperLineRange() {
    const lines = SOURCE.split('\n');
    let start = -1;
    let end = -1;

    for (let i = 0; i < lines.length; i++) {
        if (/export\s+function\s+clearExplorationFocusSelection/.test(lines[i])) {
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
 * Extract the line range of setMyceliumMode, whose else-branch legitimately
 * writes to trail fields independently of clearExplorationFocusSelection.
 */
function getSetMyceliumModeLineRange() {
    const lines = SOURCE.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (/export\s+function\s+setMyceliumMode\b/.test(lines[i])) {
            // Find the end of the function body
            let depth = 0;
            for (let j = i; j < lines.length; j++) {
                const stripped = lines[j].replace(/\/\/.*$/, '');
                for (const ch of stripped) {
                    if (ch === '{') depth++;
                    else if (ch === '}') depth--;
                }
                if (depth === 0 && j > i) {
                    return { start: i, end: j };
                }
            }
        }
    }
    return { start: -1, end: -1 };
}

/**
 * Find every occurrence of a direct write pattern outside clearExplorationFocusSelection.
 * Returns array of { pattern, line, snippet }
 */
function findDirectWrites() {
    const lines = SOURCE.split('\n');
    const { start: helperStart, end: helperEnd } = getHelperLineRange();
    const { start: mmStart, end: mmEnd } = getSetMyceliumModeLineRange();
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip lines inside the helper function body
        if (i >= helperStart && i <= helperEnd) continue;
        // Skip lines inside setMyceliumMode — its else-branch independently manages
        // trail fields and is not required to route through the focus helper
        if (i >= mmStart && i <= mmEnd) continue;

        for (const pattern of DIRECT_WRITE_PATTERNS) {
            if (pattern.test(line)) {
                issues.push({ pattern: pattern.toString(), line: i + 1, snippet: line });
            }
        }
    }
    return issues;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('Verifying clearExplorationFocusSelection is exported...');
assert(
    /export\s+function\s+clearExplorationFocusSelection/.test(SOURCE),
    'clearExplorationFocusSelection is not exported from lifecycle.js'
);
console.log('  found export function clearExplorationFocusSelection');

console.log('\nScanning for direct writes to protected fields...');
const issues = findDirectWrites();

if (issues.length === 0) {
    console.log('  PASS — no direct writes found outside clearExplorationFocusSelection');
} else {
    console.error('  FAIL — direct writes found:');
    for (const issue of issues) {
        console.error(`    line ${issue.line}: ${issue.snippet}`);
    }
    process.exit(1);
}

// Verify the helper is called from resetStateBeforeUrlRestore
console.log('\nVerifying resetStateBeforeUrlRestore routes through clearExplorationFocusSelection...');
const resetStateMatch = SOURCE.match(/export\s+function\s+resetStateBeforeUrlRestore[\s\S]*?\n}(?=\n|$)/m);
assert(resetStateMatch, 'Could not extract resetStateBeforeUrlRestore body');
const resetStateBody = resetStateMatch[0];
assert(
    /clearExplorationFocusSelection\s*\(/.test(resetStateBody),
    'resetStateBeforeUrlRestore does not call clearExplorationFocusSelection'
);
assert(
    !/state\.focusedNode\s*=\s*null/.test(resetStateBody),
    'resetStateBeforeUrlRestore still has direct write to focusedNode'
);
assert(
    !/state\.selectedPoint\s*=\s*null/.test(resetStateBody),
    'resetStateBeforeUrlRestore still has direct write to selectedPoint'
);
console.log('  PASS — resetStateBeforeUrlRestore routes through clearExplorationFocusSelection');

// Verify the helper is called from resetNodePositions
console.log('\nVerifying resetNodePositions routes through clearExplorationFocusSelection...');
const resetNodeMatch = SOURCE.match(/export\s+function\s+resetNodePositions[\s\S]*?\n}(?=\n|$)/m);
assert(resetNodeMatch, 'Could not extract resetNodePositions body');
const resetNodeBody = resetNodeMatch[0];
assert(
    /clearExplorationFocusSelection\s*\(/.test(resetNodeBody),
    'resetNodePositions does not call clearExplorationFocusSelection'
);
assert(
    !/state\.focusedNode\s*=\s*null/.test(resetNodeBody),
    'resetNodePositions still has direct write to focusedNode'
);
assert(
    !/state\.selectedPoint\s*=\s*null/.test(resetNodeBody),
    'resetNodePositions still has direct write to selectedPoint'
);
console.log('  PASS — resetNodePositions routes through clearExplorationFocusSelection');

console.log('\nfocus-selection-owner-contract.mjs passed');
