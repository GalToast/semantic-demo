// task-14 — circular wrap: map any integer index into [0, n)
// Bug: naive % keeps negative results (JS % is remainder, not modulo).
function wrap(i, n) {
  return i % n;
}
module.exports = { wrap };