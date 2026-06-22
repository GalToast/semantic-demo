/**
 * @/lib/orchestration/cluster-metadata.ts
 *
 * Single source of truth for the cluster taxonomy used by the orchestration
 * layer: 21 distinct cluster categories with paired display colors. This
 * schema is the one consumed by cluster-filter-controller, the search
 * engine's mock fallback, and any new code that needs to map a cluster
 * index to a name or color.
 *
 * Schema history (worth knowing):
 *
 *   - The legacy 15-entry schema (Food & Dining, Retail & Shopping, ...)
 *     still lives in three Svelte components as local const arrays:
 *       src/components/FocusCard.svelte:53
 *       src/components/InfoPanel.svelte:50
 *       src/components/Legend.svelte:25
 *     Those local arrays are scoped to a single component each and use a
 *     different (older) taxonomy. Migrating them to this canonical schema
 *     is a UI behavior change and is tracked separately (W47+ follow-up:
 *     reconcile legacy 15-entry component labels with canonical 21-entry).
 *
 *   - Before W47, these arrays lived inline in cluster-filter-controller.ts.
 *     Extracting them here gives the 21-entry taxonomy a discoverable home
 *     and lets cluster-filter-controller.ts shrink by ~30 lines.
 *
 * Invariants (enforced by w46-c3-orchestration-bulk-fill.test.ts):
 *
 *   - CLUSTER_COLORS.length === CLUSTER_NAMES.length (must always be 1:1)
 *   - Length must equal 21 (the canonical taxonomy count)
 *   - All entries are non-empty strings
 *
 * Adding or renaming a cluster here propagates to:
 *   - cluster-filter-controller.ts (via re-export)
 *   - Any future consumer that imports from this module directly
 */

export const CLUSTER_COLORS: readonly string[] = [
    '#4ecdc4',
    '#ff6b6b',
    '#ffe66d',
    '#a8e6cf',
    '#ffd3b6',
    '#c7ceea',
    '#f8b500',
    '#7dd3fc',
    '#fda4af',
    '#a5f3fc',
    '#fdba74',
    '#bfdbfe',
    '#fecaca',
    '#d8b4fe',
    '#bbf7d0',
    '#fef08a',
    '#bae6fd',
    '#e9d5ff',
    '#fde68a',
    '#fed7aa',
    '#ddd6fe'
] as const

export const CLUSTER_NAMES: readonly string[] = [
    'General Business',
    'Professional Services',
    'Food & Hospitality',
    'Construction & Trades',
    'Retail & Shops',
    'Beauty & Wellness',
    'Real Estate & Property',
    'Industrial & Logistics',
    'Agriculture & Ranching',
    'Automotive',
    'Healthcare & Medical',
    'Therapy & Counseling',
    'Education & Childcare',
    'Churches',
    'Faith Ministries',
    'Community Nonprofits',
    'Foundations',
    'Arts & Culture',
    'Economic Development',
    'Public Agencies',
    'Enterprise Brands'
] as const