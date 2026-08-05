const { countAbove, hasAbove } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(countAbove([1, 5, 10, 3], 5) === 1, 'only 10 > 5'); // 5 is not > 5
assert(hasAbove([1, 5, 10], 10) === false, '10 >= 10 is true but should require > 10');
console.log('task-2 OK');
