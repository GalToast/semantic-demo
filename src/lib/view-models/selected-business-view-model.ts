/**
 * src/lib/view-models/selected-business-view-model.ts
 *
 * Pure view-model extraction for the selected business card.
 * Faithful TS port of js/modules/view-models/selected-business-view-model.ts.
 *
 * Import from src/ only — no brittle cross-track imports from js/modules/.
 */

import type { BusinessNamePresentation } from '../utils/dom-formatters';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BusinessPoint {
  name?: string;
  what?: string;
  cluster?: number;
  status?: string;
  city?: string;
  website?: string;
  email?: string;
  phone?: string;
  lat?: number;
  lng?: number;
  weather_sensitive?: boolean;
  sensitivity_flags?: string[];
  [key: string]: unknown;
}

export interface NamePresentation {
  display: string;
  raw: string | null;
  showRaw: boolean;
}

export interface SelectedCardAdapter {
  getSelectedBusinessRoleLabel?: (point: BusinessPoint) => string;
  getInterestingBusinessNote?: (point: BusinessPoint) => string;
  buildSelectedMatchNarrative?: (point: BusinessPoint) => string;
  describeThreadLensForPoint?: (point: BusinessPoint) => string;
}

export interface CopyBundle {
  selectedEmptyName?: string;
  selectedEmptyWhat?: string;
  selectedEmptyRole?: string;
  selectedEmptyTheme?: string;
  selectedEmptyStatus?: string;
  selectedEmptyMap?: string;
  selectedEmptyThread?: string;
  selectedFiledAs?: (raw: string) => string;
  [key: string]: unknown;
}

export interface FormatterDependencies {
  getBusinessNamePresentation: (name: string) => BusinessNamePresentation;
  sanitizePublicFacingNote: (note: string) => string;
  describeCluster: (cluster: number | undefined) => string;
  getPublicRecordStatusLabel: (status: string) => string;
  COPY: CopyBundle;
}

export interface FactItem {
  type: string;
  value?: string;
  label?: string;
  href?: string;
  isExternal?: boolean;
}

export interface SensitivityBadge {
  class: string;
  text: string;
}

export interface SelectedBusinessProps {
  name: string;
  filedAs: string;
  showFiledAs: boolean;
  what: string;
  role: string;
  theme: string;
  status: string;
  trivia: string;
  showTrivia: boolean;
  matchNarrative: string;
  showMatchPanel: boolean;
  facts: FactItem[];
  sensitivityBadges: SensitivityBadge[];
  mapText: string;
  threadText: string;
  isPopulated: boolean;
}

// ── View Model ────────────────────────────────────────────────────────────────

/**
 * Extracts pure view-model props for the selected business card.
 *
 * Faithful port of the legacy `buildSelectedBusinessProps`.
 * When `point` is null, returns empty defaults (no-op state).
 * When `point` is provided, derives all display fields from the point data.
 *
 * @param point - The selected 3D point/business data, or null for empty state
 * @param _options - Reserved for future use (legacy compat)
 * @param adapter - Optional adapter for role label, trivia, narrative, thread lens
 * @param formatters - Required formatter functions and COPY bundle
 * @returns SelectedBusinessProps ready for template rendering
 */
