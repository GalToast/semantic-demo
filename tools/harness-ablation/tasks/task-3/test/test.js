const { top3, sumTop3 } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(JSON.stringify(top3([3, 1, 7, 2, 9])) === JSON.stringify([9, 7, 3]), 'should return sorted-desc top 3');
assert(sumTop3([3, 1, 7, 2, 9]) === 19, '9+7+3=19');
console.log('task-3 OK');
