const { findInsertIndex } = require('../src/task.js')

function assert(cond, msg) {
    if (!cond) throw new Error('ASSERT FAIL: ' + msg)
}

assert(findInsertIndex([1, 3, 5, 7], 4) === 2, 'insert in middle')
assert(findInsertIndex([1, 3, 5, 7], 0) === 0, 'insert before all')
assert(findInsertIndex([1, 3, 5, 7], 8) === 4, 'insert after all (BUG: 5)')
assert(findInsertIndex([1, 3, 5, 7], 5) === 2, 'existing element')
assert(findInsertIndex([], 1) === 0, 'empty array')
console.log('task-5 OK')
