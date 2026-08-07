const { wrap } = require('../src/task.js')
function assert(cond, msg) {
    if (!cond) throw new Error('ASSERT FAIL: ' + msg)
}
assert(wrap(0, 5) === 0, 'wrap(0,5)=0 (got ' + wrap(0, 5) + ')')
assert(wrap(3, 5) === 3, 'wrap(3,5)=3 (got ' + wrap(3, 5) + ')')
assert(wrap(7, 5) === 2, 'wrap(7,5)=2 (got ' + wrap(7, 5) + ')')
assert(wrap(-1, 5) === 4, 'wrap(-1,5)=4 (got ' + wrap(-1, 5) + ')')
assert(wrap(-7, 5) === 3, 'wrap(-7,5)=3 (got ' + wrap(-7, 5) + ')')
assert(wrap(20, 4) === 0, 'wrap(20,4)=0 (got ' + wrap(20, 4) + ')')
console.log('task-14 OK')
