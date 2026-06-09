/**
 * search-results-view-model.ts
 *
 * Typed sibling of search-results-view-model.js.
 * Extracts pure view-model props for a search result item.
 */

export interface SearchResultPoint {
    name?: string;
    what?: string;
    cluster?: number;
    city?: string;
    website?: string;
    email?: string;
    phone?: string;
}

export interface SearchResultItem {
    index: number | string;
    point: SearchResultPoint | null;
    publicNote?: string;
    publicDetail?: string;
    score?: number;
}

export interface SearchRenderContext {
    trimmedQuery: string;
    topIndex?: number | null;
    anchorIndex?: number | null;
    topScore?: number;
}

export interface SearchResultFormatterDeps {
    getSearchResultStrength?: (result: SearchResultItem, topScore?: number) => number;
    getSearchResultStrengthLabel?: (order: number, strength: number) => string;
    buildSearchRankLabel?: (params: { index: number | string | null | undefined; order: number; topIndex?: number | null; anchorIndex?: number | null }) => string;
    getSearchResultCardClasses?: (order: number, isAnchor: boolean) => string;
    buildSearchResultSnippet?: (result: SearchResultItem) => string;
    describeCluster?: (cluster: number | undefined) => string;
    formatBusinessName?: (name: string | undefined) => string;
}

export interface SearchResultProps {
    index: number | string;
    order: number;
    strength: number;
    strengthLabel: string;
    rankLabel: string;
    cardClasses: string;
    snippetText: string;
    contextText: string;
    businessName: string;
    badges: string[];
}

/**
 * Extracts pure view-model props for a search result item.
 */
export function buildSearchResultProps(
    result: SearchResultItem | null,
    order: number,
    renderContext: SearchRenderContext,
    formatters: SearchResultFormatterDeps = {}
): SearchResultProps {
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

    const strength = getSearchResultStrength ? getSearchResultStrength(result!, topScore) : 14;
    const strengthLabel = getSearchResultStrengthLabel ? getSearchResultStrengthLabel(order, strength) : '';
    const isAnchor = anchorIndex !== null && anchorIndex !== undefined && result!.index === anchorIndex;
    const rankLabel = buildSearchRankLabel ? buildSearchRankLabel({ index: result!.index, order, topIndex, anchorIndex }) : '';
    const cardClasses = getSearchResultCardClasses ? getSearchResultCardClasses(order, isAnchor) : '';
    const snippetText = buildSearchResultSnippet ? buildSearchResultSnippet(result!) : '';

    const point: SearchResultPoint = result && result.point ? result.point : {};
    const clusterDesc = describeCluster ? describeCluster(point.cluster) : '';
    const cityText = point.city ? point.city.trim() : 'Location unknown';
    const contextText = clusterDesc ? `${clusterDesc} \u00B7 ${cityText}` : cityText;

    const businessName = formatBusinessName ? formatBusinessName(point.name) : (point.name || '');

    const badges: string[] = [];
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
