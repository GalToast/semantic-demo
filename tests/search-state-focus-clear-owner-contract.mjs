/**
 * search-state-focus-clear-owner-contract.mjs
 *
 * Search-state may clear its own selected search/focus affordance, but broader
 * nav reset is an event-bus request and trail/thread cleanup goes through the
 * navigation-state owner.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSource } from './source-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(resolveSource('js/modules/search-state.ts', path.resolve(__dirname, '..')), 'utf8');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function extractFunctionBody(functionName) {
    const signature = `export function ${functionName}`;
    const start = SOURCE.indexOf(signature);
    assert(start !== -1, `${functionName} is not exported from search-state.js`);
    const paramsEnd = SOURCE.indexOf(')', start);
    const openBrace = SOURCE.indexOf('{', paramsEnd);
    let depth = 0;
    for (let i = openBrace; i < SOURCE.length; i += 1) {
        const ch = SOURCE[i];
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        if (depth === 0) return SOURCE.slice(openBrace + 1, i);
    }
    throw new Error(`${functionName} body was not closed`);
}

const helperBody = extractFunctionBody('clearSearchRelatedFocusState');

console.log('Verifying clearSearchRelatedFocusState ownership...');
assert(/\bstate\b[\s\S]{0,40}\.selectedPoint\s*=\s*null/.test(helperBody), 'helper must clear selectedPoint');
assert(/publish\(EVENTS\.STATE_RESET/.test(helperBody), 'helper must request nav reset through EVENTS.STATE_RESET');
assert(/clearTrailThreadState\s*\(\s*\)/.test(helperBody), 'helper must route trail/thread cleanup through clearTrailThreadState()');
assert(/(?:appState\.trailIndices\?\.clear|state\.trailIndices\.clear|getTrailIndices\(\)\?\.clear)\s*\(\s*\)/.test(helperBody), 'helper must clear search-owned trail index set');
assert(!/adapter_dispatchNavTransition/.test(SOURCE), 'search-state must not restore adapter dispatch routing');

console.log('\nScanning for direct nav writes outside search-state owner fields...');
const protectedDirectWrites = [
    /state\.focusedNode\s*=\s*/,
    /state\.navState\.mode\s*=\s*/,
    /state\.navState\.focusedIndex\s*=\s*/,
    /state\.navState\.trailSeedIndex\s*=\s*/,
    /state\.navState\.trailNeighborIndices\s*=\s*/,
    /state\.navState\.trailCursor\s*=\s*/,
    /state\.navState\.explorationHistoryIndices\s*=\s*/,
    /state\.navState\.lastTraversalReason\s*=\s*/,
];

const helperStart = SOURCE.indexOf('export function clearSearchRelatedFocusState');
const helperEnd = helperStart + helperBody.length + 'export function clearSearchRelatedFocusState'.length;
const issues = SOURCE.split('\n').flatMap((line, index) => {
    const offset = SOURCE.split('\n').slice(0, index).join('\n').length;
    if (offset >= helperStart && offset <= helperEnd) return [];
    return protectedDirectWrites
        .filter((pattern) => pattern.test(line))
        .map(() => `line ${index + 1}: ${line.trim()}`);
});

assert(issues.length === 0, `unexpected direct nav writes:\n${issues.join('\n')}`);
console.log('  PASS');

console.log('\nsearch-state-focus-clear-owner-contract passed');
