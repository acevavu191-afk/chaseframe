/**
 * filters.js — 滤镜库 / 风格 / 出片
 *
 * 72 个手工调校的母版 × 8 个变体（原味 / 暖 / 冷 / 亮 / 暗 / 柔 / 硬 / 淡）
 * = 576 组，全部由参数生成，预览与出片走同一套参数，所见即所得。
 */

const D = (bri = 1, con = 1, sat = 1, hue = 0, sep = 0, gray = 0) =>
  ({ bri, con, sat, hue, sep, gray });

/** 母版：[id, 名称, 家族, 参数, 色调层, 暗角, 颗粒] */
const BASES = [
  // ============ 胶片 ============
  ['portra160', 'Portra 160', 'film', D(1.06, 1.03, 0.9, 0, 0.06), 'rgba(255,198,160,0.08)', 0.08, 0.04],
  ['portra400', 'Portra 400', 'film', D(1.04, 1.06, 0.94, 0, 0.07), 'rgba(255,190,150,0.1)', 0.1, 0.05],
  ['portra800', 'Portra 800', 'film', D(1.02, 1.08, 1.0, 0, 0.08), 'rgba(255,182,140,0.12)', 0.12, 0.08],
  ['gold200', 'Gold 200', 'film', D(1.02, 1.1, 1.08, 0, 0.15), 'rgba(255,166,72,0.12)', 0.14, 0.06],
  ['ektar100', 'Ektar 100', 'film', D(1.0, 1.16, 1.28, 0, 0), 'rgba(60,140,255,0.05)', 0.08, 0.02],
  ['ultramax', 'UltraMax 400', 'film', D(1.0, 1.12, 1.14, 0, 0.06), 'rgba(255,170,90,0.08)', 0.12, 0.07],
  ['colorplus', 'ColorPlus 200', 'film', D(1.04, 1.06, 1.02, 0, 0.12), 'rgba(255,200,130,0.1)', 0.16, 0.06],
  ['pro400h', 'Pro 400H', 'film', D(1.08, 0.98, 0.86, 8, 0), 'rgba(200,255,235,0.08)', 0.06, 0.04],
  ['superia400', 'Superia 400', 'film', D(1.01, 1.13, 1.1, -5, 0), 'rgba(90,210,160,0.06)', 0.12, 0.07],
  ['superia1600', 'Superia 1600', 'film', D(1.0, 1.16, 1.14, -6, 0), 'rgba(90,200,180,0.08)', 0.18, 0.12],
  ['velvia50', 'Velvia 50', 'film', D(0.99, 1.22, 1.42, 0, 0), 'rgba(255,60,90,0.05)', 0.18, 0.03],
  ['velvia100', 'Velvia 100', 'film', D(1.0, 1.18, 1.34, 0, 0), 'rgba(255,80,80,0.05)', 0.14, 0.03],
  ['provia', 'Provia 100F', 'film', D(1.01, 1.1, 1.14, 0, 0), null, 0.08, 0.03],
  ['astia', 'Astia 100F', 'film', D(1.03, 1.04, 1.06, 0, 0), 'rgba(255,220,200,0.06)', 0.04, 0.03],
  ['classicChrome', 'Classic Chrome', 'film', D(0.99, 1.16, 0.82, -4, 0), 'rgba(60,120,160,0.1)', 0.14, 0.04],
  ['classicNeg', 'Classic Neg', 'film', D(0.98, 1.2, 0.9, 10, 0), 'rgba(190,120,90,0.12)', 0.18, 0.06],
  ['cinestill800', 'CineStill 800T', 'film', D(1.04, 1.04, 1.12, 0, 0), 'rgba(255,110,90,0.13)', 0.08, 0.09],
  ['vision3', 'Vision3 250D', 'film', D(1.0, 1.08, 1.02, 0, 0), 'rgba(40,110,140,0.12)', 0.12, 0.05],
  ['agfaVista', 'Vista 200', 'film', D(1.03, 1.06, 0.94, 6, 0.09), 'rgba(255,190,120,0.08)', 0.14, 0.05],
  ['lomo', 'Lomo', 'film', D(0.96, 1.3, 1.3, -8, 0), null, 0.45, 0.08],
  ['fujiC200', 'Fuji C200', 'film', D(1.04, 1.05, 1.0, 6, 0.05), 'rgba(190,230,220,0.08)', 0.1, 0.05],
  ['kodakMax', 'Kodak Max 400', 'film', D(1.02, 1.12, 1.16, 0, 0.1), 'rgba(255,150,60,0.1)', 0.16, 0.08],
  ['ferrania', 'Ferrania 200', 'film', D(1.02, 1.08, 0.86, 0, 0.08), 'rgba(190,210,230,0.1)', 0.12, 0.06],
  ['portra800N', 'Portra 800 室内', 'film', D(1.05, 1.02, 0.96, 0, 0.1), 'rgba(255,200,170,0.14)', 0.1, 0.1],

  // ============ 黑白 ============
  ['mono', '黑白', 'mono', D(1.02, 1.18, 1, 0, 0, 1), null, 0.2, 0.05],
  ['noir', '硬黑白', 'mono', D(0.94, 1.5, 1, 0, 0, 1), null, 0.28, 0.08],
  ['acros', 'Acros 100', 'mono', D(1.04, 1.32, 1, 0, 0, 1), 'rgba(30,60,110,0.08)', 0.18, 0.03],
  ['silver', '银盐', 'mono', D(1.06, 1.1, 1, 0, 0, 0.9), 'rgba(160,190,220,0.07)', 0.12, 0.07],
  ['sepia', '棕调', 'mono', D(1.0, 1.06, 0.95, 0, 0.55), 'rgba(200,150,90,0.1)', 0.22, 0.05],
  ['cyanotype', '蓝晒', 'mono', D(1.0, 1.1, 1.5, 0, 0.2, 1), 'rgba(40,90,200,0.2)', 0.24, 0.06],
  ['highkey', '高调', 'mono', D(1.24, 0.9, 1, 0, 0, 1), null, 0, 0.04],
  ['lowkey', '低调', 'mono', D(0.86, 1.36, 1, 0, 0, 1), null, 0.42, 0.08],
  ['hp5', 'HP5 Plus', 'mono', D(1.0, 1.24, 1, 0, 0, 1), 'rgba(120,130,150,0.06)', 0.24, 0.1],
  ['tmax', 'T-Max 400', 'mono', D(1.02, 1.2, 1, 0, 0, 1), null, 0.14, 0.03],

  // ============ 流行 ============
  ['tealOrange', '青橙', 'pop', D(1.0, 1.18, 1.2, -8, 0), 'rgba(0,160,190,0.1)', 0.18, 0.02],
  ['morandi', '莫兰迪', 'pop', D(1.06, 0.94, 0.72, 0, 0), 'rgba(200,190,180,0.16)', 0.08, 0.03],
  ['japan', '日系', 'pop', D(1.12, 0.92, 0.92, 4, 0), 'rgba(220,255,240,0.12)', 0, 0.03],
  ['salt', '盐系', 'pop', D(1.14, 1.02, 0.78, 0, 0), 'rgba(240,245,250,0.16)', 0, 0.02],
  ['milky', '奶咖', 'pop', D(1.08, 0.96, 0.88, 0, 0.18), 'rgba(210,170,130,0.16)', 0.1, 0.04],
  ['french', '法式', 'pop', D(1.06, 1.04, 0.9, 0, 0.1), 'rgba(255,220,180,0.12)', 0.14, 0.05],
  ['hk', '港风', 'pop', D(1.0, 1.14, 1.18, -12, 0), 'rgba(210,40,90,0.1)', 0.24, 0.05],
  ['cyber', '赛博', 'pop', D(1.0, 1.25, 1.5, -12, 0), 'rgba(0,200,255,0.1)', 0.3, 0.04],
  ['y2k', 'Y2K', 'pop', D(1.05, 1.1, 1.3, 12, 0), 'rgba(255,120,220,0.1)', 0.1, 0.05],
  ['vapor', '蒸汽波', 'pop', D(1.0, 1.08, 1.35, 18, 0), 'rgba(120,80,255,0.14)', 0.2, 0.04],
  ['neon', '霓虹', 'pop', D(0.99, 1.18, 1.5, 6, 0), 'rgba(120,60,255,0.1)', 0.24, 0.03],
  ['dawn', '晨雾', 'pop', D(1.08, 0.96, 0.94, 0, 0.05), 'rgba(255,190,200,0.12)', 0.06, 0.03],
  ['dusk', '暮色', 'pop', D(0.97, 1.1, 1.08, 0, 0), 'rgba(180,90,200,0.11)', 0.22, 0.04],
  ['instaPop', '鲜果', 'pop', D(1.04, 1.1, 1.3, 4, 0), 'rgba(255,90,110,0.08)', 0.1, 0.03],
  ['peach', '蜜桃', 'pop', D(1.08, 0.98, 1.12, 8, 0.06), 'rgba(255,150,140,0.14)', 0.06, 0.03],
  ['mint', '薄荷', 'pop', D(1.06, 1.0, 0.98, -14, 0), 'rgba(120,230,200,0.12)', 0.05, 0.02],

  // ============ 夜拍 ============
  ['night', '夜行', 'night', D(1.12, 1.12, 1.05, 0, 0), 'rgba(40,90,220,0.12)', 0.3, 0.05],
  ['blueHour', '蓝调时刻', 'night', D(1.06, 1.1, 1.1, -14, 0), 'rgba(30,70,180,0.16)', 0.22, 0.04],
  ['cityLight', '灯火', 'night', D(1.08, 1.16, 1.2, 0, 0), 'rgba(255,160,60,0.1)', 0.28, 0.05],
  ['darkFood', '暗调美食', 'night', D(0.96, 1.12, 1.1, 0, 0.08), 'rgba(255,150,70,0.1)', 0.34, 0.04],
  ['amberNight', '琥珀夜', 'night', D(1.1, 1.08, 1.16, 0, 0.1), 'rgba(255,140,40,0.14)', 0.26, 0.06],
  ['taxiNeon', '的士高', 'night', D(1.02, 1.2, 1.3, -6, 0), 'rgba(255,60,140,0.12)', 0.3, 0.05],

  // ============ 复古 ============
  ['vintage', '复古', 'retro', D(1.03, 0.95, 0.82, 0, 0.26), 'rgba(255,200,140,0.1)', 0.3, 0.07],
  ['polaroid', '拍立得', 'retro', D(1.1, 0.92, 0.9, 0, 0.12), 'rgba(255,240,220,0.18)', 0.12, 0.08],
  ['faded', '褪色', 'retro', D(1.1, 0.9, 0.78, 0, 0), 'rgba(255,255,255,0.1)', 0.06, 0.06],
  ['sepiaOld', '旧照片', 'retro', D(1.02, 0.98, 0.8, 0, 0.42), 'rgba(220,180,120,0.14)', 0.34, 0.09],
  ['kodachrome', 'Kodachrome', 'retro', D(1.0, 1.16, 1.12, -4, 0.08), 'rgba(255,120,60,0.1)', 0.2, 0.04],
  ['agfaRetro', 'Agfa 复古', 'retro', D(1.04, 1.06, 0.9, 8, 0.12), 'rgba(255,190,110,0.12)', 0.24, 0.07],
  ['lomoRed', 'Lomo 红', 'retro', D(0.98, 1.26, 1.34, -10, 0), 'rgba(220,40,60,0.12)', 0.42, 0.06],
  ['polaroid600', 'Polaroid 600', 'retro', D(1.14, 0.94, 0.86, 0, 0.16), 'rgba(255,235,210,0.2)', 0.1, 0.1],

  // ============ 电影 ============
  ['cinema', '电影感', 'cine', D(0.98, 1.14, 1.06, -6, 0), 'rgba(20,90,120,0.12)', 0.26, 0.03],
  ['teal', '青蓝调', 'cine', D(0.98, 1.12, 1.04, -12, 0), 'rgba(0,120,150,0.14)', 0.24, 0.03],
  ['orange', '橙调', 'cine', D(1.0, 1.1, 1.14, 6, 0.06), 'rgba(255,140,60,0.12)', 0.2, 0.03],
  ['bleach', '漂白', 'cine', D(1.04, 1.28, 0.7, 0, 0), 'rgba(180,200,210,0.08)', 0.22, 0.05],
  ['matrix', '矩阵绿', 'cine', D(0.98, 1.2, 1.1, 30, 0), 'rgba(30,180,90,0.14)', 0.28, 0.05],
  ['coldWar', '冷战', 'cine', D(0.96, 1.18, 0.86, -16, 0), 'rgba(60,100,160,0.14)', 0.3, 0.04],
  ['godfather', '教父', 'cine', D(0.94, 1.16, 0.9, 0, 0.22), 'rgba(200,140,60,0.12)', 0.34, 0.05],
  ['wongKarWai', '王家卫', 'cine', D(1.0, 1.12, 1.16, -8, 0), 'rgba(180,20,80,0.14)', 0.3, 0.06],

  // ============ 趋势 / 网感（2025-2026 热门） ============
  ['fxnR', '富士 FXN-R', 'film', D(1.0, 1.12, 0.92, -4, 0.04), 'rgba(120,190,170,0.1)', 0.16, 0.07],
  ['fujiCC', '富士 CC 晴天', 'film', D(1.02, 1.14, 1.06, -2, 0.06), 'rgba(255,190,120,0.08)', 0.12, 0.05],
  ['fujiNN', '富士 NN 暖调', 'film', D(1.04, 1.08, 1.12, 4, 0.1), 'rgba(255,170,90,0.12)', 0.14, 0.06],
  ['ccdR', 'CCD 千禧', 'retro', D(1.08, 0.94, 0.98, 6, 0.1), 'rgba(255,200,160,0.14)', 0.18, 0.09],
  ['classicU', 'Classic U 80s', 'retro', D(1.06, 1.04, 1.02, 8, 0.18), 'rgba(255,180,90,0.14)', 0.2, 0.07],
  ['ek80', 'Fimo EK80', 'film', D(1.02, 1.06, 0.94, 6, 0.08), 'rgba(200,220,190,0.1)', 0.14, 0.06],
  ['business400', 'Business 400', 'film', D(1.0, 1.1, 0.9, 0, 0.06), 'rgba(170,190,210,0.1)', 0.16, 0.07],
  ['pan100', 'Pan 100', 'mono', D(1.03, 1.14, 1, 0, 0, 1), 'rgba(140,160,180,0.06)', 0.14, 0.05],
  ['heguang', '和光', 'pop', D(1.05, 1.0, 0.96, -6, 0.05), 'rgba(190,220,180,0.12)', 0.06, 0.03],
  ['leica', '徕卡暗调', 'cine', D(0.95, 1.22, 1.02, 0, 0), 'rgba(30,60,80,0.14)', 0.34, 0.04],
  ['plog', 'Plog 清透', 'pop', D(1.1, 0.98, 1.04, 0, 0.04), 'rgba(235,245,255,0.12)', 0.02, 0.02],
  ['leakWarm', '暖漏光', 'retro', D(1.02, 1.04, 1.06, 6, 0.1), 'rgba(255,140,60,0.1)', 0.2, 0.08],

  // ============ 基础 ============
  ['clean', '清透', 'basic', D(1.05, 1.04, 1.06), null, 0, 0.02],
  ['bright', '明亮', 'basic', D(1.14, 0.97, 1.02), 'rgba(255,248,235,0.09)', 0, 0],
  ['cream', '奶油', 'basic', D(1.1, 0.92, 0.95, 0, 0.06), 'rgba(255,232,205,0.14)', 0.05, 0.02],
  ['soft', '柔光', 'basic', D(1.08, 0.93, 1.02), 'rgba(255,225,205,0.1)', 0.08, 0],
  ['warm', '暖阳', 'basic', D(1.03, 1.05, 1.12, 0, 0.08), 'rgba(255,150,60,0.11)', 0.12, 0.02],
  ['cool', '冷调', 'basic', D(1.0, 1.08, 0.98, -6, 0), 'rgba(80,140,255,0.1)', 0.1, 0],
  ['vivid', '通透', 'basic', D(1.02, 1.1, 1.18), null, 0.04, 0.01],
  ['moody', '低饱和', 'basic', D(1.0, 1.06, 0.72, 0, 0), 'rgba(120,130,140,0.1)', 0.16, 0.03],
];

