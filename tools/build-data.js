/**
 * Converts raw Overpass extracts (data/_raw_*.json) into the compact offline
 * datasets the app ships with:
 *   data/roads.json     - street network (major / tertiary / residential)
 *   data/pois.json      - named points of interest with Arabic names
 *   data/districts.json - neighbourhood labels
 *
 * Run:  node tools/build-data.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const encLon = (v) => Math.round((v + 180) * 1e5);
const encLat = (v) => Math.round((v + 90) * 1e5);

/* ---------------------------------------------------------------- roads --- */
const CLASSES = [
  ['motorway', 1],
  ['trunk', 2],
  ['primary', 3],
  ['secondary', 4],
  ['tertiary', 5],
  ['residential', 6],
];
const classIndex = (hw) => {
  const base = String(hw || '').replace(/_link$/, '');
  const i = CLASSES.findIndex((c) => c[0] === base);
  return i < 0 ? 5 : i;
};

function collectRoads(files) {
  const names = [null];
  const nameIdx = new Map();
  const roads = [];
  const seen = new Set();

  for (const file of files) {
    let raw;
    try {
      raw = read(file);
    } catch (e) {
      console.warn('skip missing', file);
      continue;
    }
    for (const el of raw.elements || []) {
      if (!el.geometry || el.geometry.length < 2 || !el.tags) continue;
      const hw = el.tags.highway;
      if (!hw) continue;
      const key = el.type + el.id;
      if (seen.has(key)) continue;
      seen.add(key);

      const name = el.tags['name:ar'] || el.tags.name || null;
      let ni = 0;
      if (name) {
        if (!nameIdx.has(name)) {
          ni = names.length;
          names.push(name);
          nameIdx.set(name, ni);
        } else ni = nameIdx.get(name);
      }

      const pts = [];
      for (const g of el.geometry) {
        pts.push(encLon(g.lon), encLat(g.lat));
      }
      // drop consecutive duplicates
      const clean = [];
      for (let i = 0; i < pts.length; i += 2) {
        if (clean.length >= 2 && clean[clean.length - 2] === pts[i] && clean[clean.length - 1] === pts[i + 1]) continue;
        clean.push(pts[i], pts[i + 1]);
      }
      if (clean.length < 4) continue;

      const flags =
        (el.tags.oneway && el.tags.oneway !== 'no' ? 1 : 0) |
        (el.tags.bridge && el.tags.bridge !== 'no' ? 2 : 0) |
        (el.tags.tunnel && el.tags.tunnel !== 'no' ? 4 : 0);

      roads.push([classIndex(hw), ni, flags, clean]);
    }
  }
  return { v: 1, classes: CLASSES, names, roads };
}

