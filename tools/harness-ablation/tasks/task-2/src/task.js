// Bug: uses >= instead of >
function countAbove(arr, threshold) {
  let c = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= threshold) c++;
  }
  return c;
}

function hasAbove(arr, threshold) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= threshold) return true;
  }
  return false;
}

module.exports = { countAbove, hasAbove };
