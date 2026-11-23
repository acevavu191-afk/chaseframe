/**
 * filters.js — 滤镜 / 风格库与出片
 *
 * 54 组滤镜，分 5 个分组：基础、胶片、黑白、流行、夜拍。
 * 实时预览用 CSS filter 近似；出片时再叠加色调层、暗角与颗粒，成片比预览更有味道。
 */

const F = (name, group, css, tint = null, blend = 'soft-light', vignette = 0, grain = 0) =>
  ({ name, group, css, tint, blend, vignette, grain });

export const FILTERS = {
  // ================= 基础 =================
  none:      F('原片', 'basic', 'none'),
  clean:     F('清透', 'basic', 'saturate(1.06) contrast(1.04) brightness(1.05)', null, 'soft-light', 0, 0.02),
  bright:    F('明亮', 'basic', 'brightness(1.14) contrast(0.97) saturate(1.02)', 'rgba(255,248,235,0.09)', 'soft-light', 0, 0),
  cream:     F('奶油', 'basic', 'saturate(0.95) contrast(0.92) brightness(1.1) sepia(0.06)', 'rgba(255,232,205,0.14)', 'soft-light', 0.05, 0.02),
  soft:      F('柔光', 'basic', 'saturate(1.02) contrast(0.93) brightness(1.08)', 'rgba(255,225,205,0.1)', 'soft-light', 0.08, 0),
  warm:      F('暖阳', 'basic', 'saturate(1.12) contrast(1.05) sepia(0.08) brightness(1.03)', 'rgba(255,150,60,0.11)', 'soft-light', 0.12, 0.02),
  cool:      F('冷调', 'basic', 'saturate(0.98) contrast(1.08) hue-rotate(-6deg)', 'rgba(80,140,255,0.1)', 'soft-light', 0.1, 0),
  vivid:     F('通透', 'basic', 'saturate(1.18) contrast(1.1) brightness(1.02)', null, 'soft-light', 0.04, 0.01),

  // ================= 胶片 =================
  portra160: F('Portra 160', 'film', 'saturate(0.9) contrast(1.03) brightness(1.06) sepia(0.06)', 'rgba(255,198,160,0.08)', 'soft-light', 0.08, 0.04),
  portra400: F('Portra 400', 'film', 'saturate(0.94) contrast(1.06) brightness(1.04) sepia(0.07)', 'rgba(255,190,150,0.1)', 'soft-light', 0.1, 0.05),
  portra800: F('Portra 800', 'film', 'saturate(1) contrast(1.08) brightness(1.02) sepia(0.08)', 'rgba(255,182,140,0.12)', 'soft-light', 0.12, 0.08),
  gold200:   F('Gold 200', 'film', 'saturate(1.08) contrast(1.1) sepia(0.15) brightness(1.02)', 'rgba(255,166,72,0.12)', 'soft-light', 0.14, 0.06),
  ektar100:  F('Ektar 100', 'film', 'saturate(1.28) contrast(1.16)', 'rgba(60,140,255,0.05)', 'soft-light', 0.08, 0.02),
  ultramax:  F('UltraMax 400', 'film', 'saturate(1.14) contrast(1.12) sepia(0.06)', 'rgba(255,170,90,0.08)', 'soft-light', 0.12, 0.07),
  colorplus: F('ColorPlus', 'film', 'saturate(1.02) contrast(1.06) sepia(0.12) brightness(1.04)', 'rgba(255,200,130,0.1)', 'soft-light', 0.16, 0.06),
  pro400h:   F('Pro 400H', 'film', 'saturate(0.86) contrast(0.98) brightness(1.08) hue-rotate(8deg)', 'rgba(200,255,235,0.08)', 'soft-light', 0.06, 0.04),
  superia400:F('Superia 400', 'film', 'saturate(1.1) contrast(1.13) hue-rotate(-5deg)', 'rgba(90,210,160,0.06)', 'soft-light', 0.12, 0.07),
  velvia50:  F('Velvia 50', 'film', 'saturate(1.42) contrast(1.22)', 'rgba(255,60,90,0.05)', 'overlay', 0.18, 0.03),
  provia:    F('Provia 100F', 'film', 'saturate(1.14) contrast(1.1)', null, 'soft-light', 0.08, 0.03),
  astia:     F('Astia', 'film', 'saturate(1.06) contrast(1.04) brightness(1.03)', 'rgba(255,220,200,0.06)', 'soft-light', 0.04, 0.03),
  classicChrome: F('Classic Chrome', 'film', 'saturate(0.82) contrast(1.16) brightness(0.99) hue-rotate(-4deg)', 'rgba(60,120,160,0.1)', 'soft-light', 0.14, 0.04),
  classicNeg:    F('Classic Neg', 'film', 'saturate(0.9) contrast(1.2) brightness(0.98) hue-rotate(10deg)', 'rgba(190,120,90,0.12)', 'soft-light', 0.18, 0.06),
  cinestill: F('CineStill 800T', 'film', 'saturate(1.12) contrast(1.04) brightness(1.04)', 'rgba(255,110,90,0.13)', 'screen', 0.08, 0.09),
  vision3:   F('Vision3 250D', 'film', 'saturate(1.02) contrast(1.08)', 'rgba(40,110,140,0.12)', 'soft-light', 0.12, 0.05),
  agfaVista: F('Vista 200', 'film', 'saturate(0.94) contrast(1.06) sepia(0.09) hue-rotate(6deg)', 'rgba(255,190,120,0.08)', 'soft-light', 0.14, 0.05),
  lomo:      F('Lomo', 'film', 'saturate(1.3) contrast(1.3) brightness(0.96) hue-rotate(-8deg)', null, 'soft-light', 0.45, 0.08),

  // ================= 黑白 =================
  mono:      F('黑白', 'mono', 'grayscale(1) contrast(1.18) brightness(1.02)', null, 'soft-light', 0.2, 0.05),
  noir:      F('硬黑白', 'mono', 'grayscale(1) contrast(1.5) brightness(0.94)', null, 'soft-light', 0.28, 0.08),
  acros:     F('Acros', 'mono', 'grayscale(1) contrast(1.32) brightness(1.04)', 'rgba(30,60,110,0.08)', 'soft-light', 0.18, 0.03),
  silver:    F('银盐', 'mono', 'grayscale(0.9) contrast(1.1) brightness(1.06)', 'rgba(160,190,220,0.07)', 'soft-light', 0.12, 0.07),
  sepia:     F('棕调', 'mono', 'sepia(0.55) contrast(1.06) saturate(0.95)', 'rgba(200,150,90,0.1)', 'soft-light', 0.22, 0.05),
  cyanotype: F('蓝晒', 'mono', 'grayscale(1) sepia(0.2) hue-rotate(160deg) saturate(1.5) contrast(1.1)', 'rgba(40,90,200,0.2)', 'soft-light', 0.24, 0.06),
  highkey:   F('高调', 'mono', 'grayscale(1) brightness(1.24) contrast(0.9)', null, 'soft-light', 0, 0.04),
  lowkey:    F('低调', 'mono', 'grayscale(1) brightness(0.86) contrast(1.36)', null, 'soft-light', 0.42, 0.08),

  // ================= 流行 =================
  tealOrange: F('青橙', 'pop', 'saturate(1.2) contrast(1.18) hue-rotate(-8deg)', 'rgba(0,160,190,0.1)', 'soft-light', 0.18, 0.02),
  morandi:    F('莫兰迪', 'pop', 'saturate(0.72) contrast(0.94) brightness(1.06)', 'rgba(200,190,180,0.16)', 'soft-light', 0.08, 0.03),
  japan:      F('日系', 'pop', 'saturate(0.92) contrast(0.92) brightness(1.12) hue-rotate(4deg)', 'rgba(220,255,240,0.12)', 'soft-light', 0, 0.03),
  salt:       F('盐系', 'pop', 'saturate(0.78) contrast(1.02) brightness(1.14)', 'rgba(240,245,250,0.16)', 'soft-light', 0, 0.02),
  milky:      F('奶咖', 'pop', 'saturate(0.88) contrast(0.96) brightness(1.08) sepia(0.18)', 'rgba(210,170,130,0.16)', 'soft-light', 0.1, 0.04),
  french:     F('法式', 'pop', 'saturate(0.9) contrast(1.04) brightness(1.06) sepia(0.1)', 'rgba(255,220,180,0.12)', 'soft-light', 0.14, 0.05),
  hk:         F('港风', 'pop', 'saturate(1.18) contrast(1.14) hue-rotate(-12deg)', 'rgba(210,40,90,0.1)', 'soft-light', 0.24, 0.05),
  cyber:      F('赛博', 'pop', 'saturate(1.5) contrast(1.25) hue-rotate(-12deg)', 'rgba(0,200,255,0.1)', 'screen', 0.3, 0.04),
  y2k:        F('Y2K', 'pop', 'saturate(1.3) contrast(1.1) brightness(1.05) hue-rotate(12deg)', 'rgba(255,120,220,0.1)', 'screen', 0.1, 0.05),
  vapor:      F('蒸汽波', 'pop', 'saturate(1.35) contrast(1.08) hue-rotate(18deg)', 'rgba(120,80,255,0.14)', 'screen', 0.2, 0.04),
  neon:       F('霓虹', 'pop', 'saturate(1.5) contrast(1.18) hue-rotate(6deg)', 'rgba(120,60,255,0.1)', 'screen', 0.24, 0.03),
  dawn:       F('晨雾', 'pop', 'brightness(1.08) saturate(0.94) contrast(0.96) sepia(0.05)', 'rgba(255,190,200,0.12)', 'soft-light', 0.06, 0.03),
  dusk:       F('暮色', 'pop', 'saturate(1.08) contrast(1.1) brightness(0.97)', 'rgba(180,90,200,0.11)', 'soft-light', 0.22, 0.04),
  vintage:    F('复古', 'pop', 'sepia(0.26) saturate(0.82) contrast(0.95) brightness(1.03)', 'rgba(255,200,140,0.1)', 'soft-light', 0.3, 0.07),
  polaroid:   F('拍立得', 'pop', 'saturate(0.9) contrast(0.92) brightness(1.1) sepia(0.12)', 'rgba(255,240,220,0.18)', 'soft-light', 0.12, 0.08),
  cinema:     F('电影感', 'pop', 'saturate(1.06) contrast(1.14) hue-rotate(-6deg) brightness(0.98)', 'rgba(20,90,120,0.12)', 'soft-light', 0.26, 0.03),

  // ================= 夜拍 =================
  night:      F('夜行', 'night', 'brightness(1.12) contrast(1.12) saturate(1.05)', 'rgba(40,90,220,0.12)', 'soft-light', 0.3, 0.05),
  blueHour:   F('蓝调时刻', 'night', 'brightness(1.06) contrast(1.1) saturate(1.1) hue-rotate(-14deg)', 'rgba(30,70,180,0.16)', 'soft-light', 0.22, 0.04),
  cityLight:  F('灯火', 'night', 'brightness(1.08) contrast(1.16) saturate(1.2)', 'rgba(255,160,60,0.1)', 'soft-light', 0.28, 0.05),
  darkFood:   F('暗调美食', 'night', 'brightness(0.96) contrast(1.12) saturate(1.1) sepia(0.08)', 'rgba(255,150,70,0.1)', 'soft-light', 0.34, 0.04),
};

