# Mars Twin Finder

NASA Space Apps Challenge 2026. Lake Salda (Türkiye) and Jezero Crater (Mars) side by side,
with numbered hotspots showing why Salda is one of Earth's closest analogs to the
lake Perseverance is exploring.

## Run it

Open `index.html` in a browser. No build step, no server. Map tiles stream from
NASA Mars Trek, Esri and EOX, so imagery needs an internet connection.

## What's on the page

- **Earth (left):** Lake Salda on Esri World Imagery or Sentinel-2 cloudless, with the
  lake outline from OpenStreetMap.
- **Mars (right):** Jezero on NASA Mars Trek's CTX and HiRISE mosaics, or MOLA elevation,
  with the crater rim from the IAU gazetteer.
- **Sync:** *Matched framing* scales each basin to fill its map. *True scale* makes a kilometre
  the same length on both, which shows that Jezero is about 6× wider.
- **Five matches:** basin, delta, carbonate shoreline, ultramafic source rock, and
  biosignature target. Click a card or a marker to fly both maps to the pair.

Every dataset and paper is cited in the page footer and in `data/sites.js`.
