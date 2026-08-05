// Bug: sums elements at odd indices (1,3...) instead of even (0,2...)
function sumEvenIndices(arr) {
  let s = 0;
  for (let i = 1; i < arr.length; i += 2) s += arr[i];
  return s;
}

function maxEven(arr) {
  let m = -Infinity;
  for (let i = 1; i < arr.length; i += 2) {
    if (arr[i] > m) m = arr[i];
  }
  return m === -Infinity ? null : m;
}

module.exports = { sumEvenIndices, maxEven };
