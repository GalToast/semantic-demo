/**
 * utils-contract.mjs
 * Node/static contract test for changed formatter functions.
 *
 * Tests the four changed functions without browser dependencies.
 * Run: node tests/utils-contract.mjs  (from semantic-demo root)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    cleanPublicNoteText,
    getBusinessNamePresentation,
    sanitizePublicFacingNote
} from '../js/utils.js';

const CWD = process.cwd();
const formatterPath = resolve(CWD, 'js/modules/utils/dom-formatters.js');

// --------------------------------------------------------------------------
// Load and parse source
// --------------------------------------------------------------------------
const src = readFileSync(formatterPath, 'utf8');

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
const checks = [];

checks.push({
    name: 'source: compactSnippetText export removed',
    pass: !src.includes('export function compactSnippetText')
});
checks.push({
    name: 'source: humanizeSnippetCase export removed',
    pass: !src.includes('export function humanizeSnippetCase')
});
checks.push({
    name: 'source: sanitizePublicFacingNote no longer declares point parameter',
    pass: src.includes('export function sanitizePublicFacingNote(value) {')
});

// --- cleanPublicNoteText ---

checks.push({
    name: 'cleanPublicNoteText: bullet-only dash is stripped',
    pass: cleanPublicNoteText('- leading dash') === 'leading dash'
});
checks.push({
    name: 'cleanPublicNoteText: asterisk bullet is stripped',
    pass: cleanPublicNoteText('* leading asterisk') === 'leading asterisk'
});
checks.push({
    name: 'cleanPublicNoteText: bullet char (•) is NOT stripped (regression)',
    pass: cleanPublicNoteText('• leading bullet') === '• leading bullet'
});
checks.push({
    name: 'cleanPublicNoteText: legal name prefix stripped',
    pass: cleanPublicNoteText('Legal Name: Acme Corp') === 'Acme Corp'
});
checks.push({
    name: 'cleanPublicNoteText: semicolon trimmed',
    pass: cleanPublicNoteText('Acme Corp; extra') === 'Acme Corp'
});
checks.push({
    name: 'cleanPublicNoteText: double spaces normalized',
    pass: cleanPublicNoteText('Acme  Corp') === 'Acme Corp'
});
checks.push({
    name: 'cleanPublicNoteText: heading markers stripped',
    pass: cleanPublicNoteText('## Acme Corp') === 'Acme Corp'
});
checks.push({
    name: 'cleanPublicNoteText: terminal punctuation spacing fixed',
    pass: cleanPublicNoteText('Acme Corp ,') === 'Acme Corp,'
});

// --- sanitizePublicFacingNote ---

checks.push({
    name: 'sanitizePublicFacingNote: private research blocked',
    pass: sanitizePublicFacingNote('Qualified candidate record here') === ''
});
checks.push({
    name: 'sanitizePublicFacingNote: empty string returns empty',
    pass: sanitizePublicFacingNote('') === ''
});
checks.push({
    name: 'sanitizePublicFacingNote: null returns empty',
    pass: sanitizePublicFacingNote(null) === ''
});
checks.push({
    name: 'sanitizePublicFacingNote: plain text passes through',
    pass: sanitizePublicFacingNote('A clean business note') === 'A clean business note'
});
checks.push({
    name: 'sanitizePublicFacingNote: legal name prefix stripped',
    pass: sanitizePublicFacingNote('Legal Name: Acme Corp') === 'Acme Corp'
});
checks.push({
    name: 'sanitizePublicFacingNote: no second-arg point dependency (to verify old call signature still works)',
    pass: sanitizePublicFacingNote('some note', { city: 'Conroe' }) === 'some note'
});

// --- getBusinessNamePresentation ---

checks.push({
    name: 'getBusinessNamePresentation: all-uppercase tokens > 3 chars title-case per mixed-case rule',
    pass: getBusinessNamePresentation('ACME CORP SERVICES').display === 'ACME CORP Services'
});
checks.push({
    name: 'getBusinessNamePresentation: LLC preserved uppercase',
    pass: getBusinessNamePresentation('Acme LLC').display === 'Acme LLC'
});
checks.push({
    name: 'getBusinessNamePresentation: apostrophe separator titlecased (THE FIX)',
    pass: getBusinessNamePresentation("O'Reilly Plumbing").display === "O'Reilly Plumbing"
});
checks.push({
    name: 'getBusinessNamePresentation: dash-separated slug normalized',
    pass: getBusinessNamePresentation('acme-plumbing-llc').display === 'Acme Plumbing LLC'
});
checks.push({
    name: 'getBusinessNamePresentation: numeric prefix stripped',
    pass: getBusinessNamePresentation('123456_acme-llc').display === 'Acme LLC'
});
checks.push({
    name: 'getBusinessNamePresentation: unknown on null input',
    pass: getBusinessNamePresentation(null).display === 'Unknown business'
});
checks.push({
    name: 'getBusinessNamePresentation: unknown on empty string',
    pass: getBusinessNamePresentation('').display === 'Unknown business'
});
checks.push({
    name: 'getBusinessNamePresentation: parentheses-boundary name titlecased',
    pass: getBusinessNamePresentation('acme (plumbing) services').display === 'Acme (Plumbing) Services'
});

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------
const passed = checks.filter(c => c.pass).length;
const failed = checks.filter(c => !c.pass).length;
const total = checks.length;

console.log('\n=== utils.js contract results ===\n');
checks.forEach(c => {
    const icon = c.pass ? '  PASS' : '  FAIL';
    console.log(`${icon}  ${c.name}`);
});
console.log(`\n${passed}/${total} checks passed.\n`);

if (failed > 0) {
    console.error(`FAILED: ${failed} checks. Review above.\n`);
    process.exit(1);
} else {
    console.log('All checks passed.\n');
    process.exit(0);
}
