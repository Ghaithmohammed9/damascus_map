/* صور العرض النهائية: موبايل فاتح/داكن + سطح المكتب */
'use strict';
const path = require('path');
const { CDP } = require('./cdp-lib');

const OUT = path.resolve(__dirname, '..', 'shots');
const URL = 'http://127.0.0.1:4173/';

async function waitTiles(cdp, tries = 5) {
  for (let i = 0; i < tries; i++) {
    await cdp.wait(13000);
    const n = await cdp.eval(`return document.querySelectorAll('.leaflet-tile-loaded').length;`);
    if (n >= 5) return n;
    await cdp.send('Page.reload', { ignoreCache: false });
    await cdp.wait(3000);
  }
  return 0;
}

(async () => {
  const cdp = await CDP.attach(9222);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:4173', storageTypes: 'all' });
  await cdp.send('Page.navigate', { url: URL });
  await cdp.wait(3500);
  await cdp.eval(`document.getElementById('welcome-start').click(); return 1;`);
  await cdp.wait(1500);
  console.log('tiles:', await waitTiles(cdp));
  await cdp.wait(1200);
  await cdp.shot(path.join(OUT, 'hero-light.png'));
  console.log('light done');

  // الوضع الداكن
  await cdp.eval(`
    const s = JSON.parse(localStorage.getItem('sham.settings.v1') || '{}');
    s.theme = 'dark'; s.firstRun = false;
    localStorage.setItem('sham.settings.v1', JSON.stringify(s));
    return 1;`);
  await cdp.send('Page.reload', { ignoreCache: false });
  await cdp.wait(2000);
  console.log('dark tiles:', await waitTiles(cdp));
  await cdp.wait(1200);
  await cdp.shot(path.join(OUT, 'hero-dark.png'));
  console.log('dark done');

  // سطح المكتب
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval(`
    const s = JSON.parse(localStorage.getItem('sham.settings.v1') || '{}');
    s.theme = 'light'; s.firstRun = false;
    localStorage.setItem('sham.settings.v1', JSON.stringify(s));
    return 1;`);
  await cdp.send('Page.reload', { ignoreCache: false });
  await cdp.wait(2000);
  console.log('desktop tiles:', await waitTiles(cdp));
  await cdp.wait(1200);
  await cdp.shot(path.join(OUT, 'hero-desktop.png'));
  console.log('desktop done');

  cdp.close();
})().catch((e) => { console.error(e); process.exit(1); });
