/**
 * 智能决策层：
 *   1) 景别（远景 / 中景 / 特写）自动判定 —— 不需要用户手动选
 *   2) 按画面内容推荐滤镜 —— 给出 3 个带理由的建议
 *
 * 只吃 vision 分析结果，不碰 DOM，方便单测。
 */
import { FILTERS } from './filters.js';

/* ============================ 景别 ============================ */

export const SHOTS = {
  wide: {
    id: 'wide', name: '远景', band: [0.045, 0.125],
    tip: '让环境和主体一起入画',
  },
  mid: {
    id: 'mid', name: '中景', band: [0.125, 0.30],
    tip: '主体占两成左右，最不容易出错',
  },
  close: {
    id: 'close', name: '特写', band: [0.30, 0.68],
    tip: '主体占三分之一以上，强调细节',
  },
};

/** 场景模式自带的景别倾向；landscape 要看主体多大再定 */
function modePreferred(mode, box) {
  switch (mode) {
    case 'portrait':
    case 'macro':
    case 'food': return 'close';
    case 'sport':
    case 'night': return 'mid';
    case 'landscape': return box > 0.3 ? 'mid' : 'wide';
    default: return null;
  }
}

/**
 * 自动挑景别。
 * @param {object} a vision 分析结果
 * @param {{mode?:string, prev?:object}} ctx
 */
export function decideShot(a, { mode = 'smart', prev = null } = {}) {
  const s = a && a.subject;
  const box = s ? Math.min(1, Math.max(0, s.w * s.h)) : 0;

  let id = modePreferred(mode, box);
  if (!id) {
    // 智能：先贴合你现在的取景，再给一个更明确的建议
    const tall = s && s.h > s.w * 1.15;
    if (box >= SHOTS.close.band[0]) id = 'close';
    else if (box >= SHOTS.mid.band[0]) id = 'mid';
    else if (tall) id = 'mid';        // 竖长主体（人、瓶子）靠近拍更合适
    else id = 'wide';
  }

  // 迟滞：还在上一个景别的范围附近就别来回跳
  if (prev && prev.mode === mode && prev.id !== id) {
    const [pl, ph] = SHOTS[prev.id].band;
    if (box >= pl * 0.82 && box <= ph * 1.18) id = prev.id;
  }

  const shot = SHOTS[id];
  const [lo, hi] = shot.band;
  let action = box < lo ? 'closer' : box > hi ? 'back' : 'hold';
  // 风景本来就以环境为主，别因为前景大了就让人往后退
  if (mode === 'landscape') action = box < 0.03 ? 'closer' : 'hold';
  const gap = action === 'closer' ? lo - box : action === 'back' ? box - hi : 0;

  return {
    id, name: shot.name, mode, box, band: shot.band,
    action, gap, tip: shot.tip,
    // 0–1，离目标距离有多远（给评分/提示强弱用）
    off: action === 'hold' ? 0 : Math.min(1, gap / Math.max(0.04, (hi - lo) * 0.7)),
  };
}

/** 一句话告诉用户该往前还是往后 */
export function shotAdvice(shot) {
  if (!shot) return '';
  if (shot.action === 'closer') {
    return shot.gap > 0.18 ? `走近两步，拍${shot.name}` : `再靠近一点，拍${shot.name}`;
  }
  if (shot.action === 'back') {
    return shot.gap > 0.2 ? `退后两步，拍${shot.name}` : `退后一点，拍${shot.name}`;
  }
  return `${shot.name}，距离刚好`;
}

