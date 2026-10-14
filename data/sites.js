// Hero comparison data: Lake Salda (Earth) <-> Jezero Crater (Mars).
// Loaded as a plain <script> (not fetched) so the page works from file://.
//
// Coordinate sources
//   Mars: IAU / USGS Gazetteer of Planetary Nomenclature (planetocentric, +East).
//         Points flagged `approx: true` were placed by eye on Mars Trek imagery.
//   Earth: lake outline from OpenStreetMap (Nominatim, simplified ~12 m tolerance).
//         Points flagged `approx: true` were placed by eye on satellite imagery.

window.MTF = window.MTF || {};

MTF.SITES = {
  earth: {
    body: 'Earth',
    name: 'Lake Salda',
    region: 'Burdur, Türkiye',
    radiusM: 6378137,             // Leaflet EPSG:3857 sphere
    center: [37.547, 29.679],     // centroid of the OSM lake polygon
    diameterKm: 7.5,              // equivalent diameter of the 43.7 km² polygon
    facts: '43.7 km² · ~196 m deep · closed basin · pH > 9',
    outline: [[37.56415,29.64137],[37.56368,29.64147],[37.56218,29.64263],[37.56114,29.64407],[37.55959,29.64559],[37.55845,29.64757],[37.55731,29.64796],[37.55644,29.64777],[37.5529,29.64587],[37.55067,29.64575],[37.54976,29.6455],[37.54713,29.64426],[37.54354,29.64213],[37.54127,29.64167],[37.53946,29.64221],[37.53814,29.64352],[37.53677,29.64558],[37.53556,29.64811],[37.5347,29.65046],[37.53434,29.65231],[37.53442,29.65398],[37.53477,29.65475],[37.53543,29.65508],[37.5357,29.65556],[37.53512,29.65622],[37.53466,29.65749],[37.53389,29.65825],[37.5318,29.65752],[37.53085,29.65751],[37.53023,29.65775],[37.52784,29.66004],[37.52591,29.66316],[37.52206,29.66843],[37.52088,29.67107],[37.52018,29.67439],[37.52014,29.6775],[37.52041,29.68138],[37.52022,29.68258],[37.51833,29.68477],[37.51745,29.68508],[37.51726,29.68569],[37.51688,29.68588],[37.51651,29.68645],[37.51598,29.68825],[37.51399,29.689],[37.51332,29.68957],[37.51282,29.69033],[37.51219,29.69213],[37.51156,29.6958],[37.5101,29.70012],[37.50939,29.70512],[37.50957,29.70681],[37.51047,29.70933],[37.5121,29.71268],[37.51364,29.71529],[37.51474,29.71605],[37.51683,29.71643],[37.51835,29.71711],[37.5194,29.71806],[37.52005,29.71967],[37.52015,29.72041],[37.52182,29.72226],[37.52317,29.72336],[37.52435,29.72366],[37.52601,29.72291],[37.5268,29.72203],[37.52744,29.72093],[37.53183,29.71714],[37.53423,29.71642],[37.53526,29.71641],[37.53744,29.71692],[37.54165,29.71867],[37.54323,29.71895],[37.54745,29.71874],[37.55137,29.71796],[37.55253,29.71807],[37.55577,29.7169],[37.55682,29.71696],[37.55885,29.71765],[37.56266,29.71718],[37.56729,29.71495],[37.57083,29.71209],[37.57377,29.70866],[37.57883,29.70096],[37.58061,29.69758],[37.58333,29.69165],[37.58439,29.68837],[37.58518,29.68484],[37.58573,29.67998],[37.58561,29.67847],[37.58522,29.67715],[37.58504,29.67566],[37.58506,29.67406],[37.58546,29.67179],[37.58553,29.67016],[37.58535,29.66712],[37.58502,29.66532],[37.58426,29.66289],[37.58337,29.66097],[37.58252,29.65994],[37.5805,29.65843],[37.57986,29.6582],[37.57972,29.65758],[37.57873,29.65586],[37.57853,29.65414],[37.57868,29.65252],[37.57889,29.6515],[37.57958,29.65032],[37.57968,29.64947],[37.57892,29.64754],[37.57744,29.64551],[37.5753,29.64344],[37.57287,29.64173],[37.57212,29.64172],[37.57058,29.64254],[37.56971,29.64271],[37.56651,29.6417],[37.56415,29.64137]],
    labels: []
  },
  mars: {
    body: 'Mars',
    name: 'Jezero Crater',
    region: 'Isidis Planitia, Mars',
    radiusM: 3396190,             // Mars 2000 sphere (matches Mars Trek tiles)
    center: [18.41, 77.69],       // IAU gazetteer
    diameterKm: 47.52,            // IAU gazetteer
    facts: '47.5 km impact crater · lake ~3.5–3.8 billion years ago · open basin',
    labels: [
      { latlng: [18.55, 77.20], text: 'Neretva Vallis (inlet)' },
      { latlng: [19.09, 77.13], text: 'Sava Vallis (inlet)' },
      { latlng: [18.67, 78.35], text: 'Pliva Vallis (outlet)' },
      { latlng: [18.48, 77.38], text: 'Belva crater' }
    ]
  }
};

