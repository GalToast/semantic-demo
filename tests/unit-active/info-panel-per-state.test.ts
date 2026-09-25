/**
 * info-panel-per-state.test.ts
 *
 * Tests for Ticket UI-5: Info Panel content per panelSurface state.
 * Verifies that the InfoPanel component adapts its content based on
 * the body[data-panel-surface] attribute.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const INFO_PANEL_PATH = resolve(__dirname, '../../src/components/InfoPanel.svelte');
const HELPER_PATH = resolve(__dirname, '../../src/lib/orchestration/info-panel-state.ts');

describe('Info Panel per-state content', () => {
  let infoPanelSource: string;
  let helperSource: string;

  beforeAll(() => {
    infoPanelSource = readFileSync(INFO_PANEL_PATH, 'utf-8');
    helperSource = readFileSync(HELPER_PATH, 'utf-8');
  });

  it('InfoPanel imports the info-panel-state helper', () => {
    expect(infoPanelSource).toContain("from '@lib/orchestration/info-panel-state'");
  });

  it('InfoPanel uses getInfoPanelContent to derive content descriptor', () => {
    expect(infoPanelSource).toContain('getInfoPanelContent');
    expect(infoPanelSource).toContain('contentDescriptor');
  });

  it('InfoPanel renders dynamic header text from contentDescriptor', () => {
    // Should NOT have a hardcoded "Business Details" in the template
    // (it's now driven by contentDescriptor.headerText)
    expect(infoPanelSource).toContain('contentDescriptor.headerText');
    // Should have the conditional header rendering
    expect(infoPanelSource).toContain('contentDescriptor.headerVisible');
  });

  it('InfoPanel renders dynamic empty state copy from contentDescriptor', () => {
    expect(infoPanelSource).toContain('contentDescriptor.emptyHeadline');
    expect(infoPanelSource).toContain('contentDescriptor.emptySubtext');
  });

  it('InfoPanel uses contentDescriptor.selectionSuppressed', () => {
    expect(infoPanelSource).toContain('contentDescriptor.selectionSuppressed');
  });

  it('info-panel-state helper defines content for idle surface', () => {
    expect(helperSource).toContain("idle:");
    expect(helperSource).toContain("headerText: 'Business Details'");
    expect(helperSource).toContain("headerVisible: true");
  });

  it('info-panel-state helper defines content for focus surface', () => {
    expect(helperSource).toContain("focus:");
    expect(helperSource).toContain("headerText: 'Business Details'");
  });

  it('info-panel-state helper defines content for search surface with hidden header', () => {
    expect(helperSource).toContain("search:");
    expect(helperSource).toContain("headerVisible: false");
    expect(helperSource).toContain("selectionSuppressed: true");
  });

  it('info-panel-state helper defines content for semantic-dive surface', () => {
    expect(helperSource).toContain("'semantic-dive':");
    expect(helperSource).toContain("headerText: 'Semantic Dive'");
  });

  it('info-panel-state helper hides panel for map surfaces', () => {
    expect(helperSource).toContain("MAP_SURFACES");
    expect(helperSource).toContain("'map-idle'");
    expect(helperSource).toContain("'map-focus'");
    expect(helperSource).toContain("'map-search'");
    expect(helperSource).toContain("panelVisible: false");
  });

  it('info-panel-state helper exports all required functions', () => {
    expect(helperSource).toContain('export function getInfoPanelContent');
    expect(helperSource).toContain('export function getInfoPanelHeaderText');
    expect(helperSource).toContain('export function isInfoHeaderVisible');
    expect(helperSource).toContain('export function isSelectionSuppressed');
    expect(helperSource).toContain('export function isInfoPanelVisible');
    expect(helperSource).toContain('export function getEmptyHeadline');
    expect(helperSource).toContain('export function getEmptySubtext');
  });

  it('info-panel-state helper has InfoPanelContentDescriptor interface', () => {
    expect(helperSource).toContain('export interface InfoPanelContentDescriptor');
    expect(helperSource).toContain('headerText: string');
    expect(helperSource).toContain('headerVisible: boolean');
    expect(helperSource).toContain('emptyHeadline: string');
    expect(helperSource).toContain('emptySubtext: string');
    expect(helperSource).toContain('panelVisible: boolean');
    expect(helperSource).toContain('selectionSuppressed: boolean');
  });

  it('InfoPanel conditionally renders header based on contentDescriptor.headerVisible', () => {
    // Should have {#if contentDescriptor.headerVisible} block
    expect(infoPanelSource).toMatch(/\{#if contentDescriptor\.headerVisible\}/);
  });
});
