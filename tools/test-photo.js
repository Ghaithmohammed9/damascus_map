/* اختبار مسار الصور والاستيراد */
'use strict';
const path = require('path');
const fs = require('fs');
const { CDP } = require('./cdp-lib');

const OUT = path.resolve(__dirname, '..', 'shots');
const results = [];
const rec = (n, ok, info) => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + JSON.stringify(info) : ''}`); };

(async () => {
  const cdp = await CDP.attach(9222);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:4173', storageTypes: 'all' });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await cdp.wait(4000);
  await cdp.eval(`
    const w = document.getElementById('ov-welcome');
    if (w && w.classList.contains('open')) document.getElementById('welcome-start').click();
    return 1;`);
  await cdp.wait(600);

  // افتح نموذج الإضافة عبر الزر العائم
  await cdp.eval(`document.getElementById('fab-add').click(); return 1;`);
  await cdp.wait(700);

  // ارفع صورة إلى حقل الملف
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#f-photo' });
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [path.join(__dirname, 'fixtures', 'test-photo.jpg')] });
  await cdp.eval(`document.getElementById('f-photo').dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
  await cdp.wait(1600);
  const preview = await cdp.eval(`
    const img = document.querySelector('#f-photo-pv img');
    return { hasPreview: !!img, len: img ? img.src.length : 0, w: img ? img.naturalWidth : 0, h: img ? img.naturalHeight : 0 };`);
  rec('photo compressed + preview', preview.hasPreview && preview.len > 5000 && preview.w <= 1000, preview);

  await cdp.eval(`
    document.getElementById('f-name').value = 'مطعم أبو حنيفة — تجربة صورة';
    document.querySelector('#f-cats [data-cat="restaurant"]').click();
    document.getElementById('f-desc').value = 'مطعم اختبار للتأكد من حفظ الصورة محلياً.';
    document.getElementById('f-save').click(); return 1;`);
  await cdp.wait(2200);
  const saved = await cdp.eval(`
    const img = document.querySelector('#detail-card .detail-photo img');
    const places = JSON.parse(localStorage.getItem('sham.places.v1') || '[]');
    return { hasDetailPhoto: !!img, name: places[0]?.name, id: places[0]?.id };`);
  rec('photo shown in detail', saved.hasDetailPhoto, saved);
  await cdp.shot(path.join(OUT, '16-photo.png'));

  // تأكد من IndexedDB
  const idb = await cdp.eval(`
    const s = window.__store;
    const url = await s.getPhoto(${JSON.stringify(saved.id || '')});
    return { len: url ? url.length : 0 };`);
  rec('photo persisted in IndexedDB', idb.len > 5000, idb);

  // تصدير ثم استيراد
  const imp = await cdp.eval(`
    const s = window.__store;
    const dump = await s.exportData();
    const json = JSON.stringify(dump);
    s.places = []; s.savePlaces();
    const added = await s.importData(JSON.parse(json));
    return { added, total: s.places.length, photos: Object.keys(dump.photos).length };`);
  rec('export/import round-trip', imp.added === 1 && imp.total === 1 && imp.photos === 1, imp);

  // حذف الصورة عند حذف المكان
  const del = await cdp.eval(`
    const s = window.__store;
    const id = s.places[0].id;
    s.removePlace(id);
    await new Promise(r => setTimeout(r, 300));
    const left = await s.getPhoto(id);
    return { left: !!left, count: s.places.length };`);
  rec('delete removes photo', del.left === false && del.count === 0, del);

  cdp.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
