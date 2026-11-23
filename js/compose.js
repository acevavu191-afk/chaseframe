/**
 * compose.js — 构图评估与拍摄决策
 * 输入 vision.js 的分析结果，输出：分数、目标点、移动提示、快门/参数建议
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export const MODES = {
  smart:     { name: '智能',   ideal: [0.05, 0.46], isoMax: 1600, shutterBias: 1.0, weight: {} },
  sport:     { name: '运动',   ideal: [0.07, 0.50], isoMax: 3200, shutterBias: 4.5, weight: { sharp: 0.24, pos: 0.26, exp: 0.16 } },
  portrait:  { name: '人像',   ideal: [0.12, 0.52], isoMax: 1200, shutterBias: 1.4, weight: { headroom: 0.10, size: 0.16 } },
  landscape: { name: '风景',   ideal: [0.03, 0.34], isoMax: 800,  shutterBias: 1.0, weight: { level: 0.12, clutter: 0.15 } },
  night:     { name: '夜景',   ideal: [0.04, 0.42], isoMax: 6400, shutterBias: 0.3, weight: { exp: 0.26 } },
  macro:     { name: '微距',   ideal: [0.14, 0.64], isoMax: 1600, shutterBias: 1.8, weight: { sharp: 0.22 } },
  food:      { name: '食物',   ideal: [0.14, 0.58], isoMax: 1600, shutterBias: 1.2, weight: { clutter: 0.14 } },
};

/** 可选构图方法：给 UI 用，也给评分用 */
export const COMPOSITIONS = [
  { id: 'auto',     name: '智能',     desc: '按画面自动挑最合适的构图', short: '自动' },
  { id: 'thirds',   name: '三分法',   desc: '主体落在四个交点之一，最不容易出错', short: '三分' },
  { id: 'golden',   name: '黄金分割', desc: '0.618 的比例，比三分更古典，适合人像与静物', short: '黄金' },
  { id: 'center',   name: '中心对称', desc: '主体居中，庄重直接，适合建筑、正面人像', short: '中心' },
  { id: 'diagonal', name: '对角线',   desc: '视觉沿对角线延伸，画面有动势', short: '对角' },
  { id: 'leading',  name: '运动留白', desc: '运动方向前方留出空间，跑动不会"撞墙"', short: '留白' },
  { id: 'look',     name: '视线留白', desc: '人物看向的方向留白，画面有呼吸感', short: '视线' },
  { id: 'symmetry', name: '对称',     desc: '沿中轴左右呼应，适合倒影、长廊、建筑', short: '对称' },
  { id: 'triangle', name: '三角',     desc: '三个视觉点构成三角，稳定又有层次', short: '三角' },
  { id: 'frame',    name: '框架',     desc: '用门洞、树枝、窗框把主体框起来', short: '框架' },
  { id: 'fill',     name: '满构图',   desc: '主体占满画面，强调质感与细节', short: '满格' },
  { id: 'rule',     name: '破局',     desc: '主体故意贴边，制造张力与不平衡', short: '破局' },
];

const COMP_POINTS = {
  thirds: [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]],
  golden: [[0.382, 0.382], [0.618, 0.382], [0.382, 0.618], [0.618, 0.618]],
  center: [[0.5, 0.5]],
  diagonal: [[0.28, 0.28], [0.72, 0.72], [0.72, 0.28], [0.28, 0.72]],
  triangle: [[0.5, 0.3], [0.26, 0.74], [0.74, 0.74]],
};

const TEMPLATES = [
  { id: 'thirds',  name: '三分法',  pts: [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]] },
  { id: 'golden',  name: '黄金分割', pts: [[0.382, 0.382], [0.618, 0.382], [0.382, 0.618], [0.618, 0.618]] },
  { id: 'center',  name: '中心构图', pts: [[0.5, 0.5]] },
  { id: 'diagonal', name: '对角构图', pts: [[0.27, 0.28], [0.73, 0.72], [0.73, 0.28], [0.27, 0.72]] },
];

