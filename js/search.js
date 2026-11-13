/* بحث موحّد: أماكن، شوارع، أحياء، وفئات */

import { normAr } from './geo.js';
import { CATS, GROUPS } from './config.js';

let index = null;

export function buildIndex(pois) {
  index = pois.map((p) => ({ p, n: normAr(p.name), e: normAr(p.en), c: p.cat }));
  return index.length;
}

/** كلمات مفتاحية للفئات: مطعم → restaurant … */
const CAT_WORDS = (() => {
  const map = new Map();
  for (const [key, c] of Object.entries(CATS)) {
    map.set(normAr(c.label), key);
    map.set(normAr(c.plural), key);
    for (const w of (c.aliases || [])) map.set(normAr(w), key);
  }
  const extra = {
    'اكل': 'restaurant', 'طعام': 'restaurant', 'فطور': 'restaurant', 'شاورما': 'restaurant',
    'قهوه': 'cafe', 'كافيه': 'cafe', 'بار': 'cafe',
    'مشفى': 'hospital', 'مستشفى': 'hospital', 'طبيب': 'hospital', 'اسعاف': 'hospital',
    'دوا': 'pharmacy', 'دواء': 'pharmacy', 'صيدلية': 'pharmacy',
    'مدرسه': 'school', 'ثانويه': 'school', 'جامعة': 'university',
    'بنك': 'bank', 'مصرف': 'bank', 'صراف': 'bank', 'atm': 'bank',
    'بنزين': 'fuel', 'وقود': 'fuel', 'محطة': 'fuel',
    'جامع': 'mosque', 'مسجد': 'mosque', 'كنيسة': 'church',
    'اثار': 'historic', 'قلعة': 'historic', 'باب': 'historic', 'سوق': 'market',
    'بقالية': 'shop', 'سوبرماركت': 'shop', 'حلويات': 'shop', 'مخبز': 'shop',
    'حديقة': 'park', 'منتزه': 'park', 'ملعب': 'sport', 'نادي': 'sport',
    'فندق': 'hotel', 'اوتيل': 'hotel', 'موقف': 'parking', 'كراج': 'parking',
    'شرطة': 'government', 'بريد': 'government', 'بلدية': 'government',
    'جبل': 'nature', 'قمة': 'nature', 'نبع': 'nature', 'شلال': 'nature',
    'متحف': 'museum', 'مسرح': 'culture', 'سينما': 'culture',
  };
  for (const [w, k] of Object.entries(extra)) map.set(normAr(w), k);
  return map;
})();

/**
 * @returns {{places:Array, streets:Array<string>, cats:Array<string>}}
 */
export function search(q, { streets = new Map(), mine = [] } = {}) {
  const nq = normAr(q);
  const out = { places: [], streets: [], cats: [] };
  if (!nq) return out;
  const terms = nq.split(' ').filter(Boolean);

  // 1) الفئة
  if (CAT_WORDS.has(nq) && index) {
    const cat = CAT_WORDS.get(nq);
    out.cats.push(cat);
    const hits = index.filter((r) => r.c === cat).slice(0, 40).map((r) => r.p);
    out.places.push(...hits);
  }

  // 2) الشوارع والأحياء
  for (const name of streets.keys()) {
    const nn = normAr(name);
    if (nn === nq || nn.startsWith(nq)) out.streets.push(name);
    if (out.streets.length > 8) break;
  }

  // 3) الأماكن
  const scored = [];
  const mineIds = new Set(mine.map((p) => p.id));
  for (const p of mine) {
    const nn = normAr(p.name);
    if (nn.includes(nq)) scored.push({ p, s: nn === nq ? 130 : nn.startsWith(nq) ? 115 : 95, mine: true });
  }
  if (index) {
    for (const r of index) {
      let s = 0;
      if (r.n === nq) s = 100;
      else if (r.n.startsWith(nq)) s = 82;
      else if (r.n.includes(nq)) s = 64;
      else if (terms.length > 1 && terms.every((t) => r.n.includes(t))) s = 46;
      else if (r.e && r.e.includes(nq)) s = 26;
      if (s) scored.push({ p: r.p, s, mine: mineIds.has(r.p.id) });
    }
  }
  scored.sort((a, b) => b.s - a.s || a.p.name.length - b.p.name.length);
  out.places = [...out.places, ...scored.map((x) => x.p)];

  // إزالة التكرار
  const seen = new Set();
  out.places = out.places.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  return out;
}
