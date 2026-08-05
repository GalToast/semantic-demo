// Bug: var i is shared across closures, all return n
function makeCounters(n) {
  const fns = [];
  for (var i = 0; i < n; i++) {
    fns.push(function () { return i; });
  }
  return fns;
}
module.exports = { makeCounters };