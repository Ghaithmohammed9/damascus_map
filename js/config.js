/* خرائط الشام — ثوابت التطبيق: الفئات، الألوان، النصوص */

export const APP = {
  name: 'خرائط الشام',
  tagline: 'خريطة دمشق… بيدك',
  version: '2.0.2',
  center: [33.5138, 36.2765],
  bounds: [[33.28, 35.90], [33.80, 36.70]],
};

/** كل فئة: اسم عربي، أيقونة (معرّف من SVG sprite)، لون، والمجموعة */
export const CATS = {
  mosque:     { label: 'مسجد',        plural: 'المساجد',        icon: 'mosque',     color: '#0d9488', group: 'landmark' },
  church:     { label: 'كنيسة',       plural: 'الكنائس',        icon: 'church',     color: '#7c3aed', group: 'landmark' },
  worship:    { label: 'مكان عبادة',  plural: 'أماكن العبادة',  icon: 'worship',    color: '#14b8a6', group: 'landmark' },
  historic:   { label: 'معلم تاريخي', plural: 'المعالم',        icon: 'historic',   color: '#b45309', group: 'landmark' },
  museum:     { label: 'متحف',        plural: 'المتاحف',        icon: 'museum',     color: '#c026d3', group: 'landmark' },
  viewpoint:  { label: 'إطلالة',      plural: 'الإطلالات',      icon: 'viewpoint',  color: '#ca8a04', group: 'landmark' },
  culture:    { label: 'ثقافة',       plural: 'الثقافة',        icon: 'culture',    color: '#e11d48', group: 'landmark' },

  hospital:   { label: 'مشفى',        plural: 'المشافي',        icon: 'hospital',   color: '#dc2626', group: 'services' },
  pharmacy:   { label: 'صيدلية',      plural: 'الصيدليات',      icon: 'pharmacy',   color: '#db2777', group: 'services' },
  school:     { label: 'مدرسة',       plural: 'المدارس',        icon: 'school',     color: '#2563eb', group: 'services' },
  university: { label: 'جامعة',       plural: 'الجامعات',       icon: 'university', color: '#4338ca', group: 'services' },
  education:  { label: 'تعليم',       plural: 'التعليم',        icon: 'education',  color: '#0284c7', group: 'services' },
  bank:       { label: 'مصرف',        plural: 'المصارف',        icon: 'bank',       color: '#0891b2', group: 'services' },
  government: { label: 'مؤسسة',       plural: 'المؤسسات',       icon: 'government', color: '#475569', group: 'services' },
  fuel:       { label: 'محطة وقود',   plural: 'محطات الوقود',   icon: 'fuel',       color: '#ea580c', group: 'services' },
  parking:    { label: 'موقف',        plural: 'المواقف',        icon: 'parking',    color: '#64748b', group: 'services' },
  transport:  { label: 'نقل',         plural: 'النقل',          icon: 'transport',  color: '#0369a1', group: 'services' },

  restaurant: { label: 'مطعم',        plural: 'المطاعم',        icon: 'restaurant', color: '#f97316', group: 'food' },
  cafe:       { label: 'مقهى',        plural: 'المقاهي',        icon: 'cafe',       color: '#a16207', group: 'food' },
  hotel:      { label: 'فندق',        plural: 'الفنادق',        icon: 'hotel',      color: '#7c3aed', group: 'food' },

  market:     { label: 'سوق',         plural: 'الأسواق',        icon: 'market',     color: '#be185d', group: 'shopping' },
  shop:       { label: 'محل',         plural: 'المحلات',        icon: 'shop',       color: '#65a30d', group: 'shopping' },

  park:       { label: 'حديقة',       plural: 'الحدائق',        icon: 'park',       color: '#16a34a', group: 'nature' },
  sport:      { label: 'رياضة',       plural: 'الرياضة',        icon: 'sport',      color: '#0d9488', group: 'nature' },
  nature:     { label: 'طبيعة',       plural: 'الطبيعة',        icon: 'nature',     color: '#15803d', group: 'nature' },

  district:   { label: 'حي',          plural: 'الأحياء',        icon: 'district',   color: '#64748b', group: 'meta' },
  other:      { label: 'مكان',        plural: 'أماكن',          icon: 'other',      color: '#475569', group: 'meta' },
};

export const GROUPS = {
  landmark: { label: 'المعالم',        icon: 'historic',  cats: ['historic', 'museum', 'viewpoint', 'mosque', 'church', 'worship', 'culture'] },
  services: { label: 'الخدمات',       icon: 'hospital',  cats: ['hospital', 'pharmacy', 'school', 'university', 'education', 'bank', 'government', 'fuel', 'parking', 'transport'] },
  food:     { label: 'مطاعم ومقاهي',  icon: 'restaurant', cats: ['restaurant', 'cafe', 'hotel'] },
  shopping: { label: 'أسواق ومحلات',  icon: 'shop',      cats: ['market', 'shop'] },
  nature:   { label: 'طبيعة وحدائق',  icon: 'park',      cats: ['park', 'sport', 'nature'] },
};

export const catOf = (key) => CATS[key] || CATS.other;

/** لوحات ألوان التمييز — يختارها المستخدم من الأدوات */
export const ACCENTS = {
  indigo:  { name: 'نيلي',   light: '#4f46e5', dark: '#8b93ff' },
  teal:    { name: 'فيروزي', light: '#0d9488', dark: '#2dd4bf' },
  emerald: { name: 'زمردي',  light: '#059669', dark: '#34d399' },
  amber:   { name: 'عنبري',  light: '#b45309', dark: '#fbbf24' },
  rose:    { name: 'وردي',   light: '#e11d48', dark: '#fb7185' },
  violet:  { name: 'بنفسجي', light: '#7c3aed', dark: '#a78bfa' },
};

export const accentOf = (key) => ACCENTS[key] || ACCENTS.indigo;

/** ألوان رسم الطرق المحلية لكل ثيم */
export const THEMES = {
  light: {
    mapBg: '#f3f5f8',
    label: '#8a97a8',
    road: {
      motorway: ['#b2bfd1', 3.0], trunk: ['#bdc8d8', 2.6], primary: ['#c8d2e0', 2.2],
      secondary: ['#d3dbe6', 1.8], tertiary: ['#dee4ed', 1.4], residential: ['#e6ebf2', 1.1],
    },
  },
  dark: {
    mapBg: '#0b0f16',
    label: '#5b6a7f',
    road: {
      motorway: ['#37445c', 3.0], trunk: ['#313d52', 2.6], primary: ['#2b3648', 2.2],
      secondary: ['#252f40', 1.8], tertiary: ['#1e2734', 1.4], residential: ['#18202b', 1.1],
    },
  },
};

export const T = {
  addPlace: 'أضف مكاناً هنا',
  nearMe: 'الأقرب إليّ',
  noResults: 'ما في نتائج… جرّب كلمة تانية',
  saved: 'أماكني',
  favorites: 'المفضلة',
  all: 'الكل',
};