export function buildSelectedBusinessProps(
  point: BusinessPoint | null,
  _options: Record<string, unknown> = {},
  adapter: SelectedCardAdapter = {},
  formatters: Partial<FormatterDependencies> = {}
): SelectedBusinessProps {
  const {
    getBusinessNamePresentation,
    sanitizePublicFacingNote,
    describeCluster,
    getPublicRecordStatusLabel,
    COPY = {} as CopyBundle
  } = formatters;

  if (!point) {
    return {
      name: COPY.selectedEmptyName || 'Business Name',
      filedAs: '',
      showFiledAs: false,
      what: COPY.selectedEmptyWhat || 'What they do',
      role: COPY.selectedEmptyRole || 'Record',
      theme: COPY.selectedEmptyTheme || 'Theme',
      status: COPY.selectedEmptyStatus || 'Record status',
      trivia: '',
      showTrivia: false,
      matchNarrative: '',
      showMatchPanel: false,
      facts: [],
      sensitivityBadges: [],
      mapText: COPY.selectedEmptyMap || 'No geocoded point yet',
      threadText: COPY.selectedEmptyThread || 'Waiting for a related path.',
      isPopulated: false
    };
  }

  const namePresentation: NamePresentation = getBusinessNamePresentation
    ? getBusinessNamePresentation(point.name ?? '')
    : { display: point.name || '', raw: null, showRaw: false };
  const isEmptyRaw = !namePresentation.raw || namePresentation.raw === '-' || namePresentation.raw.trim() === '';
  const showFiledAs = Boolean(namePresentation.showRaw && !isEmptyRaw);
  const filedAsCopy = COPY && COPY.selectedFiledAs
    ? COPY.selectedFiledAs(namePresentation.raw ?? '')
    : `Filed as ${namePresentation.raw ?? ''}`;

  const what = sanitizePublicFacingNote
    ? sanitizePublicFacingNote(point.what ?? '')
    : (point.what || '');
  const defaultWhat = what || 'Montgomery County business record';

  const role = (adapter && typeof adapter.getSelectedBusinessRoleLabel === 'function')
    ? adapter.getSelectedBusinessRoleLabel(point)
    : (COPY.selectedEmptyRole || 'Record');

  const theme = describeCluster ? describeCluster(point.cluster) : '';
  const status = getPublicRecordStatusLabel
    ? getPublicRecordStatusLabel(point.status ?? '')
    : '';

  const interestingNote = (adapter && typeof adapter.getInterestingBusinessNote === 'function')
    ? adapter.getInterestingBusinessNote(point)
    : '';
  const matchNarrative = (adapter && typeof adapter.buildSelectedMatchNarrative === 'function')
    ? adapter.buildSelectedMatchNarrative(point)
    : '';
  const showTrivia = Boolean(interestingNote && !matchNarrative.includes(interestingNote));
  const showMatchPanel = Boolean(matchNarrative);

  const facts: FactItem[] = [];
  if (point.city) facts.push({ type: 'text', value: point.city });
  if (point.website) {
    const websiteLabel = point.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const href = point.website.match(/^https?:\/\//) ? point.website : `https://${point.website}`;
    facts.push({ type: 'link', label: websiteLabel, href, isExternal: true });
  }
  if (point.email) facts.push({ type: 'link', label: point.email, href: `mailto:${point.email}`, isExternal: false });
  if (point.phone) facts.push({ type: 'link', label: point.phone, href: `tel:${point.phone}`, isExternal: false });

  const sensitivityBadges: SensitivityBadge[] = [];
  if (point.weather_sensitive) {
    sensitivityBadges.push({ class: 'weather', text: 'Weather Sensitive' });
  }
  if (Array.isArray(point.sensitivity_flags) && point.sensitivity_flags.length) {
    point.sensitivity_flags.forEach((flag: string) => {
      sensitivityBadges.push({ class: 'flag', text: flag });
    });
  }

  let mapText = 'No geocoded point';
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    mapText = `Mapped at ${point.lat!.toFixed(4)}, ${point.lng!.toFixed(4)}`;
  }

  let threadText = '';
  if (adapter && typeof adapter.describeThreadLensForPoint === 'function') {
    threadText = adapter.describeThreadLensForPoint(point) || '';
  }

  return {
    name: namePresentation.display || COPY.selectedEmptyName || '',
    filedAs: showFiledAs ? filedAsCopy : '',
    showFiledAs,
    what: defaultWhat,
    role,
    theme,
    status,
    trivia: showTrivia ? interestingNote : '',
    showTrivia,
    matchNarrative,
    showMatchPanel,
    facts,
    sensitivityBadges,
    mapText,
    threadText,
    isPopulated: true
  };
}
