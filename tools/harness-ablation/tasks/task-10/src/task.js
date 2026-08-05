// Bug: sums ALL numbers, including negatives
function sumPositive(arr) {
  return arr.reduce((s, x) => s + x, 0);
}
module.exports = { sumPositive };