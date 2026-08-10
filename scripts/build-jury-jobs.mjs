// Emit jobs.json for the slice runner (shared job list)
import fs from 'node:fs'
const DIR = 'C:\\Users\\HP\\repos\\semantic-explorer\\tmp\\vision-jury\\jpeg-q90'
const jobs = [
    [
        '01-mobile-idle',
        '01-mobile-idle.jpg',
        'mobile idle: search input, header, canvas region, any visible UI or placeholder graphic'
    ],
    [
        '02-mobile-search-coffee',
        '02-mobile-search-coffee.jpg',
        'mobile search "coffee": result rows, input legibility, list layout'
    ],
    [
        '03-mobile-focus-first-result',
        '03-mobile-focus-first-result.jpg',
        'mobile focus card: layout, title/description overlap, spacing'
    ],
    ['04-mobile-field-node-active', '04-mobile-field-node-active.jpg', 'mobile field-node focus panel'],
    ['05-mobile-map', '05-mobile-map.jpg', 'mobile map: real browser map vs placeholder vs blank'],
    ['06-mobile-filters-open', '06-mobile-filters-open.jpg', 'mobile filters drawer open'],
    ['09-mobile-map-empty-state', '09-mobile-map-empty-state.jpg', 'mobile map empty state copy/icon'],
    ['10-mobile-search-error-state', '10-mobile-search-error-state.jpg', 'mobile search error (degraded lane)'],
    ['11-mobile-selected-card-map-trail', '11-mobile-selected-card-map-trail.jpg', 'mobile selected card + map trail'],
    ['11-desktop-selected-card-map-trail', '11-desktop-selected-card-map-trail.jpg', 'desktop card + map trail'],
    ['12-desktop-reduced-motion', '12-desktop-reduced-motion.jpg', 'desktop reduced-motion static scene'],
    ['13-desktop-filters-open', '13-desktop-filters-open.jpg', 'desktop filters (mobile-only; may be empty/hidden)'],
    ['13-mobile-reduced-motion', '13-mobile-reduced-motion.jpg', 'mobile reduced-motion'],
    ['14-desktop-search-error', '14-desktop-search-error.jpg', 'desktop search error state'],
    ['15-mobile-semantic-dive', '15-mobile-semantic-dive.jpg', 'mobile semantic-dive at 390'],
    [
        '16-desktop-info-panel-populated',
        '16-desktop-info-panel-populated.jpg',
        'desktop info panel populated: any text overlap'
    ],
    ['17-mobile-thread-inspector', '17-mobile-thread-inspector.jpg', 'mobile thread inspector rail'],
    ['18-mobile-loading-overlay', '18-mobile-loading-overlay.jpg', 'mobile loading overlay: progress/narrative/chips'],
    ['19-mobile-compass-rail', '19-mobile-compass-rail.jpg', 'mobile compass rail'],
    ['20-mobile-mode-grid-visible', '20-mobile-mode-grid-visible.jpg', 'mobile mode grid'],
    [
        '21-mobile-route-trace-visible',
        '21-mobile-route-trace-visible.jpg',
        'mobile route trace — key: blank? map? placeholder?'
    ],
    ['22-mobile-semantic-dive-320', '22-mobile-semantic-dive-320.jpg', 'mobile dive at 320: overflow/clipping?'],
    ['23-mobile-short-landscape', '23-mobile-short-landscape.jpg', '896x414 short landscape: utility chrome hidden?'],
    [
        '24-mobile-map-focus-search',
        '24-mobile-map-focus-search.jpg',
        'mobile map-focus-search: selected card + search chrome'
    ],
    ['25-mobile-search-no-results', '25-mobile-search-no-results.jpg', 'mobile no-results state'],
    ['07-desktop-idle', '07-desktop-idle.jpg', 'desktop idle: header/search layout; static placeholder OK'],
    ['08-desktop-search-coffee', '08-desktop-search-coffee.jpg', 'desktop search coffee: UI + canvas'],
    [
        'w07 real-webgl dt-idle',
        'webgl-07-desktop-idle.jpg',
        'REAL WEBGL desktop idle: 3D mycelium field — describe nodes/threads/quality'
    ],
    [
        'w08 real-webgl dt-search',
        'webgl-08-desktop-search-coffee.jpg',
        'REAL WEBGL desktop search: 3D scene + overlay quality'
    ],
    [
        'w3-21 sw-webgl route',
        'webgl3-21-mobile-route-trace-visible.jpg',
        'SW-WEBGL mobile route trace: content present?'
    ],
    ['w3-15 sw-webgl dive', 'webgl3-15-mobile-semantic-dive.jpg', 'SW-WEBGL mobile semantic dive'],
    ['w3-24 sw-webgl mapfocus', 'webgl3-24-mobile-map-focus-search.jpg', 'SW-WEBGL mobile map focus search']
]
fs.writeFileSync('tmp/vision-jury/jobs.json', JSON.stringify(jobs))
console.log('jobs.json:', jobs.length, 'jobs')
