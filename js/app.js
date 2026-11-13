/* خرائط الشام — منطق التطبيق والواجهة */

import { APP, CATS, GROUPS, catOf, ACCENTS, accentOf } from './config.js';
import { haversine, fmtDist, fmtDuration, escapeHtml, uid, debounce, clamp, normAr } from './geo.js';
import { store } from './store.js';
import { mapview } from './mapview.js';
import { search as runSearch, buildIndex } from './search.js';

const $ = (id) => document.getElementById(id);
const ico = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24"><use href="#i-${name}"/></svg>`;
const haptic = (ms = 10) => { try { navigator.vibrate?.(ms); } catch (e) {} };

const st = {
  chip: 'all',
  sort: 'near',
  limit: 60,
  userPos: null,
  photos: {},
  selected: null,
  editing: null,
  draft: null,
  route: null,
  deferredInstall: null,
};

function accentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5';
}

function applyAccent(key) {
  const a = accentOf(key);
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.style.setProperty('--accent', dark ? a.dark : a.light);
  document.documentElement.style.setProperty('--accent-ink', dark ? '#0b0f16' : '#ffffff');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0a0e15' : '#f6f7f9');
}

/* ------------------------------------------------------------------ boot --- */
async function boot() {
  window.__mapview = mapview;
  window.__store = store;

  document.documentElement.dataset.theme = store.settings.theme;
  applyAccent(store.settings.accent);
  setSheetHeight(peekHeight());
  initMap();
  renderChips();
  bindUI();
  renderList();

  try {
    await mapview.load();
    buildIndex(mapview.pois);
  } catch (e) {
    console.error(e);
    toast('تعذّر تحميل بيانات الخريطة');
  }

  mapview.setActiveGroups(Object.keys(GROUPS).filter((g) => store.settings.groups[g] !== false));
  mapview.setLabelsVisible(store.settings.labels !== false);
  mapview.setMineVisible(store.settings.showMine !== false);
  mapview.setBase(store.settings.base);

  st.photos = await store.allPhotos();
  refreshMine();
  renderList();
  updateSub();
  handleUrlParams();

  if (store.settings.firstRun) openOverlay('ov-welcome');
  if (!navigator.onLine) $('offline-badge').classList.add('show');
  registerSW();
}

function initMap() {
  mapview.theme = store.settings.theme;
  mapview.init($('map'));
  mapview.onSelect = (p) => openDetail(p);
  mapview.onLongPress = (latlng) => openEditor({ lat: latlng.lat, lon: latlng.lng });
  mapview.onTilesState = (state) => {
    const el = $('tile-status');
    if (!el) return;
    el.classList.toggle('show', state === 'loading');
    if (state === 'failed') $('offline-badge').classList.add('show');
    if (state === 'ready') $('offline-badge').classList.toggle('show', !navigator.onLine);
  };
  mapview.onTilesFailed = () => {
    toast('الخريطة الأونلاين ما وصلت — عم نعرض الخريطة المحلية');
  };
  mapview.onMeasure = (total) => {
    $('measure-label')?.remove();
    const el = document.createElement('div');
    el.id = 'measure-label';
    el.className = 'toast show';
    el.style.top = 'calc(var(--safe-t) + 122px)';
    el.textContent = 'المسافة: ' + fmtDist(total);
    document.body.appendChild(el);
  };
  mapview.map.on('moveend', debounce(() => {
    if (st.sort === 'near' && !st.userPos) renderList();
  }, 400));
}

/* ----------------------------------------------------------------- chips --- */
const CHIPS = [
  { key: 'all', label: 'الكل', icon: 'grid' },
  { key: 'landmark', label: 'المعالم', icon: 'historic' },
  { key: 'services', label: 'الخدمات', icon: 'hospital' },
  { key: 'food', label: 'مطاعم ومقاهي', icon: 'restaurant' },
  { key: 'shopping', label: 'أسواق', icon: 'shop' },
  { key: 'nature', label: 'حدائق', icon: 'park' },
  { key: 'fav', label: 'المفضلة', icon: 'heart' },
  { key: 'mine', label: 'أماكني', icon: 'pin' },
];

function renderChips() {
  $('chips').innerHTML = CHIPS.map((c) =>
    `<button class="chip ${st.chip === c.key ? 'active' : ''}" data-chip="${c.key}">${ico(c.icon)}${c.label}</button>`
  ).join('');
}

/* ------------------------------------------------------------------ list --- */
function refPoint() {
  return st.userPos || mapview.map.getCenter();
}

function withDistance(list) {
  const r = refPoint();
  return list.map((p) => ({ p, d: haversine(r.lat, r.lng, p.lat, p.lon) }));
}

function currentSource() {
  const chip = st.chip;
  const mine = store.places;
  if (chip === 'mine') return { list: mine.map((p) => ({ ...p, __mine: true })) };
  if (chip === 'fav') {
    const all = [...mine.map((p) => ({ ...p, __mine: true })), ...mapview.pois];
    return { list: all.filter((p) => store.isFav(p.id)) };
  }
  if (GROUPS[chip]) {
    return {
      list: mapview.pois.filter((p) => catOf(p.cat).group === chip),
      includeMine: mine.filter((p) => catOf(p.cat).group === chip),
    };
  }
  return { list: mapview.pois, includeMine: mine };
}

