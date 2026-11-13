/* اختبار الواجهة الحقيقي عبر CDP: يفتح الصفحة، يمشي بسيناريو، ويصوّر كل خطوة */
'use strict';
const path = require('path');
const fs = require('fs');
const { CDP, delay } = require('./cdp-lib');

const URL = process.env.APP_URL || 'http://127.0.0.1:4173/';
const OUT = path.resolve(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function rec(name, ok, info) {
  results.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + JSON.stringify(info) : ''}`);
}

(async () => {
  const cdp = await CDP.attach(9222);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: URL });
  await cdp.wait(4500);

  /* ---------- 1. الإقلاع ---------- */
  const boot = await cdp.eval(`
    const card = document.querySelector('#ov-welcome .card');
    const r = card ? card.getBoundingClientRect() : null;
    return {
      vw: innerWidth, vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      welcomeOpen: document.getElementById('ov-welcome').classList.contains('open'),
      card: r && { left: Math.round(r.left), width: Math.round(r.width) },
      clusters: document.querySelectorAll('.clu').length,
      pins: document.querySelectorAll('.pin').length,
    };`);
  rec('boot layout', boot.scrollW <= boot.vw + 1 && boot.card && boot.card.width <= boot.vw + 1, boot);
  await cdp.shot(path.join(OUT, '01-welcome.png'));

  /* ---------- 2. تجاوز الترحيب ---------- */
  await cdp.eval(`document.getElementById('welcome-start').click(); return 1;`);
  await cdp.wait(1500);
  const after = await cdp.eval(`
    return {
      listItems: document.querySelectorAll('#list .item').length,
      clusters: document.querySelectorAll('.clu').length,
      pins: document.querySelectorAll('.pin').length,
      maxCluster: Math.max(0, ...[...document.querySelectorAll('.clu')].map(e => parseInt(e.textContent) || (parseFloat(e.textContent)*1000) || 0)),
      count: document.getElementById('list-count').textContent,
      base: window.__mapview.baseMode,
    };`);
  rec('list renders', after.listItems > 0, after);
  rec('markers render', after.clusters + after.pins > 0, { clusters: after.clusters, pins: after.pins });
  rec('marker density sane', after.clusters <= 70, { clusters: after.clusters, maxCluster: after.maxCluster });
  await cdp.shot(path.join(OUT, '02-map.png'));

  /* ---------- 3. فئة المعالم ---------- */
  await cdp.eval(`document.querySelector('[data-chip="landmark"]').click(); return 1;`);
  await cdp.wait(600);
  const land = await cdp.eval(`return { items: document.querySelectorAll('#list .item').length, count: document.getElementById('list-count').textContent };`);
  rec('landmark chip', land.items > 0, land);
  await cdp.shot(path.join(OUT, '03-landmarks.png'));

  /* ---------- 4. تفاصيل مكان ---------- */
  await cdp.eval(`document.querySelector('#list .item').click(); return 1;`);
  await cdp.wait(900);
  const det = await cdp.eval(`
    const c = document.getElementById('detail-card');
    return {
      open: document.getElementById('ov-detail').classList.contains('open'),
      title: c.querySelector('.detail-title')?.textContent,
      cat: c.querySelector('.detail-cat')?.textContent,
      actions: c.querySelectorAll('.act').length,
      overflowX: c.scrollWidth > c.clientWidth + 2,
    };`);
  rec('detail sheet', det.open && !!det.title && det.actions >= 4, det);
  await cdp.shot(path.join(OUT, '04-detail.png'));

  /* ---------- 5. المفضلة ---------- */
  await cdp.eval(`document.querySelector('#detail-card [data-act="fav"]').click(); return 1;`);
  await cdp.wait(500);
  const fav = await cdp.eval(`
    return { flags: JSON.parse(localStorage.getItem('sham.flags.v1') || '{}'),
             on: !!document.querySelector('#detail-card [data-act="fav"].on') };`);
  rec('favorite toggles + persists', Object.keys(fav.flags).length > 0 && fav.on, fav);

  /* ---------- 6. الطريق ---------- */
  await cdp.eval(`document.querySelector('#detail-card [data-act="route"]').click(); return 1;`);
  await cdp.wait(12000);
  const route = await cdp.eval(`
    const mv = window.__mapview;
    return { line: !!mv.routeLine, info: (document.getElementById('d-route-info')?.textContent || '').slice(0, 80) };`);
  rec('route computes or falls back', route.line && route.info.length > 0, route);
  await cdp.shot(path.join(OUT, '05-route.png'));
  await cdp.eval(`window.__mapview.clearRoute(); document.querySelector('#ov-detail [data-close]').click(); return 1;`);
  await cdp.wait(500);

  /* ---------- 7. إضافة مكان ---------- */
  await cdp.eval(`document.getElementById('fab-add').click(); return 1;`);
  await cdp.wait(700);
  const ed = await cdp.eval(`
    return { open: document.getElementById('ov-editor').classList.contains('open'),
             catOpts: document.querySelectorAll('#f-cats .catopt').length,
             coords: document.getElementById('f-coords').textContent };`);
  rec('editor opens', ed.open && ed.catOpts > 10, ed);

  await cdp.eval(`
    document.getElementById('f-name').value = 'مقهى النوفرة التجريبي';
    document.getElementById('f-desc').value = 'قهوة عربية وقعدة بالحوش… تجربة اختبار.';
    document.querySelector('#f-cats [data-cat="cafe"]').click();
    document.querySelector('#f-stars [data-v="4"]').click();
    document.getElementById('f-save').click();
    return 1;`);
  await cdp.wait(1800);
  const saved = await cdp.eval(`
    const places = JSON.parse(localStorage.getItem('sham.places.v1') || '[]');
    return { count: places.length, name: places[0]?.name, cat: places[0]?.cat, rating: places[0]?.rating,
             detailOpen: document.getElementById('ov-detail').classList.contains('open'),
             minePins: document.querySelectorAll('.pin.mine').length };`);
  rec('add place saves + shows detail', saved.count === 1 && saved.cat === 'cafe' && saved.detailOpen && saved.minePins === 1, saved);
  await cdp.shot(path.join(OUT, '06-mine.png'));
  await cdp.eval(`document.querySelector('#ov-detail [data-close]').click(); return 1;`);
  await cdp.wait(400);

  /* ---------- 8. الضغط المطول على الخريطة ---------- */
  const lp = await cdp.eval(`
    const el = document.getElementById('map');
    const r = el.getBoundingClientRect();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.width / 2, clientY: r.height / 2 - 60, buttons: 2 });
    el.querySelector('.leaflet-container')?.dispatchEvent(ev) || el.dispatchEvent(ev);
    return 1;`);
  await cdp.wait(900);
  const lp2 = await cdp.eval(`return { open: document.getElementById('ov-editor').classList.contains('open'), coords: document.getElementById('f-coords').textContent };`);
  rec('long-press opens editor', lp2.open, lp2);
  await cdp.eval(`document.getElementById('f-cancel').click(); return 1;`);
  await cdp.wait(400);

  /* ---------- 9. البحث ---------- */
  await cdp.eval(`document.getElementById('btn-search').click(); return 1;`);
  await cdp.wait(600);
  await cdp.eval(`
    const i = document.getElementById('search-input');
    i.value = 'جامع';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;`);
  await cdp.wait(700);
  const sr = await cdp.eval(`
    return { groups: [...document.querySelectorAll('#search-results .sres-group')].map(g => g.textContent),
             results: document.querySelectorAll('#search-results .sres').length,
             hasUserPlace: [...document.querySelectorAll('#search-results .nm')].some(n => n.textContent.includes('النوفرة')) };`);
  rec('search works', sr.results > 3, sr);
  await cdp.shot(path.join(OUT, '07-search.png'));

  await cdp.eval(`
    const i = document.getElementById('search-input');
    i.value = 'أماكن';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;`);
  await cdp.wait(600);
  await cdp.shot(path.join(OUT, '08-search2.png'));
  await cdp.eval(`document.querySelector('#ov-search [data-close]').click(); return 1;`);
  await cdp.wait(400);

  /* ---------- 10. لوحة الطبقات ---------- */
  await cdp.eval(`document.getElementById('btn-layers').click(); return 1;`);
  await cdp.wait(600);
  const lay = await cdp.eval(`
    return { open: document.getElementById('ov-panel').classList.contains('open'),
             opts: document.querySelectorAll('#panel-body .opt').length,
             sw: document.querySelectorAll('#panel-body .switch').length };`);
  rec('layers panel', lay.open && lay.opts >= 8, lay);
  await cdp.shot(path.join(OUT, '09-layers.png'));

  /* ---------- 11. الوضع بدون إنترنت ---------- */
  await cdp.eval(`document.querySelector('#panel-body [data-base="vector"]').click(); return 1;`);
  await cdp.wait(2000);
  const vec = await cdp.eval(`
    return { vectorMode: document.getElementById('map').classList.contains('vector-mode'),
             tiles: document.querySelectorAll('.leaflet-tile').length,
             canvases: document.querySelectorAll('#map canvas').length };`);
  rec('vector offline mode', vec.vectorMode && vec.canvases > 0, vec);
  await cdp.eval(`document.querySelector('#ov-panel [data-close]').click(); return 1;`);
  await cdp.wait(600);
  await cdp.shot(path.join(OUT, '10-vector.png'));

  /* ---------- 12. الأدوات ---------- */
  await cdp.eval(`document.getElementById('btn-menu').click(); return 1;`);
  await cdp.wait(500);
  const tools = await cdp.eval(`return { rows: document.querySelectorAll('#panel-body .tool-row').length, title: document.getElementById('panel-title').textContent };`);
  rec('tools panel', tools.rows > 6, tools);
  await cdp.shot(path.join(OUT, '11-tools.png'));

  /* ---------- 13. قياس المسافة ---------- */
  await cdp.eval(`document.querySelector('#panel-body [data-tool="measure"]').click(); return 1;`);
  await cdp.wait(600);
  await cdp.eval(`
    const mv = window.__mapview;
    const c = mv.map.getCenter();
    mv.onMapClick && 0;
    mv.map.fire('click', { latlng: L.latLng(c.lat, c.lng) });
    mv.map.fire('click', { latlng: L.latLng(c.lat + 0.01, c.lng + 0.01) });
    return 1;`);
  await cdp.wait(600);
  const meas = await cdp.eval(`
    return { label: document.getElementById('measure-label')?.textContent || '',
             bar: !!document.getElementById('measure-bar') };`);
  rec('distance measure', /مسافة/.test(meas.label) && meas.bar, meas);
  await cdp.shot(path.join(OUT, '12-measure.png'));
  await cdp.eval(`document.getElementById('measure-cancel').click(); return 1;`);
  await cdp.wait(400);

  /* ---------- 14. الوضع الفاتح ---------- */
  await cdp.eval(`document.getElementById('btn-menu').click(); return 1;`);
  await cdp.wait(500);
  await cdp.eval(`document.querySelector('#panel-body [data-tool="theme"]').click(); return 1;`);
  await cdp.wait(900);
  const light = await cdp.eval(`return { theme: document.documentElement.dataset.theme };`);
  rec('theme toggle', light.theme === 'dark', light);
  await cdp.eval(`document.querySelector('#ov-panel [data-close]').click(); return 1;`);
  await cdp.wait(500);
  await cdp.shot(path.join(OUT, '13-light.png'));

  /* ---------- 15. تصدير ---------- */
  const exp = await cdp.eval(`
    const s = (await import('./js/store.js')).store;
    const d = await s.exportData();
    const gj = s.exportGeoJSON();
    return { places: d.places.length, app: d.app, features: gj.features.length };`);
  rec('export payload', exp.places >= 1 && exp.app === 'sham-map' && exp.features >= 1, exp);

  /* ---------- 16. Service worker ---------- */
  const sw = await cdp.eval(`
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    return { reg: !!reg, active: !!(reg && (reg.active || reg.installing || reg.waiting)), keys };`);
  rec('service worker + caches', sw.active && sw.keys.length > 0, sw);

  /* ---------- 17. إعادة تحميل بدون إنترنت ---------- */
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Page.reload', { ignoreCache: false });
  await cdp.wait(6000);
  const offline = await cdp.eval(`
    return {
      title: document.title,
      listItems: document.querySelectorAll('#list .item').length,
      clusters: document.querySelectorAll('.clu').length + document.querySelectorAll('.pin').length,
      welcome: document.getElementById('ov-welcome').classList.contains('open'),
      base: window.__mapview ? window.__mapview.baseMode : null,
      badge: document.getElementById('offline-badge').classList.contains('show'),
    };`);
  rec('reload works offline (SW)', offline.listItems > 0 && offline.clusters > 0, offline);
  await cdp.shot(path.join(OUT, '14-offline.png'));

  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  /* ---------- 18. روابط المشاركة ---------- */
  await cdp.send('Page.navigate', { url: URL + '?lat=33.5115&lon=36.3064&z=17&n=' + encodeURIComponent('الجامع الأموي') });
  await cdp.wait(4000);
  const deep = await cdp.eval(`
    const c = window.__mapview.map.getCenter();
    return { lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), z: Math.round(window.__mapview.map.getZoom()) };`);
  rec('deep link centers map', Math.abs(deep.lat - 33.5115) < 0.01 && Math.abs(deep.lon - 36.3064) < 0.01, deep);
  await cdp.shot(path.join(OUT, '15-deeplink.png'));

  const errs = cdp.errors.filter((e) => !/favicon|manifest|tile|ERR_|Failed to load resource|Install|install/i.test(e));
  rec('no JS errors', errs.length === 0, errs.slice(0, 6));
  console.log('\nconsole (last 10):', cdp.logs.slice(-10));
  cdp.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, logs: cdp.logs, errors: cdp.errors }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('TEST CRASH', e);
  process.exit(2);
});
