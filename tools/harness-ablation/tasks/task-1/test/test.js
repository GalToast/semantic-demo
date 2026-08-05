const { sumEvenIndices, maxEven } = require('../src/task.js');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
}

assert(sumEvenIndices([10, 20, 30, 40, 50]) === 90, 'sumEvenIndices should be 10+30+50=90');
assert(sumEvenIndices([5]) === 5, 'single element at index 0');
assert(maxEven([10, 20, 30, 40, 50]) === 50, 'maxEven at even indices: 10,30,50 -> 50');
assert(maxEven([10, 99, 30, 99, 50]) === 50, 'maxEven ignores odd-index peaks');
console.log('task-1 OK');
