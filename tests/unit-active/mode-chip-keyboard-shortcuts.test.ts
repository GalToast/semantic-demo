/**
 * mode-chip-keyboard-shortcuts.test.ts
 *
 * A2-4: Ctrl/Cmd+1 through Ctrl/Cmd+6 keyboard shortcuts enable mode switching
 * from anywhere in the app without trapping keyboard users in a single mode.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = resolve(import.meta.dirname, '../../src/App.svelte');
const HEADER = resolve(import.meta.dirname, '../../src/components/Header.svelte');

function readApp(): string {
  return readFileSync(APP, 'utf-8');
}

function readHeader(): string {
  return readFileSync(HEADER, 'utf-8');
}

describe('A2-4: Ctrl+1-6 keyboard shortcuts for mode switching', () => {
  const appSrc = readApp();
  const headerSrc = readHeader();

  it('has a Ctrl/Cmd+1-6 handler block in App.svelte', () => {
    expect(appSrc).toContain('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
  });

  it('skips shortcuts when user is typing in an input/textarea/select', () => {
    // The handler checks isFormField before dispatching
    expect(appSrc).toMatch(/if\s*\(\s*isFormField\s*\)\s*return/);
  });

  it('skips shortcuts when target is contentEditable', () => {
    // isFormField is computed from tagName + isContentEditable
    expect(appSrc).toContain("target?.isContentEditable === true");
  });

  it('prevents default browser behavior on shortcut match', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const returnIdx = appSrc.indexOf('return;', shortcutIdx + 100);
    const block = appSrc.slice(shortcutIdx, returnIdx);
    expect(block).toContain('e.preventDefault()');
  });

  it('maps Ctrl+1 to RETURN_OVERVIEW', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const block = appSrc.slice(shortcutIdx, shortcutIdx + 800);
    expect(block).toContain("case '1'");
    expect(block).toContain('NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW');
  });

  it('maps Ctrl+2 to SET_SURFACE with search', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const block = appSrc.slice(shortcutIdx, shortcutIdx + 800);
    expect(block).toContain("case '2'");
    expect(block).toContain("surface: 'search'");
    expect(block).toContain('NAV_TRANSITION_ACTIONS.SET_SURFACE');
  });

  it('maps Ctrl+3 to SET_SURFACE with trail', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const block = appSrc.slice(shortcutIdx, shortcutIdx + 800);
    expect(block).toContain("case '3'");
    expect(block).toContain("surface: 'trail'");
  });

  it('maps Ctrl+4 to SET_SURFACE with focus', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const block = appSrc.slice(shortcutIdx, shortcutIdx + 800);
    expect(block).toContain("case '4'");
    expect(block).toContain("surface: 'focus'");
  });

  it('maps Ctrl+5 to SET_SURFACE with inside', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const block = appSrc.slice(shortcutIdx, shortcutIdx + 800);
    expect(block).toContain("case '5'");
    expect(block).toContain("surface: 'inside'");
  });

  it('maps Ctrl+6 to SET_VIEW map + SET_SURFACE map (matching Header.selectMode)', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const block = appSrc.slice(shortcutIdx, shortcutIdx + 1000);
    expect(block).toContain("case '6'");
    expect(block).toContain("view: 'map'");
    expect(block).toContain("surface: 'map'");
    // Must dispatch both SET_VIEW and SET_SURFACE for Map mode
    const case6Idx = block.indexOf("case '6'");
    const case6Block = block.slice(case6Idx, case6Idx + 200);
    expect(case6Block).toContain('NAV_TRANSITION_ACTIONS.SET_VIEW');
    expect(case6Block).toContain('NAV_TRANSITION_ACTIONS.SET_SURFACE');
  });

  it('shortcut handler fires BEFORE the Escape handler', () => {
    const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)');
    const escapeIdx = appSrc.indexOf("e.key === 'Escape'");
    expect(shortcutIdx).toBeLessThan(escapeIdx);
  });

  it('mode-chips radiogroup has aria-keyshortcuts including Control+1-6', () => {
    expect(headerSrc).toMatch(/aria-keyshortcuts="[^"]*Control\+1[^"]*Control\+6[^"]*"/);
  });

  it('aria-keyshortcuts preserves existing Arrow/Home/End shortcuts', () => {
    expect(headerSrc).toMatch(/aria-keyshortcuts="[^"]*ArrowUp[^"]*ArrowDown[^"]*Home[^"]*End[^"]*"/);
  });
});
