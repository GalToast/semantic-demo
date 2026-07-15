<!--
  CompassHeader.svelte — extracted from JourneyCompass.svelte (W52).
  Renders the #journey-compass-kicker / #journey-compass-title /
  #journey-compass-note blocks. Props are pure; the parent owns derived
  state. DOM ids/classes + sr-only toggle are byte-identical to the
  original source block. `title` (raw compass.title) is accepted for
  parity with the parent's compass shape; the rendered text uses
  visibleTitle || title || titleSrOnlyText (byte-identical in all real
  states because visibleTitle already incorporates compass.title).
-->
<script lang="ts">
  interface Props {
    kicker: string;
    title: string;
    note: string;
    visibleTitle: string;
    titleSrOnlyText: string;
  }

  let { kicker, title, note, visibleTitle, titleSrOnlyText }: Props = $props();
</script>

<div id="journey-compass-kicker" class="journey-compass-kicker">
  {kicker || 'Journey'}
</div>

<div
  id="journey-compass-title"
  class="journey-compass-title"
  class:sr-only={!visibleTitle}
>
  {visibleTitle || title || titleSrOnlyText}
</div>

<div
  id="journey-compass-note"
  class="journey-compass-note"
>
  {note || 'Search to open a trail.'}
</div>
