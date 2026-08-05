// Bug: naive *100 rounding fails on float repr (1.005 -> 1)
function round2(x) {
  return Math.round(x * 100) / 100;
}
module.exports = { round2 };