window.RESIDENT_INSIGHTS = {
  "generated_at": "2026-04-04T17:54:04.323597+00:00",
  "featured_index": 2,
  "refresh_interval_seconds": 21600,
  "notes": [
    {
      "slug": "conroe-food-web",
      "headline": "Today in MoCo: Conroe's Food Web",
      "summary": "In the current retrieved slice, the strongest examples are ALFONSO'S MEXICAN RESTAURANT, Angie's Mexican Restaurant and Taqueria, EL FOGON THE KITCHEN GRILL RESTAURANT, and EL FOGON REYES RESTAURANT. I’d treat this as a directional summary rather than a complete countywide count.",
      "generated_at": "2026-04-04T17:52:58.200277+00:00",
      "suggested_story": "mapped-food",
      "suggested_mode": "bloom",
      "city_focus": "Conroe",
      "highlight_lead_ids": [
        376,
        531,
        2403,
        2404,
        2419,
        571
      ],
      "source_prompt": "What is interesting about restaurants in Conroe?",
      "thinking_attempted": false,
      "thinking_fallback_used": false
    },
    {
      "slug": "willis-service-web",
      "headline": "Willis Service Web",
      "summary": "In the current retrieved slice, the strongest examples are GEORGE LAWN & TREE SERVICE, GABBYS LAWN SERVICE, 3085-graceys-commercial-cleaning-service, and KFPI SERVICE DOGS. I’d treat this as a directional summary rather than a complete countywide count.",
      "generated_at": "2026-04-04T17:52:58.434282+00:00",
      "suggested_story": "signal-rich",
      "suggested_mode": "bridge",
      "city_focus": "Willis",
      "highlight_lead_ids": [
        2965,
        2891,
        3085,
        4133,
        6395,
        6602
      ],
      "source_prompt": "Tell me the story of service businesses in Willis.",
      "thinking_attempted": false,
      "thinking_fallback_used": false
    },
    {
      "slug": "county-ghost-layer",
      "headline": "Ghost Layer: What Fell Out Of The Public Slice",
      "summary": "In the current retrieved slice, the strongest examples are Greyghost Tattoo Supply. I’d treat this as a directional summary rather than a complete countywide count.",
      "generated_at": "2026-04-04T17:54:04.323573+00:00",
      "suggested_story": "disqualified-ghosts",
      "suggested_mode": "default",
      "city_focus": "Montgomery County",
      "highlight_lead_ids": [
        8107,
        668,
        1541,
        2576,
        2831,
        3135
      ],
      "source_prompt": "What do the archived ghosts say about the county?",
      "thinking_attempted": false,
      "thinking_fallback_used": false
    }
  ]
};
window.RESIDENT_INSIGHT = (window.RESIDENT_INSIGHTS && window.RESIDENT_INSIGHTS.notes && window.RESIDENT_INSIGHTS.notes[window.RESIDENT_INSIGHTS.featured_index || 0]) || null;
