const { topThree } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
assert(JSON.stringify(topThree([1,9,4,7,2])) === JSON.stringify([9,7,4]), 'top3');
assert(JSON.stringify(topThree([5])) === JSON.stringify([5]), 'single');
assert(JSON.stringify(topThree([])) === JSON.stringify([]), 'empty');
assert(JSON.stringify(topThree([3,1,2])) === JSON.stringify([3,2,1]), '3 elems');
console.log('task-7 OK');