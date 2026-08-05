// Bug: sorts ascending, so slice(-3) returns the 3 SMALLEST... actually slice(0,3) of ascending = smallest 3
function topThree(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted.slice(0, 3);
}
module.exports = { topThree };