const { slidingMax3 } = require('../src/task.js');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
}

assert(JSON.stringify(slidingMax3([1, 5, 3])) === JSON.stringify([5, 5, 3]), 'window of 3 over 3 elems (last window [3])');
assert(JSON.stringify(slidingMax3([1, 5, 3, 2])) === JSON.stringify([5, 5, 3, 2]), '4 elems: windows [1,5,3],[5,3,2],[3,2],[2]');
assert(JSON.stringify(slidingMax3([7])) === JSON.stringify([7]), 'single');
assert(JSON.stringify(slidingMax3([])) === JSON.stringify([]), 'empty');
assert(JSON.stringify(slidingMax3([2, 9, 1, 8, 4])) === JSON.stringify([9, 9, 8, 8, 4]), 'mixed');
console.log('task-6 OK');
