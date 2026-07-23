<!--
  @lib/components/focus/FocusCardHeader.svelte — Hero header for FocusCard

  Extracted from SelectedBusinessDetails.svelte (2026-08-04).
  Renders the business name, what line, role badge, and meta strip
  (city / theme / status chips).

  DOM ids/classes expected by contract tests:
    #selected-name, #selected-what, .selected-hero, #selected-role-badge
    (these are rendered by InfoPanel via SelectedBusinessDetails without a prefix;
     FocusCard passes idPrefix="fc-" so the ids become
     #fc-selected-name, #fc-selected-what, etc.)
-->
<script lang="ts">
  interface Props {
    viewModel: Record<string, any>;
    selectedCity: string;
    idPrefix?: string;
  }

  let { viewModel, selectedCity, idPrefix = '' }: Props = $props();
</script>

<div class="selected-hero">
  <div class="selected-hero-main">
    <h3 id="{idPrefix}selected-name" title={viewModel.name} aria-label={viewModel.name}>{viewModel.name}</h3>
    {#if viewModel.showFiledAs}
      <div class="selected-filed-as" id="{idPrefix}selected-filed-as">{viewModel.filedAs}</div>
    {/if}
    <div class="selected-subtitle" id="{idPrefix}selected-what">{viewModel.what}</div>
  </div>
  <div class="selected-role-badge" id="{idPrefix}selected-role-badge">{viewModel.role}</div>
</div>

<!-- Meta strip -->
<div class="selected-meta-strip" id="{idPrefix}selected-meta-strip">
  {#if viewModel.isPopulated}
    <span class="focus-stage-chip">{selectedCity}</span>
    <span class="focus-stage-chip">{viewModel.theme}</span>
    <span class="focus-stage-chip">{viewModel.status}</span>
  {/if}
</div>

<style>
  /*
   * Inner-chip overflow handling lives in this component's <style> block
   * (not css/modules/focus_stage.css) because that file is currently the
   * lane's WIP — touching it would conflict with their pending changes.
   * The override is global because .focus-stage-chip is a class used by
   * multiple surfaces (FocusCard, SelectedBusinessDetails, etc.) and the
   * underlying lane file owns the visual style.
   *
   * Long cluster names (e.g. "Professional Services & Office Support") would
   * otherwise push a single chip past its container's 100% width on mobile.
   * Clamp with ellipsis; the chip's title attribute stays for full disclosure.
   */
  :global(.focus-stage-chip) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
   * Mobile responsive pass (<=768px). Desktop keeps its existing clustered
   * grid + inline hero; these overrides only take effect on small screens so
   * the business detail panel stays usable: no horizontal overflow, readable
   * type via --mobile-type-* tokens, and tighter --space-* rhythm. Every value
   * below is a design token from docs/semantic-demo-design-tokens.md — no raw
   * hex is introduced. Selectors are scoped to this component's elements, so
   * the desktop appearance is untouched.
   */
  @media (max-width: 768px) {
    /* Hero: allow the name + role badge to wrap instead of forcing a
       horizontal scroll when either is long. */
    .selected-hero {
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
      padding-bottom: var(--space-3);
    }

    .selected-hero-main {
      gap: var(--space-1);
      min-width: 0;
    }

    .selected-hero-main h3 {
      font-size: var(--mobile-type-title);
      line-height: var(--mobile-line-tight);
    }

    .selected-subtitle {
      font-size: var(--mobile-type-body);
      line-height: var(--mobile-line-normal);
    }

    .selected-filed-as {
      font-size: var(--mobile-type-caption);
    }

    .selected-role-badge {
      font-size: var(--mobile-type-caption);
      padding: var(--space-1) var(--space-2);
    }

    /* Meta strip: wrap, never overflow the panel. */
    .selected-meta-strip {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  }
</style>
