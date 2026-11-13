/* يولّد صور العرض: خريطة، تفاصيل، إضافة، طبقات، وضع داكن */
'use strict';
const path = require('path');
const { CDP } = require('./cdp-lib');

const OUT = path.resolve(__dirname, '..', 'shots');
const URL = 'http://127.0.0.1:4173/';

(async () => {
  const cdp = await CDP.attach(9222);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:4173', storageTypes: 'all' });
  await cdp.send('Page.navigate', { url: URL });
  await cdp.wait(3500);
  await cdp.shot(path.join(OUT, 'g1-welcome.png'));

  await cdp.eval(`document.getElementById('welcome-start').click(); return 1;`);
  await cdp.wait(9000); // ننتظر البلاطات
  await cdp.shot(path.join(OUT, 'g2-map.png'));

  await cdp.eval(`
    const items = [...document.querySelectorAll('#list .item')];
    const el = items.find(i => i.textContent.includes('الجامع الأموي')) || items[0];
    el.click(); return 1;`);
  await cdp.wait(1500);
  await cdp.shot(path.join(OUT, 'g3-detail.png'));

  await cdp.eval(`document.querySelector('#ov-detail [data-close]').click(); return 1;`);
  await cdp.wait(400);
  await cdp.eval(`document.getElementById('fab-add').click(); return 1;`);
  await cdp.wait(900);
  await cdp.eval(`
    document.getElementById('f-name').value = 'مقهى النوفرة';
    document.getElementById('f-desc').value = 'قهوة عربية وقعدة بالحوش، قدام الجامع الأموي.';
    document.querySelector('#f-cats [data-cat="cafe"]').click();
    document.querySelector('#f-stars [data-v="4"]').click();
    return 1;`);
  await cdp.wait(400);
  await cdp.shot(path.join(OUT, 'g4-editor.png'));

  await cdp.eval(`document.getElementById('f-save').click(); return 1;`);
  await cdp.wait(2000);
  await cdp.shot(path.join(OUT, 'g5-mine.png'));

  await cdp.eval(`document.querySelector('#ov-detail [data-close]').click(); return 1;`);
  await cdp.wait(400);
  await cdp.eval(`document.getElementById('btn-layers').click(); return 1;`);
  await cdp.wait(700);
  await cdp.shot(path.join(OUT, 'g6-layers.png'));

  await cdp.eval(`document.querySelector('#panel-body [data-base="vector"]').click(); return 1;`);
  await cdp.wait(1500);
  await cdp.shot(path.join(OUT, 'g7-layers-vector.png'));
  await cdp.eval(`document.querySelector('#ov-panel [data-close]').click(); return 1;`);
  await cdp.wait(600);
  await cdp.shot(path.join(OUT, 'g8-offline-map.png'));

  // الوضع الداكن
  await cdp.eval(`document.getElementById('btn-menu').click(); return 1;`);
  await cdp.wait(500);
  await cdp.eval(`document.querySelector('#panel-body [data-tool="theme"]').click(); return 1;`);
  await cdp.wait(600);
  await cdp.eval(`document.querySelector('#ov-panel [data-close]')?.click(); return 1;`);
  await cdp.wait(300);
  await cdp.eval(`document.getElementById('btn-layers').click(); return 1;`);
  await cdp.wait(600);
  await cdp.eval(`document.querySelector('#panel-body [data-base="auto"]').click(); return 1;`);
  await cdp.wait(10000);
  await cdp.eval(`document.querySelector('#ov-panel [data-close]')?.click(); return 1;`);
  await cdp.wait(800);
  await cdp.shot(path.join(OUT, 'g9-dark.png'));

  await cdp.eval(`
    const items = [...document.querySelectorAll('#list .item')];
    (items[0] || document.querySelector('#list .item')).click(); return 1;`);
  await cdp.wait(1500);
  await cdp.shot(path.join(OUT, 'g10-dark-detail.png'));

  console.log('shots done');
  cdp.close();
})().catch((e) => { console.error(e); process.exit(1); });
