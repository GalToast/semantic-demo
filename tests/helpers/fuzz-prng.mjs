/**
 * fuzz-prng.mjs — deterministic PRNG for adversarial fuzz test replay.
 */

export class FuzzPRNG {
    constructor(seed = 42) {
        this.seed = (seed * 9301 + 49297) % 233280
        this.current = this.seed
    }

    next() {
        this.current = (this.current * 16807 + 0) % 2147483647
        return (this.current % 233280) / 233280
    }

    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min
    }

    pick(arr) {
        return arr[this.int(0, arr.length - 1)]
    }
}
