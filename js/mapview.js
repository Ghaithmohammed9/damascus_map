/* طبقة الخريطة: Leaflet + شبكة طرق محلية (تُرسم فوراً) + بلاطات اختيارية + عناقيد */

import { APP, THEMES, catOf, GROUPS } from './config.js';
import { haversine } from './geo.js';

const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services';

/** مزوّدو البلاطات — لكل نمط سلسلة بدائل */
const PROVIDERS = {
  street: [
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '', maxNativeZoom: 19, darkInvert: true },
  ],
  bright: [
    { url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, attr: 'Tiles &copy; Esri', maxNativeZoom: 19 },
  ],
  dark: [
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '', maxNativeZoom: 19, darkInvert: true },
  ],
  satellite: [
    { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attr: 'Imagery &copy; Esri, Maxar', maxNativeZoom: 19,
      labels: { url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 } },
    { url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
      attr: 'Sentinel-2 cloudless &copy; EOX', maxNativeZoom: 14 },
  ],
};

/** أهمية المكان: 0 = يظهر دايماً، 1 = من ١٢.٥، 2 = من ١٤ */
const RANK = {
  historic: 0, museum: 0, viewpoint: 0, mosque: 0, church: 0, culture: 0,
  park: 0, nature: 0, university: 0, hotel: 0, transport: 0,
  market: 1, restaurant: 1, cafe: 1, hospital: 1, sport: 1, worship: 1, other: 1,
  shop: 2, school: 2, pharmacy: 2, bank: 2, fuel: 2, parking: 2, government: 2, education: 2,
};