/** 目标点：按指定构图或自动挑最合适的交点 */
function pickTarget(subject, mode, motion, comp = 'auto', lookDir = 'right') {
  const nearestOf = (pts, penalty = 0) => {
    let best = null;
    for (const p of pts) {
      const d = Math.hypot(subject.cx - p[0], (subject.cy - p[1]) * 0.85) + penalty;
      if (!best || d < best.d) best = { d, x: p[0], y: p[1] };
    }
    return best;
  };

  if (comp === 'leading') {
    const dirX = motion ? (motion.vx >= 0 ? 1 : -1) : 1;
    const lead = clamp(0.2 + (motion ? motion.speed : 0.16) * 0.16, 0.2, 0.34);
    return {
      x: dirX > 0 ? 0.5 - lead : 0.5 + lead,
      y: clamp(subject.cy, 0.34, 0.62),
      tpl: { id: 'leading', name: '运动留白' }, d: 0,
    };
  }
  if (comp === 'look') {
    return {
      x: lookDir === 'right' ? 0.34 : 0.66,
      y: clamp(subject.cy, 0.3, 0.6),
      tpl: { id: 'look', name: '视线留白' }, d: 0,
    };
  }
  if (comp === 'symmetry') {
    return { x: 0.5, y: clamp(subject.cy, 0.3, 0.62), tpl: { id: 'symmetry', name: '对称' }, d: 0 };
  }
  if (comp === 'fill') {
    return { x: 0.5, y: 0.5, tpl: { id: 'fill', name: '满构图' }, d: 0 };
  }
  if (comp === 'frame') {
    return { x: 0.5, y: clamp(subject.cy, 0.35, 0.6), tpl: { id: 'frame', name: '框架' }, d: 0 };
  }
  if (comp === 'rule') {
    const left = subject.cx < 0.5;
    return {
      x: left ? 0.14 : 0.86,
      y: clamp(subject.cy, 0.28, 0.72),
      tpl: { id: 'rule', name: '破局' }, d: 0,
    };
  }
  if (comp !== 'auto' && COMP_POINTS[comp]) {
    const p = nearestOf(COMP_POINTS[comp]);
    const name = (COMPOSITIONS.find(c => c.id === comp) || {}).name || '构图';
    return { x: p.x, y: p.y, tpl: { id: comp, name }, d: p.d };
  }

  // ---- 自动：在可选模板里挑最合适的 ----
  const skipCenter = ['portrait', 'food', 'sport', 'macro'].includes(mode);
  const penalty = { center: 0.018, diagonal: 0.012, thirds: 0, golden: 0, leading: 0 };
  let best = null;
  for (const tpl of TEMPLATES) {
    if (mode === 'portrait' && tpl.id === 'diagonal') continue;
    if (skipCenter && tpl.id === 'center') continue;
    for (const p of tpl.pts) {
      const d = Math.hypot(subject.cx - p[0], (subject.cy - p[1]) * 0.85) + (penalty[tpl.id] || 0);
      if (!best || d < best.d) best = { d, x: p[0], y: p[1], tpl };
    }
  }

  const wantLead = mode === 'sport' || (mode === 'smart' && motion && motion.speed > 0.45);
  if (wantLead && motion) {
    const dirX = motion.vx >= 0 ? 1 : -1;
    const lead = clamp(0.2 + motion.speed * 0.16, 0.2, 0.34);
    return {
      x: dirX > 0 ? 0.5 - lead : 0.5 + lead,
      y: clamp(subject.cy, 0.34, 0.62),
      tpl: { id: 'leading', name: '运动留白' }, d: 0,
    };
  }
  return best;
}

/**
 * @param {object} a vision 分析结果
 * @param {object} o { mode, tilt, evBias, aspect, prevScore, hasGyro }
 */
