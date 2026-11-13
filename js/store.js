/* تخزين محلي: أماكن المستخدم في localStorage، الصور في IndexedDB */

const K = {
  places: 'sham.places.v1',
  settings: 'sham.settings.v1',
  flags: 'sham.flags.v1', // مفضلة / زُرِت للأماكن الجاهزة
  last: 'sham.last.v1',
};

const readJSON = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
};
const writeJSON = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (e) {
    console.warn('storage full?', e);
    return false;
  }
};

export const DEFAULT_SETTINGS = {
  theme: 'light',
  accent: 'indigo',
  base: 'auto', // auto | dark | light | satellite | vector
  groups: { landmark: true, services: true, food: true, shopping: true, nature: true },
  showMine: true,
  labels: true,
  firstRun: true,
};

export const store = {
  places: readJSON(K.places, []),
  flags: readJSON(K.flags, {}), // id -> { fav:bool, visited:bool }
  settings: Object.assign({}, DEFAULT_SETTINGS, readJSON(K.settings, {})),

  savePlaces() {
    const ok = writeJSON(K.places, this.places);
    if (!ok) this.trimPhotosHint?.();
    return ok;
  },
  saveSettings() {
    writeJSON(K.settings, this.settings);
  },
  saveFlags() {
    writeJSON(K.flags, this.flags);
  },

  addPlace(p) {
    this.places.unshift(p);
    this.savePlaces();
    return p;
  },
  updatePlace(id, patch) {
    const i = this.places.findIndex((p) => p.id === id);
    if (i < 0) return null;
    this.places[i] = { ...this.places[i], ...patch, updated: Date.now() };
    this.savePlaces();
    return this.places[i];
  },
  removePlace(id) {
    this.places = this.places.filter((p) => p.id !== id);
    this.savePlaces();
    this.deletePhoto(id);
  },
  getPlace(id) {
    return this.places.find((p) => p.id === id) || null;
  },

  isFav(id) {
    return !!this.flags[id]?.fav;
  },
  isVisited(id) {
    return !!this.flags[id]?.visited;
  },
  toggleFav(id) {
    const f = this.flags[id] || {};
    f.fav = !f.fav;
    this.flags[id] = f;
    this.saveFlags();
    return f.fav;
  },
  toggleVisited(id) {
    const f = this.flags[id] || {};
    f.visited = !f.visited;
    this.flags[id] = f;
    this.saveFlags();
    return f.visited;
  },

  /* ------------------------------------------------ photos (IndexedDB) --- */
  _db: null,
  async db() {
    if (this._db) return this._db;
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('sham-map', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._db;
  },
  async putPhoto(id, dataUrl) {
    try {
      const db = await this.db();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        tx.objectStore('photos').put(dataUrl, id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('photo save failed', e);
      return false;
    }
  },
  async getPhoto(id) {
    try {
      const db = await this.db();
      return await new Promise((resolve) => {
        const tx = db.transaction('photos', 'readonly');
        const r = tx.objectStore('photos').get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },
  async deletePhoto(id) {
    try {
      const db = await this.db();
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(id);
    } catch (e) {
      /* ignore */
    }
  },
  async allPhotos() {
    try {
      const db = await this.db();
      return await new Promise((resolve) => {
        const out = {};
        const tx = db.transaction('photos', 'readonly');
        const st = tx.objectStore('photos');
        const req = st.openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) {
            out[c.key] = c.value;
            c.continue();
          } else resolve(out);
        };
        req.onerror = () => resolve({});
      });
    } catch (e) {
      return {};
    }
  },

  /* ------------------------------------------------------- import/export --- */
  async exportData() {
    const photos = await this.allPhotos();
    const mine = {};
    for (const p of this.places) if (photos[p.id]) mine[p.id] = photos[p.id];
    return {
      app: 'sham-map',
      version: 1,
      exported: new Date().toISOString(),
      places: this.places,
      flags: this.flags,
      settings: this.settings,
      photos: mine,
    };
  },
  async importData(obj, { merge = true } = {}) {
    if (!obj || obj.app !== 'sham-map' || !Array.isArray(obj.places)) throw new Error('ملف غير صالح');
    let added = 0;
    if (!merge) {
      this.places = [];
      this.flags = {};
    }
    const ids = new Set(this.places.map((p) => p.id));
    for (const p of obj.places) {
      if (!p || !p.id || !isFinite(p.lat) || !isFinite(p.lon)) continue;
      if (ids.has(p.id)) continue;
      this.places.push(p);
      ids.add(p.id);
      added++;
    }
    if (obj.flags) this.flags = merge ? { ...obj.flags, ...this.flags } : obj.flags;
    this.savePlaces();
    this.saveFlags();
    for (const [id, url] of Object.entries(obj.photos || {})) await this.putPhoto(id, url);
    return added;
  },
  exportGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: this.places.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { name: p.name, category: p.cat, description: p.desc || '', rating: p.rating || 0 },
      })),
    };
  },
};