const MODS = [
  { suffix: '', tag: '原味', name: '', f: {} },
  { suffix: '-w', tag: '暖', name: '暖', f: { bri: 1.02, hue: 4, tint: 'rgba(255,170,90,0.06)' } },
  { suffix: '-c', tag: '冷', name: '冷', f: { hue: -6, tint: 'rgba(80,150,255,0.06)' } },
  { suffix: '-b', tag: '亮', name: '亮', f: { bri: 1.07 } },
  { suffix: '-d', tag: '暗', name: '暗', f: { bri: 0.93, con: 1.04 } },
  { suffix: '-s', tag: '柔', name: '柔', f: { con: 0.93, sat: 0.94 } },
  { suffix: '-h', tag: '硬', name: '硬', f: { con: 1.09, sat: 1.04 } },
  { suffix: '-f', tag: '淡', name: '淡', f: { sat: 0.8, bri: 1.04, tint: 'rgba(255,255,255,0.05)' } },
];

function cssOf(p) {
  const parts = [];
  if (p.bri !== 1) parts.push(`brightness(${p.bri.toFixed(3)})`);
  if (p.con !== 1) parts.push(`contrast(${p.con.toFixed(3)})`);
  if (p.sat !== 1) parts.push(`saturate(${p.sat.toFixed(3)})`);
  if (p.hue) parts.push(`hue-rotate(${p.hue}deg)`);
  if (p.sep) parts.push(`sepia(${p.sep})`);
  if (p.gray) parts.push(`grayscale(${p.gray})`);
  return parts.length ? parts.join(' ') : 'none';
}

