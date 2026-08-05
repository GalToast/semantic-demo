// Bug: loop misses the LAST index's window (runs i < arr.length-1)
function slidingMax3(arr) {
  if (arr.length === 0) return [];
  const out = [];
  for (let i = 0; i < arr.length - 1; i++) {
    out.push(Math.max(arr[i], arr[i + 1] ?? -Infinity, arr[i + 2] ?? -Infinity));
  }
  return out;
}
module.exports = { slidingMax3 };
