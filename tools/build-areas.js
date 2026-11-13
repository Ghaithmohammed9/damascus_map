/**
 * يبني data/areas.json — حدود الأحياء (admin_level 9/10) من مستخلص Overpass.
 * Run: node tools/build-areas.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', '_raw_districts.json');
const OUT = path.join(ROOT, 'data', 'areas.json');

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;

function stitch(segments) {
  const segs = segments.slice();
  const rings = [];
  while (segs.length) {
    let ring = segs.pop().slice();
    let changed = true;
    while (changed && segs.length) {
      changed = false;
      const a = ring[0];
      const b = ring[ring.length - 1];
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const s0 = s[0];
        const s1 = s[s.length - 1];
        if (near(s0, b)) { ring = ring.concat(s.slice(1)); }
        else if (near(s1, b)) { ring = ring.concat(s.slice(0, -1).reverse()); }
        else if (near(s1, a)) { ring = s.concat(ring.slice(1)); }
        else if (near(s0, a)) { ring = s.slice().reverse().concat(ring.slice(1)); }
        else continue;
        segs.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** تبسيط: نشيل النقاط القريبة كتير من بعضها */
function simplify(ring, tol = 3e-5) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.abs(ring[i][0] - last[0]) + Math.abs(ring[i][1] - last[1]) > tol) out.push(ring[i]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}

const areas = [];
for (const el of raw.elements || []) {
  if (el.type !== 'relation') continue;
  const name = el.tags?.['name:ar'] || el.tags?.name;
  if (!name) continue;
  const segments = (el.members || [])
    .filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1)
    .map((m) => m.geometry.map((g) => [g.lat, g.lon]));
  if (!segments.length) continue;
  const rings = stitch(segments)
    .map((r) => simplify(r))
    .filter((r) => r.length >= 4);
  if (!rings.length) continue;

  const flatRings = rings.map((r) => {
    const flat = [];
    for (const [lat, lon] of r) flat.push(Math.round(lat * 1e5), Math.round(lon * 1e5));
    return flat;
  }).filter((f) => f.length >= 8);

  if (!flatRings.length) continue;
  areas.push({
    id: 'a' + el.id,
    n: name,
    l: +(el.tags.admin_level || 10),
    r: flatRings,
  });
}

areas.sort((a, b) => a.n.localeCompare(b.n, 'ar'));
fs.writeFileSync(OUT, JSON.stringify({ v: 1, areas }));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('areas:', areas.length, '| rings:', areas.reduce((s, a) => s + a.r.length, 0), '|', kb, 'KB');
