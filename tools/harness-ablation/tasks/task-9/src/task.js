// Bug: uses a shared mutable 'latest' so a slow earlier call can overwrite a later result
let latest = null;
function slowResolve(val, ms) {
  return new Promise((r) => setTimeout(() => r(val), ms));
}
async function fetchUser(id) {
  latest = id;
  await slowResolve(id, id === 1 ? 50 : 5);
  return latest;
}
module.exports = { fetchUser };