function mixTint(base, extra) {
  if (!base) return extra || null;
  if (!extra) return base;
  return `${base}, ${extra}`; // 上层用两层叠加时拆开，这里只存主色
}

export const FILTERS = {
  none: { name: '原片', family: 'basic', css: 'none', tint: null, blend: 'soft-light', vignette: 0, grain: 0, base: 'none', variant: '' },
};

// 审美护栏：把参数夹在"自然、不脏、不死黑"的范围内
const CLAMP = { bri: [0.9, 1.18], con: [0.86, 1.34], sat: [0.68, 1.45], vig: [0, 0.38], grain: [0, 0.12] };
const cl = (v, r) => Math.min(r[1], Math.max(r[0], v));

for (const [id, name, family, d, tint, vig, grain] of BASES) {
  for (const m of MODS) {
    const p = {
      bri: cl(d.bri * (m.f.bri || 1), CLAMP.bri),
      con: cl(d.con * (m.f.con || 1), CLAMP.con),
      sat: cl(d.sat * (m.f.sat || 1), CLAMP.sat),
      hue: Math.max(-18, Math.min(30, d.hue + (m.f.hue || 0))),
      sep: Math.min(0.6, d.sep + (m.f.sep || 0)),
      gray: d.gray,
    };
    const key = id + m.suffix;
    FILTERS[key] = {
      name: m.name ? `${name} · ${m.name}` : name,
      short: name,
      tag: m.tag,
      family,
      css: cssOf(p),
      tint: m.f.tint ? m.f.tint : tint,
      blend: 'soft-light',
      vignette: cl(vig, CLAMP.vig),
      grain: cl(grain * (m.f.grain || 1), CLAMP.grain),
      leak: id === 'leakWarm' ? 0.5 : 0,
      base: id,
      variant: m.suffix,
    };
  }
}

