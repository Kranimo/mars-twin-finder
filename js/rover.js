/* Mars Twin Finder — 3D rover drive over real terrain of Jezero (Mars) and Salda (Earth).
 * Terrain packs come from tools/build_terrain.py and are loaded as plain scripts so the
 * page runs from file://. 1 scene unit = 1 metre; x = east, z = south, y = up. */
(function () {
  'use strict';

  var SITES = MTF.SITES, MATCHES = MTF.MATCHES;
  var PACK = { mars: 'jezero', earth: 'salda' };
  var PERSEVERANCE_TOP_SPEED = 0.042;   // m/s (~152 m/h)
  var MAX_CLIMB_DEG = 30;               // Perseverance is rated for ~30° tilt

  var CFG = {
    mars: {
      skyTop: 0x6e4f3c, skyHorizon: 0xd9a676, fog: 0xc89a70, fogDensity: 0.000045,
      sun: 0xfff0dc, sunI: 1.05, hemiSky: 0xe9c8a0, hemiGround: 0x4a2e1e, hemiI: 0.55,
      gravity: 3.71, beaconColor: 0xe0703f, beaconOpacity: 0.28, rock: 0x6b4330,
      arrive: 320, beaconR: 22, beaconH: 700,
      start: { spot: 5, heading: 285 },
      // Approach points for spots that are awkward to drive onto.
      approach: {}
    },
    earth: {
      skyTop: 0x3f7fc4, skyHorizon: 0xcfe2f2, fog: 0xc4d8ea, fogDensity: 0.00003,
      sun: 0xffffff, sunI: 1.15, hemiSky: 0xcfe6ff, hemiGround: 0x5b4a33, hemiI: 0.6,
      gravity: 9.81, beaconColor: 0x4cc3d9, beaconOpacity: 0.14, rock: 0xbdb6a8,
      arrive: 160, beaconR: 10, beaconH: 350,
      start: { spot: 2, heading: 60 },
      // Spot 1 is mid-lake and 3/5 sit at the waterline; drive to onshore viewpoints instead.
      approach: { 1: [37.5530, 29.6440], 3: [37.5812, 29.6990], 5: [37.5188, 29.6800] }
    }
  };

  // ------------------------------------------------------------ renderer
  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, 1, 0.3, 120000);

  var hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  var sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(hemi, sun, sun.target);

  // Sky dome with a vertical gradient; follows the camera.
  var skyGeo = new THREE.SphereGeometry(100000, 32, 16);
  var skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying float vY; void main(){ float t = pow(clamp(vY,0.0,1.0),0.55); gl_FragColor = vec4(mix(horizon, top, t),1.0); }',
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  var sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  // Procedural detail texture so the ground doesn't look blurry up close.
  function noiseTexture(size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    var base = new Float32Array(size * size);
    for (var oct = 0, amp = 1, cell = size / 4; oct < 5; oct++, amp *= 0.55, cell /= 2) {
      var n = size / cell, grid = new Float32Array((n + 1) * (n + 1));
      for (var i = 0; i < grid.length; i++) grid[i] = Math.random();
      for (var gy = 0; gy <= n; gy++) grid[gy * (n + 1) + n] = grid[gy * (n + 1)];          // wrap
      for (var gx = 0; gx <= n; gx++) grid[n * (n + 1) + gx] = grid[gx];
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var a = grid[iy * (n + 1) + ix], b = grid[iy * (n + 1) + ix + 1];
        var cc = grid[(iy + 1) * (n + 1) + ix], dd = grid[(iy + 1) * (n + 1) + ix + 1];
        base[y * size + x] += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty);
      }
    }
    var mn = Infinity, mx = -Infinity;
    for (var k = 0; k < base.length; k++) { mn = Math.min(mn, base[k]); mx = Math.max(mx, base[k]); }
    for (k = 0; k < base.length; k++) {
      var v = Math.round((base[k] - mn) / (mx - mn) * 255);
      d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = v; d[k * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  var detailTex = noiseTexture(256);

  // ------------------------------------------------------------- state
  var world = null;          // current site: terrain, objects, helpers
  var exag = 1;
  var keys = { fwd: 0, back: 0, left: 0, right: 0, boost: 0 };
  var rover = {
    x: 0, z: 0, heading: 0, speed: 0, odo: 0, wheelTurn: 0,
    quat: new THREE.Quaternion(), y: 0
  };
  var cam = { mode: 'chase', yaw: 0, pitch: 0.28, dist: 16, mastYaw: 0, mastPitch: -0.05 };
  var lake = { on: false, level: -2395 };
  var activeSpot = null;

  // ------------------------------------------------------------ loading
  var loadingEl = document.getElementById('loading');
  function setLoading(text) {
    loadingEl.hidden = !text;
    if (text) document.getElementById('loading-text').textContent = text;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function decodeHeights(pack) {
    var bin = atob(pack.heightsGz), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer().then(function (buf) {
      var q = new Uint16Array(buf), h = new Float32Array(q.length);
      for (var j = 0; j < q.length; j++) h[j] = q[j] * pack.hScale;   // metres above pack.hMin
      return h;
    });
  }

  // ------------------------------------------------------------- terrain
  function makeWorld(site, pack, heights) {
    var G = pack.grid, W = pack.widthM, D = pack.depthM, b = pack.bounds;
    var dx = W / (G - 1), dz = D / (G - 1);
    var pos = new Float32Array(G * G * 3), uv = new Float32Array(G * G * 2);
    for (var j = 0; j < G; j++) for (var i = 0; i < G; i++) {
      var k = j * G + i;
      pos[k * 3] = -W / 2 + i * dx; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = -D / 2 + j * dz;
      uv[k * 2] = i / (G - 1); uv[k * 2 + 1] = 1 - j / (G - 1);
    }
    var idx = new Uint32Array((G - 1) * (G - 1) * 6), n = 0;
    for (j = 0; j < G - 1; j++) for (i = 0; i < G - 1; i++) {
      var a = j * G + i, bb = a + 1, c = a + G, d = c + 1;
      // split along the (i+1,j)-(i,j+1) diagonal; heightAt() mirrors this
      idx[n++] = a; idx[n++] = c; idx[n++] = bb;
      idx[n++] = bb; idx[n++] = c; idx[n++] = d;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    var tex = new THREE.TextureLoader().load(pack.texture);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97, metalness: 0 });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.detailMap = { value: detailTex };
      sh.vertexShader = 'varying vec2 vDetailUv;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vDetailUv = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D detailMap;\nvarying vec2 vDetailUv;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n' +
        ' float dist = length(vViewPosition);\n' +
        ' float dn = texture2D(detailMap, vDetailUv / 7.0).r * 0.55 + texture2D(detailMap, vDetailUv / 53.0).r * 0.45;\n' +
        ' float fade = 1.0 - smoothstep(40.0, 900.0, dist);\n' +
        ' diffuseColor.rgb *= mix(1.0, 0.62 + dn * 0.76, 0.85 * fade);');
    };
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;

    var latc = (b.north + b.south) / 2, lonc = (b.east + b.west) / 2;
    var w = {
      site: site, pack: pack, heights: heights, G: G, W: W, D: D, dx: dx, dz: dz,
      mesh: mesh, group: new THREE.Group(), objects: new THREE.Group(), cfg: CFG[site],
      toXZ: function (lat, lon) {
        return { x: (lon - lonc) / (b.east - b.west) * W, z: (latc - lat) / (b.north - b.south) * D };
      },
      toLatLon: function (x, z) {
        return { lat: latc - z / D * (b.north - b.south), lon: lonc + x / W * (b.east - b.west) };
      },
      inBounds: function (x, z, margin) {
        margin = margin || 0;
        return Math.abs(x) <= W / 2 - margin && Math.abs(z) <= D / 2 - margin;
      }
    };
    w.group.add(mesh);
    scene.add(w.group, w.objects);
    return w;
  }

  // Exact height of the rendered triangle surface (metres above hMin, unexaggerated).
  function heightAt(x, z) {
    var w = world, G = w.G;
    var fx = (x + w.W / 2) / w.dx, fz = (z + w.D / 2) / w.dz;
    fx = Math.max(0, Math.min(G - 1.0001, fx)); fz = Math.max(0, Math.min(G - 1.0001, fz));
    var i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, h = w.heights;
    var h00 = h[j * G + i], h10 = h[j * G + i + 1], h01 = h[(j + 1) * G + i], h11 = h[(j + 1) * G + i + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }
  function groundY(x, z) { return heightAt(x, z) * exag; }
  function elevation(x, z) { return world.pack.hMin + heightAt(x, z); }   // true metres

  // ------------------------------------------------------------- objects
  function pointInPoly(x, z, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  }

  function labelSprite(text, num, color) {
    var c = document.createElement('canvas'), g = c.getContext('2d');
    var font = '600 30px system-ui, Segoe UI, sans-serif';
    g.font = font;
    var tw = g.measureText(text).width, pad = num ? 56 : 14;
    c.width = Math.ceil(tw + pad + 18); c.height = 52;
    g.font = font;
    g.fillStyle = 'rgba(11,13,18,0.78)';
    roundRect(g, 0, 0, c.width, c.height, 12); g.fill();
    if (num) {
      g.fillStyle = color; g.beginPath(); g.arc(28, 26, 17, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0b0d12'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(num), 28, 27);
    }
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(text, pad, 27);
    var tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true, fog: false }));
    var h = 0.042; s.scale.set(h * c.width / c.height, h, 1);
    s.renderOrder = 10;
    return s;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function buildObjects(w) {
    var cfg = w.cfg, side = w.site, color = '#' + cfg.beaconColor.toString(16).padStart(6, '0');
    w.beacons = [];
    MATCHES.forEach(function (m) {
      var spot = m[side], p = w.toXZ(spot.latlng[0], spot.latlng[1]);
      if (!w.inBounds(p.x, p.z, 50)) return;
      var ap = cfg.approach[m.id] ? w.toXZ(cfg.approach[m.id][0], cfg.approach[m.id][1]) : p;
      var beam = new THREE.Mesh(new THREE.CylinderGeometry(cfg.beaconR, cfg.beaconR, cfg.beaconH, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: cfg.beaconColor, transparent: true, opacity: cfg.beaconOpacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
      var ring = new THREE.Mesh(new THREE.RingGeometry(cfg.arrive * 0.92, cfg.arrive, 64),
        new THREE.MeshBasicMaterial({ color: cfg.beaconColor, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      var label = labelSprite(spot.label + (spot.approx ? ' ≈' : ''), m.id, color);
      w.objects.add(beam, ring, label);
      w.beacons.push({ match: m, x: p.x, z: p.z, ax: ap.x, az: ap.z, beam: beam, ring: ring, label: label });
    });
    w.labels = [];
    SITES[side].labels.forEach(function (l) {
      var p = w.toXZ(l.latlng[0], l.latlng[1]);
      if (!w.inBounds(p.x, p.z, 50)) return;
      var s = labelSprite(l.text, null); s.scale.multiplyScalar(0.8);
      w.objects.add(s);
      w.labels.push({ x: p.x, z: p.z, sprite: s });
    });

    // Water: Salda's real lake (from the OSM outline) or Jezero's ancient lake (a level plane).
    w.water = null; w.lakePoly = null;
    var waterMat = new THREE.MeshStandardMaterial({ color: side === 'earth' ? 0x0f4f6e : 0x2d6d86, roughness: 0.12, metalness: 0.15, transparent: true, opacity: side === 'earth' ? 0.92 : 0.82 });
    if (side === 'earth') {
      w.lakePoly = SITES.earth.outline.map(function (ll) { return w.toXZ(ll[0], ll[1]); });
      var shape = new THREE.Shape(w.lakePoly.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
      var c0 = w.toXZ(SITES.earth.center[0], SITES.earth.center[1]);
      w.waterLevel = heightAt(c0.x, c0.z) + 0.4;                // DEM water surface, metres above hMin
      w.water = new THREE.Mesh(new THREE.ShapeGeometry(shape), waterMat);
      w.water.rotation.x = -Math.PI / 2;
    } else {
      w.water = new THREE.Mesh(new THREE.PlaneGeometry(w.W, w.D), waterMat);
      w.water.rotation.x = -Math.PI / 2;
    }
    w.objects.add(w.water);

    // Rocks scattered around the rover for a sense of scale.
    var rockGeo = new THREE.IcosahedronGeometry(1, 0);
    w.rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: cfg.rock, roughness: 1, flatShading: true }), 1400);
    w.rocks.castShadow = true; w.rocks.receiveShadow = true;
    w.rocks.frustumCulled = false;
    w.rockCap = 1400;
    w.rockCell = null;
    w.objects.add(w.rocks);
  }

  function placeObjects() {
    var w = world, cfg = w.cfg;
    w.beacons.forEach(function (bc) {
      var gy = groundY(bc.x, bc.z);
      bc.beam.position.set(bc.x, gy + cfg.beaconH / 2, bc.z);
      bc.ring.position.set(bc.x, gy + 1.5, bc.z);
      bc.label.position.set(bc.x, gy + 60 * (cfg.beaconR / 22) + 10, bc.z);
    });
    w.labels.forEach(function (l) { l.sprite.position.set(l.x, groundY(l.x, l.z) + 40, l.z); });
    if (w.site === 'earth') {
      w.water.visible = true;
      w.water.position.y = w.waterLevel * exag;
    } else {
      w.water.visible = lake.on;
      w.water.position.y = (lake.level - w.pack.hMin) * exag;
    }
    w.rockCell = null;
  }

  function hash(i, j, s) {
    var h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  function updateRocks() {
    var w = world, CELL = 5, R = 18;   // 37x37 cells of 5 m around the rover
    var ci = Math.floor(rover.x / CELL), cj = Math.floor(rover.z / CELL);
    if (w.rockCell && w.rockCell[0] === ci && w.rockCell[1] === cj) return;
    w.rockCell = [ci, cj];
    var n = 0, max = w.rockCap;
    for (var j = cj - R; j <= cj + R && n < max; j++) for (var i = ci - R; i <= ci + R && n < max; i++) {
      if (hash(i, j, 1) > 0.55) continue;
      var x = (i + hash(i, j, 2)) * CELL, z = (j + hash(i, j, 3)) * CELL;
      if (!w.inBounds(x, z, 5)) continue;
      if (w.lakePoly && pointInPoly(x, z, w.lakePoly)) continue;
      var r = hash(i, j, 4), size = 0.08 + r * r * r * 0.9;
      e4.set(hash(i, j, 5) * 6.28, hash(i, j, 6) * 6.28, 0);
      q4.setFromEuler(e4);
      s4.set(size * (0.8 + hash(i, j, 7) * 0.6), size * (0.5 + hash(i, j, 8) * 0.4), size);
      v4.set(x, groundY(x, z) + size * 0.15, z);
      m4.compose(v4, q4, s4);
      w.rocks.setMatrixAt(n++, m4);
    }
    w.rocks.count = n;
    w.rocks.instanceMatrix.needsUpdate = true;
  }

  function disposeWorld(w) {
    [w.group, w.objects].forEach(function (g) {
      scene.remove(g);
      g.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    });
  }

  // --------------------------------------------------------------- rover
  function buildRover() {
    var g = new THREE.Group();
    var white = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.6, metalness: 0.2 });
    var grey = new THREE.MeshStandardMaterial({ color: 0x6d6d6d, roughness: 0.7, metalness: 0.4 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.5, metalness: 0.3 });
    var gold = new THREE.MeshStandardMaterial({ color: 0xc89b3c, roughness: 0.35, metalness: 0.8 });
    function add(geo, mat, x, y, z, rx, ry, rz) {
      var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    }
    add(new THREE.BoxGeometry(1.9, 0.55, 2.5), white, 0, 1.05, 0);                    // body
    add(new THREE.BoxGeometry(1.95, 0.06, 2.6), grey, 0, 1.35, 0);                    // deck
    add(new THREE.BoxGeometry(0.7, 0.18, 0.5), gold, 0.35, 1.45, 0.3);                // sample caching unit
    add(new THREE.CylinderGeometry(0.32, 0.32, 1.0, 16), dark, 0, 1.35, 1.45, 1.1);    // RTG (rear)
    add(new THREE.CylinderGeometry(0.05, 0.06, 1.25, 8), grey, 0.62, 2.0, -1.0);       // mast
    add(new THREE.BoxGeometry(0.5, 0.24, 0.3), white, 0.62, 2.7, -1.0);                // mast head
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), dark, 0.5, 2.7, -1.17, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), dark, 0.74, 2.7, -1.17, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24), grey, -0.55, 1.55, 0.45, 0.4);  // high-gain antenna
    add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), grey, -0.45, 1.1, -1.55, 1.3);   // arm
    add(new THREE.BoxGeometry(0.3, 0.3, 0.3), grey, -0.45, 0.85, -2.05);                  // turret
    var wheels = [];
    var wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.4, 20);
    [-1.12, 0, 1.12].forEach(function (z) {
      [-1.15, 1.15].forEach(function (x) {
        var wm = add(wheelGeo, dark, x, 0.26, z, 0, 0, Math.PI / 2);
        wheels.push(wm);
        add(new THREE.BoxGeometry(0.08, 0.08, 0.7), grey, x * 0.86, 0.62, z * 0.6, 0.5 * Math.sign(z || 1));
      });
    });
    g.userData.wheels = wheels;
    return g;
  }
  var roverMesh = buildRover();
  scene.add(roverMesh);
  var roverTag = labelSprite('Rover', null);   // locator when zoomed out to drone height
  roverTag.scale.multiplyScalar(0.8);
  scene.add(roverTag);

  var vF = new THREE.Vector3(), vR = new THREE.Vector3(), vU = new THREE.Vector3(), vB = new THREE.Vector3(), mR = new THREE.Matrix4(), qT = new THREE.Quaternion();
  function orientRover(snap) {
    var s = Math.sin(rover.heading), c = Math.cos(rover.heading);
    var fx = s, fz = -c, rx = c, rz = s;
    var L = 1.3, Wd = 1.2;
    var hF = groundY(rover.x + fx * L, rover.z + fz * L), hB = groundY(rover.x - fx * L, rover.z - fz * L);
    var hR = groundY(rover.x + rx * Wd, rover.z + rz * Wd), hL = groundY(rover.x - rx * Wd, rover.z - rz * Wd);
    var hC = groundY(rover.x, rover.z);
    vF.set(fx * 2 * L, hF - hB, fz * 2 * L).normalize();
    vR.set(rx * 2 * Wd, hR - hL, rz * 2 * Wd).normalize();
    vU.crossVectors(vR, vF).normalize();
    vB.copy(vF).negate();
    vR.crossVectors(vU, vB).normalize();
    mR.makeBasis(vR, vU, vB);
    qT.setFromRotationMatrix(mR);
    if (snap) rover.quat.copy(qT); else rover.quat.slerp(qT, 0.25);
    rover.y = Math.max(hC, (hF + hB + hL + hR) / 4);
    roverMesh.position.set(rover.x, rover.y, rover.z);
    roverMesh.quaternion.copy(rover.quat);
  }

  // True (unexaggerated) slope and uphill grade along the heading.
  function slopeInfo() {
    var d = 15, x = rover.x, z = rover.z;
    var gx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
    var gz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
    var slope = Math.atan(Math.sqrt(gx * gx + gz * gz)) * 180 / Math.PI;
    var s = Math.sin(rover.heading), c = -Math.cos(rover.heading);
    var grade = Math.atan(gx * s + gz * c) * 180 / Math.PI;     // + = uphill ahead
    return { slope: slope, grade: grade };
  }

  // ------------------------------------------------------------- driving
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function blocked(nx, nz) {
    if (!world.inBounds(nx, nz, 15)) return 'Edge of the mapped terrain';
    if (world.lakePoly && pointInPoly(nx, nz, world.lakePoly)) return 'Rovers can\'t swim: Salda is ~196 m deep';
    return null;
  }

  function drive(dt) {
    var maxV = keys.boost ? 80 : 18;
    var target = (keys.fwd - keys.back) * maxV;
    if (keys.back && !keys.fwd) target = -maxV * 0.4;
    rover.speed += (target - rover.speed) * Math.min(1, dt * (target === 0 ? 2.5 : 1.4));
    if (Math.abs(rover.speed) < 0.01) rover.speed = 0;
    var turn = (keys.right - keys.left) * (1.25 - Math.min(0.75, Math.abs(rover.speed) / 120));
    rover.heading += turn * dt * (rover.speed < -0.1 ? -1 : 1);

    var sl = slopeInfo();
    var climbing = rover.speed > 0 ? sl.grade : -sl.grade;
    if (climbing > MAX_CLIMB_DEG && Math.abs(rover.speed) > 0.1) {
      rover.speed *= 0.2;
      toast('Too steep: ' + climbing.toFixed(0) + '° grade. Perseverance is rated for about 30°.');
    }

    var step = rover.speed * dt;
    var nx = rover.x + Math.sin(rover.heading) * step, nz = rover.z - Math.cos(rover.heading) * step;
    var why = step !== 0 && blocked(nx, nz);
    if (why) { rover.speed = 0; toast(why); }
    else { rover.x = nx; rover.z = nz; rover.odo += Math.abs(step); }
    rover.wheelTurn += step / 0.26;
    roverMesh.userData.wheels.forEach(function (wm) { wm.rotation.x = rover.wheelTurn; });
    orientRover(false);
    return sl;
  }

  // -------------------------------------------------------------- camera
  var camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  function updateCamera(snap) {
    var want = new THREE.Vector3(), look = new THREE.Vector3();
    if (cam.mode === 'mast') {
      var head = new THREE.Vector3(0.62, 2.75, -1.2).applyQuaternion(rover.quat).add(roverMesh.position);
      var yaw = rover.heading + cam.mastYaw, pitch = cam.mastPitch;
      want.copy(head);
      look.set(head.x + Math.sin(yaw) * Math.cos(pitch) * 50, head.y + Math.sin(pitch) * 50, head.z - Math.cos(yaw) * Math.cos(pitch) * 50);
      camPos.copy(want); camLook.copy(look);
    } else {
      var yawC = rover.heading + cam.yaw;
      var dist = cam.dist, p = cam.pitch;
      look.set(rover.x, rover.y + 1.6 + Math.min(dist * 0.05, 400), rover.z);
      want.set(rover.x - Math.sin(yawC) * Math.cos(p) * dist, look.y + Math.sin(p) * dist, rover.z + Math.cos(yawC) * Math.cos(p) * dist);
      var floor = groundY(want.x, want.z) + 1.5;
      if (want.y < floor) want.y = floor;
      if (snap) { camPos.copy(want); camLook.copy(look); }
      else { camPos.lerp(want, 0.18); camLook.lerp(look, 0.3); }
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sky.position.copy(camera.position);
    roverTag.visible = cam.mode === 'chase' && cam.dist > 250;
    roverTag.position.set(rover.x, rover.y + 4 + cam.dist * 0.03, rover.z);
    sun.position.copy(roverMesh.position).add(tmp.set(-120, 220, -90));
    sun.target.position.copy(roverMesh.position);
  }

  function setCamMode(mode) {
    cam.mode = mode;
    cam.mastYaw = 0; cam.mastPitch = -0.05;
    document.getElementById('cam').textContent = 'Camera: ' + (mode === 'mast' ? 'mast cam' : 'chase');
    roverMesh.visible = true;
    updateCamera(true);
  }

  // -------------------------------------------------------------- waypoints
  function nearestSpot() {
    var best = null, bd = Infinity;
    world.beacons.forEach(function (bc) {
      var d = Math.hypot(bc.x - rover.x, bc.z - rover.z);
      var da = Math.hypot(bc.ax - rover.x, bc.az - rover.z);
      var dd = Math.min(d, da);
      if (dd < world.cfg.arrive && dd < bd) { bd = dd; best = bc; }
    });
    return best;
  }

  function showCard(bc) {
    var card = document.getElementById('card');
    if (!bc) { card.hidden = true; activeSpot = null; return; }
    if (activeSpot === bc) return;
    activeSpot = bc;
    var m = bc.match, side = world.site, other = side === 'mars' ? 'earth' : 'mars';
    var here = m[side], twin = m[other];
    document.getElementById('card-num').textContent = m.id;
    document.getElementById('card-num').className = 'num ' + side;
    document.getElementById('card-title').textContent = m.title + ': ' + here.label + (here.approx ? ' ≈' : '');
    document.getElementById('card-here').textContent = here.note;
    document.getElementById('card-twin-label').textContent = 'Its twin on ' + SITES[other].body + ': ' + twin.label + (twin.approx ? ' ≈' : '');
    document.getElementById('card-twin-label').className = 'twin-label ' + other;
    document.getElementById('card-twin').textContent = twin.note;
    var go = document.getElementById('card-go');
    go.textContent = 'Drive to the twin on ' + SITES[other].body + ' →';
    go.onclick = function () { switchSite(other, m.id); };
    card.hidden = false;
  }

  function teleport(x, z, heading) {
    rover.x = x; rover.z = z; rover.speed = 0;
    if (heading !== undefined) rover.heading = heading;
    orientRover(true);
    world.rockCell = null;
    updateRocks();
    updateCamera(true);
  }

  function goToSpot(id) {
    var bc = world.beacons.filter(function (b) { return b.match.id === id; })[0];
    if (!bc) return;
    var hd = rover.heading;
    if (bc.ax !== bc.x || bc.az !== bc.z) hd = Math.atan2(bc.x - bc.ax, -(bc.z - bc.az));   // face the feature
    teleport(bc.ax, bc.az, hd);
  }

  // -------------------------------------------------------------- minimap
  var mini = document.getElementById('minimap'), miniCtx = mini.getContext('2d'), miniBase = null;
  function prepMinimap(pack) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    mini.width = mini.height = 200 * dpr;
    miniBase = null;
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = c.height = mini.width;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      miniBase = c;
    };
    img.src = pack.texture;
  }
  function drawMinimap() {
    var S = mini.width, w = world, g = miniCtx;
    g.clearRect(0, 0, S, S);
    if (miniBase) g.drawImage(miniBase, 0, 0);
    function px(x) { return (x / w.W + 0.5) * S; }
    function pz(z) { return (z / w.D + 0.5) * S; }
    var color = '#' + w.cfg.beaconColor.toString(16).padStart(6, '0'), k = S / 200;
    if (w.site === 'mars' && lake.on) {
      g.fillStyle = 'rgba(45,109,134,0.45)';           // cheap lake hint: shade cells under the level
      var step = 8, G = w.G, lvl = lake.level - w.pack.hMin;
      for (var j = 0; j < G; j += step) for (var i = 0; i < G; i += step) {
        if (w.heights[j * G + i] < lvl) g.fillRect(i / G * S, j / G * S, step / G * S + 0.5, step / G * S + 0.5);
      }
    }
    g.font = '600 ' + 11 * k + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    w.beacons.forEach(function (bc) {
      g.fillStyle = color; g.beginPath(); g.arc(px(bc.x), pz(bc.z), 7 * k, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5 * k; g.stroke();
      g.fillStyle = '#0b0d12'; g.fillText(String(bc.match.id), px(bc.x), pz(bc.z) + 0.5 * k);
    });
    var rx = px(rover.x), rz = pz(rover.z);
    var yaw = rover.heading + (cam.mode === 'mast' ? cam.mastYaw : cam.yaw);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(rx, rz);
    g.arc(rx, rz, 34 * k, yaw - Math.PI / 2 - 0.5, yaw - Math.PI / 2 + 0.5); g.closePath(); g.fill();
    g.save(); g.translate(rx, rz); g.rotate(rover.heading);
    g.fillStyle = '#ffd166'; g.strokeStyle = '#0b0d12'; g.lineWidth = 1.5 * k;
    g.beginPath(); g.moveTo(0, -8 * k); g.lineTo(6 * k, 7 * k); g.lineTo(0, 3 * k); g.lineTo(-6 * k, 7 * k); g.closePath();
    g.fill(); g.stroke(); g.restore();
  }
  mini.addEventListener('click', function (e) {
    var r = mini.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width - 0.5) * world.W, z = ((e.clientY - r.top) / r.height - 0.5) * world.D;
    var why = blocked(x, z);
    if (why) { toast(why); return; }
    teleport(x, z);
  });

  // ------------------------------------------------------------------ HUD
  var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function fmtNum(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  var hudT = 0;
  function updateHud(sl, dt) {
    hudT += dt; if (hudT < 0.1) return; hudT = 0;
    var spd = Math.abs(rover.speed);
    document.getElementById('h-speed').textContent = spd.toFixed(1);
    document.getElementById('h-fact').textContent = spd > 0.5
      ? fmtNum(spd / PERSEVERANCE_TOP_SPEED) + '× Perseverance\'s top speed'
      : 'Perseverance tops out at 0.042 m/s';
    var deg = ((rover.heading * 180 / Math.PI) % 360 + 360) % 360;
    document.getElementById('h-heading').textContent = COMPASS[Math.round(deg / 45) % 8] + ' ' + deg.toFixed(0) + '°';
    var el = elevation(rover.x, rover.z), txt = fmtNum(el) + ' m';
    if (world.site === 'mars') {
      txt += ' (Mars datum)';
      if (lake.on && el < lake.level) txt += ' · ' + fmtNum(lake.level - el) + ' m under the lake';
    } else txt += ' above sea level';
    document.getElementById('h-elev').textContent = txt;
    var se = document.getElementById('h-slope');
    se.textContent = sl.slope.toFixed(0) + '°';
    se.className = sl.slope > MAX_CLIMB_DEG ? 'bad' : sl.slope > 20 ? 'warn' : '';
    var ll = world.toLatLon(rover.x, rover.z);
    document.getElementById('h-pos').textContent = ll.lat.toFixed(4) + '° N, ' + ll.lon.toFixed(4) + '° E';
    document.getElementById('h-odo').textContent = rover.odo < 1000 ? fmtNum(rover.odo) + ' m' : fmtNum(rover.odo / 1000, 2) + ' km';
  }

  // ------------------------------------------------------------- site load
  var switching = null;
  function switchSite(site, spotId) {
    if (switching) return switching;
    var name = PACK[site];
    document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.site === site)); });
    document.getElementById('lake-ctl').hidden = site !== 'mars';
    setLoading('Loading ' + SITES[site].name + ' terrain…');
    var have = MTF.TERRAIN && MTF.TERRAIN[name];
    switching = (have ? Promise.resolve() : loadScript('data/terrain-' + name + '.js'))
      .then(function () { return decodeHeights(MTF.TERRAIN[name]); })
      .then(function (heights) {
        if (world) disposeWorld(world);
        world = makeWorld(site, MTF.TERRAIN[name], heights);
        world.group.scale.y = exag;
        var cfg = world.cfg;
        skyMat.uniforms.top.value.setHex(cfg.skyTop);
        skyMat.uniforms.horizon.value.setHex(cfg.skyHorizon);
        scene.fog = new THREE.FogExp2(cfg.fog, cfg.fogDensity);
        sun.color.setHex(cfg.sun); sun.intensity = cfg.sunI;
        hemi.color.setHex(cfg.hemiSky); hemi.groundColor.setHex(cfg.hemiGround); hemi.intensity = cfg.hemiI;
        buildObjects(world);
        placeObjects();
        prepMinimap(world.pack);
        document.getElementById('h-grav').textContent = cfg.gravity + ' m/s² (' + (cfg.gravity / 9.81).toFixed(2) + ' g)';
        document.getElementById('credits').textContent = world.pack.credits.join(' · ') + ' · Hotspots: see Maps page for sources';
        activeSpot = null; showCard(null);
        rover.odo = 0;
        var id = spotId || cfg.start.spot;
        var bc = world.beacons.filter(function (b) { return b.match.id === id; })[0];
        if (spotId) goToSpot(spotId);
        else teleport(bc.ax, bc.az, cfg.start.heading * Math.PI / 180);
        history.replaceState(null, '', '?site=' + site + (spotId ? '&spot=' + spotId : ''));
        setLoading(null);
      })
      .catch(function (err) {
        setLoading('Could not load terrain: ' + err.message);
        console.error(err);
      })
      .then(function () { switching = null; });
    return switching;
  }

  // --------------------------------------------------------------- input
  var KEYMAP = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'boost', ShiftRight: 'boost' };
  window.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    var k = KEYMAP[e.code];
    if (k) { keys[k] = 1; e.preventDefault(); return; }
    if (!world || e.repeat) return;
    if (e.code === 'KeyC') setCamMode(cam.mode === 'chase' ? 'mast' : 'chase');
    else if (e.code === 'KeyR') switchSite(world.site);
    else if (/^Digit[1-5]$/.test(e.code)) goToSpot(Number(e.code.slice(5)));
  });
  window.addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) keys[k] = 0; });
  window.addEventListener('blur', function () { for (var k in keys) keys[k] = 0; });

  document.querySelectorAll('.pad button').forEach(function (b) {
    var k = b.dataset.key;
    b.addEventListener('pointerdown', function (e) { keys[k] = 1; b.setPointerCapture(e.pointerId); e.preventDefault(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { keys[k] = 0; }); });
  });

  var drag = null;
  canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (cam.mode === 'mast') {
      cam.mastYaw += dx * 0.004; cam.mastPitch = Math.max(-1.2, Math.min(0.8, cam.mastPitch - dy * 0.004));
    } else {
      cam.yaw -= dx * 0.005; cam.pitch = Math.max(0.02, Math.min(1.45, cam.pitch + dy * 0.004));
    }
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { canvas.addEventListener(ev, function () { drag = null; }); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (cam.mode !== 'chase') return;
    cam.dist = Math.max(6, Math.min(25000, cam.dist * Math.exp(e.deltaY * 0.0015)));
  }, { passive: false });
  canvas.addEventListener('dblclick', function () { cam.yaw = 0; cam.pitch = 0.28; cam.dist = 16; });

  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () { if (!world || world.site !== b.dataset.site) switchSite(b.dataset.site); });
  });
  document.getElementById('cam').addEventListener('click', function () { setCamMode(cam.mode === 'chase' ? 'mast' : 'chase'); });

  var exagIn = document.getElementById('exag');
  exagIn.addEventListener('input', function () {
    exag = Number(exagIn.value);
    document.getElementById('exag-out').textContent = exag + '×';
    if (!world) return;
    world.group.scale.y = exag;
    placeObjects();
    orientRover(true);
  });

  var lakeIn = document.getElementById('lake'), lakeLvl = document.getElementById('lake-level');
  function syncLake() {
    lake.on = lakeIn.checked; lake.level = Number(lakeLvl.value);
    document.getElementById('lake-out').textContent = fmtNum(lake.level) + ' m';
    if (world) placeObjects();
  }
  lakeIn.addEventListener('change', function () {
    syncLake();
    if (lake.on) toast('Jezero ~3.5 billion years ago: modelled lake levels range about −2,500 to −2,390 m.');
  });
  lakeLvl.addEventListener('input', syncLake);
  syncLake();

  var help = document.getElementById('help');
  function closeHelp() { help.hidden = true; canvas.focus(); }
  document.getElementById('help-close').addEventListener('click', closeHelp);
  document.getElementById('help-btn').addEventListener('click', function () { help.hidden = false; });
  help.addEventListener('click', function (e) { if (e.target === help) closeHelp(); });

  // ---------------------------------------------------------------- loop
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  // Keep overlays clear of the top bar, which wraps to two lines on narrow screens.
  var bar = document.querySelector('.bar');
  function barOffset() { document.documentElement.style.setProperty('--bar-bottom', bar.getBoundingClientRect().bottom + 'px'); }
  if (window.ResizeObserver) new ResizeObserver(barOffset).observe(bar);
  barOffset();

  var last = performance.now(), miniT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!world || switching) return;
    var sl = drive(dt);
    updateRocks();
    updateCamera(false);
    showCard(nearestSpot());
    updateHud(sl, dt);
    miniT += dt; if (miniT > 0.07) { miniT = 0; drawMinimap(); }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  if (typeof DecompressionStream === 'undefined') {
    setLoading('This browser is too old for the 3D view (needs DecompressionStream). Try a current Chrome, Edge, Firefox or Safari.');
    return;
  }
  var params = new URLSearchParams(location.search);
  var startSite = params.get('site') === 'earth' ? 'earth' : 'mars';
  var startSpot = Number(params.get('spot')) || null;
  switchSite(startSite, startSpot);

  window.MTF.rover = { renderer: renderer, scene: scene, camera: camera, drawMinimap: function () { drawMinimap(); },
    // Debug/test hook: advance the simulation without waiting for animation frames.
    simulate: function (seconds) {
      for (var t = 0; t < seconds; t += 1 / 60) { var sl = drive(1 / 60); updateRocks(); updateCamera(false); showCard(nearestSpot()); updateHud(sl, 1); }
    },
    rover: rover, cam: cam, keys: keys, get world() { return world; }, switchSite: switchSite, goToSpot: goToSpot, heightAt: heightAt };
})();
