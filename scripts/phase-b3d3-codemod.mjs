#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');

const CSS_FILES = [
    'css/mobile_premium__focus-dive.css',
    'css/mobile_premium__surfaces.css',
    'css/mobile_premium__chrome.css',
    'css/mobile_premium__narrow.css',
    'css/mobile_premium__state.css',
    'css/mobile_premium__idle.css',
    'css/modules/focus_stage.css',
    'css/shell.css',
    'css/journey_active.css',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

let totalReplacements = 0;
let filesChanged = 0;

for (const relPath of CSS_FILES) {
    const fullPath = resolve(projectRoot, relPath);
    let src;
    try {
        src = readFileSync(fullPath, 'utf8');
    } catch (e) {
        console.log(`  SKIP (not found): ${relPath}`);
        continue;
    }
    // Match body.is-active followed by non-word char or end
    const actualMatches = (src.match(/body\.is-active(?![a-zA-Z0-9_-])/g) || []).length;
    if (actualMatches === 0) {
        console.log(`  ${relPath}: 0 matches (no-op)`);
        continue;
    }
    const out = src.replace(/body\.is-active(?![a-zA-Z0-9_-])/g, 'body:not(.surface-idle)');
    filesChanged++;
    totalReplacements += actualMatches;
    console.log(`  ${relPath}: ${actualMatches} replacements`);
    if (!DRY_RUN) writeFileSync(fullPath, out, 'utf8');
}

console.log(`\nTotal: ${totalReplacements} replacements across ${filesChanged} files`);
console.log(DRY_RUN ? '(DRY RUN)' : '(FILES WRITTEN)');