export const FEATURED = [
  'clean', 'portra400', 'portra400-w', 'gold200', 'ektar100', 'fxnR', 'fujiCC', 'fujiNN',
  'ccdR', 'classicU', 'ek80', 'business400', 'velvia50', 'classicChrome', 'cinestill800',
  'mono', 'noir', 'acros', 'pan100', 'japan', 'japan-s', 'salt', 'morandi', 'plog',
  'hk', 'wongKarWai', 'cinema-h', 'leica', 'blueHour', 'cityLight', 'darkFood', 'heguang',
  'vintage', 'polaroid', 'ccdR-h', 'leakWarm', 'fujiNN-w', 'morandi-s', 'cream-b', 'tealOrange',
].filter(k => FILTERS[k]);

export const FILTER_COUNT = Object.keys(FILTERS).length;

export const FILTER_FAMILIES = [
  { id: 'feat', name: '精选' },
  { id: 'all', name: '全部' },
  { id: 'fav', name: '收藏' },
  { id: 'basic', name: '基础' },
  { id: 'film', name: '胶片' },
  { id: 'mono', name: '黑白' },
  { id: 'pop', name: '流行' },
  { id: 'night', name: '夜拍' },
  { id: 'retro', name: '复古' },
  { id: 'cine', name: '电影' },
];

