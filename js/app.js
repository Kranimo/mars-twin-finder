/* Mars Twin Finder — Phase 1: Salda <-> Jezero side-by-side comparison. */
(function () {
  'use strict';

  var SITES = MTF.SITES, MATCHES = MTF.MATCHES, SOURCES = MTF.SOURCES;
  var log2 = Math.log2 || function (x) { return Math.log(x) / Math.LN2; };
  var rad = Math.PI / 180;

  // ---------------------------------------------------------------- scales
  // Metres per pixel at zoom 0, so zoom offsets between the two CRSs can be
  // computed exactly. Earth is Web Mercator (scale depends on latitude);
  // Mars Trek tiles are equirectangular (we use the N-S scale, which is
  // constant; E-W differs by ~5% at Jezero's latitude).
  var earthMpp0 = 2 * Math.PI * SITES.earth.radiusM * Math.cos(SITES.earth.center[0] * rad) / 256;
  var marsMpp0 = Math.PI * SITES.mars.radiusM / 256;
  var sizeRatio = SITES.mars.diameterKm / SITES.earth.diameterKm;

  // Mars zoom = Earth zoom + offset
  var OFFSETS = {
    scale: log2(marsMpp0 / earthMpp0),                     // same metres per pixel
    framing: log2(marsMpp0 / earthMpp0) - log2(sizeRatio)  // both basins fill their map
  };

  var state = { mode: 'framing', sync: true, driver: null, anchors: null };

  // ------------------------------------------------------------------ maps
  var mapOpts = { zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, worldCopyJump: false };

  var earth = L.map('map-earth', L.extend({ crs: L.CRS.EPSG3857, minZoom: 2, maxZoom: 19 }, mapOpts));

  // Equirectangular CRS on the Mars sphere: matches Trek's tile grid
  // (2x1 tiles at zoom 0) and gives the scale bar Martian kilometres.
  var MarsCRS = L.extend({}, L.CRS.EPSG4326, { R: SITES.mars.radiusM });
  var mars = L.map('map-mars', L.extend({ crs: MarsCRS, minZoom: 0, maxZoom: 19 }, mapOpts));

  // ---------------------------------------------------------- tile layers
  function trek(id, ext, opts) {
    return L.tileLayer('https://trek.nasa.gov/tiles/Mars/EQ/' + id + '/1.0.0/default/default028mm/{z}/{y}/{x}.' + ext,
      L.extend({ maxZoom: 19, tileSize: 256, noWrap: true }, opts));
  }
  var TREK = 'NASA Mars Trek';
  var molaAttr = '<a href="https://trek.nasa.gov/mars/">' + TREK + '</a>: MGS MOLA (NASA/JPL/GSFC)';
  var marsImagery = L.layerGroup([
    trek('Mars_MGS_MOLA_ClrShade_merge_global_463m', 'jpg', { maxNativeZoom: 7, attribution: molaAttr }),
    trek('Jezero_CTX_BlockAdj_dd', 'png', {
      maxNativeZoom: 12, bounds: [[15.9058, 75.1538], [19.4453, 78.8717]],
      attribution: 'MRO CTX (NASA/JPL-Caltech/MSSS)'
    }),
    trek('JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd', 'png', {
      minZoom: 11, maxNativeZoom: 17, bounds: [[18.3068, 77.2229], [18.6693, 77.5840]],
      attribution: 'MRO HiRISE (NASA/JPL-Caltech/UArizona)'
    })
  ]);
  var marsElevation = trek('Mars_MGS_MOLA_ClrShade_merge_global_463m', 'jpg', { maxNativeZoom: 7, attribution: molaAttr });

  var earthImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 18, maxZoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
  });
  var earthS2 = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg', {
    maxNativeZoom: 15, maxZoom: 19,
    attribution: '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX (modified Copernicus Sentinel data 2020)'
  });

  earthImagery.addTo(earth);
  marsImagery.addTo(mars);

  // ------------------------------------------------------------ overlays
  var earthOverlay = L.layerGroup().addTo(earth);
  var marsOverlay = L.layerGroup().addTo(mars);

  L.polygon(SITES.earth.outline, { className: 'outline outline-earth', fill: false, interactive: false })
    .addTo(earthOverlay);

  // Jezero rim drawn on the Mars sphere (L.circle assumes Earth's radius).
  function ring(center, radiusM, R, n) {
    var pts = [], dLat = radiusM / R / rad;
    for (var i = 0; i < n; i++) {
      var a = 2 * Math.PI * i / n;
      pts.push([center[0] + dLat * Math.sin(a), center[1] + dLat * Math.cos(a) / Math.cos(center[0] * rad)]);
    }
    return pts;
  }
  var rim = L.polygon(ring(SITES.mars.center, SITES.mars.diameterKm * 500, SITES.mars.radiusM, 96),
    { className: 'outline outline-mars', fill: false, interactive: false }).addTo(marsOverlay);

  function addLabels(list, layer) {
    list.forEach(function (l) {
      L.marker(l.latlng, {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'feature-label', html: '<span>' + l.text + '</span>', iconSize: null })
      }).addTo(layer);
    });
  }
  addLabels(SITES.earth.labels, earthOverlay);
  addLabels(SITES.mars.labels, marsOverlay);

  // ------------------------------------------------------------ hotspots
  var markers = { earth: {}, mars: {} };

  function hotspot(match, side, layer) {
    var spot = match[side];
    var m = L.marker(spot.latlng, {
      title: match.id + '. ' + spot.label,
      icon: L.divIcon({ className: 'hotspot hotspot-' + side, html: '<span>' + match.id + '</span>', iconSize: [28, 28] })
    });
    m.bindPopup(
      '<div class="pop"><b>' + match.id + '. ' + spot.label + (spot.approx ? ' <abbr title="approximate location">≈</abbr>' : '') +
      '</b><p>' + spot.note + '</p><small>' + fmtLatLng(spot.latlng, side) + '</small>' +
      '<a class="pop-drive" href="rover.html?site=' + side + '&spot=' + match.id + '">Drive here in 3D →</a></div>',
      { autoPan: false, maxWidth: 260, className: 'pop-' + side }
    );
    m.on('click', function () { select(match.id); });
    m.addTo(layer);
    markers[side][match.id] = m;
  }
  MATCHES.forEach(function (match) {
    hotspot(match, 'earth', earthOverlay);
    hotspot(match, 'mars', marsOverlay);
  });

  L.control.layers({ 'Satellite (Esri)': earthImagery, 'Sentinel-2 cloudless': earthS2 },
    { 'Hotspots & outline': earthOverlay }, { position: 'topright' }).addTo(earth);
  L.control.layers({ 'CTX + HiRISE': marsImagery, 'MOLA elevation': marsElevation },
    { 'Hotspots & rim': marsOverlay }, { position: 'topright' }).addTo(mars);
  L.control.scale({ imperial: false, maxWidth: 140 }).addTo(earth);
  L.control.scale({ imperial: false, maxWidth: 140 }).addTo(mars);

  // ----------------------------------------------------------------- sync
  // Each map keeps an anchor point. The follower is placed so its centre sits
  // the same number of pixels from its anchor as the driver's centre does
  // from its own, at zoom = driver zoom +/- offset. Re-anchoring after a
  // "fly to match" lets the two maps look at different-but-paired features.
  function offset() { return OFFSETS[state.mode]; }

  function followerView(src, dst, center, zoom) {
    var srcIsEarth = src === earth;
    var a = state.anchors;
    var zd = zoom + (srcIsEarth ? offset() : -offset());
    var srcAnchor = srcIsEarth ? a.earth : a.mars, dstAnchor = srcIsEarth ? a.mars : a.earth;
    var d = src.project(center, zoom).subtract(src.project(srcAnchor, zoom));
    return { center: dst.unproject(dst.project(dstAnchor, zd).add(d), zd), zoom: zd };
  }

  function bindSync(src, dst) {
    var el = src.getContainer();
    ['mousedown', 'touchstart', 'wheel', 'keydown', 'focusin'].forEach(function (ev) {
      el.addEventListener(ev, function () { state.driver = src; }, { passive: true, capture: true });
    });
    src.on('zoomanim', function (e) {
      if (!state.sync || state.driver !== src) return;
      var v = followerView(src, dst, e.center, e.zoom);
      dst.setView(v.center, v.zoom, { animate: true });
    });
    src.on('move', function () {
      if (!state.sync || state.driver !== src || src._animatingZoom) return;
      var v = followerView(src, dst, src.getCenter(), src.getZoom());
      dst.setView(v.center, v.zoom, { animate: false });
    });
  }
  bindSync(earth, mars);
  bindSync(mars, earth);

  function reanchor() {
    state.anchors = { earth: earth.getCenter(), mars: mars.getCenter() };
  }

  // Home view: fit Jezero's rim on the Mars map, then derive Earth's zoom.
  function home(animate) {
    state.driver = null;
    if (!mars._loaded) mars.setView(SITES.mars.center, 8, { animate: false });  // getBoundsZoom needs a view
    var mz = mars.getBoundsZoom(rim.getBounds(), false, L.point(40, 40));
    var ez = mz - offset();
    var o = { animate: !!animate };
    earth.setView(SITES.earth.center, ez, o);
    mars.setView(SITES.mars.center, mz, o);
    state.anchors = { earth: L.latLng(SITES.earth.center), mars: L.latLng(SITES.mars.center) };
    setActive(null);
  }

  function whenSettled(map) {
    return new Promise(function (resolve) {
      var t = setTimeout(resolve, 2500);
      map.once('moveend', function () { clearTimeout(t); resolve(); });
    });
  }

  function select(id) {
    var match = MATCHES.filter(function (m) { return m.id === id; })[0];
    if (!match) return;
    state.driver = null;
    setActive(id);
    var done = Promise.all([whenSettled(earth), whenSettled(mars)]);
    earth.flyTo(match.earth.latlng, match.zoom, { duration: 1.2 });
    mars.flyTo(match.mars.latlng, match.zoom + offset(), { duration: 1.2 });
    done.then(function () {
      reanchor();
      markers.earth[id].openPopup();
      markers.mars[id].openPopup();
    });
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.seg button').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    });
    updateScaleNote();
    home(true);
  }

  // ------------------------------------------------------------------- UI
  function fmtLatLng(ll, side) {
    var lat = ll.lat !== undefined ? ll.lat : ll[0], lng = ll.lng !== undefined ? ll.lng : ll[1];
    var ns = (lat >= 0 ? '° N' : '° S');
    if (side === 'mars') {               // planetocentric, 0–360 °E
      lng = ((lng % 360) + 360) % 360;
      return Math.abs(lat).toFixed(4) + ns + ', ' + lng.toFixed(4) + '° E';
    }
    return Math.abs(lat).toFixed(4) + ns + ', ' + Math.abs(lng).toFixed(4) + (lng >= 0 ? '° E' : '° W');
  }

  function readout(map, side) {
    var el = document.getElementById(side + '-readout');
    function show(ll) { el.textContent = fmtLatLng(ll, side); }
    map.on('mousemove', function (e) { show(e.latlng); });
    map.on('moveend', function () { show(map.getCenter()); });
  }
  readout(earth, 'earth');
  readout(mars, 'mars');

  function updateScaleNote() {
    var r = sizeRatio.toFixed(1);
    document.getElementById('scale-note').textContent = state.mode === 'scale'
      ? 'True scale: a kilometre is the same length on both maps. Jezero is about ' + r + '× wider than Salda.'
      : 'Matched framing: each basin fills its own map, so Mars is shown ' + r + '× more zoomed out. Compare the scale bars.';
  }

  function setActive(id) {
    document.querySelectorAll('.match').forEach(function (li) {
      li.classList.toggle('active', Number(li.dataset.id) === id);
    });
    document.querySelectorAll('.hotspot').forEach(function (el) {
      el.classList.toggle('active', id !== null && el.textContent === String(id));
    });
  }

  ['earth', 'mars'].forEach(function (side) {
    document.getElementById(side + '-name').textContent = SITES[side].name + ', ' + SITES[side].region;
    var facts = document.getElementById(side + '-facts');
    facts.textContent = facts.title = SITES[side].facts;
  });

  var list = document.getElementById('match-list');
  MATCHES.forEach(function (m) {
    var li = document.createElement('li');
    li.className = 'match';
    li.dataset.id = m.id;
    li.innerHTML =
      '<button type="button">' +
        '<span class="num">' + m.id + '</span>' +
        '<span class="title">' + m.title + '</span>' +
        '<span class="pair"><span class="e">' + m.earth.label + (m.earth.approx ? ' ≈' : '') + '</span>' +
        '<span class="arrow">↔</span><span class="m">' + m.mars.label + (m.mars.approx ? ' ≈' : '') + '</span></span>' +
        '<span class="why">' + m.why + '</span>' +
      '</button>';
    li.querySelector('button').addEventListener('click', function () { select(m.id); });
    list.appendChild(li);
  });

  var srcList = document.getElementById('source-list');
  SOURCES.forEach(function (s) {
    var li = document.createElement('li');
    li.innerHTML = '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + '</a> <span>' + s.by + '</span>';
    srcList.appendChild(li);
  });

  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });
  document.getElementById('reset').addEventListener('click', function () { home(true); });
  document.getElementById('sync').addEventListener('change', function (e) {
    state.sync = e.target.checked;
    if (state.sync) {                    // keep the current views paired from here on
      mars.setZoom(earth.getZoom() + offset(), { animate: false });
      reanchor();
    }
  });

  updateScaleNote();
  home(false);

  window.MTF.app = { earth: earth, mars: mars, state: state, OFFSETS: OFFSETS, select: select };
})();
