/**
 * @typedef {Object} SearchResultPoint
 * @property {string} [name]
 * @property {string} [what]
 * @property {number} [cluster]
 * @property {string} [city]
 * @property {string} [website]
 * @property {string} [email]
 * @property {string} [phone]
 */

/**
 * @typedef {Object} SearchResultItem
 * @property {number|string} index
 * @property {SearchResultPoint} point
 * @property {string} [publicNote]
 * @property {string} [publicDetail]
 * @property {number} [score]
 */

/**
 * @typedef {Object} SearchRenderContext
 * @property {string} trimmedQuery
 * @property {number|null} [topIndex]
 * @property {number|null} [anchorIndex]
 * @property {number} [topScore]
 */

/**
 * @typedef {Object} SearchResultFormatterDeps
 * @property {function(SearchResultItem, number): number} getSearchResultStrength
 * @property {function(number, number): string} getSearchResultStrengthLabel
 * @property {function(Object): string} buildSearchRankLabel
 * @property {function(number, boolean): string} getSearchResultCardClasses
 * @property {function(SearchResultItem): string} buildSearchResultSnippet
 * @property {function(number): string} describeCluster
 * @property {function(string): string} formatBusinessName
 */

/**
 * @typedef {Object} SearchResultProps
 * @property {number|string} index
 * @property {number} order
 * @property {number} strength
 * @property {string} strengthLabel
 * @property {string} rankLabel
 * @property {string} cardClasses
 * @property {string} snippetText
 * @property {string} contextText
 * @property {string} businessName
 * @property {string[]} badges
 */

/**
 * Extracts pure view-model props for a search result item.
 * @param {SearchResultItem} result
 * @param {number} order
 * @param {SearchRenderContext} renderContext
 * @param {SearchResultFormatterDeps} formatters
 * @returns {SearchResultProps}
 */
export function buildSearchResultProps(result, order, renderContext, formatters = {}) {
    const { topIndex, anchorIndex, topScore } = renderContext;
    const {
        getSearchResultStrength,
        getSearchResultStrengthLabel,
        buildSearchRankLabel,
        getSearchResultCardClasses,
        buildSearchResultSnippet,
        describeCluster,
        formatBusinessName
    } = formatters;

    const strength = getSearchResultStrength ? getSearchResultStrength(result, topScore) : 14;
    const strengthLabel = getSearchResultStrengthLabel ? getSearchResultStrengthLabel(order, strength) : '';
    const isAnchor = anchorIndex !== null && anchorIndex !== undefined && result.index === anchorIndex;
    const rankLabel = buildSearchRankLabel ? buildSearchRankLabel({ index: result.index, order, topIndex, anchorIndex }) : '';
    const cardClasses = getSearchResultCardClasses ? getSearchResultCardClasses(order, isAnchor) : '';
    const snippetText = buildSearchResultSnippet ? buildSearchResultSnippet(result) : '';
    
    const point = result && result.point ? result.point : {};
    const clusterDesc = describeCluster ? describeCluster(point.cluster) : '';
    const cityText = point.city ? point.city.trim() : 'Location unknown';
    const contextText = clusterDesc ? `${clusterDesc} \u00B7 ${cityText}` : cityText;
    
    const businessName = formatBusinessName ? formatBusinessName(point.name) : (point.name || '');

    const badges = [];
    if (point.website) badges.push('website');
    if (point.email) badges.push('email');
    if (point.phone) badges.push('phone');

    return {
        index: result ? result.index : 0,
        order,
        strength,
        strengthLabel,
        rankLabel,
        cardClasses,
        snippetText,
        contextText,
        businessName,
        badges
    };
}
