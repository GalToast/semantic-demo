<script>
    import { publish, EVENTS } from '../event-bus.js';

    function handleLaunch() {
        publish(EVENTS.EXPLORATION_RESET_REQUESTED, { surprise: true });
    }

    function handleDemoStarter(query) {
        const input = document.getElementById('search-input');
        if (input) {
            input.value = query;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        }
    }
</script>

<div class="info-panel-surface info-panel-surface-overview" data-surface-owner="idle-overview" data-ownership-lane="surface content">
    <div class="stats-row">
        <div class="stat-box">
            <div class="stat-number" id="total-count">8,406</div>
            <div class="stat-label">Businesses</div>
        </div>
        <div class="stat-box">
            <div class="stat-number" id="city-count">12</div>
            <div class="stat-label">Cities</div>
        </div>
    </div>
    <div class="stat-caption">Montgomery County records in the semantic field</div>

    <div class="demo-starters" id="demo-starters" aria-label="Guided demo searches">
        <div class="demo-starters-kicker">First time here?</div>
        <div class="demo-starters-copy">Choose a starting need. The view will light an anchor, then suggest related nearby businesses.</div>
        <div class="demo-journey-steps" aria-hidden="true">
            <span><b>1</b> Choose</span>
            <span><b>2</b> Guide</span>
            <span><b>3</b> Explore</span>
        </div>
        <div class="demo-starter-row">
            <button class="demo-starter-chip" type="button" onclick={() => handleDemoStarter('coffee')} aria-label="Start demo search for coffee">Coffee</button>
            <button class="demo-starter-chip" type="button" onclick={() => handleDemoStarter('roof repair')} aria-label="Start demo search for roof repair">Roof repair</button>
            <button class="demo-starter-chip" type="button" onclick={() => handleDemoStarter('childcare')} aria-label="Start demo search for childcare">Childcare</button>
            <button class="demo-starter-chip" type="button" onclick={() => handleDemoStarter('dog friendly')} aria-label="Start demo search for dog friendly businesses">Dog friendly</button>
        </div>
    </div>

    <button class="launch-btn" id="btn-launch" type="button" title="Launch directly into focus mode with a random business" onclick={handleLaunch}>
        <svg class="ui-icon" aria-hidden="true"><use href="#icon-mycelium"></use></svg>
        Surprise Me
    </button>
</div>
