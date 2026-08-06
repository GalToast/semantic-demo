const { deepMerge } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
function J(x) { return JSON.stringify(x); }
assert(J(deepMerge({ a: 1 }, { b: 2 })) === J({ a: 1, b: 2 }), 'add-key (got ' + J(deepMerge({ a: 1 }, { b: 2 })) + ')');
assert(J(deepMerge({ a: 1 }, { a: 2 })) === J({ a: 2 }), 'scalar-wins');
assert(J(deepMerge({ tags: ['x'] }, { tags: ['y'] })) === J({ tags: ['x', 'y'] }), 'array-concat (got ' + J(deepMerge({ tags: ['x'] }, { tags: ['y'] })) + ')');
assert(J(deepMerge({ n: { a: 1, q: 2 } }, { n: { a: 9 } })) === J({ n: { a: 9, q: 2 } }), 'nested-merge keeps q (got ' + J(deepMerge({ n: { a: 1, q: 2 } }, { n: { a: 9 } })) + ')');
assert(J(deepMerge({ n: { x: null } }, { n: { y: 1 } })) === J({ n: { x: null, y: 1 } }), 'nested-null-key-kept');
assert(J(deepMerge(null, { c: 3 })) === J({ c: 3 }), 'null-a no-throw (got ' + J(deepMerge(null, { c: 3 })) + ')');
const base = { k: [1] };
deepMerge(base, { k: [2] });
assert(base.k.length === 1, 'inputs-not-mutated');
console.log('task-15 OK');