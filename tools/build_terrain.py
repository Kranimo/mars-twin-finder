"""Build the 3D terrain packs used by rover.html.

Downloads open elevation + imagery for each site, resamples them onto a regular
lat/lon grid, and writes data/terrain-<site>.js: a plain script that sets
window.MTF.TERRAIN[<site>] so the page works from file:// with no server.

  Mars / Jezero:  Mars 2020 CTX DTM (20 m) + CTX orthomosaic (6 m), USGS Astrogeology
  Earth / Salda:  AWS Terrain Tiles (terrarium; SRTM-based) + Sentinel-2 cloudless 2020 (EOX)

Usage:  python -P tools/build_terrain.py [jezero|salda ...]
Needs:  pip install numpy tifffile imagecodecs pillow
"""
import base64
import gzip
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data-raw'          # downloads (gitignored)
OUT = ROOT / 'data'
UA = {'User-Agent': 'mars-twin-finder/0.2 (NASA Space Apps hackathon)'}

GRID = 1024                      # height samples per side
MARS_R = 3396190.0

SITES = {
    'jezero': {
        'body': 'mars',
        'dtm': 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif',
        'ortho': 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif',
        'tex': 4096,
        'credits': [
            'Elevation: Mars 2020 CTX DTM, 20 m (NASA/JPL-Caltech/USGS)',
            'Imagery: Mars 2020 CTX orthomosaic, 6 m (NASA/JPL-Caltech/MSSS/USGS)',
        ],
    },
    'salda': {
        'body': 'earth',
        'bounds': (37.470, 37.625, 29.590, 29.780),   # S, N, W, E
        'dem_zoom': 13,
        'img_zoom': 14,
        'tex': 2048,
        'credits': [
            'Elevation: AWS Terrain Tiles (Mapzen; SRTM, NASA/USGS)',
            'Imagery: Sentinel-2 cloudless 2020 by EOX (contains modified Copernicus Sentinel data 2020, CC BY-NC-SA 4.0)',
        ],
    },
}


def fetch(url, dest=None):
    if dest and dest.exists():
        return dest.read_bytes()
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        data = r.read()
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return data


def bilinear(img, fx, fy):
    """Sample a 2D array at fractional pixel coords (arrays of equal shape)."""
    h, w = img.shape[:2]
    fx = np.clip(fx, 0, w - 1.0001)
    fy = np.clip(fy, 0, h - 1.0001)
    x0 = fx.astype(int); y0 = fy.astype(int)
    tx = fx - x0; ty = fy - y0
    if img.ndim == 3:
        tx = tx[..., None]; ty = ty[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def geotiff_degrees(tif):
    """Return (lon0, lat0, dlon, dlat) of pixel (0,0)'s corner for an Eqc Mars GeoTIFF in metres."""
    page = tif.pages[0]
    sx, sy, _ = page.tags['ModelPixelScaleTag'].value
    tie = page.tags['ModelTiepointTag'].value
    x0, y0 = tie[3], tie[4]
    k = 180 / math.pi / MARS_R   # equirectangular, standard parallel 0
    return x0 * k, y0 * k, sx * k, -sy * k


def fill_nodata(a, bad):
    """Replace masked cells with the nearest valid value along rows then columns."""
    if not bad.any():
        return a
    a = a.copy(); a[bad] = np.nan
    for axis in (1, 0):
        b = a if axis == 1 else a.T
        for row in b:
            m = np.isnan(row)
            if m.all() or not m.any():
                continue
            idx = np.where(~m, np.arange(len(row)), 0)
            np.maximum.accumulate(idx, out=idx)
            row[m] = row[idx[m]]
            m = np.isnan(row)
            if m.any():                          # leading gap: fill backwards
                first = np.argmax(~m); row[:first] = row[first]
    return np.nan_to_num(a, nan=np.nanmin(a))


# ------------------------------------------------------------------- Mars
def build_jezero(cfg):
    dtm_path = RAW / 'jezero_dtm.tif'
    ortho_path = RAW / 'jezero_ortho.tif'
    print('  downloading DTM / ortho (cached in data-raw/)')
    fetch(cfg['dtm'], dtm_path)
    fetch(cfg['ortho'], ortho_path)

    with tifffile.TiffFile(dtm_path) as t:
        dtm = t.pages[0].asarray().astype(np.float64)
        lon0, lat0, dlon, dlat = geotiff_degrees(t)
    bad = ~np.isfinite(dtm) | (dtm < -1e6) | (dtm > 1e6)
    dtm = fill_nodata(dtm, bad)
    rows, cols = dtm.shape
    west, north = lon0, lat0
    east, south = lon0 + dlon * cols, lat0 + dlat * rows
    # trim a few pixels of edge nodata
    pad_lon, pad_lat = 4 * dlon, -4 * dlat
    bounds = (south + pad_lat, north - pad_lat, west + pad_lon, east - pad_lon)
    print('  DTM %dx%d  bounds S%.4f N%.4f W%.4f E%.4f' % ((cols, rows) + bounds))

    lats = np.linspace(bounds[1], bounds[0], GRID)           # north -> south
    lons = np.linspace(bounds[2], bounds[3], GRID)
    LON, LAT = np.meshgrid(lons, lats)
    heights = bilinear(dtm, (LON - lon0) / dlon - 0.5, (LAT - lat0) / dlat - 0.5)

    with tifffile.TiffFile(ortho_path) as t:
        ortho = t.pages[0].asarray()
        olon0, olat0, odlon, odlat = geotiff_degrees(t)
    if ortho.ndim == 3:
        ortho = ortho[..., 0]
    ortho = ortho.astype(np.float32)
    n = cfg['tex']
    tl = np.linspace(bounds[1], bounds[0], n); tg = np.linspace(bounds[2], bounds[3], n)
    TG, TL = np.meshgrid(tg, tl)
    tex = bilinear(ortho, (TG - olon0) / odlon - 0.5, (TL - olat0) / odlat - 0.5)
    # contrast stretch (ignore nodata zeros), then a warm Mars tint
    valid = tex[tex > 0]
    lo, hi = np.percentile(valid, [1, 99.5])
    g = np.clip((tex - lo) / (hi - lo), 0, 1)
    rgb = np.stack([g * 0.98 + 0.02, g * 0.80 + 0.03, g * 0.62 + 0.02], -1)
    img = Image.fromarray((rgb * 255).astype(np.uint8))
    return bounds, heights, img, MARS_R


# ------------------------------------------------------------------ Earth
def merc(lat, lon, z):
    n = 256 * 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n
    return x, y


def stitch(url_fmt, bounds, z, cache_prefix, decode):
    s, nb, w, e = bounds
    x0, y0 = merc(np.array(nb), np.array(w), z)
    x1, y1 = merc(np.array(s), np.array(e), z)
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    tiles = None
    for ty in range(ty0, ty1 + 1):
        row = []
        for tx in range(tx0, tx1 + 1):
            raw = fetch(url_fmt.format(z=z, x=tx, y=ty), RAW / ('%s_%d_%d_%d' % (cache_prefix, z, tx, ty)))
            row.append(decode(Image.open(io.BytesIO(raw))))
        row = np.concatenate(row, 1)
        tiles = row if tiles is None else np.concatenate([tiles, row], 0)
    return tiles, tx0 * 256, ty0 * 256


def terrarium(im):
    a = np.asarray(im.convert('RGB')).astype(np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def build_salda(cfg):
    bounds = cfg['bounds']
    print('  downloading terrain + imagery tiles (cached in data-raw/)')
    dem, ox, oy = stitch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
                         bounds, cfg['dem_zoom'], 'terrarium', terrarium)
    lats = np.linspace(bounds[1], bounds[0], GRID)
    lons = np.linspace(bounds[2], bounds[3], GRID)
    LON, LAT = np.meshgrid(lons, lats)
    px, py = merc(LAT, LON, cfg['dem_zoom'])
    heights = bilinear(dem, px - ox - 0.5, py - oy - 0.5)

    img, ix, iy = stitch('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
                         bounds, cfg['img_zoom'], 's2c',
                         lambda im: np.asarray(im.convert('RGB')).astype(np.float32))
    n = cfg['tex']
    tl = np.linspace(bounds[1], bounds[0], n); tg = np.linspace(bounds[2], bounds[3], n)
    TG, TL = np.meshgrid(tg, tl)
    qx, qy = merc(TL, TG, cfg['img_zoom'])
    tex = bilinear(img, qx - ix - 0.5, qy - iy - 0.5)
    return bounds, heights, Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)), 6371008.8


