#!/usr/bin/env node
/* global process, console */
/**
 * Lighthouse Performance Gate
 * Compares current Lighthouse results against stored baseline.
 * Run after: npm run build && npx vite preview --port 4174
 * Usage: node scripts/lighthouse-gate.mjs [--baseline docs/lighthouse-baseline-*.json]
 */
import fs from "node:fs";
import path from "node:path";

const BASELINE_PATH =
    process.argv.find((a) => a.startsWith("--baseline="))?.slice(11) ??
    (() => {
        const files = fs.readdirSync("docs").filter((f) => f.startsWith("lighthouse-baseline"));
        if (files.length === 0) throw new Error("No lighthouse baseline found in docs/");
        return path.join("docs", files.sort().at(-1));
    })();

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const current = JSON.parse(fs.readFileSync(0, "utf8")); // read from stdin

const categories = {
    performance: { threshold: 0.30 },     // expect >=30
    accessibility: { threshold: 0.95 },
    "best-practices": { threshold: 0.95 },
    seo: { threshold: 0.88 },
};

let failed = false;
const results = [];

for (const [key, { threshold }] of Object.entries(categories)) {
    const baseScore = Math.round(baseline.categories[key].score * 100);
    const currScore = Math.round(current.categories[key].score * 100);
    const pass = currScore >= Math.max(threshold, baseScore - 5);
    results.push({ key: key.padEnd(15), baseScore, currScore, pass: pass ? "PASS" : "FAIL" });
    if (!pass) failed = true;
}

// Key metrics
const metrics = [
    { key: "first-contentful-paint", label: "FCP" },
    { key: "largest-contentful-paint", label: "LCP" },
    { key: "total-blocking-time", label: "TBT" },
    { key: "cumulative-layout-shift", label: "CLS" },
];

for (const { key, label } of metrics) {
    const baseVal = baseline.audits[key]?.displayValue || "?";
    const currVal = current.audits[key]?.displayValue || "?";
    const baseNum = parseFloat(baseVal) || 0;
    const currNum = parseFloat(currVal) || 0;
    const pass = key === "cumulative-layout-shift" ? currNum <= 0.1 : currNum <= baseNum * 1.1;
    results.push({ key: label.padEnd(15), baseScore: baseVal, currScore: currVal, pass: pass ? "PASS" : "FAIL" });
    if (!pass) failed = true;
}

console.table(results.map(r => ({ metric: r.key, baseline: r.baseScore, current: r.currScore, status: r.pass })));

if (failed) {
    console.error("\n❌ Lighthouse gate FAILED — metrics regressed beyond threshold");
    process.exit(1);
} else {
    console.log("\n✅ Lighthouse gate PASSED — all metrics within threshold");
    process.exit(0);
}
