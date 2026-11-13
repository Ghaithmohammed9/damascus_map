/* أدوات الجغرافيا والنصوص */

export const R = 6371008.8;

export function haversine(lat1, lon1, lat2, lon2) {
  const p = Math.PI / 180;
  const dφ = (lat2 - lat1) * p;
  const dλ = (lon2 - lon1) * p;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function fmtDist(m) {
  if (!isFinite(m)) return '';
  if (m < 950) return Math.round(m / 10) * 10 + ' م';
  return (m / 1000).toFixed(m < 9500 ? 1 : 0) + ' كم';
}

export function fmtDuration(sec) {
  if (!isFinite(sec) || sec <= 0) return '';
  const min = Math.round(sec / 60);
  if (min < 60) return min + ' دقيقة';
  const h = Math.floor(min / 60), r = min % 60;
  return h + ' ساعة' + (r ? ' و' + r + ' د' : '');
}

const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** تطبيع عربي للبحث: توحيد الألف/الياء/التاء المربوطة، إزالة التشكيل والهمزات */
export function normAr(s) {
  return String(s || '')
    .replace(AR_DIACRITICS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[^\w\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function money(n) {
  return Number(n).toFixed(1);
}

export function bboxOf(points, pad = 0) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [[minLat - pad, minLon - pad], [maxLat + pad, maxLon + pad]];
}

export function debounce(fn, ms = 160) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function uid() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
