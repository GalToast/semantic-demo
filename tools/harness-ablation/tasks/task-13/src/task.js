// task-13 — dedupe: keep LAST occurrence, not first
// Bug: naive dedupe keeps the FIRST occurrence (common default), but the
// contract keeps the LAST. The README hints it; only the test pins it.
function dedupeLast(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}
module.exports = { dedupeLast };