// Each match is one numbered pair of hotspots. `zoom` is the Earth zoom used
// when flying to the pair; the Mars zoom follows from the current sync mode.
MTF.MATCHES = [
  {
    id: 1,
    title: 'A lake in a basin',
    why: 'Both are bowl-shaped basins that held standing water fed by rivers. One honest difference: Salda is closed (water leaves only by evaporation), while Jezero overflowed through an outlet valley on its east rim.',
    zoom: 12.6,
    earth: { latlng: [37.547, 29.679], label: 'Salda basin',
      note: 'Closed-basin soda lake, ~7 km across and ~196 m deep. With no outlet, dissolved Mg and carbonate concentrate until minerals precipitate.' },
    mars: { latlng: [18.41, 77.69], label: 'Jezero paleolake',
      note: '47.5 km crater that held a lake ~3.5–3.8 billion years ago. Neretva and Sava Valles fed it; Pliva Vallis drained it to the east.' }
  },
  {
    id: 2,
    title: 'River-built delta',
    why: 'Rivers carried sediment from the surrounding highlands and dropped it where they met still water, building fan-shaped deposits that record the watershed\'s minerals.',
    zoom: 14.2,
    earth: { latlng: [37.532, 29.651], label: 'SW fan-delta', approx: true,
      note: 'Alluvial fan-delta on the southwest shore, built from serpentinite debris washed off the hills. Salda\'s fan deposits are used to study how sediment settled at Jezero.' },
    mars: { latlng: [18.50, 77.40], label: 'Western delta',
      note: 'The ~40 m tall western fan delta, built where Neretva Vallis entered the lake. Perseverance climbed its front in 2022–23.' }
  },
  {
    id: 3,
    title: 'Carbonate shoreline',
    why: 'The headline match. Salda\'s white beaches are hydromagnesite, a Mg-carbonate; orbital CRISM spectra show Mg-carbonate along Jezero\'s inner margin, interpreted as a possible ancient shoreline.',
    zoom: 14.2,
    earth: { latlng: [37.580, 29.699], label: 'Hydromagnesite beach',
      note: 'Bright white terraces and beach sand of hydromagnesite, largely eroded from microbialite mounds. Visible from orbit as the white rim of the lake.' },
    mars: { latlng: [18.47, 77.31], label: 'Marginal carbonates', approx: true,
      note: 'The "Marginal Carbonates" unit (Horgan et al. 2020): strong carbonate signatures hugging the inner crater wall near the main inlet and delta.' }
  },
  {
    id: 4,
    title: 'Ultramafic source rock',
    why: 'Olivine- and serpentine-rich (ultramafic) rocks weather to release magnesium. That Mg is the raw ingredient for the carbonates in match 3.',
    zoom: 13.4,
    earth: { latlng: [37.552, 29.735], label: 'Serpentinized hills', approx: true,
      note: 'The lake is nearly surrounded and underlain by partially serpentinized harzburgite of the regional ophiolite belt.' },
    mars: { latlng: [18.43, 77.43], label: 'Séítah olivine unit', approx: true,
      note: 'Séítah: an olivine-rich igneous unit on the crater floor, part of the regional olivine-carbonate unit that surrounds Isidis.' }
  },
  {
    id: 5,
    title: 'Biosignature target',
    why: 'Salda\'s living microbialites show what microbe-built carbonate looks like. Perseverance is coring Jezero\'s carbonates and delta muds looking for the ancient equivalent.',
    zoom: 14.6,
    earth: { latlng: [37.5205, 29.680], label: 'Microbialites', approx: true,
      note: 'Hydromagnesite microbialites (stromatolite-like mounds) grow in the shallows around the shore, built by cyanobacteria and biofilms.' },
    mars: { latlng: [18.4447, 77.4508], label: 'Perseverance landing',
      note: 'Octavia E. Butler Landing, 18 Feb 2021. From here the rover drove to the delta and margin to collect sample cores for possible return to Earth.' }
  }
];

MTF.SOURCES = [
  { name: 'NASA Mars Trek — Jezero CTX mosaic, HiRISE mosaic, MGS MOLA colorized shaded relief', by: 'NASA/JPL-Caltech, MSSS, Univ. of Arizona, GSFC', url: 'https://trek.nasa.gov/mars/' },
  { name: 'Gazetteer of Planetary Nomenclature (Jezero, Neretva/Sava/Pliva Valles, Belva)', by: 'IAU WGPSN / USGS Astrogeology', url: 'https://planetarynames.wr.usgs.gov/' },
  { name: 'World Imagery basemap', by: 'Esri, Maxar, Earthstar Geographics', url: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9' },
  { name: 'Sentinel-2 cloudless 2020', by: 'EOX IT Services; contains modified Copernicus Sentinel data 2020 (CC BY-NC-SA 4.0)', url: 'https://s2maps.eu/' },
  { name: 'Lake Salda outline', by: '© OpenStreetMap contributors (ODbL)', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'Horgan et al. 2020, "The mineral diversity of Jezero crater: Evidence for possible lacustrine carbonates on Mars", Icarus 339, 113526', by: 'doi:10.1016/j.icarus.2019.113526', url: 'https://doi.org/10.1016/j.icarus.2019.113526' },
  { name: 'Braithwaite & Zedef 1996, "Hydromagnesite stromatolites and sediments in an alkaline lake, Salda Gölü, Turkey", Journal of Sedimentary Research', by: 'Salda microbialites', url: 'https://acikerisim.selcuk.edu.tr/items/4b14a735-8307-4420-923a-da9ed5f446db' },
  { name: 'What a lake in Turkey can tell us about Mars', by: 'NASA Earth Observatory, 2021', url: 'https://earthobservatory.nasa.gov/blogs/earthmatters/2021/02/17/what-a-lake-in-turkey-can-tell-us-about-mars/' }
];
