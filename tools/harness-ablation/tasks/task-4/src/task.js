function lastN(arr, n) {
  const start = arr.length - n - 1; // off-by-boundary: should be arr.length - n
  return arr.slice(start, arr.length);
}

function penultimate(arr) {
  return arr[arr.length - 1]; // off-by-boundary: should be arr.length - 2 for second-to-last
}

module.exports = { lastN, penultimate };