export function evaluate(a, o = {}) {
  const mode = o.mode || 'smart';
  const cfg = MODES[mode] || MODES.smart;
  const evBias = o.evBias || 0;
  const tilt = o.tilt || 0;

  // 曝光评分（考虑手动 EV 补偿后的等效亮度）
  const effLum = clamp(a.meanLum * Math.pow(2, evBias), 0, 1);
  let expScore = clamp(1 - Math.abs(effLum - 0.46) / 0.44, 0, 1);
  expScore *= clamp(1 - a.clipHigh * 1.35, 0.15, 1);
  if (a.clipLow > 0.28) expScore *= 0.7;
  if (mode === 'night') expScore = clamp(expScore * 1.1, 0, 1);

  const sharpScore = clamp(a.sharp * 1.15, 0, 1);
  const clutterScore = clamp(1 - a.clutter * 1.5, 0.1, 1);
  const levelScore = o.hasGyro ? clamp(1 - Math.abs(tilt) / 9, 0, 1) : 1;

  const subject = a.subject;
  let posScore = 0, sizeScore = 0, headroomScore = 0.8;
  let target = { x: 0.5, y: 0.5, tpl: { id: 'center', name: '中心构图' }, d: 0.5 };
  let hasSubject = !!subject;

  if (subject) {
    target = pickTarget(subject, mode, a.motion, o.comp || 'auto', o.lookDir || 'right');
    const inside = subject.cx > subject.x && subject.cx < subject.x + subject.w &&
                   subject.cy > subject.y && subject.cy < subject.y + subject.h;
    const dist = Math.hypot(subject.cx - target.x, (subject.cy - target.y) * 1.05);
    const containsTarget = target.x > subject.x && target.x < subject.x + subject.w &&
                           target.y > subject.y && target.y < subject.y + subject.h;
    const eff = containsTarget ? 0 : dist;
    posScore = clamp(1 - eff / 0.27, 0, 1);

    // 某些构图不看"落在哪个点"，而看别的量
    const comp = o.comp || 'auto';
    if (comp === 'fill') posScore = clamp(subject.area / 0.3, 0, 1);
    else if (comp === 'symmetry') posScore = clamp(1 - Math.abs(subject.cx - 0.5) / 0.24, 0, 1);

    const [lo, hi] = cfg.ideal;
    const area = subject.area;
    if (area >= lo && area <= hi) sizeScore = 1;
    else if (area < lo) sizeScore = clamp(area / lo, 0, 1);
    else sizeScore = clamp(1 - (area - hi) / (hi * 1.2 + 0.18), 0, 1);

    // 顶部留白：人像 4%~22%，其他 2%~26%
    const top = subject.y;
    const [tLo, tHi] = mode === 'portrait' ? [0.035, 0.24] : [0.015, 0.3];
    headroomScore = top >= tLo && top <= tHi ? 1
      : top < tLo ? clamp(top / tLo, 0, 1)
      : clamp(1 - (top - tHi) / 0.22, 0, 1);
  }

  const w = {
    pos: 0.30, size: 0.13, exp: 0.19, sharp: 0.15, clutter: 0.11, level: 0.07, headroom: 0.05,
    ...(cfg.weight || {}),
  };

  let score;
  if (hasSubject) {
    const sumW = Object.values(w).reduce((s, v) => s + v, 0);
    score = (posScore * w.pos + sizeScore * w.size + expScore * w.exp +
             sharpScore * w.sharp + clutterScore * w.clutter + levelScore * w.level +
             headroomScore * w.headroom) / sumW;
  } else {
    // 没有明确主体时只评画面质量，上限压到 62，避免误判"完美"
    const sumW = 0.19 + 0.15 + 0.11 + 0.07;
    score = (expScore * 0.19 + sharpScore * 0.15 + clutterScore * 0.11 + levelScore * 0.07) / sumW;
    score = Math.min(score, 0.62);
  }
  const scorePct = Math.round(clamp(score, 0, 1) * 100);

  // 主提示：挑最短板
  const issues = [];
  if (!hasSubject) {
    issues.push({ k: 1.0, t: '把想拍的主体放到画面里', cls: '' });
  } else {
    if (posScore < 0.72) {
      const dx = target.x - subject.cx;
      const dy = target.y - subject.cy;
      const ax = Math.abs(dx) * 100, ay = Math.abs(dy) * 100;
      const h = dx > 0 ? '右' : '左';
      const v = dy > 0 ? '下' : '上';
      let t;
      const at = target.tpl.id === 'center' ? '中心' : (target.tpl.id === 'fill' ? '中间' : '位置');
      if (ax > ay * 1.3) t = `${h}移 ${ax.toFixed(0)}% · ${target.tpl.name}的${at}`;
      else if (ay > ax * 1.3) t = `${v}移 ${ay.toFixed(0)}% · ${target.tpl.name}的${at}`;
      else t = `${h}${v}移 ${Math.max(ax, ay).toFixed(0)}% · ${target.tpl.name}的${at}`;
      issues.push({ k: 1 - posScore + 0.32, t, cls: '' });
    }
    if (sizeScore < 0.62) {
      issues.push({
        k: 1 - sizeScore + 0.16,
        t: subject.area < cfg.ideal[0] ? '靠近一点，主体太小' : '退后一点，主体太满',
        cls: '',
      });
    }
  }
  if (expScore < 0.68) {
    issues.push({
      k: 1 - expScore + 0.14,
      t: a.meanLum < 0.4 ? '画面偏暗，已自动提亮' : a.meanLum > 0.62 ? '画面偏亮，已压暗' : '曝光接近极限，换个角度',
      cls: '',
    });
  }
  if (sharpScore < 0.5) {
    issues.push({ k: 1 - sharpScore + 0.1, t: '画面偏软：稳住手，或点一下主体对焦', cls: '' });
  }
  if (clutterScore < 0.55 && mode !== 'landscape') {
    issues.push({ k: 1 - clutterScore, t: '背景有点乱，稍微换个角度', cls: '' });
  }
  if (o.hasGyro && Math.abs(tilt) > 3.5) {
    issues.push({ k: Math.abs(tilt) / 26, t: `手机倾斜 ${Math.abs(tilt).toFixed(0)}°，先摆平`, cls: 'bad' });
  }

  issues.sort((x, y) => y.k - x.k);
  const top = issues[0];
  const detail = top ? top.t : '构图、曝光、清晰度都到位';

  let title;
  if (!hasSubject) title = '等待主体';
  else if (scorePct >= 88) title = '可以按快门了';
  else if (scorePct >= 76) title = '快到位了';
  else if (scorePct >= 62) title = '再调整一下';
  else title = '需要调整';

  const ready = hasSubject && scorePct >= 86 && (!o.hasGyro || Math.abs(tilt) < 3.2) && sharpScore > 0.55;

  return {
    score: scorePct,
    target,
    template: target.tpl,
    title,
    detail,
    detailCls: top ? top.cls : 'good',
    ready,
    hasSubject,
    metrics: {
      pos: posScore, size: sizeScore, exposure: expScore,
      sharp: sharpScore, clutter: clutterScore, level: levelScore, headroom: headroomScore,
    },
    suggest: subject ? {
      dx: target.x - subject.cx,
      dy: target.y - subject.cy,
      px: target.x, py: target.y,
    } : null,
  };
}

