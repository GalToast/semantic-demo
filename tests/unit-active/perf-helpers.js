/**
 * perf-helpers.js — shared helpers for the canvas-picking perf benchmark.
 */

export const vector3AllocCounter = {
    count: 0,
    reset() {
        this.count = 0
    },
    increment() {
        this.count++
    }
}