/** 风格预设：滤镜 + 画幅 + 模式 + 构图，一次配好 */
export const STYLES = {
  daily:      { name: '日常',      filter: 'clean',        ratio: '4:3',  mode: 'smart',     comp: 'auto',     tip: '万能，随手拍不翻车' },
  jpPortrait: { name: '日系人像',  filter: 'japan-s',      ratio: '4:3',  mode: 'portrait',  comp: 'thirds',   tip: '低反差肤色，留白多' },
  creamSkin:  { name: '奶油人像',  filter: 'cream-b',      ratio: '4:3',  mode: 'portrait',  comp: 'thirds',   tip: '柔、亮、干净' },
  filmWarm:   { name: '暖调胶片',  filter: 'gold200',      ratio: '4:3',  mode: 'portrait',  comp: 'thirds',   tip: '黄昏、咖啡馆、老街' },
  filmQuiet:  { name: '清冷胶片',  filter: 'portra160-c',  ratio: '4:3',  mode: 'portrait',  comp: 'look',     tip: '阴天、室内、安静' },
  street:     { name: '街头',      filter: 'superia400-h', ratio: '16:9', mode: 'sport',     comp: 'leading',  tip: '高对比、轻微偏青' },
  sport:      { name: '运动抓拍',  filter: 'clean',        ratio: '16:9', mode: 'sport',     comp: 'leading',  tip: '连拍 + 提前量' },
  landscape:  { name: '风光',      filter: 'velvia50',     ratio: '4:3',  mode: 'landscape', comp: 'thirds',   tip: '浓艳、天空压暗' },
  travel:     { name: '旅拍',      filter: 'ektar100-b',   ratio: '4:3',  mode: 'landscape', comp: 'golden',   tip: '色彩扎实，适合白天' },
  hkNight:    { name: '港风夜景',  filter: 'wongKarWai',   ratio: '16:9', mode: 'night',     comp: 'center',   tip: '玫红 + 青绿阴影' },
  blueHour:   { name: '蓝调时刻',  filter: 'blueHour',     ratio: '16:9', mode: 'night',     comp: 'symmetry', tip: '入夜前 20 分钟' },
  monoDoc:    { name: '黑白纪实',  filter: 'mono-h',       ratio: '1:1',  mode: 'smart',     comp: 'center',   tip: '硬朗、去掉色彩干扰' },
  acrosArch:  { name: '建筑线条',  filter: 'acros',        ratio: '1:1',  mode: 'landscape', comp: 'diagonal', tip: '找线条与几何' },
  food:       { name: '美食',      filter: 'warm-s',       ratio: '1:1',  mode: 'food',      comp: 'fill',     tip: '暖黄、满构图、近距离' },
  darkFood:   { name: '暗调美食',  filter: 'darkFood',     ratio: '1:1',  mode: 'food',      comp: 'golden',   tip: '深色背景 + 侧光' },
  macroShot:  { name: '微距',      filter: 'provia-h',     ratio: '1:1',  mode: 'macro',     comp: 'center',   tip: '细节优先、背景干净' },
  morandi:    { name: '莫兰迪',    filter: 'morandi',      ratio: '4:3',  mode: 'smart',     comp: 'thirds',   tip: '低饱和灰调，很高级' },
  y2k:        { name: 'Y2K',       filter: 'y2k',          ratio: '4:3',  mode: 'smart',     comp: 'rule',     tip: '闪、粉、直闪感' },
  cyberNight: { name: '赛博夜城',  filter: 'cyber-b',      ratio: '16:9', mode: 'night',     comp: 'rule',     tip: '冷蓝 + 品红反光' },
  vintage:    { name: '复古胶片',  filter: 'vintage',      ratio: '1:1',  mode: 'smart',     comp: 'frame',    tip: '旧照片的褪色与暗角' },
  cinema:     { name: '电影色调',  filter: 'cinema-h',     ratio: '16:9', mode: 'smart',     comp: 'center',   tip: '青橙分离、宽银幕' },
  snow:       { name: '雪景',      filter: 'salt-b',       ratio: '4:3',  mode: 'landscape', comp: 'symmetry', tip: '压暗高光、保留冷调' },
};

