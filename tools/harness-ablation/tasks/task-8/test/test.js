const { safeLength } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(safeLength(null) === 0, 'null');
assert(safeLength(undefined) === 0, 'undefined');
assert(safeLength('abc') === 3, 'string');
assert(safeLength([1,2]) === 2, 'array');
console.log('task-8 OK');