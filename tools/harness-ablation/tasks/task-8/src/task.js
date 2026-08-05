// Bug: no null/undefined guard
function safeLength(x) {
  return x.length;
}
module.exports = { safeLength };