/** 线性外推主体位置（horizon 秒） */
export function predictSubject(motion, horizon) {
  if (!motion) return null;
  return {
    x: clamp(motion.cx + motion.vx * horizon, 0, 1),
    y: clamp(motion.cy + motion.vy * horizon, 0, 1),
    x0: motion.x + motion.vx * horizon,
    y0: motion.y + motion.vy * horizon,
    w: motion.w, h: motion.h,
  };
}

/**
 * 快门建议：像素位移控制在约 1.5px（以 4000px 长边估算）
 * @returns {{denom:number, label:string, risk:number}}
 */
export function shutterAdvice(motion, mode) {
  const base = mode === 'sport' ? 1 / 500 : 1 / 125;
  if (!motion || motion.speed < 0.05) {
    return { denom: Math.round(1 / base), label: `1/${Math.round(1 / base)}`, risk: 0 };
  }
  const pxSpeed = motion.speed * 4000;          // px/s on a 4000px-wide photo
  const safeT = 1.5 / Math.max(1, pxSpeed);     // s
  const denom = Math.min(4000, Math.max(60, Math.round(1 / safeT / 10) * 10));
  const risk = clamp(pxSpeed / 4000, 0, 1);
  return { denom, label: `1/${denom}`, risk };
}

/** 根据画面亮度给出 ISO / EV 建议 */
export function exposureAdvice(a, mode, evBias) {
  const cfg = MODES[mode] || MODES.smart;
  const target = 0.46;
  const ev = clamp(Math.log2(target / Math.max(0.03, a.meanLum)), -1.6, 2.2) + (evBias || 0);
  // 基准 ISO：光线越暗越高
  let iso = 100 * Math.pow(2, clamp(-ev, -1.5, 4.2));
  if (mode === 'night') iso *= 1.8;
  if (mode === 'night') iso = Math.max(iso, 800);
  iso = Math.min(cfg.isoMax, Math.max(100, Math.round(iso / 50) * 50));
  return { ev: Math.round(ev * 10) / 10, iso };
}

/** 连拍时给单帧打分（用于挑最佳瞬间） */
export function scoreFrame(a, o) {
  const e = evaluate(a, o);
  let bonus = 0;
  if (a.motion) {
    // 主体速度适中且清晰度高的帧更可能是"动作峰值"
    bonus += clamp(a.motion.speed * 0.6, 0, 0.1);
  }
  return { total: e.score + bonus * 100, ...e };
}

export { lerp };
