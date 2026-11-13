/* صورة سريعة بأبعاد مخصّصة: node tools/shot.js 1280 900 shots/desktop.png [url] */
'use strict';
const path = require('path');
const fs = require('fs');
const { CDP } = require('./cdp-lib');

const [w = 1280, h = 900, out = 'shots/shot.png', url = 'http://127.0.0.1:4173/'] = process.argv.slice(2);

(async () => {
  const cdp = await CDP.attach(9222);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 720,
  });
  if (process.argv.includes('--fresh')) {
    await cdp.send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'all' });
  }
  await cdp.send('Page.navigate', { url });
  await cdp.wait(5000);
  await cdp.eval(`
    const w = document.getElementById('ov-welcome');
    if (w && w.classList.contains('open')) document.getElementById('welcome-start').click();
    return 1;`);
  await cdp.wait(1800);
  const file = path.resolve(out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await cdp.shot(file);
  console.log('saved', file);
  cdp.close();
})().catch((e) => { console.error(e); process.exit(1); });