function renderList() {
  const listEl = $('list');
  if (!mapview.map) return;
  const { list, includeMine } = currentSource();
  const all = includeMine ? [...includeMine.map((p) => ({ ...p, __mine: true })), ...list] : list;

  const withD = withDistance(all);
  if (st.sort === 'near') withD.sort((a, b) => a.d - b.d);
  else withD.sort((a, b) => String(a.p.name).localeCompare(String(b.p.name), 'ar'));

  const total = withD.length;
  $('list-count').textContent = total ? `${total.toLocaleString('en-US')} مكان` : 'لا نتائج';
  $('btn-sort').textContent = st.sort === 'near'
    ? (st.userPos ? 'الأقرب إليّ' : 'الأقرب من مركز الخريطة')
    : 'أبجدياً';

  if (!total) {
    listEl.innerHTML = st.chip === 'mine'
      ? `<div class="empty"><b>لسا ما ضفت ولا مكان</b>اضغط زر ＋ عالخريطة، أو اضغط مطوّل على أي مكان بدك تحفظه.<br><br>
         <button class="btn-primary" id="empty-add" style="max-width:220px;margin:0 auto">${ico('plus')} أضف أول مكان</button></div>`
      : st.chip === 'fav'
        ? `<div class="empty"><b>ما في أماكن بالمفضلة</b>افتح أي مكان واضغط القلب ليحفظ هون.</div>`
        : `<div class="empty"><b>ما في نتائج هنا</b>جرّب فئة تانية، أو حرّك الخريطة لمنطقة تانية.</div>`;
    $('empty-add')?.addEventListener('click', () => {
      const c = mapview.map.getCenter();
      mapview.flashCrosshair();
      openEditor({ lat: c.lat, lon: c.lng });
    });
    return;
  }

  const slice = withD.slice(0, st.limit);
  listEl.innerHTML = slice.map(({ p, d }) => itemHtml(p, d)).join('') +
    (total > st.limit ? `<button class="more" id="list-more">عرض ${Math.min(60, total - st.limit)} نتيجة إضافية</button>` : '');

  $('list-more')?.addEventListener('click', () => {
    st.limit += 60;
    renderList();
  });
}

function itemHtml(p, d) {
  const c = catOf(p.cat);
  const photo = p.__mine ? st.photos[p.id] : null;
  const av = photo ? `<img src="${photo}" alt="">` : ico(c.icon);
  const sub = [c.label, p.en && p.en !== p.name ? p.en : null].filter(Boolean).join(' ');
  const fav = store.isFav(p.id) ? `<span class="fav">${ico('heart')}</span>` : '';
  return `<button class="item" data-id="${escapeHtml(p.id)}" data-mine="${p.__mine ? 1 : 0}">
    <div class="av" style="--c:${c.color}">${av}</div>
    <div class="tx">
      <div class="nm">${escapeHtml(p.name)}</div>
      <div class="sb">${escapeHtml(sub)}${p.tags?.['addr:street'] ? `<span class="sub-sep"></span>${escapeHtml(p.tags['addr:street'])}` : ''}</div>
    </div>
    ${fav}
    <div class="dist">${fmtDist(d)}</div>
  </button>`;
}

function updateSub() {
  const n = mapview.pois.length;
  $('head-sub').textContent = n ? `${n.toLocaleString('en-US')} مكان · دمشق` : 'دمشق';
}

/* ------------------------------------------------------------------ sheet --- */
const sheet = () => $('sheet');
function peekHeight() { return window.innerWidth >= 720 ? 400 : 210; }
function sheetHeights() {
  const H = window.innerHeight;
  return [peekHeight(), Math.round(H * 0.46), Math.round(H * 0.88)];
}
function setSheetHeight(h) {
  document.documentElement.style.setProperty('--sheet-h', h + 'px');
  sheet().style.height = h + 'px';
}
function snapSheet() {
  const [a, b, c] = sheetHeights();
  const h = sheet().offsetHeight;
  const target = [a, b, c].reduce((best, v) => (Math.abs(v - h) < Math.abs(best - h) ? v : best), a);
  setSheetHeight(target);
}

function bindSheet() {
  const grab = $('sheet-grab');
  let startY = 0, startH = 0, moved = false, dragging = false;

  grab.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; startY = e.clientY; startH = sheet().offsetHeight;
    sheet().classList.add('dragging');
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 6) moved = true;
    setSheetHeight(clamp(startH + dy, 150, window.innerHeight * 0.9));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet().classList.remove('dragging');
    if (!moved) {
      const [a, b, c] = sheetHeights();
      const h = sheet().offsetHeight;
      const next = Math.abs(h - a) < 8 ? b : Math.abs(h - b) < 8 ? c : a;
      setSheetHeight(next);
    } else snapSheet();
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);

  window.addEventListener('resize', () => {
    const [a] = sheetHeights();
    if (sheet().offsetHeight < a) setSheetHeight(a);
  });
}

/* ----------------------------------------------------------------- search --- */
function openSearch() {
  openOverlay('ov-search');
  const inp = $('search-input');
  inp.value = '';
  renderSearch('');
  setTimeout(() => inp.focus(), 120);
}

let searchTimer;
function onSearchInput(e) {
  clearTimeout(searchTimer);
  const q = e.target.value;
  searchTimer = setTimeout(() => renderSearch(q), 90);
}

