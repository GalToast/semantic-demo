/**
 * @typedef {Object} BusinessPoint
 * @property {string} [name]
 * @property {string} [what]
 * @property {number} [cluster]
 * @property {string} [status]
 * @property {string} [city]
 * @property {string} [website]
 * @property {string} [email]
 * @property {string} [phone]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {boolean} [weather_sensitive]
 * @property {string[]} [sensitivity_flags]
 */

/**
 * @typedef {Object} SelectedCardAdapter
 * @property {function(BusinessPoint): string} [getSelectedBusinessRoleLabel]
 * @property {function(BusinessPoint): string} [getInterestingBusinessNote]
 * @property {function(BusinessPoint): string} [buildSelectedMatchNarrative]
 * @property {function(BusinessPoint): string} [describeThreadLensForPoint]
 */

/**
 * @typedef {Object} FormatterDependencies
 * @property {function(string): {display: string, raw: string, showRaw: boolean}} getBusinessNamePresentation
 * @property {function(string): string} sanitizePublicFacingNote
 * @property {function(number): string} describeCluster
 * @property {function(string): string} getPublicRecordStatusLabel
 * @property {Object} COPY
 */

/**
 * @typedef {Object} SelectedBusinessProps
 * @property {string} name
 * @property {string} filedAs
 * @property {boolean} showFiledAs
 * @property {string} what
 * @property {string} role
 * @property {string} theme
 * @property {string} status
 * @property {string} trivia
 * @property {boolean} showTrivia
 * @property {Object[]} facts
 * @property {Object[]} sensitivityBadges
 * @property {string} mapText
 * @property {string} threadText
 * @property {boolean} isPopulated
 */

/**
 * Extracts pure view-model props for the selected business card.
 * @param {BusinessPoint|null} point
 * @param {Object} _options
 * @param {SelectedCardAdapter} adapter
 * @param {FormatterDependencies} formatters
 * @returns {SelectedBusinessProps}
 */
export function buildSelectedBusinessProps(point, _options = {}, adapter = {}, formatters = {}) {
    const {
        getBusinessNamePresentation,
        sanitizePublicFacingNote,
        describeCluster,
        getPublicRecordStatusLabel,
        COPY = {}
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
            facts: [],
            sensitivityBadges: [],
            mapText: COPY.selectedEmptyMap || 'No geocoded point yet',
            threadText: COPY.selectedEmptyThread || 'Waiting for a related path.',
            isPopulated: false
        };
    }

    const namePresentation = getBusinessNamePresentation ? getBusinessNamePresentation(point.name) : { display: point.name || '', raw: '', showRaw: false };
    const isEmptyRaw = !namePresentation.raw || namePresentation.raw === '-' || namePresentation.raw.trim() === '';
    const showFiledAs = Boolean(namePresentation.showRaw && !isEmptyRaw);
    const filedAsCopy = COPY && COPY.selectedFiledAs ? COPY.selectedFiledAs(namePresentation.raw) : `Filed as ${namePresentation.raw}`;

    const what = sanitizePublicFacingNote ? sanitizePublicFacingNote(point.what) : (point.what || '');
    const defaultWhat = what || 'Montgomery County business record';

    const role = (adapter && typeof adapter.getSelectedBusinessRoleLabel === 'function')
        ? adapter.getSelectedBusinessRoleLabel(point)
        : (COPY.selectedEmptyRole || 'Record');

    const theme = describeCluster ? describeCluster(point.cluster) : '';
    const status = getPublicRecordStatusLabel ? getPublicRecordStatusLabel(point.status) : '';

    const interestingNote = (adapter && typeof adapter.getInterestingBusinessNote === 'function') ? adapter.getInterestingBusinessNote(point) : '';
    const matchNarrative = (adapter && typeof adapter.buildSelectedMatchNarrative === 'function') ? adapter.buildSelectedMatchNarrative(point) : '';
    const showTrivia = Boolean(interestingNote && !matchNarrative.includes(interestingNote));

    const facts = [];
    if (point.city) facts.push({ type: 'text', value: point.city });
    if (point.website) {
        const websiteLabel = point.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const href = point.website.match(/^https?:\/\//) ? point.website : `https://${point.website}`;
        facts.push({ type: 'link', label: websiteLabel, href, isExternal: true });
    }
    if (point.email) facts.push({ type: 'link', label: point.email, href: `mailto:${point.email}`, isExternal: false });
    if (point.phone) facts.push({ type: 'link', label: point.phone, href: `tel:${point.phone}`, isExternal: false });

    const sensitivityBadges = [];
    if (point.weather_sensitive) {
        sensitivityBadges.push({ class: 'weather', text: 'Weather Sensitive' });
    }
    if (Array.isArray(point.sensitivity_flags) && point.sensitivity_flags.length) {
        point.sensitivity_flags.forEach((flag) => {
            sensitivityBadges.push({ class: 'flag', text: flag });
        });
    }

    let mapText = 'No geocoded point';
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
        mapText = `Mapped at ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
    }

    let threadText = '';
    if (adapter && typeof adapter.describeThreadLensForPoint === 'function') {
        threadText = adapter.describeThreadLensForPoint(point) || '';
    }

    return {
        name: namePresentation.display || COPY.selectedEmptyName,
        filedAs: showFiledAs ? filedAsCopy : '',
        showFiledAs,
        what: defaultWhat,
        role,
        theme,
        status,
        trivia: showTrivia ? interestingNote : '',
        showTrivia,
        facts,
        sensitivityBadges,
        mapText,
        threadText,
        isPopulated: true
    };
}
