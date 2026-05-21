// focus-pocket-state-owner-contract.mjs
// Proves no runtime module writes state.navState.focusPocketIndices or
// state.navState.focusPocketMeta outside the focus-pocket owner API.

import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(__dirname, '..', 'js', 'modules');
const FP_PATH = join(__dirname, '..', 'js', 'modules', 'focus-pocket.js');

let failures = 0;

function listJsFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return listJsFiles(full);
        return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
    });
}

function findFunctionRange(source, functionName) {
    const signature = new RegExp(`export\\s+function\\s+${functionName}\\s*\\(`);
    const match = signature.exec(source);
    if (!match) return null;

    const start = match.index;
    const open = source.indexOf('{', start);
    if (open < 0) return null;

    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return { start, end: i + 1 };
        }
    }
    return null;
}

function offsetToLine(source, offset) {
    return source.slice(0, offset).split('\n').length;
}

const source = readFileSync(FP_PATH, 'utf8');

const ownerFunctionNames = [
    'setFocusPocketIndices',
    'clearFocusPocketIndices',
    'setFocusPocketMeta',
    'clearFocusPocketMeta',
];

const ownerRanges = ownerFunctionNames.map((name) => {
    const range = findFunctionRange(source, name);
    if (!range) {
        console.error(`FAIL: missing export function ${name}`);
        failures++;
    }
    return range;
}).filter(Boolean);

function isInsideOwnerApi(file, offset) {
    if (file !== FP_PATH) return false;
    return ownerRanges.some((range) => offset >= range.start && offset <= range.end);
}

for (const file of listJsFiles(MODULES_DIR)) {
    const fileSource = readFileSync(file, 'utf8');
    const directWrite = /state\.navState\.focusPocket(?:Indices|Meta)\s*=/g;
    let match;

    while ((match = directWrite.exec(fileSource)) !== null) {
        if (isInsideOwnerApi(file, match.index)) continue;
        const lineNum = offsetToLine(fileSource, match.index);
        const line = fileSource.split('\n')[lineNum - 1].trim();
        console.error(
            `FAIL: ${relative(join(__dirname, '..'), file)}:${lineNum} writes focus pocket state outside owner API:\n  ${line}`
        );
        failures++;
    }
}

// Verify API functions exist
const requiredExports = [
    'getFocusPocketIndices',
    'setFocusPocketIndices',
    'clearFocusPocketIndices',
    'getFocusPocketMeta',
    'setFocusPocketMeta',
    'clearFocusPocketMeta',
];

requiredExports.forEach((name) => {
    if (!source.includes(`export function ${name}`)) {
        console.error(`FAIL: missing export function ${name}`);
        failures++;
    }
});

// Verify applyLocalNeighborhoodFocus is still exported
if (!source.includes('export function applyLocalNeighborhoodFocus')) {
    console.error('FAIL: applyLocalNeighborhoodFocus is not exported');
    failures++;
}

// Verify the API comment header is present
if (!source.includes('// === Focus Pocket Owner API ===')) {
    console.error('FAIL: owner API header comment is missing');
    failures++;
}

if (failures === 0) {
    console.log('PASS: no module writes state.navState.focusPocket(Indices|Meta) outside the focus-pocket owner API');
    console.log(`  - Owner API functions: ${requiredExports.join(', ')}`);
    console.log(`  - Scanned JS modules under ${relative(join(__dirname, '..'), MODULES_DIR)}`);
    process.exit(0);
} else {
    console.error(`\n${failures} failure(s) found`);
    process.exit(1);
}