function renderSearch(q) {
  const box = $('search-results');
  const nq = normAr(q);
  if (!nq) {
    box.innerHTML = `<div class="sres-group">جرّب تبحث عن</div><div class="quick-cats">
      ${['مطعم', 'مقهى', 'مشفى', 'صيدلية', 'جامع', 'متحف', 'سوق', 'حديقة', 'فندق', 'محطة وقود', 'مدرسة', 'جامعة']
        .map((w) => `<button class="chip" data-quick="${w}">${w}</button>`).join('')}
      </div>
      <div class="sres-group">الأحياء</div>
      ${mapview.districts.slice(0, 14).map((d) => `<button class="sres" data-district="${escapeHtml(d.name)}" data-lat="${d.lat}" data-lon="${d.lon}">
        <div class="ico" style="--c:#64748b">${ico('district')}</div>
        <div class="tx"><div class="nm">${escapeHtml(d.name)}</div><div class="sb">حي في دمشق</div></div></button>`).join('')}`;
    return;
  }

  const res = runSearch(q, { streets: mapview.streetIndex, mine: store.places });
  let html = '';

  if (res.cats.length) {
    html += `<div class="sres-group">تصفية حسب الفئة</div>` + res.cats.map((c) => {
      const cc = catOf(c);
      return `<button class="sres" data-cat="${c}"><div class="ico" style="--c:${cc.color}">${ico(cc.icon)}</div>
        <div class="tx"><div class="nm">${cc.plural}</div><div class="sb">عرض كل ${cc.plural}</div></div></button>`;
    }).join('');
  }

  if (res.streets.length) {
    html += `<div class="sres-group">شوارع</div>` + res.streets.slice(0, 5).map((s) => `
      <button class="sres" data-street="${escapeHtml(s)}">
        <div class="ico" style="--c:#64748b">${ico('route')}</div>
        <div class="tx"><div class="nm">${escapeHtml(s)}</div><div class="sb">شارع</div></div>
      </button>`).join('');
  }

  if (res.places.length) {
    html += `<div class="sres-group">أماكن</div>` + res.places.slice(0, 30).map((p) => {
      const c = catOf(p.cat);
      return `<button class="sres" data-place="${escapeHtml(p.id)}">
        <div class="ico" style="--c:${c.color}">${st.photos[p.id] ? `<img src="${st.photos[p.id]}" style="width:100%;height:100%;object-fit:cover;border-radius:11px">` : ico(c.icon)}</div>
        <div class="tx"><div class="nm">${escapeHtml(p.name)}</div><div class="sb">${c.label}${p.en ? ' · ' + escapeHtml(p.en) : ''}</div></div>
      </button>`;
    }).join('');
  }

  if (!html) html = `<div class="empty"><b>ما لقينا شي</b>جرّب تكتب جزء من الاسم أو نوع المكان.</div>`;
  box.innerHTML = html;
}

function handleSearchClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.quick) {
    $('search-input').value = btn.dataset.quick;
    renderSearch(btn.dataset.quick);
    return;
  }
  if (btn.dataset.district) {
    closeOverlay('ov-search');
    mapview.map.setView([+btn.dataset.lat, +btn.dataset.lon], 15, { animate: true });
    toast(btn.dataset.district);
    return;
  }
  if (btn.dataset.cat) {
    closeOverlay('ov-search');
    const group = catOf(btn.dataset.cat).group;
    if (GROUPS[group]) {
      st.chip = group;
      st.limit = 60;
      renderChips();
      renderList();
      setSheetHeight(sheetHeights()[1]);
    }
    return;
  }
  if (btn.dataset.street) {
    closeOverlay('ov-search');
    if (!mapview.fitStreet(btn.dataset.street)) toast('ما قدرنا نلاقي الشارع عالخريطة');
    return;
  }
  if (btn.dataset.place) {
    const id = btn.dataset.place;
    const p = store.places.find((x) => x.id === id) || mapview.pois.find((x) => x.id === id);
    closeOverlay('ov-search');
    if (p) {
      mapview.map.setView([p.lat, p.lon], 16.5, { animate: true });
      openDetail(p);
    }
  }
}

