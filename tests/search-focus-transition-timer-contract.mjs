import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSource } from './source-path.mjs';

const cwd = process.cwd();
const searchStateSrc = readFileSync(resolveSource('js/modules/search-state.ts', cwd), 'utf8');

function extractFunctionBody(src, functionName) {
    const signature = `export function ${functionName}`;
    const start = src.indexOf(signature);
    assert.notEqual(start, -1, `${functionName} must be exported`);

    const openBrace = src.indexOf('{', start);
    assert.notEqual(openBrace, -1, `${functionName} must have a function body`);

    let depth = 0;
    for (let i = openBrace; i < src.length; i += 1) {
        const char = src[i];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) return src.slice(openBrace + 1, i);
    }

    throw new Error(`${functionName} body was not closed`);
}

const transitionBody = extractFunctionBody(searchStateSrc, 'beginSearchFocusTransition');

assert(
    !/search-lifecycle-adapter/.test(searchStateSrc),
    'search-state.js must not restore the lifecycle adapter for transition timers'
);

assert(
    !/\bwindow\.setTimeout\b/.test(transitionBody),
    'beginSearchFocusTransition must not schedule timers through window.setTimeout'
);

const scheduledTasks = transitionBody.match(/\bsetTimeout\s*\(/g) || [];
assert.equal(
    scheduledTasks.length,
    3,
    'beginSearchFocusTransition must preserve the focus delay, map switch delay, and focusing settle delay'
);

assert(
    /publish\(EVENTS\.SEARCH_FOCUS_REQUESTED/.test(transitionBody),
    'beginSearchFocusTransition must request focus through the event bus'
);
assert(
    /publish\(EVENTS\.SEARCH_FOCUS_TRANSITION_SETTLED/.test(transitionBody),
    'beginSearchFocusTransition must publish settled state through the event bus'
);

console.log('search-focus-transition-timer-contract.mjs passed');
