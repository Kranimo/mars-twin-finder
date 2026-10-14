# Mars Twin Finder

NASA Space Apps Challenge 2026. Lake Salda (Türkiye) and Jezero Crater (Mars) side by side,
with numbered hotspots showing why Salda is one of Earth's closest analogs to the
lake Perseverance is exploring.

**Live demo:** https://kranimo.github.io/mars-twin-finder/ · 3D rover: https://kranimo.github.io/mars-twin-finder/rover.html

## Run it

Open `index.html` in a browser. No build step, no server. On the 2D map page, tiles stream from
NASA Mars Trek, Esri and EOX, so it needs an internet connection. The 3D rover page
(`rover.html`) stores its terrain in the repo and works fully offline.

## What's on the page

- **Earth (left):** Lake Salda on Esri World Imagery or Sentinel-2 cloudless, with the
  lake outline from OpenStreetMap.
- **Mars (right):** Jezero on NASA Mars Trek's CTX and HiRISE mosaics, or MOLA elevation,
  with the crater rim from the IAU gazetteer.
- **Sync:** *Matched framing* scales each basin to fill its map. *True scale* makes a kilometre
  the same length on both, which shows that Jezero is about 6× wider.
- **Five matches:** basin, delta, carbonate shoreline, ultramafic source rock, and
  biosignature target. Click a card or a marker to fly both maps to the pair.

### 3D rover drive (`rover.html`)

- Real terrain:
  - **Jezero:** 30 × 30 km from the Mars 2020 CTX elevation model (20 m) with the 6 m CTX orthomosaic.
  - **Salda:** 17 × 17 km from SRTM-based AWS Terrain Tiles with Sentinel-2 cloudless imagery.
- Drive with WASD or the arrow keys, Shift to boost, or the on-screen pad on touch screens. Drag to look
  around and scroll to zoom out to a drone view. `C` switches to the mast camera.
- Beacons mark the five match pairs. Arrive at one to read about it, then
  **Drive to the twin**, which jumps you to the matching feature on the other planet.
- **Refill ancient lake** floods Jezero to a chosen level. Published models put the lake at about
  −2,500 to −2,390 m, which turns the west rim into a shoreline like Salda's.
- The HUD shows real elevation, slope, gravity (0.38 g vs 1 g), and your speed compared with Perseverance's
  0.042 m/s top speed. The rover can't drive into Salda's lake and stops on grades over 30°.

Rebuild the terrain packs (cached downloads go in the gitignored `data-raw/`):

```bash
pip install numpy tifffile imagecodecs pillow
python -P tools/build_terrain.py
```

Every dataset and paper is cited in the page footer and in `data/sites.js`.