/* ----------------------------------------------------------------- detail --- */
function openDetail(p, kind) {
  if (!kind) kind = store.places.some((x) => x.id === p.id) ? 'mine' : 'poi';
  st.selected = { p, kind };
  mapview.select(p.id);

  const mine = kind === 'mine';
  const photo = st.photos[p.id] || null;
  const c = catOf(p.cat);
  const d = haversine(refPoint().lat, refPoint().lng, p.lat, p.lon);
  const t = p.tags || {};
  const addr = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const desc = p.desc || t.description || '';
  const rating = p.rating || 0;
  const stars = rating
    ? `<div class="rate">${[1, 2, 3, 4, 5].map((i) => ico('star', 'ic' + (i > rating ? ' off' : ''))).join('')}</div>`
    : '';

  const facts = [];
  if (t.opening_hours) facts.push(['clock', 'الدوام', t.opening_hours]);
  if (t.phone) facts.push(['phone', 'هاتف', t.phone]);
  if (t.cuisine) facts.push(['restaurant', 'المطبخ', String(t.cuisine).replace(/_/g, ' ')]);
  if (t.website) facts.push(['globe', 'الموقع', String(t.website).replace(/^https?:\/\//, '').slice(0, 34)]);
  if (store.isVisited(p.id) && !p.visited) facts.push(['check', 'حالة', 'زرتها']);

  $('detail-card').innerHTML = `
    ${photo
      ? `<div class="detail-photo"><img src="${photo}" alt=""><div class="shade"></div></div>`
      : `<div class="detail-hero" style="--c:${c.color}"><span class="hero-chip">${ico(c.icon)}</span></div>`}
    <button class="detail-close" data-close="ov-detail" aria-label="إغلاق">${ico('down')}</button>
    <div class="detail-body">
      <div class="detail-top">
        <span class="detail-cat" style="--c:${c.color}">${ico(c.icon)} ${c.label}${mine ? ' · مكانك' : ''}</span>
        <span class="detail-dist">${ico('pin')} ${fmtDist(d)} ${st.userPos ? 'منك' : 'من مركز الخريطة'}</span>
      </div>
      <h2 class="detail-title">${escapeHtml(p.name)}</h2>
      ${p.en && p.en !== p.name ? `<div class="detail-en">${escapeHtml(p.en)}</div>` : ''}
      ${addr ? `<div class="detail-en">${escapeHtml(addr)}</div>` : ''}
      ${stars}
      ${desc ? `<p class="detail-desc">${escapeHtml(desc)}</p>` : ''}
      ${facts.length ? `<div class="facts">${facts.map(([i, k, v]) =>
        `<div class="fact"><span class="fk">${ico(i)} ${k}</span><span class="fv">${escapeHtml(String(v))}</span></div>`).join('')}</div>` : ''}
      <div class="actions">
        <button class="act ${store.isFav(p.id) ? 'on' : ''}" data-act="fav">${ico('heart')}مفضلة</button>
        <button class="act ${store.isVisited(p.id) || p.visited ? 'on' : ''}" data-act="visited">${ico('check')}زرتها</button>
        <button class="act" data-act="share">${ico('share')}مشاركة</button>
        <button class="act" data-act="copy">${ico('copy')}نسخ الموقع</button>
        ${mine
          ? `<button class="act" data-act="edit">${ico('edit')}تعديل</button>
             <button class="act danger" data-act="delete">${ico('trash')}حذف</button>`
          : `<button class="act" data-act="mine">${ico('pin')}لأماكني</button>
             <button class="act" data-act="street">${ico('route')}الشوارع</button>`}
      </div>
      <div id="d-route-info"></div>
      <button class="btn-primary" data-act="route">${ico('route')} الطريق من موقعي إلى هنا</button>
      <button class="btn-ghost" data-act="google">${ico('external')} افتح بغوغل ماب</button>
    </div>`;
  openOverlay('ov-detail');
  mapview.highlight([p.lat, p.lon]);
}

async function detailAction(act) {
  const { p } = st.selected || {};
  if (!p) return;
  const kind = st.selected.kind;
  const mine = kind === 'mine';
  haptic();

  if (act === 'fav') {
    const on = store.toggleFav(p.id);
    toast(on ? 'أضفناها للمفضلة' : 'شلناها من المفضلة');
    openDetail(p, kind);
    renderList();
  } else if (act === 'visited') {
    const on = store.toggleVisited(p.id);
    toast(on ? 'سجّلنا زيارتك' : 'شلنا علامة الزيارة');
    if (mine) store.updatePlace(p.id, { visited: on });
    openDetail(p, kind);
  } else if (act === 'share') {
    sharePlace(p);
  } else if (act === 'copy') {
    copyText(`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`).then(() => toast('نسخنا الإحداثيات'));
  } else if (act === 'edit') {
    closeOverlay('ov-detail');
    openEditor({ lat: p.lat, lon: p.lon, place: p });
  } else if (act === 'delete') {
    const ok = await confirmDialog('حذف المكان', 'متأكد بدك تحذف «' + p.name + '»؟ ما في رجعة.', 'حذف');
    if (ok) {
      store.removePlace(p.id);
      delete st.photos[p.id];
      refreshMine();
      renderList();
      closeOverlay('ov-detail');
      toast('انحذف المكان');
    }
  } else if (act === 'mine') {
    const copy = { ...p, id: uid(), source: 'osm', created: Date.now() };
    store.addPlace(copy);
    refreshMine();
    renderList();
    toast('ضفناها لأماكنك');
  } else if (act === 'street') {
    const street = p.tags?.['addr:street'];
    if (street && mapview.fitStreet(street)) toast(street);
    else toast('ما في شارع مسجّل لهالمكان');
  } else if (act === 'route') {
    await routeTo(p);
  } else if (act === 'clear-route') {
    mapview.clearRoute();
    const box = $('d-route-info');
    if (box) box.innerHTML = '';
    toast('انمسح المسار');
  } else if (act === 'google') {
    window.open(`https://www.google.com/maps?q=${p.lat},${p.lon}`, '_blank', 'noopener');
  }
}

async function routeTo(p) {
  const info = $('d-route-info');
  if (info) info.innerHTML = `<div class="about">عم نحسب الطريق…</div>`;
  let from = st.userPos;
  if (!from) {
    from = await getPosition();
    if (!from) {
      const c = mapview.map.getCenter();
      from = { lat: c.lat, lon: c.lng };
      toast('ما قدرنا نحدد موقعك — حسبنا الطريق من مركز الخريطة');
    }
  }
  const direct = haversine(from.lat, from.lon, p.lat, p.lon);
  if (direct < 45) {
    mapview.drawRoute([from.lat, from.lon], [p.lat, p.lon], { direct: true });
    if (info) info.innerHTML = `<div class="about">إنت على بعد <b>${fmtDist(direct)}</b> من هالمكان — ما في داعي لطريق.</div>`;
    toast('إنت قريب كتير من هالمكان');
    return;
  }
  let path = null, dist = 0, dur = 0;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon.toFixed(5)},${from.lat.toFixed(5)};${p.lon.toFixed(5)},${p.lat.toFixed(5)}?overview=full&geometries=geojson`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const route = (await r.json()).routes?.[0];
    if (route) {
      path = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      dist = route.distance;
      dur = route.duration;
    }
  } catch (e) { /* بلا نت */ }

  if (path) {
    mapview.drawRoute([from.lat, from.lon], [p.lat, p.lon], { path });
    mapview.map.fitBounds(path, { padding: [40, 90] });
    const durTxt = dur > 0 ? ' · ' + fmtDuration(dur) : '';
    if (info) info.innerHTML = `<div class="about"><b>الطريق بالسيارة:</b> ${fmtDist(dist)}${durTxt}
      <button class="btn-ghost" data-act="clear-route" style="margin-top:8px">مسح المسار</button></div>`;
    toast(`الطريق: ${fmtDist(dist)}${durTxt}`);
  } else {
    mapview.drawRoute([from.lat, from.lon], [p.lat, p.lon], { direct: true });
    mapview.map.fitBounds([[from.lat, from.lon], [p.lat, p.lon]], { padding: [50, 90] });
    if (info) info.innerHTML = `<div class="about">تعذّر جلب الطريق من الخادم.<br>خط مباشر: <b>${fmtDist(direct)}</b> · تقديري بالسيارة ${fmtDist(direct * 1.3)}.</div>`;
    toast('ما في نت لحساب الطريق — رسمنا خط مباشر');
  }
}

/* ----------------------------------------------------------------- editor --- */
const EDIT_CATS = ['mosque', 'church', 'historic', 'museum', 'viewpoint', 'culture',
  'restaurant', 'cafe', 'hotel', 'market', 'shop', 'park', 'sport', 'nature',
  'hospital', 'pharmacy', 'school', 'university', 'education', 'bank', 'government',
  'fuel', 'parking', 'transport', 'other'];

function openEditor({ lat, lon, place = null }) {
  st.editing = place;
  st.draft = { lat, lon, cat: place?.cat || 'other', photo: null, rating: place?.rating || 0 };
  $('editor-title').textContent = place ? 'تعديل المكان' : 'أضف مكاناً';
  $('f-name').value = place?.name || '';
  $('f-desc').value = place?.desc || '';
  $('f-coords').textContent = lat.toFixed(5) + ', ' + lon.toFixed(5);
  $('f-cats').innerHTML = EDIT_CATS.map((k) => {
    const c = catOf(k);
    return `<button class="catopt ${st.draft.cat === k ? 'sel' : ''}" data-cat="${k}" style="--c:${c.color}">${ico(c.icon)}${c.label}</button>`;
  }).join('');
  paintStars();
  $('f-photo').value = '';
  const existing = place ? st.photos[place.id] : null;
  $('f-photo-pv').innerHTML = existing ? `<img src="${existing}" alt="">` : ico('camera');
  st.draft.photo = null;
  st.draft.existingPhoto = existing;
  openOverlay('ov-editor');
  setTimeout(() => $('f-name').focus(), 220);
}

function paintStars() {
  const v = st.draft?.rating || 0;
  [...$('f-stars').children].forEach((s) => s.classList.toggle('on', +s.dataset.v <= v));
}

async function saveEditor() {
  const name = $('f-name').value.trim();
  if (!name) { toast('لازم تكتب اسم المكان'); $('f-name').focus(); return; }
  const id = st.editing?.id || uid();
  const rec = {
    id, name,
    cat: st.draft.cat,
    lat: st.draft.lat,
    lon: st.draft.lon,
    desc: $('f-desc').value.trim(),
    rating: st.draft.rating || 0,
    source: 'user',
    created: st.editing?.created || Date.now(),
    updated: Date.now(),
  };
  if (st.draft.photo) {
    if (await store.putPhoto(id, st.draft.photo)) st.photos[id] = st.draft.photo;
  } else if (st.draft.existingPhoto) {
    st.photos[id] = st.draft.existingPhoto;
  }
  if (st.editing) store.updatePlace(id, rec);
  else store.addPlace(rec);

  refreshMine();
  renderList();
  closeOverlay('ov-editor');
  toast(st.editing ? 'تعدّل المكان' : 'أضفنا مكانك');
  haptic(18);
  const saved = store.getPlace(id);
  st.editing = null;
  if (saved) {
    mapview.map.setView([saved.lat, saved.lon], 16.5, { animate: true });
    setTimeout(() => openDetail(saved, 'mine'), 320);
  }
}

function refreshMine() {
  mapview.renderMine(store.places, {
    photos: st.photos,
    onOpen: (p) => openDetail(p, 'mine'),
  });
}

/* ----------------------------------------------------------------- panels --- */
function openPanel(kind) {
  const body = $('panel-body');
  if (kind === 'layers') {
    $('panel-title').textContent = 'الطبقات';
    const s = store.settings;
    const bases = [
      ['auto', 'layers', 'تلقائي', 'شوارع أونلاين، والخريطة المحلية تظهر فوراً'],
      ['vector', 'wifi-off', 'بدون إنترنت', 'شبكة شوارع دمشق المحفوظة على جهازك'],
      ['street', 'map', 'شوارع', 'OpenStreetMap'],
      ['satellite', 'globe', 'قمر صناعي', 'صور جوية — Esri / Sentinel-2'],
    ];
    body.innerHTML = `
      <section class="panel-sec">
        <h3>خريطة الأساس</h3>
        ${bases.map(([k, i, t, d]) => `<button class="opt ${s.base === k ? 'sel' : ''}" data-base="${k}">
          <div class="oi">${ico(i)}</div><div class="ot"><div class="on-t">${t}</div><div class="os">${d}</div></div>
          <div class="radio"></div></button>`).join('')}
      </section>
      <section class="panel-sec">
        <h3>الطبقات</h3>
        ${Object.entries(GROUPS).map(([k, g]) => `<button class="opt" data-group="${k}">
          <div class="oi">${ico(g.icon)}</div><div class="ot"><div class="on-t">${g.label}</div>
          <div class="os">${g.cats.map((c) => catOf(c).label).slice(0, 4).join(' · ')}…</div></div>
          <div class="switch ${store.settings.groups[k] !== false ? 'on' : ''}"></div></button>`).join('')}
        <button class="opt" data-toggle="labels">
          <div class="oi">${ico('tag')}</div><div class="ot"><div class="on-t">أسماء الأحياء</div><div class="os">تظهر عند التقريب</div></div>
          <div class="switch ${s.labels !== false ? 'on' : ''}"></div></button>
        <button class="opt" data-toggle="showMine">
          <div class="oi">${ico('pin')}</div><div class="ot"><div class="on-t">أماكني</div><div class="os">العلامات اللي ضفتها إنت</div></div>
          <div class="switch ${s.showMine !== false ? 'on' : ''}"></div></button>
      </section>`;
  } else {
    $('panel-title').textContent = 'الأدوات';
    body.innerHTML = `
      <section class="panel-sec">
        <h3>استكشاف</h3>
        <button class="tool-row" data-tool="measure">${ico('ruler')}<span class="tt">قياس المسافة</span><span class="td">اضغط نقاط عالخريطة</span></button>
        <button class="tool-row" data-tool="locate">${ico('locate')}<span class="tt">حدّد موقعي</span><span class="td">GPS</span></button>
        <button class="tool-row" data-tool="share">${ico('share')}<span class="tt">شارك موقع الخريطة</span><span class="td">رابط</span></button>
      </section>
      <section class="panel-sec">
        <h3>بياناتي</h3>
        <button class="tool-row" data-tool="export">${ico('download')}<span class="tt">تصدير أماكني</span><span class="td">JSON</span></button>
        <button class="tool-row" data-tool="geojson">${ico('map')}<span class="tt">تصدير GeoJSON</span><span class="td">لأي تطبيق خرائط</span></button>
        <button class="tool-row" data-tool="import">${ico('upload')}<span class="tt">استيراد ملف</span><span class="td">JSON مُصدَّر</span></button>
        <button class="tool-row danger" data-tool="clear">${ico('trash')}<span class="tt">مسح كل أماكني</span></button>
      </section>
      <section class="panel-sec">
        <h3>لون التمييز</h3>
        <div class="swatches">
          ${Object.entries(ACCENTS).map(([k, a]) => {
            const on = (store.settings.accent || 'indigo') === k;
            const c = document.documentElement.dataset.theme === 'dark' ? a.dark : a.light;
            return `<button class="swatch ${on ? 'sel' : ''}" data-accent="${k}" style="--c:${c}" aria-label="${a.name}"></button>`;
          }).join('')}
        </div>
      </section>
      <section class="panel-sec">
        <h3>التطبيق</h3>
        <button class="tool-row" data-tool="theme">${ico(store.settings.theme === 'dark' ? 'sun' : 'moon')}<span class="tt">تبديل المظهر</span><span class="td">${store.settings.theme === 'dark' ? 'داكن' : 'فاتح'}</span></button>
        <button class="tool-row" data-tool="install">${ico('phone')}<span class="tt">ثبّت التطبيق</span><span class="td">عالشاشة الرئيسية</span></button>
        <button class="tool-row" data-tool="help">${ico('info')}<span class="tt">كيف أضيف مكان؟</span></button>
        <div class="about">خرائط الشام ${APP.version} — بيانات الخريطة © <b>OpenStreetMap</b> (ODbL)، والصور الجوية © Esri / EOX.
        كل أماكنك وصورك محفوظة على جهازك، ما في سيرفر ولا حساب.</div>
      </section>
      <input type="file" id="import-file" accept="application/json,.json" hidden>`;
  }
  openOverlay('ov-panel');
}

function handlePanelClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.base) {
    store.settings.base = btn.dataset.base;
    store.saveSettings();
    mapview.setBase(btn.dataset.base);
    $('offline-badge').classList.toggle('show', btn.dataset.base === 'vector' || !navigator.onLine);
    openPanel('layers');
  } else if (btn.dataset.group) {
    const k = btn.dataset.group;
    const on = !(store.settings.groups[k] !== false);
    store.settings.groups[k] = on;
    store.saveSettings();
    mapview.setActiveGroups(Object.keys(GROUPS).filter((g) => store.settings.groups[g] !== false));
    btn.querySelector('.switch').classList.toggle('on', on);
    renderList();
  } else if (btn.dataset.toggle) {
    const k = btn.dataset.toggle;
    const on = !(store.settings[k] !== false);
    store.settings[k] = on;
    store.saveSettings();
    if (k === 'labels') mapview.setLabelsVisible(on);
    if (k === 'showMine') mapview.setMineVisible(on);
    btn.querySelector('.switch').classList.toggle('on', on);
  } else if (btn.dataset.tool) {
    runTool(btn.dataset.tool);
  } else if (btn.dataset.accent) {
    store.settings.accent = btn.dataset.accent;
    store.saveSettings();
    applyAccent(btn.dataset.accent);
    openPanel('tools');
    toast('غيّرنا لون التطبيق');
  }
}

async function runTool(tool) {
  if (tool === 'measure') {
    closeOverlay('ov-panel');
    mapview.startMeasure();
    setSheetHeight(peekHeight());
    toast('اضغط عالخريطة لتحديد النقاط');
    showMeasureBar();
  } else if (tool === 'locate') {
    closeOverlay('ov-panel');
    locateMe();
  } else if (tool === 'share') {
    const c = mapview.map.getCenter();
    const url = `${location.origin}${location.pathname}?lat=${c.lat.toFixed(5)}&lon=${c.lng.toFixed(5)}&z=${mapview.map.getZoom()}`;
    const copied = await shareOrCopy({ title: 'خرائط الشام', text: 'موقع على خريطة دمشق', url });
    if (copied) toast('نسخنا رابط الموقع');
  } else if (tool === 'export') {
    const data = await store.exportData();
    download(`sham-places-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('صدّرنا ' + data.places.length + ' مكان');
  } else if (tool === 'geojson') {
    download(`sham-places-${new Date().toISOString().slice(0, 10)}.geojson`, JSON.stringify(store.exportGeoJSON(), null, 2), 'application/geo+json');
    toast('صدّرنا GeoJSON');
  } else if (tool === 'import') {
    $('import-file')?.click();
  } else if (tool === 'clear') {
    const ok = await confirmDialog('مسح كل أماكني', 'رح تنمسح كل الأماكن اللي ضفتها والصور كمان. متأكد؟', 'امسح الكل');
    if (ok) {
      for (const p of store.places) await store.deletePhoto(p.id);
      store.places = [];
      store.savePlaces();
      st.photos = {};
      refreshMine();
      renderList();
      closeOverlay('ov-panel');
      toast('انمسحت كل أماكنك');
    }
  } else if (tool === 'theme') {
    const next = store.settings.theme === 'dark' ? 'light' : 'dark';
    store.settings.theme = next;
    store.saveSettings();
    document.documentElement.dataset.theme = next;
    applyAccent(store.settings.accent);
    mapview.setTheme(next);
    openPanel('tools');
  } else if (tool === 'install') {
    installApp();
  } else if (tool === 'help') {
    closeOverlay('ov-panel');
    openOverlay('ov-welcome');
  }
}

function showMeasureBar() {
  const bar = document.createElement('div');
  bar.id = 'measure-bar';
  bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--sheet-h) + 24px);z-index:70;display:flex;gap:8px';
  bar.innerHTML = `<button class="btn-ghost" id="measure-done" style="margin:0;width:auto;padding:0 20px;background:var(--accent);color:var(--accent-ink)">تم</button>
    <button class="btn-ghost" id="measure-cancel" style="margin:0;width:auto;padding:0 20px">إلغاء</button>`;
  document.body.appendChild(bar);
  $('measure-cancel').onclick = () => {
    mapview.stopMeasure();
    mapview.clearMeasureLayers();
    bar.remove();
    $('measure-label')?.remove();
  };
  $('measure-done').onclick = () => {
    mapview.stopMeasure();
    bar.remove();
    const lbl = $('measure-label');
    if (lbl) setTimeout(() => lbl.remove(), 2200);
  };
}

