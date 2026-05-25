/**
 * design-token-doc-contract.mjs
 *
 * Fast static guard for the human-readable design token sheet. css/base.css
 * remains the implementation source of truth; docs/semantic-demo-design-tokens.md
 * must mention every root custom property so token changes cannot silently drift
 * away from the documented design system.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const basePath = 'css/base.css';
const tokenDocPath = 'docs/semantic-demo-design-tokens.md';
const failures = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath} is missing`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function rootBlock(cssText) {
  const css = stripComments(cssText);
  const rootStart = css.search(/:root\s*\{/);
  if (rootStart === -1) {
    failures.push(`${basePath} must define a :root token block`);
    return '';
  }

  const openBrace = css.indexOf('{', rootStart);
  let depth = 0;
  for (let index = openBrace; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return css.slice(openBrace + 1, index);
    }
  }

  failures.push(`${basePath} has an unterminated :root token block`);
  return '';
}

function rootTokens(cssText) {
  const block = rootBlock(cssText);
  return [...block.matchAll(/^\s*(--[A-Za-z0-9-]+)\s*:/gm)]
    .map((match) => match[1])
    .sort((a, b) => a.localeCompare(b));
}

function documentedTableTokens(markdownText) {
  return [...markdownText.matchAll(/^\|\s*`([^`]+)`/gm)]
    .flatMap((match) => [...match[1].matchAll(/--[A-Za-z0-9-]+/g)].map((tokenMatch) => tokenMatch[0]))
    .sort((a, b) => a.localeCompare(b));
}

const baseCss = read(basePath);
const tokenDoc = read(tokenDocPath);
const tokens = rootTokens(baseCss);
const documentedTokens = documentedTableTokens(tokenDoc);
const missingFromDoc = tokens.filter((token) => !tokenDoc.includes(token));
const missingFromCss = documentedTokens.filter((token) => !tokens.includes(token));

if (!tokenDoc.includes('css/base.css')) {
  failures.push(`${tokenDocPath} must identify css/base.css as the implementation source of truth`);
}

if (!tokenDoc.includes('semantic-demo.css') || !tokenDoc.includes('import shell')) {
  failures.push(`${tokenDocPath} must state that semantic-demo.css is only an import shell`);
}

if (!tokenDoc.includes('Safe-area comfort should be handled with internal padding or content insets')) {
  failures.push(`${tokenDocPath} must document bottom-sheet safe-area policy`);
}

if (!tokenDoc.includes('Avoid `!important`')) {
  failures.push(`${tokenDocPath} must document the !important policy`);
}

if (missingFromDoc.length) {
  failures.push(
    `${tokenDocPath} is missing ${missingFromDoc.length} root token(s) from ${basePath}: ${missingFromDoc.join(', ')}`
  );
}

if (missingFromCss.length) {
  failures.push(
    `${tokenDocPath} documents ${missingFromCss.length} token(s) not defined in ${basePath}: ${missingFromCss.join(', ')}`
  );
}

if (failures.length) {
  console.error('Design token documentation contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Design token documentation contract passed: ${tokens.length} root tokens documented.`);