# ------------------------------------------------------------------ output
def write_pack(name, cfg, bounds, heights, img, radius):
    s, n, w, e = bounds
    latc = (s + n) / 2
    width_m = math.radians(e - w) * radius * math.cos(math.radians(latc))
    depth_m = math.radians(n - s) * radius
    hmin, hmax = float(heights.min()), float(heights.max())
    scale = (hmax - hmin) / 65535 or 1
    q = np.round((heights - hmin) / scale).astype('<u2')
    hgz = gzip.compress(q.tobytes(), 9)

    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=82, optimize=True, progressive=True)

    pack = {
        'site': name, 'body': cfg['body'],
        'bounds': {'south': s, 'north': n, 'west': w, 'east': e},
        'widthM': round(width_m, 2), 'depthM': round(depth_m, 2),
        'grid': GRID, 'hMin': hmin, 'hScale': scale,
        'credits': cfg['credits'],
    }
    js = ('// Generated by tools/build_terrain.py — do not edit.\n'
          'window.MTF = window.MTF || {}; MTF.TERRAIN = MTF.TERRAIN || {};\n'
          'MTF.TERRAIN[%s] = Object.assign(%s, {\n'
          '  heightsGz: "%s",\n'
          '  texture: "data:image/jpeg;base64,%s"\n});\n') % (
        json.dumps(name), json.dumps(pack),
        base64.b64encode(hgz).decode(), base64.b64encode(buf.getvalue()).decode())
    path = OUT / ('terrain-%s.js' % name)
    path.write_text(js, encoding='utf-8')
    print('  %s: %.1f x %.1f km, h %.0f..%.0f m, heights %.0f KB gz, texture %.0f KB -> %s (%.1f MB)' % (
        name, width_m / 1000, depth_m / 1000, hmin, hmax, len(hgz) / 1024, buf.tell() / 1024,
        path.relative_to(ROOT), path.stat().st_size / 1e6))


def main(names):
    for name in names or SITES:
        cfg = SITES[name]
        print(name)
        build = build_jezero if name == 'jezero' else build_salda
        write_pack(name, cfg, *build(cfg))


if __name__ == '__main__':
    main(sys.argv[1:])
