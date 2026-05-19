#!/usr/bin/env node
/**
 * Tiny runner: change to semantic-demo directory then execute a test script.
 * Usage: node run-from-semantic-demo.cjs <script-name> [--arg ...]
 *   e.g. node run-from-semantic-demo.cjs cache-buster-check.js
 *        node run-from-semantic-demo.cjs surface-contract-check.mjs --surface=mobile-idle
 *
 * Supports both .js (CommonJS or ESM with top-level import) and .mjs files.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Resolve the semantic-demo directory (parent of tests/)
const testsDir = __dirname;
const semDemoDir = path.dirname(testsDir);  // .../public_html/semantic-demo

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node run-from-semantic-demo.cjs <script> [-- arg ...]');
  process.exit(1);
}

const scriptName = args[0];
const scriptPath = path.join(testsDir, scriptName);
const scriptUrl = pathToFileURL(scriptPath).href;

// Change working directory so relative paths resolve correctly
process.chdir(semDemoDir);

const ext = path.extname(scriptName);
if (ext === '.mjs' || ext === '.js') {
  // Use dynamic import (works for both ESM and hybrid .js files).
  // Strip '--' sentinel before passing args so target script's process.argv
  // does not receive it as a positional URL.
  const targetArgs = args.slice(1).filter((a) => a !== '--');
  if (targetArgs.length) {
    process.argv = [process.argv[0], scriptName, ...targetArgs];
  }
  import(scriptUrl)
    .then(() => { /* runner exits via process.exit */ })
    .catch((err) => {
      console.error(`Error running ${scriptName}:`, err.message);
      process.exit(1);
    });
} else {
  console.error(`Unsupported file type: ${ext} (only .js and .mjs are supported)`);
  process.exit(1);
}
