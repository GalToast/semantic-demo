const { round2 } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(Math.abs(round2(1.005) - 1.01) < 1e-9, '1.005 -> 1.01 (got ' + round2(1.005) + ')');
assert(Math.abs(round2(2.5) - 2.5) < 1e-9, '2.5');
assert(Math.abs(round2(0.1 + 0.2) - 0.3) < 1e-9, '0.1+0.2 -> 0.3');
assert(Math.abs(round2(3.14159) - 3.14) < 1e-9, 'pi -> 3.14');
console.log('task-12 OK');