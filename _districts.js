const fs = require('fs');
const bbox = '33.30,35.95,33.78,36.65';
const q = `[out:json][timeout:180];
(
  relation["boundary"="administrative"]["admin_level"~"^(9|10)$"](${bbox});
);
out geom;`;
const eps = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const ep of eps) {
      try {
        const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DamascusMapApp/1.0' } });
        const t = await r.text();
        if (r.status === 200) {
          fs.writeFileSync('data/_raw_districts.json', t);
          console.log('ok', ep, 'bytes', t.length, 'elements', JSON.parse(t).elements.length);
          return;
        }
        console.log('fail', ep, r.status, t.slice(0, 80));
      } catch (e) { console.log('err', ep, e.message); }
      await sleep(4000);
    }
  }
  console.log('all attempts failed');
})();
