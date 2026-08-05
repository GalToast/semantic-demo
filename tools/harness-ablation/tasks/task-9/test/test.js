const { fetchUser } = require('../src/task.js');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }
async function main() {
  const p1 = fetchUser(1);
  const p2 = fetchUser(2);
  const r1 = await p1;
  const r2 = await p2;
  assert(r1 === 1, 'first call returns 1 (got ' + r1 + ')');
  assert(r2 === 2, 'second call returns 2, not stale ' + r2);
  console.log('task-9 OK');
}
main().catch((e) => { console.error(e.message); process.exit(1); });