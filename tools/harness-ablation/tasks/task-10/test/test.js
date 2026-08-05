const { sumPositive } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(sumPositive([1,-2,3]) === 4, 'mixed');
assert(sumPositive([-1,-2]) === 0, 'all negative');
assert(sumPositive([0,5]) === 5, 'zero + positive');
assert(sumPositive([]) === 0, 'empty');
console.log('task-10 OK');