/* ----------------------------------------------------------------- pois --- */
const CAT = [
  ['mosque', (t) => t.amenity === 'place_of_worship' && /muslim|mosque/i.test(t.religion || '') || t.building === 'mosque'],
  ['church', (t) => t.amenity === 'place_of_worship' && /christ/i.test(t.religion || '')],
  ['worship', (t) => t.amenity === 'place_of_worship'],
  ['hospital', (t) => t.amenity === 'hospital' || t.amenity === 'clinic'],
  ['pharmacy', (t) => t.amenity === 'pharmacy'],
  ['school', (t) => t.amenity === 'school' || t.amenity === 'college'],
  ['university', (t) => t.amenity === 'university'],
  ['restaurant', (t) => /^(restaurant|fast_food|food_court)$/.test(t.amenity || '')],
  ['cafe', (t) => /^(cafe|bar|pub|nightclub|ice_cream)$/.test(t.amenity || '')],
  ['hotel', (t) => /^(hotel|guest_house|hostel|motel)$/.test(t.tourism || '')],
  ['museum', (t) => /^(museum|gallery|artwork)$/.test(t.tourism || '')],
  ['historic', (t) => !!t.historic || t.tourism === 'attraction' || t.tourism === 'monument'],
  ['viewpoint', (t) => t.tourism === 'viewpoint'],
  ['park', (t) => /^(park|garden|picnic_site)$/.test(t.leisure || '') || t.leisure === 'playground'],
  ['sport', (t) => /^(stadium|sports_centre|pitch|swimming_pool|fitness_centre)$/.test(t.leisure || '')],
  ['market', (t) => t.amenity === 'marketplace'],
  ['shop', (t) => !!t.shop],
  ['bank', (t) => /^(bank|atm|bureau_de_change)$/.test(t.amenity || '')],
  ['fuel', (t) => t.amenity === 'fuel'],
  ['parking', (t) => t.amenity === 'parking'],
  ['transport', (t) => /^(bus_station|taxi|station|ferry_terminal)$/.test(t.amenity || '') || t.railway === 'station' || t.aeroway === 'aerodrome'],
  ['government', (t) => /^(townhall|police|post_office|courthouse|fire_station|embassy|prison)$/.test(t.amenity || '')],
  ['education', (t) => /^(library|language_school|driving_school)$/.test(t.amenity || '')],
  ['culture', (t) => /^(theatre|cinema|arts_centre|community_centre|conference_centre)$/.test(t.amenity || '')],
  ['nature', (t) => /^(peak|spring|water|tree|waterfall|cave_entrance)$/.test(t.natural || '')],
  ['district', (t) => !!t.place],
];

function categoryOf(t) {
  for (const [key, test] of CAT) {
    try {
      if (test(t)) return key;
    } catch (e) {
      /* ignore */
    }
  }
  return 'other';
}

const KEEP_TAGS = [
  'opening_hours', 'phone', 'website', 'cuisine', 'religion', 'denomination',
  'shop', 'amenity', 'tourism', 'historic', 'leisure', 'natural', 'place',
  'addr:street', 'addr:housenumber', 'wheelchair', 'description',
];

function buildPois() {
  const raw = read('_raw_pois.json');
  const pois = [];
  const districts = [];
  const used = new Set();

  for (const el of raw.elements || []) {
    const t = el.tags;
    if (!t) continue;
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lon == null) continue;
    if (lat < 33.2 || lat > 33.85 || lon < 35.9 || lon > 36.75) continue;

    const name = (t['name:ar'] || t.name || t['name:en'] || '').trim();
    if (!name) continue;
    const cat = categoryOf(t);

    if (cat === 'district') {
      districts.push({
        id: 'd' + el.id,
        name,
        en: t['name:en'] || '',
        kind: t.place,
        lat: +lat.toFixed(5),
        lon: +lon.toFixed(5),
      });
      continue;
    }

    const key = name + '|' + Math.round(lat * 400) + '|' + Math.round(lon * 400);
    if (used.has(key)) continue;
    used.add(key);

    const tags = {};
    for (const k of KEEP_TAGS) if (t[k]) tags[k] = String(t[k]).slice(0, 120);

    pois.push({
      id: 'osm' + (el.type === 'node' ? 'n' : el.type === 'way' ? 'w' : 'r') + el.id,
      name,
      en: t['name:en'] || '',
      cat,
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      tags,
    });
  }

  pois.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  districts.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return { pois, districts };
}

/* ---------------------------------------------------------------- write --- */
const roads = collectRoads(['_raw_major.json', '_raw_tertiary.json', '_raw_arterial.json']);
const { pois, districts } = buildPois();

const write = (f, obj) => {
  const p = path.join(DATA, f);
  fs.writeFileSync(p, JSON.stringify(obj));
  const kb = (fs.statSync(p).size / 1024).toFixed(0);
  console.log(f.padEnd(20), kb + ' KB');
};

write('roads.json', roads);
write('pois.json', { v: 1, pois });
write('districts.json', { v: 1, districts });

const byCat = {};
for (const p of pois) byCat[p.cat] = (byCat[p.cat] || 0) + 1;
console.log('roads:', roads.roads.length, '| street names:', roads.names.length - 1);
console.log('pois:', pois.length, '| districts:', districts.length);
console.log(byCat);