export function filterCss(key) {
  return (FILTERS[key] || FILTERS.none).css;
}

/** 组合「曝光增益 + 滤镜」 */
export function buildFilter(gain, key) {
  const parts = [];
  if (gain && Math.abs(gain - 1) > 0.004) parts.push(`brightness(${gain.toFixed(3)})`);
  const css = filterCss(key);
  if (css && css !== 'none') parts.push(css);
  return parts.length ? parts.join(' ') : 'none';
}

let grainPattern = null;
function getGrain(ctx) {
  if (grainPattern) return grainPattern;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const img = g.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainPattern = ctx.createPattern(c, 'repeat');
  return grainPattern;
}

export function finishCanvas(ctx, key, meta = {}, watermark = false) {
  const f = FILTERS[key] || FILTERS.none;
  const w = ctx.canvas.width, h = ctx.canvas.height;

  if (f.tint) {
    ctx.save();
    ctx.globalCompositeOperation = f.blend || 'soft-light';
    ctx.fillStyle = f.tint;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (f.leak > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const lg = ctx.createLinearGradient(0, 0, w * 0.8, h * 0.7);
    lg.addColorStop(0, `rgba(255,120,40,${0.35 * f.leak})`);
    lg.addColorStop(0.45, `rgba(255,190,90,${0.12 * f.leak})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (f.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${f.vignette})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (f.grain > 0) {
    const pat = getGrain(ctx);
    if (pat) {
      ctx.save();
      ctx.globalAlpha = f.grain;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  if (watermark) {
    const pad = Math.round(w * 0.028);
    const fs = Math.max(12, Math.round(w * 0.026));
    ctx.save();
    ctx.font = `500 ${fs}px -apple-system, "PingFang SC", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = fs * 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const parts = ['追帧'];
    if (meta.shutter) parts.push(meta.shutter);
    if (meta.iso) parts.push(`ISO${meta.iso}`);
    if (typeof meta.ev === 'number' && Math.abs(meta.ev) > 0.05) parts.push(`EV${meta.ev > 0 ? '+' : ''}${meta.ev.toFixed(1)}`);
    if (meta.style) parts.push(meta.style);
    ctx.fillText(parts.join(' · '), w - pad, h - pad);
    ctx.restore();
  }
}

export function canvasToBlob(canvas, quality = 0.94) {
  return new Promise(res => {
    if (canvas.toBlob) canvas.toBlob(b => res(b), 'image/jpeg', quality);
    else res(null);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

export async function shareBlob(blob, filename, title = '追帧照片') {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
    }
  }
  return false;
}

export function hasNative() {
  return !!(window.ChaseFrameNative && typeof window.ChaseFrameNative.saveImage === 'function');
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || '');
      res(s.slice(s.indexOf(',') + 1));
    };
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

export async function saveToDevice(blob, filename) {
  if (hasNative()) {
    try {
      const b64 = await blobToBase64(blob);
      const uri = window.ChaseFrameNative.saveImage(b64, filename);
      if (uri) return 'gallery';
    } catch (e) { /* 落到下一档 */ }
  }
  const shared = await shareBlob(blob, filename);
  if (shared) return 'share';
  downloadBlob(blob, filename);
  return 'download';
}

export function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
