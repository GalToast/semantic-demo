// Regression test for the H1 fix (pi-h1-fix-20260904-r2) in edit-diff.js.
//
// Root cause: fuzzyFindText matched a trimmed span, so residual trailing bytes
// (CR, trailing spaces) of the last matched line stayed inside the splice and
// glued onto inserted text — merging two lines into one. The fix widens each
// match to full final-line boundaries before splicing.
//
// Run: PI_EDIT_DIFF_PATH=<path-to-edit-diff.js> node --loader ./tests/helpers/ts-resolve-loader.mjs tests/edit-diff-line-merge-regression.mjs

import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const editDiffPath =
  process.env.PI_EDIT_DIFF_PATH ||
  require("path").resolve("../dist/core/tools/edit-diff.js");
const { applyEditsToNormalizedContent } = await import(pathToFileURL(editDiffPath).href);

let passed = 0;
let failed = 0;

function apply(content, edits) {
  return applyEditsToNormalizedContent(content, edits, "test").newContent;
}

function check(name, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  }
}

// 1. Mid-line edit where the matched line has a trailing CR. Before the fix the
//    CR would survive the splice and merge the next line onto the inserted text.
{
  const out = apply("alpha\r\nbeta\ngamma\n", [{ oldText: "be", newText: "BEE" }]);
  check("trailing-CR line not merged", out, "alpha\r\nBEEta\ngamma\n");
}

// 2. Match ending exactly at a line boundary with trailing spaces on the line.
{
  const out = apply("line one   \nline two\n", [{ oldText: "one", newText: "ONE" }]);
  check("trailing-space line preserved", out, "line ONE   \nline two\n");
}

// 3. Fuzzy match (whitespace-insensitive) where the source line carries a CR.
//    This is the exact shape the fuzzer flagged pre-fix.
{
  const out = apply("foo \r\nbar baz\n", [{ oldText: "bar", newText: "BAR" }]);
  check("fuzzy match with CR line", out, "foo \r\nBAR baz\n");
}

// 4. Multi-edit where the first match's residual would have merged into the
//    second insertion.
{
  const out = apply("aaa\nbbb\nccc\n", [
    { oldText: "aa", newText: "AAA" },
    { oldText: "cc", newText: "CC" },
  ]);
  check("multi-edit no merge", out, "AAAa\nbbb\nCCc\n");
}

// 5. Edit whose newText contains a newline — the old behaviour would have
//    appended the next line's residue to the first inserted line.
{
  const out = apply("head\nbody\nfoot\n", [{ oldText: "body", newText: "line1\nline2" }]);
  check("newline in replacement stays clean", out, "head\nline1\nline2\nfoot\n");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);