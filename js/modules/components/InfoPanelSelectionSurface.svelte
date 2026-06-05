<script>
    import { compositionStore } from '../stores.js';
</script>

<section class="info-panel-surface info-panel-surface-selection" data-surface-owner="selected-business" data-ownership-lane="surface content" aria-label="Selected business surface">
    <div class="selected-card" id="selected-card" role="region" aria-labelledby="selected-card-title">
        <div class="vector-cascade-bg" id="vector-cascade-bg" aria-hidden="true"></div>
        <div class="panel-section-title" id="selected-card-title">Selection</div>
        
        <div class="selected-empty" id="selected-empty">
            <svg class="selected-empty-icon" aria-hidden="true" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
                <circle cx="26" cy="26" r="10" fill="none" stroke="rgba(121,235,222,0.5)" stroke-width="2"/>
                <circle cx="26" cy="26" r="4" fill="rgba(121,235,222,0.35)"/>
                <circle cx="10" cy="14" r="3.5" fill="rgba(255,226,132,0.25)" stroke="rgba(255,226,132,0.4)" stroke-width="1.2"/>
                <circle cx="42" cy="18" r="2.8" fill="rgba(255,226,132,0.2)" stroke="rgba(255,226,132,0.35)" stroke-width="1"/>
                <circle cx="38" cy="40" r="4" fill="rgba(121,235,222,0.18)" stroke="rgba(121,235,222,0.35)" stroke-width="1.2"/>
                <circle cx="14" cy="38" r="3" fill="rgba(255,226,132,0.2)" stroke="rgba(255,226,132,0.3)" stroke-width="1"/>
                <circle cx="44" cy="32" r="2.2" fill="rgba(255,226,132,0.15)" stroke="rgba(255,226,132,0.25)" stroke-width="0.9"/>
                <circle cx="8" cy="26" r="2.5" fill="rgba(121,235,222,0.2)" stroke="rgba(121,235,222,0.3)" stroke-width="0.9"/>
                <line x1="14" y1="38" x2="26" y2="26" stroke="rgba(121,235,222,0.12)" stroke-width="0.8" stroke-dasharray="2,2"/>
                <line x1="44" y1="32" x2="26" y2="26" stroke="rgba(121,235,222,0.1)" stroke-width="0.7" stroke-dasharray="2,2"/>
                <line x1="8" y1="26" x2="26" y2="26" stroke="rgba(121,235,222,0.1)" stroke-width="0.7" stroke-dasharray="2,2"/>
            </svg>
            <div class="selected-empty-copy">
                <span class="selected-empty-headline">Explore the county's mycelium</span>
                <span class="selected-empty-sub">Click any spore in the mycelium to inspect one business and discover its neighborhood.</span>
            </div>
        </div>

        <div id="selected-details" class="focus-stage-details active">
            <!-- SelectedBusinessDetails will be mounted here -->
        </div>

        <div class="selected-map-summary" id="selected-map-summary" hidden aria-hidden="true">
            <div class="selected-map-summary-head">
                <div class="selected-map-summary-main">
                    <div class="selected-map-summary-kicker" id="selected-map-summary-kicker">Map trail match</div>
                    <h3 id="selected-map-summary-name">Business Name</h3>
                    <div class="selected-map-summary-what" id="selected-map-summary-what">Montgomery County business record</div>
                </div>
                <div class="selected-map-summary-role" id="selected-map-summary-role">Trail match</div>       
            </div>
            <div class="selected-map-summary-match" id="selected-map-summary-match">
                <div class="selected-map-summary-match-label">Why this record</div>
                <div class="selected-map-summary-match-copy" id="selected-map-summary-match-copy"></div>      
            </div>
        </div>
    </div>
</section>
