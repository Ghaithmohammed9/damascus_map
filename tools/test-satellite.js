/* التحقق من طبقة القمر الصناعي */
'use strict';
const path = require('path');
const { CDP } = require('./cdp-lib');

(async () => {
  const cdp = await CDP.attach(9222);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await cdp.wait(4000);
  await cdp.eval(`document.getElementById('welcome-start')?.click(); return 1;`);
  await cdp.wait(1500);
  await cdp.eval(`window.__mapview.setBase('satellite'); return 1;`);
  await cdp.wait(15000);
  const s = await cdp.eval(`
    const imgs = [...document.querySelectorAll('.leaflet-tile')];
    return {
      baseMode: window.__mapview.baseMode,
      providerIndex: window.__mapview.providerIndex,
      total: imgs.length,
      loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      firstSrc: imgs[0] ? imgs[0].src.slice(0, 110) : null,
      ready: window.__mapview.tilesReady,
    };`);
  console.log(JSON.stringify(s, null, 1));
  await cdp.shot(path.join(__dirname, '..', 'shots', 'g11-satellite.png'));
  cdp.close();
})().catch((e) => { console.error(e); process.exit(1); });