export function shotPercent(shot) {
  if (!shot) return '';
  const [lo, hi] = shot.band;
  return `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
}

/* ============================ 滤镜推荐 ============================ */

/**
 * 每个条目：候选滤镜 + 命中场景标签的权重 + 一句理由。
 * 标签由 sceneTags() 从分析结果里算出来（0–1 的强度）。
 */
const RECS = [
  // —— 人像 / 特写 ——
  { k: 'portra400', tags: { portrait: 3, closeup: 1.4, warmLight: 1.4, flat: 1.2, neutral: 0.7 }, why: '肤色通透，人像最稳' },
  { k: 'japan', tags: { portrait: 2.4, bright: 1.6, flat: 1.2, closeup: 1 }, why: '日系清透，适合明亮人像' },
  { k: 'cream', tags: { portrait: 2, closeup: 1.2, bright: 1.2, flat: 1 }, why: '奶油感，皮肤更柔' },
  { k: 'pro400h', tags: { portrait: 1.8, coolLight: 1.2, flat: 1 }, why: '青调肤色，日系写真常用' },
  { k: 'portra800N', tags: { portrait: 1.6, dark: 1.6, warmLight: 1 }, why: '室内暖光下肤色不发黄' },

  // —— 风光 / 旅行 ——
  { k: 'ektar100', tags: { landscape: 2.4, vivid: 2.2, bright: 1.2 }, why: '高饱和高对比，风光利落' },
  { k: 'velvia50', tags: { landscape: 2.6, vivid: 2.8 }, why: '反转片质感，绿和红很实' },
  { k: 'gold200', tags: { warmLight: 2.6, landscape: 1.4, bright: 1.2, neutral: 0.8 }, why: '暖调胶片，夕阳与街景' },
  { k: 'fujiNN', tags: { warmLight: 2.2, portrait: 1.2, landscape: 1 }, why: '富士暖调，阳光下的通透感' },
  { k: 'superia400', tags: { vivid: 1.8, landscape: 1.2, flat: 1.2 }, why: '绿意浓，树木草地讨喜' },
  { k: 'classicChrome', tags: { landscape: 1.6, flat: 1.6, bright: 1 }, why: '低饱和高对比，建筑与街道' },

  // —— 夜景 / 弱光 ——
  { k: 'cityLight', tags: { nightMode: 3, night: 2.4, coolLight: 1 }, why: '夜景通透，灯光不糊成一片' },
  { k: 'cinestill800', tags: { nightMode: 2.6, night: 2.2, warmLight: 1.4 }, why: '钨丝灯下的电影感' },
  { k: 'amberNight', tags: { nightMode: 2.2, night: 2, warmLight: 1.6 }, why: '琥珀色调，夜市与路灯' },
  { k: 'blueHour', tags: { nightMode: 2, night: 1.6, coolLight: 1.8 }, why: '蓝调时刻，天光还没死' },
  { k: 'night', tags: { nightMode: 1.8, night: 2.2 }, why: '压噪提亮，手持夜拍' },
  { k: 'lowkey', tags: { night: 1.4, dark: 1.6, motion: 0.8 }, why: '暗调压高光，灯光更干净' },

  // —— 街头 / 人文 ——
  { k: 'hk', tags: { busy: 2.2, warmLight: 1.2, night: 1 }, why: '港风霓虹，街头氛围浓' },
  { k: 'wongKarWai', tags: { night: 1.8, busy: 1.6, warmLight: 1.4 }, why: '王家卫绿红偏色，夜街' },
  { k: 'leica', tags: { busy: 2, dark: 1.4, night: 0.8 }, why: '徕卡暗调，压掉杂乱背景' },
  { k: 'kodachrome', tags: { warmLight: 1.6, busy: 1.4, vivid: 1 }, why: '柯达克罗姆，红黄扎实' },

  // —— 极简 / 高级 ——
  { k: 'morandi', tags: { flat: 2.4, busy: 1.6, closeup: 0.8 }, why: '莫兰迪低饱和，画面更高级' },
  { k: 'salt', tags: { flat: 2, bright: 1.4, busy: 1.2 }, why: '盐系淡雅，白墙与浅色' },
  { k: 'moody', tags: { busy: 1.8, flat: 1.4, dark: 1 }, why: '低饱和压杂色，主体更突出' },

  // —— 黑白 ——
  { k: 'mono', tags: { busy: 2.6, flat: 1.4 }, why: '背景太乱时，黑白最干净' },
  { k: 'acros', tags: { busy: 2.2, night: 1.2, closeup: 1 }, why: '细腻灰阶，纹理好看' },
  { k: 'noir', tags: { busy: 1.8, dark: 1.6 }, why: '硬黑白，强对比' },

  // —— 食物 ——
  { k: 'darkFood', tags: { food: 3, warmLight: 1.4, dark: 1 }, why: '暗调美食，突出油光与质感' },
  { k: 'milky', tags: { food: 2, bright: 1.4, warmLight: 1 }, why: '奶咖色调，甜品与咖啡' },

  // —— 运动 / 抓拍 ——
  { k: 'clean', tags: { sport: 1.6, motion: 1.6, bright: 1, neutral: 0.9 }, why: '干净不偏色，动作细节清楚' },
  { k: 'vivid', tags: { sport: 1.2, vivid: 1.6, motion: 1 }, why: '提饱和提对比，运动更有劲' },

  // —— 通用兜底 ——
  { k: 'plog', tags: { bright: 1.2, flat: 1.2, neutral: 1 }, why: '清淡通透，几乎不挑场景' },
  { k: 'warm', tags: { coolLight: 1.6 }, why: '冷光下补一点暖' },
  { k: 'cool', tags: { warmLight: 1.4, night: 0.6 }, why: '暖光下压一点黄' },
  { k: 'ccdR', tags: { retro: 1, bright: 1, portrait: 0.8 }, why: 'CCD 千禧色，直出有年代感' },
].filter(r => FILTERS[r.k]);

/** 把分析结果翻译成场景标签（带强度） */
export function sceneTags(a, mode = 'smart', shot = null) {
  const t = {};
  if (!a) return t;

  const lum = a.meanLum || 0;
  const sat = typeof a.meanSat === 'number' ? a.meanSat : 0.3;
  const temp = a.colorTemp || 5400;

  if (lum < 0.3) t.night = Math.min(1, (0.3 - lum) / 0.25);
  if (lum < 0.26) t.nightMode = Math.min(1, (0.26 - lum) / 0.2);   // 暗就是夜景，不管什么模式
  t.neutral = 1;                                                    // 兜底，保证永远有推荐
  if (lum < 0.42) t.dark = Math.min(1, (0.42 - lum) / 0.3);
  if (lum > 0.62) t.bright = Math.min(1, (lum - 0.62) / 0.25);
  if (a.clipHigh > 0.05) t.blown = Math.min(1, a.clipHigh * 6);
  if (temp < 4900) t.warmLight = Math.min(1, (4900 - temp) / 900);
  if (temp > 6100) t.coolLight = Math.min(1, (temp - 6100) / 900);
  if (sat < 0.22) t.flat = Math.min(1, (0.22 - sat) / 0.14);
  if (sat > 0.45) t.vivid = Math.min(1, (sat - 0.45) / 0.25);
  if (a.clutter > 0.5) t.busy = Math.min(1, (a.clutter - 0.5) / 0.3);
  if (a.motion && a.motion.speed > 0.3) t.motion = Math.min(1, a.motion.speed / 0.8);

  // 高瘦主体（人、瓶子、树）基本可以按人像/主体拍摄来推荐
  const su = a.subject;
  if (su && su.h > su.w * 1.3 && su.h > 0.28) t.portrait = Math.min(1, (su.h - 0.28) / 0.3 + 0.5);
  if (shot && shot.id === 'close') t.closeup = 1;
  if (shot && shot.id === 'wide') t.wide = 1;

  if (mode && mode !== 'smart') t[mode] = 1;
  if (mode === 'night') t.nightMode = 1;
  // 夜景模式但画面很亮时，别硬推夜景滤镜
  if (t.nightMode && lum > 0.55) delete t.nightMode;

  return t;
}

/**
 * 推荐滤镜：返回按匹配度排序的前 N 个。
 * @returns {{key:string, name:string, why:string, score:number}[]}
 */
export function recommendFilters(a, { mode = 'smart', shot = null, limit = 3 } = {}) {
  const tags = sceneTags(a, mode, shot);
  const names = Object.keys(tags);
  if (!names.length) return [];

  const scored = [];
  for (const r of RECS) {
    let sc = 0;
    for (const [tag, w] of Object.entries(r.tags)) {
      const strength = tags[tag];
      if (strength) sc += w * strength;
    }
    if (sc > 0) scored.push({ key: r.k, why: r.why, score: sc, family: (FILTERS[r.k] || {}).family });
  }
  scored.sort((x, y) => y.score - x.score);

  // 每个家族只取一条，保证三个建议彼此有区别
  const out = [];
  const usedFam = new Set();
  for (const r of scored) {
    if (usedFam.has(r.family)) continue;
    usedFam.add(r.family);
    out.push({
      key: r.key,
      name: (FILTERS[r.key] || {}).name || r.key,
      why: r.why,
      score: Math.round(r.score * 10) / 10,
    });
    if (out.length >= limit) break;
  }
  return out;
}
