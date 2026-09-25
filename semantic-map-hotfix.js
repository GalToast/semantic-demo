(function () {
    if (window.__semanticMapRuntime || typeof window.initMap === 'function') return;

    var script = document.createElement('script');
    script.src = 'semantic-map-runtime.js?v=20260509-map-runtime';
    script.async = false;
    document.head.appendChild(script);
})();
