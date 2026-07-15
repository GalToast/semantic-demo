<!--
  CompassActionButton.svelte — extracted from JourneyCompass.svelte (W52).
  Renders one of the three journey action buttons (primary/secondary/
  tertiary). Props are fully resolved by the parent (state, label,
  data-*, a11y, onclick); the child is a pure prop-driven renderer.
  All ids/classes/data-*/aria attrs are byte-identical to the original
  source block.
-->
<script lang="ts">

  interface Props {
    /** Which button slot: primary | secondary | tertiary. */
    role: 'primary' | 'secondary' | 'tertiary';
    hidden: boolean;
    ariaDisabled: boolean;
    ariaHidden: 'true' | 'false';
    ariaLabel: string;
    tabindex: number;
    dataJourneyAction: string;
    /** present only for primary (mobile label). */
    dataMobileLabel?: string;
    /** present only for tertiary (disclosure state). */
    ariaExpanded?: 'true' | 'false';
    onclick: () => void;
  }

  let {
    role,
    hidden,
    ariaDisabled,
    ariaHidden,
    ariaLabel,
    tabindex,
    dataJourneyAction,
    dataMobileLabel,
    ariaExpanded,
    onclick
  }: Props = $props();
</script>

<button
  id={'btn-journey-' + role}
  class="journey-compass-action {role}"
  type="button"
  data-journey-action={dataJourneyAction}
  data-mobile-label={dataMobileLabel}
  hidden={hidden}
  aria-disabled={ariaDisabled}
  aria-expanded={ariaExpanded}
  tabindex={tabindex}
  aria-hidden={ariaHidden}
  aria-label={ariaLabel}
  onclick={onclick}
>
  {ariaLabel}
</button>
