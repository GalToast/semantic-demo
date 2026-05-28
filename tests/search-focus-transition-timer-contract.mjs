import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();
const searchStateSrc = readFileSync(resolve(cwd, 'js/modules/search-state.js'), 'utf8');
const adapterSrc = readFileSync(resolve(cwd, 'js/modules/search-lifecycle-adapter.js'), 'utf8');

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
    /scheduleSearchFocusTask\s+as\s+adapter_scheduleSearchFocusTask/.test(searchStateSrc),
    'search-state.js must import scheduleSearchFocusTask through the lifecycle adapter'
);

assert(
    !/\bwindow\.setTimeout\b/.test(transitionBody),
    'beginSearchFocusTransition must not schedule timers through window.setTimeout'
);

const scheduledTasks = transitionBody.match(/\badapter_scheduleSearchFocusTask\s*\(/g) || [];
assert.equal(
    scheduledTasks.length,
    3,
    'beginSearchFocusTransition must preserve the focus delay, map switch delay, and focusing settle delay'
);

assert(
    /export function scheduleSearchFocusTask\s*\(/.test(adapterSrc),
    'search-lifecycle-adapter.js must export scheduleSearchFocusTask'
);

assert(
    !/\bwindow\.setTimeout\b/.test(adapterSrc),
    'search-lifecycle-adapter.js should use an environment-neutral timer boundary, not window.setTimeout'
);

console.log('search-focus-transition-timer-contract.mjs passed');