/* ------------------------------------------------------------------ tools --- */
function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 30000 }
    );
  });
}

let userDot = null;
async function locateMe() {
  const btn = $('btn-locate');
  btn.classList.add('on');
  toast('عم نحدد موقعك…');
  const pos = await getPosition();
  if (!pos) {
    btn.classList.remove('on');
    toast('ما قدرنا نحدد موقعك — تأكد من إذن الموقع');
    return;
  }
  st.userPos = pos;
  if (userDot) mapview.map.removeLayer(userDot);
  const acc = accentColor();
  userDot = L.layerGroup([
    L.circle([pos.lat, pos.lon], { radius: Math.max(30, pos.acc || 40), color: acc, weight: 1, fillColor: acc, fillOpacity: 0.1, interactive: false }),
    L.circleMarker([pos.lat, pos.lon], { radius: 7, color: '#fff', weight: 3, fillColor: acc, fillOpacity: 1 }),
  ]).addTo(mapview.map);
  mapview.map.setView([pos.lat, pos.lon], 16, { animate: true });
  renderList();
  btn.classList.remove('on');
  toast('هيدا موقعك');
}

async function shareOrCopy({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return false;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
  }
  await copyText(url);
  return true;
}

async function sharePlace(p) {
  const url = `${location.origin}${location.pathname}?p=${encodeURIComponent(p.id)}&lat=${p.lat}&lon=${p.lon}&n=${encodeURIComponent(p.name)}`;
  const copied = await shareOrCopy({ title: p.name, text: `${p.name} — من خرائط الشام`, url });
  if (copied) toast('نسخنا رابط المكان');
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

async function installApp() {
  if (st.deferredInstall) {
    st.deferredInstall.prompt();
    const { outcome } = await st.deferredInstall.userChoice;
    if (outcome === 'accepted') toast('تم التثبيت');
    st.deferredInstall = null;
    return;
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos) {
    await confirmDialog('ثبّت التطبيق', 'من سفاري: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».', 'فهمت');
  } else {
    await confirmDialog('ثبّت التطبيق', 'من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'فهمت');
  }
}

/* ---------------------------------------------------------------- overlays --- */
function openOverlay(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('open');
  if (window.innerWidth < 720) setSheetHeight(peekHeight());
}
function closeOverlay(id) {
  $(id)?.classList.remove('open');
}

let confirmResolve = null;
function confirmDialog(title, msg, okLabel = 'تأكيد') {
  $('confirm-title').textContent = title;
  $('confirm-msg').textContent = msg;
  $('confirm-ok').textContent = okLabel;
  openOverlay('ov-confirm');
  return new Promise((resolve) => { confirmResolve = resolve; });
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------------- misc --- */
function handleUrlParams() {
  const q = new URLSearchParams(location.search);
  if (q.has('lat') && q.has('lon')) {
    const lat = +q.get('lat'), lon = +q.get('lon'), z = +(q.get('z') || 16);
    if (isFinite(lat) && isFinite(lon)) {
      mapview.map.setView([lat, lon], z, { animate: false });
      if (q.get('n')) toast(q.get('n'));
    }
  }
  const pid = q.get('p');
  if (pid) {
    const p = store.places.find((x) => x.id === pid) || mapview.pois.find((x) => x.id === pid);
    if (p) setTimeout(() => openDetail(p), 600);
  }
}

async function compressImage(file, maxSide = 1000, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  // نتأخر شوي حتى ما ينافس تحميل التطبيق على شبكة المستخدم أول مرة
  const start = () => setTimeout(() => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => console.warn('SW', e));
  }, 2500);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/* ------------------------------------------------------------------ events --- */
function bindUI() {
  bindSheet();

  $('btn-search').addEventListener('click', openSearch);
  $('btn-layers').addEventListener('click', () => openPanel('layers'));
  $('btn-menu').addEventListener('click', () => openPanel('tools'));
  $('btn-locate').addEventListener('click', () => locateMe());
  $('btn-zoom-in').addEventListener('click', () => mapview.map.zoomIn(1));
  $('btn-zoom-out').addEventListener('click', () => mapview.map.zoomOut(1));
  $('fab-add').addEventListener('click', () => {
    const c = mapview.map.getCenter();
    mapview.flashCrosshair();
    openEditor({ lat: c.lat, lon: c.lng });
  });

  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]');
    if (!b) return;
    st.chip = b.dataset.chip;
    st.limit = 60;
    renderChips();
    renderList();
    setSheetHeight(sheetHeights()[1]);
  });

  $('btn-sort').addEventListener('click', () => {
    st.sort = st.sort === 'near' ? 'alpha' : 'near';
    renderList();
  });

  $('list').addEventListener('click', (e) => {
    const btn = e.target.closest('.item');
    if (!btn) return;
    const id = btn.dataset.id;
    const p = store.places.find((x) => x.id === id) || mapview.pois.find((x) => x.id === id);
    if (!p) return;
    const kind = store.places.some((x) => x.id === id) ? 'mine' : 'poi';
    mapview.map.setView([p.lat, p.lon], Math.max(15.5, mapview.map.getZoom()), { animate: true });
    setSheetHeight(peekHeight());
    openDetail(p, kind);
  });

  $('search-input').addEventListener('input', onSearchInput);
  $('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('search-clear').addEventListener('click', () => {
    $('search-input').value = '';
    renderSearch('');
    $('search-input').focus();
  });
  $('search-results').addEventListener('click', handleSearchClick);

  $('detail-card').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) detailAction(act.dataset.act);
  });

  $('f-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    st.draft.cat = b.dataset.cat;
    [...$('f-cats').children].forEach((x) => x.classList.toggle('sel', x.dataset.cat === st.draft.cat));
  });
  $('f-stars').addEventListener('click', (e) => {
    const s = e.target.closest('[data-v]');
    if (!s) return;
    st.draft.rating = +s.dataset.v === st.draft.rating ? 0 : +s.dataset.v;
    paintStars();
  });
  $('f-photo-btn').addEventListener('click', () => $('f-photo').click());
  $('f-photo').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      st.draft.photo = dataUrl;
      $('f-photo-pv').innerHTML = `<img src="${dataUrl}" alt="">`;
    } catch (err) {
      toast('تعذّر قراءة الصورة');
    }
  });
  $('f-move-center').addEventListener('click', () => {
    const c = mapview.map.getCenter();
    st.draft.lat = c.lat;
    st.draft.lon = c.lng;
    $('f-coords').textContent = c.lat.toFixed(5) + ', ' + c.lng.toFixed(5);
    toast('حدّدنا الموقع من مركز الخريطة');
  });
  $('f-save').addEventListener('click', saveEditor);
  $('f-cancel').addEventListener('click', () => closeOverlay('ov-editor'));

  $('panel-body').addEventListener('click', handlePanelClick);
  $('panel-body').addEventListener('change', async (e) => {
    if (e.target.id !== 'import-file') return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const added = await store.importData(JSON.parse(txt));
      st.photos = await store.allPhotos();
      refreshMine();
      renderList();
      closeOverlay('ov-panel');
      toast(`استوردنا ${added} مكان`);
    } catch (err) {
      toast('الملف مو صالح — لازم يكون ملف صدّرناه من هالتطبيق');
    }
  });

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c) closeOverlay(c.dataset.close);
    if (e.target.classList?.contains('overlay') && e.target.id !== 'ov-welcome') closeOverlay(e.target.id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach((o) => o.classList.remove('open'));
  });

  $('confirm-ok').addEventListener('click', () => {
    closeOverlay('ov-confirm');
    confirmResolve?.(true);
    confirmResolve = null;
  });
  $('confirm-cancel').addEventListener('click', () => {
    closeOverlay('ov-confirm');
    confirmResolve?.(false);
    confirmResolve = null;
  });

  $('welcome-start').addEventListener('click', () => {
    store.settings.firstRun = false;
    store.saveSettings();
    closeOverlay('ov-welcome');
  });

  mapview.map.on('click', () => {
    if (window.innerWidth < 720 && sheet().offsetHeight > peekHeight() + 40) setSheetHeight(peekHeight());
  });

  window.addEventListener('online', () => { $('offline-badge').classList.remove('show'); toast('رجع النت'); });
  window.addEventListener('offline', () => { $('offline-badge').classList.add('show'); toast('انقطع النت — الخريطة المحلية شغّالة'); });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    st.deferredInstall = e;
  });
}

boot();
