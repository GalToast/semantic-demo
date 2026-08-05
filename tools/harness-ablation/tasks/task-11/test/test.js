const { makeCounters } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
const fns = makeCounters(3);
assert(fns[0]() === 0, 'fn0 returns 0 (got ' + fns[0]() + ')');
assert(fns[1]() === 1, 'fn1 returns 1');
assert(fns[2]() === 2, 'fn2 returns 2');
console.log('task-11 OK');