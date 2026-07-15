/**
 * onboarding-storage.ts — shared first-visit onboarding-storage contract.
 *
 * Unifies the previously duplicated `'moco_onboarding_seen_v1'` key + writer
 * that ProximityLegend.svelte and HelpDialog.svelte both maintained privately.
 * The key string is a stable user-facing contract: changing it would reset
 * every returning user's "seen once" flag, so keep it byte-identical.
 *
 * NOTE: the two consumers decide first-visit from the stored value in
 * DIFFERENT shapes (ProximityLegend parses `{seen:true}`; HelpDialog checks
 * for any non-empty raw string), so the read logic is intentionally kept
 * inline in each component. Only the key + write are shared here.
 */

export const ONBOARDING_STORAGE_KEY = 'moco_onboarding_seen_v1';

/** Mark the first-visit onboarding as seen. SSR / private-browsing safe. */
export function markOnboardingSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
    );
  } catch {
    /* storage full / private browsing – silently ignore */
  }
}