export const FILTER_GROUPS = [
  { id: 'basic', name: '基础' },
  { id: 'film', name: '胶片' },
  { id: 'mono', name: '黑白' },
  { id: 'pop', name: '流行' },
  { id: 'night', name: '夜拍' },
];

/** 风格预设：一次把滤镜、画幅、拍摄模式和构图偏好都配好 */
export const STYLES = {
  daily:      { name: '日常',      filter: 'clean',        ratio: '4:3',  mode: 'smart',     comp: 'auto',     tip: '万能，随手拍不翻车' },
  jpPortrait: { name: '日系人像',  filter: 'japan',        ratio: '4:3',  mode: 'portrait',  comp: 'thirds',   tip: '低反差肤色，留白多' },
  creamSkin:  { name: '奶油人像',  filter: 'cream',        ratio: '4:3',  mode: 'portrait',  comp: 'thirds',   tip: '柔、亮、干净' },
  filmWarm:   { name: '暖调胶片',  filter: 'gold200',      ratio: '4:3',  mode: 'portrait',  comp: 'thirds',   tip: '黄昏、咖啡馆、老街' },
  filmQuiet:  { name: '清冷胶片',  filter: 'portra160',    ratio: '4:3',  mode: 'portrait',  comp: 'look',     tip: '阴天、室内、安静' },
  street:     { name: '街头',      filter: 'superia400',   ratio: '16:9', mode: 'sport',     comp: 'leading',  tip: '高对比、轻微偏青' },
  sport:      { name: '运动抓拍',  filter: 'clean',        ratio: '16:9', mode: 'sport',     comp: 'leading',  tip: '连拍 + 提前量' },
  landscape:  { name: '风光',      filter: 'velvia50',     ratio: '4:3',  mode: 'landscape', comp: 'thirds',   tip: '浓艳、天空压暗' },
  travel:     { name: '旅拍',      filter: 'ektar100',     ratio: '4:3',  mode: 'landscape', comp: 'golden',   tip: '色彩扎实，适合白天' },
  hkNight:    { name: '港风夜景',  filter: 'cinema',       ratio: '16:9', mode: 'night',     comp: 'center',   tip: '青绿阴影 + 霓虹高光' },
  blueHour:   { name: '蓝调时刻',  filter: 'blueHour',     ratio: '16:9', mode: 'night',     comp: 'symmetry', tip: '入夜前 20 分钟' },
  monoDoc:    { name: '黑白纪实',  filter: 'mono',         ratio: '1:1',  mode: 'smart',     comp: 'center',   tip: '硬朗、去掉色彩干扰' },
  acrosArch:  { name: '建筑线条',  filter: 'acros',        ratio: '1:1',  mode: 'landscape', comp: 'diagonal', tip: '找线条与几何' },
  food:       { name: '美食',      filter: 'warm',         ratio: '1:1',  mode: 'food',      comp: 'fill',     tip: '暖黄、满构图、近距离' },
  darkFood:   { name: '暗调美食',  filter: 'darkFood',     ratio: '1:1',  mode: 'food',      comp: 'golden',   tip: '深色背景 + 侧光' },
  macroShot:  { name: '微距',      filter: 'provia',       ratio: '1:1',  mode: 'macro',     comp: 'center',   tip: '细节优先、背景干净' },
  morandi:    { name: '莫兰迪',    filter: 'morandi',      ratio: '4:3',  mode: 'smart',     comp: 'thirds',   tip: '低饱和灰调，很高级' },
  y2k:        { name: 'Y2K',       filter: 'y2k',          ratio: '4:3',  mode: 'smart',     comp: 'rule',     tip: '闪、粉、直闪感' },
  cyberNight: { name: '赛博夜城',  filter: 'cyber',        ratio: '16:9', mode: 'night',     comp: 'rule',     tip: '冷蓝 + 品红反光' },
  vintage:    { name: '复古胶片',  filter: 'vintage',      ratio: '1:1',  mode: 'smart',     comp: 'frame',    tip: '旧照片的褪色与暗角' },
};

export function filterCss(key) {
  return (FILTERS[key] || FILTERS.none).css;
}

/** 组合「曝光增益 + 滤镜」，剔除 none，避免非法 filter 字符串导致整条失效 */
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

/** 出片后处理：色调层 + 暗角 + 颗粒 + 水印 */
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

/** 三路保存：原生相册 → 系统分享 → 浏览器下载 */
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