const markerIcon = (icon, color, cls = '') => L.divIcon({
  className: 'pin-wrap' + (cls ? ' ' + cls : ''),
  html: `<div class="pin ${cls}" style="--c:${color}"><svg class="ic" viewBox="0 0 24 24"><use href="#i-${icon}"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export const mapview = {
  map: null,
  theme: 'light',
  roads: null,
  pois: [],
  districts: [],
  areas: [],
  streetIndex: new Map(),
  tileLayer: null,
  labelLayer: null,
  providerIndex: 0,
  vectorGroup: null,
  roadLayers: null,
  areaLayer: null,
  showAreas: true,
  clusterGroup: null,
  mineGroup: null,
  labelGroup: null,
  routeLine: null,
  tempLine: null,
  selectedId: null,
  activeGroups: new Set(Object.keys(GROUPS)),
  showMine: true,
  showLabels: true,
  baseMode: 'auto',
  tilesReady: false,
  tileErrors: 0,

  init(el) {
    this.map = L.map(el, {
      center: APP.center,
      zoom: 13,
      minZoom: 9.5,
      maxZoom: 18.5,
      zoomControl: false,
      attributionControl: true,
      maxBounds: [[33.10, 35.65], [33.95, 36.95]],
      maxBoundsViscosity: 0.7,
      zoomSnap: 0.5,
      preferCanvas: true,
      zoomAnimationThreshold: 4,
    });
    this.map.attributionControl.setPrefix(false).setPosition('bottomleft');
    this.map.attributionControl.addAttribution(
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    );

    // طبقة أساس محلية تحت البلاطات: الخريطة تبين فوراً حتى قبل وصول أي صورة
    this.map.createPane('basePane');
    this.map.getPane('basePane').style.zIndex = 150;
    this.map.createPane('labelsPane');
    this.map.getPane('labelsPane').style.zIndex = 350;
    this.map.getPane('labelsPane').style.pointerEvents = 'none';
    this.map.createPane('areasPane');
    this.map.getPane('areasPane').style.zIndex = 340;

    this.vectorGroup = L.layerGroup().addTo(this.map);
    this.clusterGroup = L.layerGroup().addTo(this.map);
    this.mineGroup = L.layerGroup().addTo(this.map);
    this.labelGroup = L.layerGroup().addTo(this.map);
    this.roadLayers = {};
    // Renderer واحد يُعاد استخدامه — يمنع بقاء نسخ قديمة من الكانفاس عند تغيير الثيم
    this.baseRenderer = L.canvas({ padding: 0.5, pane: 'basePane' });
    this.overlayRenderer = L.canvas({ padding: 0.5 });

    this.map.on('moveend zoomend', () => this.refreshClusters());
    this.map.on('zoomend', () => {
      if (this.map.hasLayer(this.vectorGroup) && this.roadLayers) {
        for (const k in this.roadLayers) this.roadLayers[k].redraw?.();
      }
      this._updateDetailLayer();
    });
    this.map.on('click', (e) => {
      if (this.measureMode) return this._measureClick(e.latlng);
      this.onMapClick?.(e.latlng);
    });
    this.map.on('contextmenu', (e) => {
      L.DomEvent.preventDefault(e.originalEvent);
      this.onLongPress?.(e.latlng);
    });
    return this.map;
  },

  _accent() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return v || '#4f46e5';
  },

  /* --------------------------------------------------------------- data --- */
  async load() {
    const get = (u) => fetch(u, { cache: 'force-cache' }).then((r) => {
      if (!r.ok) throw new Error(u + ' ' + r.status);
      return r.json();
    });
    const [roads, pois, districts, areas] = await Promise.all([
      get('data/roads.json'),
      get('data/pois.json'),
      get('data/districts.json').catch(() => ({ districts: [] })),
      get('data/areas.json').catch(() => ({ areas: [] })),
    ]);
    this.roads = roads;
    this.pois = pois.pois || [];
    this.districts = districts.districts || [];
    this.areas = areas.areas || [];
    this.renderLocalBase();
    this.renderAreas();
    this.buildStreetIndex();
    return this;
  },

  buildStreetIndex() {
    const { names, roads } = this.roads;
    const idx = new Map();
    for (const [cls, ni, flags, pts] of roads) {
      if (!ni) continue;
      const name = names[ni];
      let rec = idx.get(name);
      if (!rec) {
        rec = { name, segs: [], bounds: L.latLngBounds([]) };
        idx.set(name, rec);
      }
      const seg = [];
      for (let i = 0; i < pts.length; i += 2) {
        const ll = L.latLng(pts[i + 1] / 1e5 - 90, pts[i] / 1e5 - 180);
        seg.push(ll);
        rec.bounds.extend(ll);
      }
      if (seg.length) rec.segs.push(seg);
    }
    this.streetIndex = idx;
  },

  /* -------------------------------------------------------- local base --- */
  renderLocalBase() {
    const t = THEMES[this.theme] || THEMES.light;
    if (!this.roads) return;
    if (this.roadLayers) for (const k in this.roadLayers) this.vectorGroup.removeLayer(this.roadLayers[k]);
    this.roadLayers = {};

    const canvas = this.baseRenderer || L.canvas({ padding: 0.5, pane: 'basePane' });
    const { roads, classes } = this.roads;
    const byClass = classes.map(() => []);

    for (const [cls, ni, flags, pts] of roads) {
      if (flags & 4) continue; // أنفاق
      const arr = byClass[cls] || byClass[5];
      const line = [];
      for (let i = 0; i < pts.length; i += 2) line.push([pts[i + 1] / 1e5 - 90, pts[i] / 1e5 - 180]);
      arr.push(line);
    }

    classes.forEach(([name], i) => {
      const style = t.road[name] || [t.label, 1];
      const layer = L.polyline(byClass[i], {
        renderer: canvas,
        color: style[0],
        weight: style[1],
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        smoothFactor: 1.1,
      });
      this.roadLayers[name] = layer;
      if (name !== 'residential') this.vectorGroup.addLayer(layer);
    });
    this._updateDetailLayer();
  },

  _updateDetailLayer() {
    if (!this.map || !this.roadLayers || !this.roadLayers.residential) return;
    const want = this.map.getZoom() >= 13.2;
    const has = this.vectorGroup.hasLayer(this.roadLayers.residential);
    if (want && !has) this.vectorGroup.addLayer(this.roadLayers.residential);
    if (!want && has) this.vectorGroup.removeLayer(this.roadLayers.residential);
    if (want) this.roadLayers.residential.bringToFront?.();
  },

  setTheme(theme, restart = true) {
    this.theme = theme;
    document.documentElement.dataset.theme = theme;
    if (this.roads) this.renderLocalBase();
    if (restart && this.baseMode !== 'vector') this.setBase(this.baseMode);
  },

  /* --------------------------------------------------------------- base --- */
  setBase(mode) {
    this.baseMode = mode;
    this._clearTiles();

    if (mode === 'vector') {
      this.map.getContainer().classList.add('vector-mode');
      this.map.getContainer().classList.remove('tiles-on');
      this.onTilesState?.('off');
      return;
    }
    this.map.getContainer().classList.remove('vector-mode');
    this.providerIndex = 0;
    this._startProvider();
  },

  _clearTiles() {
    clearTimeout(this._watchdog);
    if (this.tileLayer) { this.map.removeLayer(this.tileLayer); this.tileLayer = null; }
    if (this.labelLayer) { this.map.removeLayer(this.labelLayer); this.labelLayer = null; }
    this.tilesReady = false;
    this.tileErrors = 0;
  },

  _providerKey() {
    if (this.baseMode === 'auto') return this.theme === 'dark' ? 'dark' : 'street';
    return this.baseMode;
  },

  _startProvider() {
    const list = PROVIDERS[this._providerKey()] || PROVIDERS.street;
    const cfg = list[this.providerIndex];
    if (!cfg) return this._tilesFailed();

    const zMax = 19;
    this.tileLayer = L.tileLayer(cfg.url, {
      attribution: cfg.attr,
      maxZoom: zMax,
      maxNativeZoom: cfg.maxNativeZoom,
      opacity: 0,
      updateWhenIdle: false,
      keepBuffer: 3,
    });

    let loaded = 0;
    this.tileLayer.on('tileload', () => {
      loaded++;
      if (!this.tilesReady && loaded >= 6) this._tilesArrived();
    });
    this.tileLayer.on('load', () => {
      if (!this.tilesReady) this._tilesArrived();
    });
    this.tileLayer.on('tileerror', () => {
      this.tileErrors++;
      if (!this.tilesReady && this.tileErrors >= 6) this._nextProvider();
    });

    this.tileLayer.addTo(this.map);
    if (cfg.darkInvert && this.theme === 'dark') {
      const c = this.tileLayer.getContainer();
      if (c) c.classList.add('tiles-invert');
    }
    this.onTilesState?.('loading');

    if (cfg.labels) {
      this.labelLayer = L.tileLayer(cfg.labels.url, {
        maxZoom: zMax, maxNativeZoom: cfg.labels.maxNativeZoom,
        pane: 'labelsPane', opacity: 0,
      }).addTo(this.map);
    }

    clearTimeout(this._watchdog);
    this._watchdog = setTimeout(() => {
      if (!this.tilesReady) this._nextProvider();
    }, 12000);
  },

  _tilesArrived() {
    this.tilesReady = true;
    clearTimeout(this._watchdog);
    this.map.getContainer().classList.add('tiles-on');
    this.tileLayer?.setOpacity(1);
    this.labelLayer?.setOpacity(0.9);
    this.onTilesState?.('ready');
  },

  _nextProvider() {
    const list = PROVIDERS[this._providerKey()] || [];
    if (this.providerIndex + 1 < list.length) {
      this.providerIndex++;
      this._clearTiles();
      this._startProvider();
      return;
    }
    this._tilesFailed();
  },

  _tilesFailed() {
    clearTimeout(this._watchdog);
    this._clearTiles();
    this.map.getContainer().classList.add('vector-mode');
    this.onTilesState?.('failed');
    this.onTilesFailed?.();
  },

  /* ------------------------------------------------------------ markers --- */
  setActiveGroups(groups) {
    this.activeGroups = new Set(groups);
    this.refreshClusters();
  },

  passesFilter(poi) {
    return this.activeGroups.has(catOf(poi.cat).group);
  },

  refreshClusters() {
    if (!this.map || !this.pois.length) return;
    clearTimeout(this._clusterT);
    this._clusterT = setTimeout(() => this._buildClusters(), 40);
    this.refreshDistrictLabels();
  },

  _buildClusters() {
    const map = this.map;
    const z = map.getZoom();
    const bounds = map.getBounds().pad(0.15);
    this.clusterGroup.clearLayers();

    const visible = [];
    const zoomRank = z < 12.5 ? 0 : z < 14 ? 1 : 2;
    for (const p of this.pois) {
      if (!this.passesFilter(p)) continue;
      if ((RANK[p.cat] ?? 1) > zoomRank) continue;
      if (!bounds.contains([p.lat, p.lon])) continue;
      visible.push(p);
    }
    if (!visible.length) return;

    if (z >= 15.5) {
      for (const p of visible.slice(0, 520)) this.clusterGroup.addLayer(this._poiMarker(p));
      return;
    }

    const baseCell = z < 12 ? 150 : z < 13 ? 110 : z < 14 ? 92 : z < 15 ? 70 : 58;
    const out = [];
    const split = (pts, cell, depth) => {
      for (const b of this._bucket(pts, z, cell)) {
        if (b.length > 420 && depth < 3) split(b, cell / 1.8, depth + 1);
        else out.push(b);
      }
    };
    split(visible, baseCell, 0);

    for (const arr of out) {
      if (arr.length === 1) {
        this.clusterGroup.addLayer(this._poiMarker(arr[0]));
        continue;
      }
      const lat = arr.reduce((s, p) => s + p.lat, 0) / arr.length;
      const lon = arr.reduce((s, p) => s + p.lon, 0) / arr.length;
      const cats = new Set(arr.map((p) => p.cat));
      const color = cats.size === 1 ? catOf(arr[0].cat).color : this._accent();
      const n = arr.length;
      const label = n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
      const m = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'clu-wrap',
          html: `<div class="clu${n >= 100 ? ' big' : ''}" style="--c:${color}">${label}</div>`,
          iconSize: null,
          iconAnchor: [0, 0],
        }),
        keyboard: false,
      });
      m.on('click', () => map.setView([lat, lon], Math.min(z + 2, 17), { animate: true }));
      this.clusterGroup.addLayer(m);
    }
  },

  _bucket(points, z, cell) {
    const map = this.map;
    const groupsMap = new Map();
    for (const p of points) {
      const pt = map.project([p.lat, p.lon], z);
      const key = Math.floor(pt.x / cell) + ':' + Math.floor(pt.y / cell);
      let g = groupsMap.get(key);
      if (!g) groupsMap.set(key, (g = []));
      g.push(p);
    }
    return [...groupsMap.values()];
  },

  _poiMarker(p) {
    const c = catOf(p.cat);
    const active = this.selectedId === p.id;
    const m = L.marker([p.lat, p.lon], {
      icon: markerIcon(c.icon, c.color, active ? 'is-sel-target' : ''),
      riseOnHover: true,
      keyboard: false,
      zIndexOffset: active ? 500 : 0,
    });
    if (active) m._icon?.parentElement?.classList.add('is-sel');
    m.on('click', () => {
      this.select(p.id);
      this.onSelect?.(p, 'poi');
    });
    return m;
  },

  select(id) {
    this.selectedId = id;
  },

  /* --------------------------------------------------------- user places --- */
  renderMine(places, { photos = {}, onOpen } = {}) {
    this.mineGroup.clearLayers();
    for (const p of places) {
      const c = catOf(p.cat);
      const photo = photos[p.id];
      const icon = L.divIcon({
        className: 'pin-wrap mine' + (this.selectedId === p.id ? ' is-sel' : ''),
        html: `<div class="pin mine">${photo
          ? `<img src="${photo}" alt="">`
          : `<svg class="ic" viewBox="0 0 24 24"><use href="#i-${c.icon}"/></svg>`}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const m = L.marker([p.lat, p.lon], { icon, zIndexOffset: 900, riseOnHover: true });
      m.on('click', () => {
        this.select(p.id);
        onOpen?.(p);
      });
      this.mineGroup.addLayer(m);
    }
  },

  setMineVisible(on) {
    this.showMine = on;
    if (on) this.mineGroup.addTo(this.map);
    else this.map.removeLayer(this.mineGroup);
  },

  /* ------------------------------------------------------------- labels --- */
  refreshDistrictLabels() {
    if (!this.map || !this.showLabels) return;
    const z = this.map.getZoom();
    this.labelGroup.clearLayers();
    if (z < 12.5) return;
    const b = this.map.getBounds();
    let n = 0;
    for (const d of this.districts) {
      if (n > 40) break;
      if (!b.contains([d.lat, d.lon])) continue;
      n++;
      this.labelGroup.addLayer(L.marker([d.lat, d.lon], {
        icon: L.divIcon({
          className: 'dlabel-wrap',
          html: `<span class="dlabel">${d.name}</span>`,
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        }),
        interactive: false,
        keyboard: false,
      }));
    }
  },

  setLabelsVisible(on) {
    this.showLabels = on;
    if (on) this.labelGroup.addTo(this.map);
    else this.map.removeLayer(this.labelGroup);
    this.refreshDistrictLabels();
  },

  /* -------------------------------------------------------------- route --- */
  drawRoute(from, to, opts = {}) {
    this.clearRoute();
    const pts = (opts.path || []).map((c) => [c[0], c[1]]);
    this.routeLine = L.polyline(pts.length ? pts : [from, to], {
      color: this._accent(), weight: 6, opacity: 0.9, lineCap: 'round',
      dashArray: opts.direct ? '2 10' : null,
      renderer: this.overlayRenderer || L.canvas({ padding: 0.5 }),
      interactive: false,
    }).addTo(this.map);
    this.routeLine.bringToFront();
    return this.routeLine;
  },
  clearRoute() {
    if (this.routeLine) { this.map.removeLayer(this.routeLine); this.routeLine = null; }
  },

  /* ------------------------------------------------------------ measure --- */
  measureMode: false,
  measurePts: [],
  measureLayers: [],
  startMeasure() {
    this.measureMode = true;
    this.measurePts = [];
    this.clearMeasureLayers();
    this.map.getContainer().classList.add('measuring');
  },
  clearMeasureLayers() {
    for (const l of this.measureLayers) this.map.removeLayer(l);
    this.measureLayers = [];
  },
  stopMeasure() {
    this.measureMode = false;
    this.map.getContainer().classList.remove('measuring');
  },
  _measureClick(latlng) {
    this.measurePts.push(latlng);
    this.measureLayers.push(L.circleMarker(latlng, {
      radius: 5, color: this._accent(), weight: 2, fillColor: '#ffffff', fillOpacity: 1,
    }).addTo(this.map));
    let total = 0;
    for (let i = 1; i < this.measurePts.length; i++) {
      const a = this.measurePts[i - 1], b = this.measurePts[i];
      total += haversine(a.lat, a.lng, b.lat, b.lng);
    }
    if (this.measurePts.length > 1) {
      this.measureLayers.push(L.polyline(this.measurePts.slice(-2), {
        color: this._accent(), weight: 3, dashArray: '6 6',
        renderer: this.overlayRenderer || L.canvas(),
      }).addTo(this.map));
    }
    this.onMeasure?.(total);
  },

  /* --------------------------------------------------------------- misc --- */
  flyTo(lat, lon, zoom = 16) {
    this.map.setView([lat, lon], Math.max(this.map.getZoom(), zoom), { animate: true });
    this.map.panBy([0, 120], { animate: false });
  },
  fitStreet(name) {
    const rec = this.streetIndex.get(name);
    if (!rec) return false;
    this.map.fitBounds(rec.bounds, { padding: [40, 40], maxZoom: 16 });
    if (this.tempLine) this.map.removeLayer(this.tempLine);
    this.tempLine = L.polyline(rec.segs, { color: this._accent(), weight: 5, opacity: 0.85, interactive: false }).addTo(this.map);
    clearTimeout(this._tempT);
    this._tempT = setTimeout(() => { if (this.tempLine) { this.map.removeLayer(this.tempLine); this.tempLine = null; } }, 6000);
    return true;
  },
  highlight(latlng) {
    if (this.highlightMarker) this.map.removeLayer(this.highlightMarker);
    this.highlightMarker = L.circleMarker(latlng, {
      radius: 24, color: this._accent(), weight: 2, opacity: 0.85, fill: false,
    }).addTo(this.map);
    setTimeout(() => {
      if (this.highlightMarker) { this.map.removeLayer(this.highlightMarker); this.highlightMarker = null; }
    }, 4000);
  },
  flashCrosshair() {
    const el = document.createElement('div');
    el.className = 'crosshair';
    this.map.getContainer().appendChild(el);
    setTimeout(() => el.remove(), 1600);
  },
};
