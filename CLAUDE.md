# Mars Twin Finder — NASA Space Apps 2026

## Project
Build a web simulation that matches **Lake Salda (Türkiye)** to **Jezero Crater (Mars)**,
then generalizes the method to find *new* terrestrial Mars analogs.

**Challenge:** Use open Earth, Moon, and Mars data to identify and characterize new
terrestrial analog sites for future bases or landing sites.

**Team lead:** Dennis — builder, coding + product design, runs a Lego business.
Starts building day one.

## The hero comparison

| Site | Latitude | Longitude | Notes |
|---|---|---|---|
| Jezero Crater (center) | 18.41° N | 77.69° E | 47.5 km wide, W edge of Isidis Planitia (IAU gazetteer) |
| Perseverance landing site | 18.4447° N | 77.4508° E | Octavia E. Butler Landing |
| Lake Salda, Burdur, Türkiye | 37.547° N | 29.679° E | ~7.5 km wide (43.7 km², OSM outline), ~196 m deep, closed basin |

Mars longitudes are planetocentric degrees East (0–360).

**Why they match:**
- Hydromagnesite / carbonate deposits (Salda's white shoreline; Jezero's delta carbonates)
- Ancient lake + river delta setting in both
- Microbialites / stromatolite-like structures at Salda — the biosignature target
  Perseverance is sampling for
- Ultramafic (serpentine-rich) bedrock weathering into Mg-carbonates

**Honest difference:** Salda is a *closed* basin; Jezero was *open* (drained east through
Pliva Vallis). Say so on the page — judges respect it.

## Build plan

### Phase 1 — Side-by-side comparison (MVP) — built
`index.html` + `js/app.js` + `data/sites.js` (hotspot pairs, outline, sources).
Split-screen page: Earth map (Salda) left, Mars map (Jezero) right, synced zoom.
Annotated hotspots on each side pointing out the matching features
(delta, carbonate shoreline, closed basin rim).

### Phase 1b — 3D rover drive — built
`rover.html` + `js/rover.js` (three.js r149 UMD, vendored). Terrain packs
`data/terrain-{jezero,salda}.js` come from `tools/build_terrain.py`; they hold gzipped Uint16
heights + a JPEG data URI, because file:// blocks fetch() and taints image pixels.
`MTF.rover.simulate(seconds)` advances physics without rAF (handy for testing; the browser
pane throttles rAF to ~1 fps when the window isn't focused).

### Phase 2 — Similarity engine
Score any location on Earth for "Mars-likeness" across weighted factors:
- Aridity / rainfall
- Diurnal + seasonal temperature range
- Vegetation (NDVI — low is Mars-like)
- Terrain roughness / elevation
- Surface mineralogy (carbonates, iron oxides, basalt, ultramafic)

Normalize each 0–1, user-adjustable weight sliders, sum to a score.

### Phase 3 — Validation + discovery
Validate: known analogs (Atacama, Haughton Crater, Death Valley, Icelandic lava fields,
Antarctic Dry Valleys, Salda) must score high.
Then surface high-scoring places that are *not* yet recognized analogs. **This is the
money shot of the demo.**

## Data sources (all open)
- **Mars imagery:** NASA Mars Trek (https://trek.nasa.gov/mars/) — has a Jezero layer;
  CTX + HiRISE basemaps, CRISM mineral maps
- **Earth imagery:** Copernicus Browser (Sentinel-2), NASA Worldview (MODIS)
- **Climate:** NASA POWER API (easiest start), NASA GPM, Global Aridity Index
- **Vegetation:** MODIS NDVI
- **Terrain:** SRTM, Copernicus DEM
- **Mars elevation:** MOLA

## Stack
- Single-page web app, Leaflet (or Mapbox GL) for both maps
- Python preprocessing → small GeoJSON / grid file committed to repo
- Keep it self-contained so it demos offline if venue wifi dies

## Repo layout
- `index.html`, `css/style.css`, `js/app.js` — the page (no build step)
- `data/*.js` — data as `window.MTF.*` globals, loaded by `<script>` so file:// works
- `vendor/leaflet/` — Leaflet 1.9.4, vendored for offline use
- Mars maps use `L.CRS.EPSG4326` with R = 3,396,190 m; Trek tile z/x/y matches it directly.
  Don't use `L.circle` on Mars (it hardcodes Earth's radius) — build rings by hand.

## Conventions
- Demo must run from a static file. No server dependency at judging time.
- Cite every dataset on the page itself — judges look for this.
- Commit early, commit often. The submission page needs a working link.

## Open questions
- [ ] Exact local event deadline
- [ ] Team size and skills
