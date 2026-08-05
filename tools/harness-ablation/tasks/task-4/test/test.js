const { lastN, penultimate } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(JSON.stringify(lastN([10, 20, 30], 2)) === JSON.stringify([20, 30]), 'last 2');
assert(JSON.stringify(lastN([5], 1)) === JSON.stringify([5]), 'single element');
assert(penultimate([10, 20, 30]) === 20, 'penultimate is 20');
assert(penultimate([1, 2]) === 1, 'penultimate of 2 elements is first');
console.log('task-4 OK');
