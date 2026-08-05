// Bug: returns `mid` instead of `lo`, so on "not found" it returns the
// last compared index rather than the correct insert position.
function findInsertIndex(arr, target) {
  let lo = 0;
  let hi = arr.length - 1;
  let mid = 0;
  while (lo <= hi) {
    mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return mid;
}

module.exports = { findInsertIndex };
