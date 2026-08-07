const { dedupeLast } = require('../src/task.js')
function assert(cond, msg) {
    if (!cond) throw new Error('ASSERT FAIL: ' + msg)
}
assert(
    JSON.stringify(dedupeLast([1, 2, 1, 3])) === JSON.stringify([2, 1, 3]),
    'keep-last: 1,2,1,3 -> [2,1,3] (got ' + JSON.stringify(dedupeLast([1, 2, 1, 3])) + ')'
)
assert(
    JSON.stringify(dedupeLast(['a', 'b', 'a', 'c', 'b'])) === JSON.stringify(['a', 'c', 'b']),
    'keep-last: a,b,a,c,b -> [a,c,b] (got ' + JSON.stringify(dedupeLast(['a', 'b', 'a', 'c', 'b'])) + ')'
)
assert(JSON.stringify(dedupeLast([1])) === JSON.stringify([1]), 'single')
assert(JSON.stringify(dedupeLast([])) === JSON.stringify([]), 'empty')
console.log('task-13 OK')
