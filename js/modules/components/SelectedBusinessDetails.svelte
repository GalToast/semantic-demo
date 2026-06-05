<script>
    import { selectedPointStore } from '../stores.js';
    import { buildSelectedBusinessProps } from '../view-models/selected-business-view-model.js';
    import {
        getBusinessNamePresentation,
        sanitizePublicFacingNote,
        getPublicRecordStatusLabel
    } from '../utils/dom-formatters.js';
    import { describeCluster } from '../utils/ui-presentation.js';
    import { publish, EVENTS } from '../event-bus.js';
    import {
        buildSelectedMatchNarrative,
        getInterestingBusinessNote,
    } from '../ui-renderers.js';
    import { describeThreadLensForPoint } from '../journey-point-color.js';
    import { _getSelectedBusinessRoleLabel } from '../bridge-registry.js';

    const selectedDetailsAdapter = {
        getSelectedBusinessRoleLabel: _getSelectedBusinessRoleLabel,
        getInterestingBusinessNote,
        buildSelectedMatchNarrative,
        describeThreadLensForPoint
    };

    const COPY = {
        selectedFiledAs: (raw) => `Filed as ${raw}`,
        selectedEmptyName: 'Business Name',
        selectedEmptyWhat: 'What they do',
        selectedEmptyRole: 'Record',
        selectedEmptyMap: 'No geocoded point yet',
        selectedEmptyThread: 'Waiting for a related path.',
        selectedEmptyTheme: 'Theme',
        selectedEmptyStatus: 'Record status'
    };

    const viewModel = $derived(buildSelectedBusinessProps($selectedPointStore, {}, selectedDetailsAdapter, {
        getBusinessNamePresentation,
        sanitizePublicFacingNote,
        describeCluster,
        getPublicRecordStatusLabel,
        COPY
    }));

    function handleMapClick() {
        publish(EVENTS.VIEW_CHANGE_REQUESTED, { view: 'map' });
    }
</script>

<div class="selected-hero">
    <div class="selected-hero-main">
        <h3 id="selected-name">{viewModel.name}</h3>
        {#if viewModel.showFiledAs}
            <div class="selected-filed-as" id="selected-filed-as">{viewModel.filedAs}</div>
        {/if}
        <div class="selected-subtitle" id="selected-what">{viewModel.what}</div>
    </div>
    <div class="selected-role-badge" id="selected-role-badge">{viewModel.role}</div>
</div>

<div class="selected-meta-strip" id="selected-meta-strip">
    {#if viewModel.isPopulated}
        <span class="focus-stage-chip">{$selectedPointStore.city || 'Montgomery County'}</span>
        <span class="focus-stage-chip">{viewModel.theme}</span>
        <span class="focus-stage-chip">{viewModel.status}</span>
    {/if}
</div>

<div class="badge-row" id="selected-badges">
    {#if $selectedPointStore?.website}
        <span class="signal-badge meta" title="Website present">Website present</span>
    {/if}
    {#if $selectedPointStore?.email}
        <span class="signal-badge fact" title="Email present">Email present</span>
    {/if}
    {#if $selectedPointStore?.phone}
        <span class="signal-badge ai" title="Phone present">Phone present</span>
    {/if}
</div>

<div class="selected-facts" id="selected-facts">
    {#if viewModel.facts.length > 0}
        {#each viewModel.facts as fact, i}
            {#if fact.type === 'link'}
                <a href={fact.href} target={fact.isExternal ? '_blank' : null} rel={fact.isExternal ? 'noopener noreferrer' : null}>{fact.label}</a>
            {:else}
                {fact.value}
            {/if}
            {#if i < viewModel.facts.length - 1} &nbsp;|&nbsp; {/if}
        {/each}
    {:else}
        <span class="facts-none">No contact info on file</span>
    {/if}
</div>

<div class="selected-sensitivity" id="selected-sensitivity" hidden={viewModel.sensitivityBadges.length === 0}>
    {#each viewModel.sensitivityBadges as b}
        <span class="signal-badge {b.class}">{b.text}</span>
    {/each}
</div>

<div class="selected-match-panel" id="selected-match-panel" hidden={!viewModel.showMatchPanel}>
    <div class="selected-match-label" id="selected-match-label">Why this record</div>
    <div class="selected-match-copy" id="selected-match-copy">{viewModel.matchNarrative}</div>
</div>

<div class="selected-action-row" id="selected-action-row" hidden={!viewModel.isPopulated}>
    <button class="action-btn" id="btn-selected-map" type="button" onclick={handleMapClick}>View on Map</button>
</div>

<div class="selected-grid">
    <div class="selected-item">
        <div class="selected-item-label">Semantic Neighborhood</div>
        <div class="selected-item-value" id="selected-theme">{viewModel.theme}</div>
    </div>
    <div class="selected-item">
        <div class="selected-item-label">Record Status</div>
        <div class="selected-item-value" id="selected-status">{viewModel.status}</div>
    </div>
    <div class="selected-item">
        <div class="selected-item-label">Map Coordinates</div>
        <div class="selected-item-value" id="selected-map">{viewModel.mapText}</div>
    </div>
    <div class="selected-item">
        <div class="selected-item-label">Related Thread</div>
        <div class="selected-item-value" id="selected-thread">{viewModel.threadText}</div>
    </div>
</div>

{#if viewModel.showTrivia}
    <div class="selected-trivia" id="selected-trivia">{viewModel.trivia}</div>
{/if}
