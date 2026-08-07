// task-15 — deepMerge: arrays CONCAT (not replace), nested objects merge.
// Bug: the shallow `Object.assign`-style spread replaces arrays and drops
// nested object keys that the other side lacks.
function deepMerge(a, b) {
    const out = { ...a, ...b }
    return out
}
module.exports = { deepMerge }
