// Builds the flags and map data that index.html carries inline, so the game stays one file.
// Run: cd tools && npm install && npm run assets
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topo from 'topojson-client';
import { geoEquirectangular, geoPath, geoBounds } from 'd3-geo';

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = path.join(here, 'node_modules');
const indexFile = path.join(here, '..', 'index.html');

// iso2 (flag), iso numeric (map), capital latitude/longitude (pin).
const CAPITALS = {
  Paris: ['fr', 250, 48.857, 2.352], Cairo: ['eg', 818, 30.044, 31.236], Tokyo: ['jp', 392, 35.676, 139.650],
  Rome: ['it', 380, 41.903, 12.496], Madrid: ['es', 724, 40.417, -3.704], Berlin: ['de', 276, 52.520, 13.405],
  London: ['gb', 826, 51.507, -0.128], Washington: ['us', 840, 38.907, -77.037], Ottawa: ['ca', 124, 45.422, -75.697],
  Brasilia: ['br', 76, -15.794, -47.883], Beijing: ['cn', 156, 39.904, 116.407], 'New Delhi': ['in', 356, 28.614, 77.209],
  Canberra: ['au', 36, -35.281, 149.130], Moscow: ['ru', 643, 55.756, 37.617], 'Mexico City': ['mx', 484, 19.433, -99.133],
  Ankara: ['tr', 792, 39.933, 32.860], Athens: ['gr', 300, 37.984, 23.728], Lisbon: ['pt', 620, 38.722, -9.139],
  Amsterdam: ['nl', 528, 52.368, 4.904], Riyadh: ['sa', 682, 24.714, 46.675], 'Buenos Aires': ['ar', 32, -34.604, -58.382],
  Nairobi: ['ke', 404, -1.292, 36.822], Oslo: ['no', 578, 59.914, 10.752], Stockholm: ['se', 752, 59.329, 18.069],
  Warsaw: ['pl', 616, 52.230, 21.012], Bangkok: ['th', 764, 13.756, 100.502], Seoul: ['kr', 410, 37.567, 126.978],
  Rabat: ['ma', 504, 34.021, -6.842], Lima: ['pe', 604, -12.046, -77.043], Abuja: ['ng', 566, 9.077, 7.399],
  Kyiv: ['ua', 804, 50.450, 30.523], Helsinki: ['fi', 246, 60.170, 24.938], Dublin: ['ie', 372, 53.350, -6.260],
  Vienna: ['at', 40, 48.208, 16.374], Santiago: ['cl', 152, -33.449, -70.669], Jakarta: ['id', 360, -6.209, 106.846],
  Manila: ['ph', 608, 14.600, 120.984], Hanoi: ['vn', 704, 21.028, 105.834], Wellington: ['nz', 554, -41.287, 174.776]
};

// 10 map units per degree: the world is 3600 x 1800.
const W = 3600, H = 1800;
const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0);
const drawPath = geoPath(proj).digits(0);
const project = (lat, lon) => proj([lon, lat]).map(Math.round);

const load = (res) => {
  const t = JSON.parse(fs.readFileSync(path.join(nm, 'world-atlas', `countries-${res}.json`), 'utf8'));
  return topo.feature(t, t.objects.countries).features;
};
const coarse = load('110m');
const fine = load('50m');

// Background: every country, coarse.
const background = coarse.map((f) => drawPath(f) || '').join('');

const MAP = {};
const FLAGS = {};
for (const [city, [iso2, iso, lat, lon]] of Object.entries(CAPITALS)) {
  const fineF = fine.find((f) => +f.id === iso);
  const coarseF = coarse.find((f) => +f.id === iso);
  // Small countries get the detailed outline; big ones keep the light one.
  let feature = fineF && (drawPath(fineF) || '').length < 20000 ? fineF : coarseF;
  const shape = drawPath(feature);
  const pin = project(lat, lon);

  // Frame the polygons near the capital (skips far islands and overseas parts).
  const polys = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const parts = polys.map((coords) => {
    const g = { type: 'Polygon', coordinates: coords };
    const [[x0, y0], [x1, y1]] = drawPath.bounds(g);
    return { x0, y0, x1, y1, area: drawPath.area(g), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }).filter((p) => p.x1 - p.x0 < W / 2);
  const biggest = parts.reduce((a, b) => (b.area > a.area ? b : a));
  const near = (p) => Math.hypot(p.cx - pin[0], p.cy - pin[1]);
  // Big parts may sit up to 40 degrees from the capital; small islands only count when close (about 6 degrees).
  const keep = parts.filter((p) => p === biggest || (near(p) < 400 && p.area > biggest.area * 0.1) || (near(p) < 60 && p.area > biggest.area * 0.002));
  let x0 = Math.min(pin[0], ...keep.map((p) => p.x0)), x1 = Math.max(pin[0], ...keep.map((p) => p.x1));
  let y0 = Math.min(pin[1], ...keep.map((p) => p.y0)), y1 = Math.max(pin[1], ...keep.map((p) => p.y1));
  // Pad, keep a minimum size so small countries show their neighbours, and fit a 16:10 frame.
  let w = Math.max((x1 - x0) * 1.5, 150), h = Math.max((y1 - y0) * 1.5, 94);
  if (w / h > 1.6) h = w / 1.6; else w = h * 1.6;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  MAP[city] = { shape, pin, view: [cx - w / 2, cy - h / 2, w, h].map(Math.round) };

  const svg = fs.readFileSync(path.join(nm, 'flag-icons', 'flags', '4x3', `${iso2}.svg`));
  FLAGS[city] = 'data:image/svg+xml;base64,' + svg.toString('base64');
}

const block = '/* @generated-assets-start: tools/build-assets.mjs, do not edit by hand */\n' +
  '  var MAP_SIZE = [' + W + ', ' + H + '];\n' +
  '  var MAP_BACKGROUND = ' + JSON.stringify(background) + ';\n' +
  '  var MAP = ' + JSON.stringify(MAP) + ';\n' +
  '  var FLAGS = ' + JSON.stringify(FLAGS) + ';\n' +
  '  /* @generated-assets-end */';

let html = fs.readFileSync(indexFile, 'utf8');
const re = /\/\* @generated-assets-start[\s\S]*?\/\* @generated-assets-end \*\//;
if (!re.test(html)) throw new Error('Asset markers not found in index.html');
html = html.replace(re, () => block);
fs.writeFileSync(indexFile, html);
console.log('assets written:', (block.length / 1024).toFixed(0) + ' KB');
