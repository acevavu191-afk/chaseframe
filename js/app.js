/**
 * app.js — 追帧 ChaseFrame 主控
 */
import { FrameAnalyzer, measureSharp } from './vision.js';
import { evaluate, MODES, COMPOSITIONS, exposureAdvice, shutterAdvice, predictSubject } from './compose.js';
import { Camera, describeCaps } from './camera.js';
import { FILTERS, FILTER_GROUPS, STYLES, filterCss, buildFilter, finishCanvas, canvasToBlob, downloadBlob, shareBlob, saveToDevice, hasNative, stamp } from './filters.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const S = {
  mode: 'smart',
  grid: 'thirds',
  ratio: '4:3',
  filter: 'none',
  styleKey: null,
  filterGroup: 'basic',
  comp: 'auto',
  lookDir: 'right',
  torch: false,
  zoom: 1,
  evBias: 0,
  running: false,
  demo: false,
  tilt: 0,
  hasGyro: false,
  photos: [],
  burst: [],
  burstBest: -1,
  busy: false,
  auto: false,
  opts: {
    guide: true, level: true, subject: true, track: true,
    ae: true, awb: true, fast: true, hw: true,
    watermark: false, haptic: true,
  },
  a: null,
  ev: null,
  lastShotAt: 0,
  readyStreak: 0,
  gain: 1,
  hwEv: false,
  locked: null,
};

const camera = new Camera($('video'));
const analyzer = new FrameAnalyzer(208);
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const stage = $('stage');
const DEBUG = new URLSearchParams(location.search).has('debug');

/* ===================== 演示场景（无摄像头也能看） ===================== */
class DemoScene {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.runner = { x: 0.18, y: 0.56, dir: 1, phase: 0 };
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: Math.random(), y: 0.13 + i * 0.05, s: 0.06 + i * 0.02, v: 0.012 + i * 0.006 }));
    this.birds = Array.from({ length: 3 }, (_, i) => ({ x: 0.1 + i * 0.25, y: 0.22 + i * 0.03, p: i }));
  }
  step(dt) {
    this.t += dt;
    const r = this.runner;
    r.x += r.dir * dt * 0.19;
    if (r.x > 0.86) { r.x = 0.86; r.dir = -1; }
    if (r.x < 0.14) { r.x = 0.14; r.dir = 1; }
    r.phase += dt * 7.4;
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > 1.2) c.x = -0.2; }
  }
  draw(w, h) {
    const g = this.ctx;
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#22314a');
    sky.addColorStop(0.45, '#5a6b7e');
    sky.addColorStop(0.62, '#c08a63');
    sky.addColorStop(1, '#3a3229');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    // 太阳
    const sunX = w * 0.76, sunY = h * 0.3;
    const sg = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.16);
    sg.addColorStop(0, 'rgba(255,206,150,.55)');
    sg.addColorStop(0.35, 'rgba(255,180,110,.18)');
    sg.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(sunX, sunY, h * 0.16, 0, 7); g.fill();

    // 云
    g.fillStyle = 'rgba(255,255,255,.16)';
    for (const c of this.clouds) {
      const cx = c.x * w, cy = c.y * h, rw = c.s * w;
      g.beginPath();
      g.ellipse(cx, cy, rw, rw * 0.28, 0, 0, 7);
      g.ellipse(cx + rw * 0.5, cy - rw * 0.1, rw * 0.55, rw * 0.22, 0, 0, 7);
      g.fill();
    }

    // 远山
    g.fillStyle = 'rgba(30,38,48,.85)';
    g.beginPath();
    g.moveTo(0, h * 0.66);
    g.lineTo(w * 0.18, h * 0.5);
    g.lineTo(w * 0.33, h * 0.64);
    g.lineTo(w * 0.52, h * 0.47);
    g.lineTo(w * 0.72, h * 0.63);
    g.lineTo(w * 0.88, h * 0.52);
    g.lineTo(w, h * 0.62);
    g.lineTo(w, h); g.lineTo(0, h);
    g.closePath(); g.fill();

    // 地面
    const gg = g.createLinearGradient(0, h * 0.72, 0, h);
    gg.addColorStop(0, '#4a4034'); gg.addColorStop(1, '#221d18');
    g.fillStyle = gg; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = h * (0.74 + i * 0.022);
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }

    // 跑步的人
    const r = this.runner;
    const px = r.x * w, base = h * 0.84, scale = h * 0.38;
    const bob = Math.sin(r.phase * 2) * scale * 0.03;
    g.save();
    g.translate(px, base - scale * 0.5 + bob);
    g.scale(r.dir, 1);
    const swing = Math.sin(r.phase) * 0.55;
    g.lineCap = 'round';
    // 腿
    g.strokeStyle = '#1a1a1e'; g.lineWidth = scale * 0.075;
    g.beginPath(); g.moveTo(0, scale * 0.1); g.lineTo(swing * scale * 0.5, scale * 0.46); g.stroke();
    g.beginPath(); g.moveTo(0, scale * 0.1); g.lineTo(-swing * scale * 0.5, scale * 0.46); g.stroke();
    // 躯干
    g.strokeStyle = '#e2603f'; g.lineWidth = scale * 0.16;
    g.beginPath(); g.moveTo(0, -scale * 0.14); g.lineTo(0, scale * 0.12); g.stroke();
    // 手臂
    g.strokeStyle = '#e2603f'; g.lineWidth = scale * 0.07;
    g.beginPath(); g.moveTo(0, -scale * 0.08); g.lineTo(-swing * scale * 0.42, scale * 0.06); g.stroke();
    g.beginPath(); g.moveTo(0, -scale * 0.08); g.lineTo(swing * scale * 0.42, scale * 0.06); g.stroke();
    // 头
    g.fillStyle = '#e8b58f';
    g.beginPath(); g.arc(0, -scale * 0.22, scale * 0.085, 0, 7); g.fill();
    g.restore();

    // 前景草
    g.strokeStyle = 'rgba(120,110,80,.5)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x = (i * 37 % 100) / 100 * w;
      const y = h * (0.86 + ((i * 13) % 10) / 100);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(this.t + i) * 4, y - 12); g.stroke();
    }
  }
}
const demo = new DemoScene($('demoCanvas'));

/* ===================== 坐标映射 ===================== */
function aspectValue(r) {
  const [a, b] = r.split(':').map(Number);
  const portrait = stage.clientHeight >= stage.clientWidth;
  return portrait ? b / a : a / b;
}

function layout() {
  const cw = stage.clientWidth, ch = stage.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  overlay.width = Math.round(cw * dpr);
  overlay.height = Math.round(ch * dpr);
  overlay.style.width = cw + 'px';
  overlay.style.height = ch + 'px';
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const video = $('video');
  const vw = S.demo ? 720 : video.videoWidth;
  const vh = S.demo ? 1280 : video.videoHeight;
  if (!vw || !vh) return null;

  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (cw - dw) / 2, oy = (ch - dh) / 2;

  // 只取「屏幕里真正看得见」的那部分来定裁切框，
  // 否则 cover 模式下两侧被裁掉的画面会被拍进照片
  const vx0 = Math.max(0, ox), vy0 = Math.max(0, oy);
  const vx1 = Math.min(cw, ox + dw), vy1 = Math.min(ch, oy + dh);
  const availW = vx1 - vx0, availH = vy1 - vy0;

  const target = aspectValue(S.ratio);
  let cwd, chd;
  if (availW / availH > target) { chd = availH; cwd = availH * target; }
  else { cwd = availW; chd = availW / target; }
  const cx = vx0 + (availW - cwd) / 2, cy = vy0 + (availH - chd) / 2;

  // 源裁切区（视频像素），夹在画面范围内
  const sx = clamp((cx - ox) / scale, 0, vw);
  const sy = clamp((cy - oy) / scale, 0, vh);
  const sw = clamp(cwd / scale, 1, vw - sx);
  const sh = clamp(chd / scale, 1, vh - sy);

  // 遮罩
  const mask = $('cropMask');
  mask.style.left = cx + 'px';
  mask.style.top = cy + 'px';
  mask.style.width = cwd + 'px';
  mask.style.height = chd + 'px';
  mask.style.transform = 'none';

  return { cw, ch, rect: { x: cx, y: cy, w: cwd, h: chd }, src: { sx, sy, sw, sh }, scale, ox, oy };
}

let L = null;

/* ===================== 主循环 ===================== */
let lastAnalysis = 0, lastHud = 0, lastApply = 0, lastTs = 0;

function loop(ts) {
  if (!S.running) return;
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
  lastTs = ts;

  if (S.demo) { demo.step(dt); demo.draw(720, 1280); }

  if (ts - lastAnalysis > 62) {
    lastAnalysis = ts;
    runAnalysis(ts);
  }
  drawOverlay(ts);

  if (ts - lastHud > 190) {
    lastHud = ts;
    updateHud();
  }
  if (ts - lastApply > 620 && S.opts.ae && S.opts.hw && camera.track && !S.demo) {
    lastApply = ts;
    applyAutoParams();
  }
  requestAnimationFrame(loop);
}

function runAnalysis(ts) {
  const src = S.demo ? $('demoCanvas') : $('video');
  L = layout();
  let a = null;
  if (L && L.src && L.src.sw > 2) {
    a = analyzer.analyze(src, ts, L.src);
  }
  if (!a) return;
  if (S.locked) {
    a.subject = { ...S.locked };
    a.subject.area = S.locked.area;
  } else if (S.a && S.a.subject && S.a.subject.locked) {
    // 刚解锁，清掉残留
  }
  S.a = a;

  const ev = evaluate(a, {
    mode: S.mode, tilt: S.tilt, evBias: S.evBias, hasGyro: S.hasGyro,
    comp: S.comp, lookDir: S.lookDir,
  });
  S.ev = ev;
  if (DEBUG) {
    document.title = `s=${ev.score} sharp=${a.sharp.toFixed(2)} lap=${Math.round(a.lapVar)} `
      + `pos=${ev.metrics.pos.toFixed(2)} area=${a.subject ? a.subject.area.toFixed(3) : '0'} `
      + `lum=${a.meanLum.toFixed(2)} cl=${a.clutter.toFixed(2)} ready=${ev.ready} `
      + `box=${a.subject ? [a.subject.x, a.subject.y, a.subject.w, a.subject.h].map(v => v.toFixed(2)).join(',') : '-'} `
      + `cells=${a.subject ? a.subject.keptCells + '/' + a.subject.clusterCells : '-'}`;
  }
  S.evAdvice = exposureAdvice(a, S.mode, S.evBias);
  S.shutterAdvice = shutterAdvice(a.motion, S.mode);

  // 软件曝光增益（硬件不支持时）
  if (S.opts.ae && !S.hwEv) {
    const g = clamp(Math.pow(2, S.evAdvice.ev * 0.72), 0.62, 1.95);
    S.gain = S.gain * 0.7 + g * 0.3;
  } else {
    S.gain = 1;
  }
  $('video').style.filter = buildFilter(S.gain, S.filter);

  // 自动抓拍
  if (S.auto && S.opts.guide && ev.ready && !S.busy && ts - S.lastShotAt > 2600) {
    S.readyStreak++;
    if (S.readyStreak >= 4) { S.readyStreak = 0; autoShot(); }
  } else {
    S.readyStreak = Math.max(0, S.readyStreak - 1);
  }
}

async function applyAutoParams() {
  const adv = S.evAdvice;
  if (!adv) return;
  const res = await camera.apply({ ev: adv.ev }, { throttle: 600 });
  if (res.applied.includes('ev')) S.hwEv = true;
  else if (res.failed.includes('ev') || res.skipped) { /* 保持软件模拟 */ }
  if (!camera.caps.exposureCompensation) S.hwEv = false;
}

/* ===================== 叠加绘制 ===================== */
function toScreen(nx, ny) {
  if (!L) return { x: 0, y: 0 };
  return { x: L.rect.x + nx * L.rect.w, y: L.rect.y + ny * L.rect.h };
}

function drawOverlay(ts) {
  if (!L) return;
  octx.clearRect(0, 0, L.cw, L.ch);
  const a = S.a, ev = S.ev;
  if (!a || !ev) return;

  const accent = ev.score >= 86 ? '#58d68d' : ev.score >= 70 ? '#ffb03a' : '#ff8a5c';

  drawCompGuide();

  // ---- 主体框 ----
  if (a.subject && S.opts.subject) {
    const p0 = toScreen(a.subject.x, a.subject.y);
    const p1 = toScreen(a.subject.x + a.subject.w, a.subject.y + a.subject.h);
    const w = p1.x - p0.x, h = p1.y - p0.y;
    const r = Math.min(14, w * 0.18);
    octx.strokeStyle = 'rgba(255,255,255,.55)';
    octx.lineWidth = 1.5;
    cornerPath(octx, p0.x, p0.y, w, h, r);
    octx.stroke();
    const label = a.subject.locked ? '锁定主体' : `主体 ${(a.subject.area * 100).toFixed(0)}%`;
    octx.font = '500 10px -apple-system, system-ui, sans-serif';
    const tw = octx.measureText(label).width;
    octx.fillStyle = 'rgba(0,0,0,.42)';
    octx.fillRect(p0.x + 1, Math.max(2, p0.y - 20), tw + 10, 15);
    octx.fillStyle = 'rgba(255,255,255,.86)';
    octx.fillText(label, p0.x + 6, Math.max(12, p0.y - 8));
  }

  // ---- 构图目标点 + 引导线 ----
  if (S.opts.guide && ev.suggest) {
    const t = toScreen(ev.target.x, ev.target.y);
    const s = toScreen(a.subject.cx, a.subject.cy);
    const dist = Math.hypot(t.x - s.x, t.y - s.y);

    // 目标点
    octx.save();
    octx.globalAlpha = 0.85;
    octx.strokeStyle = accent;
    octx.lineWidth = 1.6;
    octx.beginPath(); octx.arc(t.x, t.y, 13, 0, 7); octx.stroke();
    octx.beginPath(); octx.arc(t.x, t.y, 2.6, 0, 7); octx.fillStyle = accent; octx.fill();
    octx.setLineDash([3, 4]);
    octx.beginPath();
    octx.moveTo(t.x - 20, t.y); octx.lineTo(t.x - 15, t.y);
    octx.moveTo(t.x + 15, t.y); octx.lineTo(t.x + 20, t.y);
    octx.moveTo(t.x, t.y - 20); octx.lineTo(t.x, t.y - 15);
    octx.moveTo(t.x, t.y + 15); octx.lineTo(t.x, t.y + 20);
    octx.stroke();
    octx.restore();

    // 引导箭头
    if (dist > 22) {
      octx.save();
      const ang = Math.atan2(t.y - s.y, t.x - s.x);
      const startX = s.x + Math.cos(ang) * 26, startY = s.y + Math.sin(ang) * 26;
      const endX = t.x - Math.cos(ang) * 20, endY = t.y - Math.sin(ang) * 20;
      octx.strokeStyle = 'rgba(255,255,255,.62)';
      octx.lineWidth = 1.6;
      octx.setLineDash([6, 6]);
      octx.beginPath(); octx.moveTo(startX, startY); octx.lineTo(endX, endY); octx.stroke();
      octx.setLineDash([]);
      // 箭头头
      octx.beginPath();
      octx.moveTo(endX, endY);
      octx.lineTo(endX - Math.cos(ang - 0.42) * 9, endY - Math.sin(ang - 0.42) * 9);
      octx.moveTo(endX, endY);
      octx.lineTo(endX - Math.cos(ang + 0.42) * 9, endY - Math.sin(ang + 0.42) * 9);
      octx.strokeStyle = accent;
      octx.stroke();
      octx.restore();
    }
  }

  // ---- 运动：轨迹 + 预测 ----
  if (a.motion && S.opts.track) {
    const m = a.motion;
    const m0 = toScreen(m.x, m.y), m1 = toScreen(m.x + m.w, m.y + m.h);
    octx.save();
    octx.strokeStyle = 'rgba(90,220,255,.85)';
    octx.lineWidth = 1.4;
    octx.setLineDash([4, 4]);
    octx.strokeRect(m0.x, m0.y, m1.x - m0.x, m1.y - m0.y);
    octx.setLineDash([]);

    // 速度矢量
    const c = toScreen(m.cx, m.cy);
    octx.beginPath();
    octx.moveTo(c.x, c.y);
    octx.lineTo(c.x + m.vx * 0.16 * L.rect.w, c.y + m.vy * 0.16 * L.rect.h);
    octx.strokeStyle = 'rgba(90,220,255,.9)';
    octx.lineWidth = 2;
    octx.stroke();

    // 预测框
    for (const hz of [0.2, 0.42]) {
      const p = predictSubject(m, hz);
      if (!p) continue;
      const q0 = toScreen(p.x0, p.y0);
      const q1 = toScreen(p.x0 + p.w, p.y0 + p.h);
      octx.globalAlpha = hz < 0.3 ? 0.5 : 0.26;
      octx.strokeStyle = '#5adcff';
      octx.lineWidth = 1.2;
      octx.strokeRect(q0.x, q0.y, q1.x - q0.x, q1.y - q0.y);
      octx.globalAlpha = 1;
    }
    // 速度读数固定放在取景框左上角，避免和主体框标签打架
    const mlabel = `主体移动 ${(m.speed * 100).toFixed(0)}%/s`;
    octx.font = '500 10px -apple-system, system-ui, sans-serif';
    const mw = octx.measureText(mlabel).width;
    const rx = L.rect.x + 8, ry = L.rect.y + 8;
    octx.fillStyle = 'rgba(6,20,26,.6)';
    octx.fillRect(rx, ry, mw + 12, 18);
    octx.fillStyle = 'rgba(120,228,255,.95)';
    octx.fillText(mlabel, rx + 6, ry + 13);
    octx.restore();
  }

  // ---- 就绪光环 ----
  if (ev.ready) {
    octx.save();
    const r = L.rect;
    const grad = octx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    grad.addColorStop(0, 'rgba(88,214,141,.85)');
    grad.addColorStop(1, 'rgba(88,214,141,.35)');
    octx.strokeStyle = grad;
    octx.lineWidth = 2.4;
    octx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    octx.restore();
  }

  // 目标点隐约的交点标记
  if (S.opts.guide) {
    octx.fillStyle = 'rgba(255,255,255,.22)';
    const pts = [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]];
    for (const p of pts) {
      const q = toScreen(p[0], p[1]);
      octx.beginPath(); octx.arc(q.x, q.y, 1.6, 0, 7); octx.fill();
    }
  }
}

function drawCompGuide() {
  if (!S.opts.guide || S.comp === 'auto' || !L) return;
  const r = L.rect;
  const at = (nx, ny) => [r.x + nx * r.w, r.y + ny * r.h];
  octx.save();
  octx.strokeStyle = 'rgba(255,255,255,.2)';
  octx.lineWidth = 1;
  octx.setLineDash([5, 7]);

  const vline = nx => { const [x] = at(nx, 0); octx.beginPath(); octx.moveTo(x, r.y); octx.lineTo(x, r.y + r.h); octx.stroke(); };
  const hline = ny => { const [, y] = at(0, ny); octx.beginPath(); octx.moveTo(r.x, y); octx.lineTo(r.x + r.w, y); octx.stroke(); };

  switch (S.comp) {
    case 'thirds': vline(1 / 3); vline(2 / 3); hline(1 / 3); hline(2 / 3); break;
    case 'golden': vline(0.382); vline(0.618); hline(0.382); hline(0.618); break;
    case 'center':
    case 'symmetry': vline(0.5); hline(0.5); break;
    case 'diagonal':
      octx.beginPath(); octx.moveTo(r.x, r.y); octx.lineTo(r.x + r.w, r.y + r.h);
      octx.moveTo(r.x + r.w, r.y); octx.lineTo(r.x, r.y + r.h); octx.stroke();
      break;
    case 'triangle': {
      const [ax, ay] = at(0.5, 0.3), [bx, by] = at(0.26, 0.74), [cx2, cy2] = at(0.74, 0.74);
      octx.beginPath(); octx.moveTo(ax, ay); octx.lineTo(bx, by); octx.lineTo(cx2, cy2); octx.closePath(); octx.stroke();
      break;
    }
    case 'frame': {
      const inset = 0.1;
      octx.strokeRect(r.x + r.w * inset, r.y + r.h * inset, r.w * (1 - inset * 2), r.h * (1 - inset * 2));
      break;
    }
    case 'fill':
      octx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      break;
    case 'rule':
      octx.beginPath(); octx.moveTo(r.x + r.w * 0.14, r.y); octx.lineTo(r.x + r.w * 0.14, r.y + r.h);
      octx.moveTo(r.x + r.w * 0.86, r.y); octx.lineTo(r.x + r.w * 0.86, r.y + r.h); octx.stroke();
      break;
    default: break;
  }
  octx.restore();
}

function cornerPath(ctx, x, y, w, h, r) {
  const len = Math.min(20, Math.min(w, h) * 0.28);
  ctx.beginPath();
  ctx.moveTo(x, y + len); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + len);
  ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + w - len, y + h);
  ctx.moveTo(x + len, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + h - len);
  ctx.stroke();
}

/* ===================== HUD ===================== */
function updateHud() {
  const ev = S.ev, a = S.a;
  if (!ev || !a) return;

  $('scoreNum').textContent = ev.score;
  const ring = $('ringFg');
  ring.style.strokeDashoffset = String(116 - (116 * ev.score) / 100);
  ring.style.stroke = ev.score >= 86 ? '#58d68d' : ev.score >= 70 ? '#ffb03a' : '#ff8a5c';

  $('scoreTitle').textContent = ev.title;
  const detailEl = $('scoreDetail');
  detailEl.textContent = ev.detail;
  detailEl.classList.toggle('good', ev.ready);
  detailEl.classList.toggle('bad', ev.detailCls === 'bad');

  $('btnShutter').classList.toggle('armed', ev.ready);

  // EXIF 条
  const iso = S.evAdvice ? S.evAdvice.iso : 100;
  const sh = S.shutterAdvice ? S.shutterAdvice.denom : 125;
  $('exifIso').textContent = `ISO ${iso}`;
  $('exifShutter').textContent = `1/${sh}`;
  $('exifEv').textContent = `EV ${(S.evAdvice ? S.evAdvice.ev : 0) >= 0 ? '+' : ''}${(S.evAdvice ? S.evAdvice.ev : 0).toFixed(1)}`;
  $('exifWb').textContent = S.opts.awb ? `${Math.round((a.colorTemp || 5500) / 100) * 100}K` : 'AWB';
  const badge = $('exifMode');
  badge.textContent = S.hwEv ? `${MODES[S.mode].name} · 硬件` : `${MODES[S.mode].name} · 软件`;
  badge.classList.toggle('hw', S.hwEv);

  // 水平仪
  const hl = $('horizonLine');
  if (S.hasGyro && S.opts.level) {
    hl.classList.add('show');
    hl.style.transform = `rotate(${clamp(S.tilt, -25, 25)}deg)`;
    hl.classList.toggle('warn', Math.abs(S.tilt) > 3.2);
  } else {
    hl.classList.remove('show');
  }

  // 变焦按钮状态
  document.querySelectorAll('.zoom-bar .z').forEach(b => {
    const z = Number(b.dataset.z);
    b.classList.toggle('is-active', Math.abs(z - S.zoom) < 0.2);
  });
}

/* ===================== 拍摄 ===================== */
function flash() {
  const f = $('flashFx');
  f.classList.remove('fire');
  void f.offsetWidth;
  f.classList.add('fire');
}
function vibrate(ms = 18) {
  if (S.opts.haptic && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} }
}

function grabTo(canvas) {
  const box = layout();
  if (!box) return null;
  const src = box.src;

  if (S.demo) {
    const d = $('demoCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.max(1, Math.round(src.sw));
    canvas.height = Math.max(1, Math.round(src.sh));
    if (ctx.filter !== undefined) ctx.filter = buildFilter(S.gain, S.filter);
    ctx.drawImage(d, src.sx, src.sy, src.sw, src.sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  return camera.grab(canvas, {
    src,
    mirror: camera.facing === 'user',
    filter: buildFilter(S.gain, S.filter),
  });
}

function metaNow() {
  return {
    shutter: `1/${S.shutterAdvice ? S.shutterAdvice.denom : 125}`,
    iso: S.evAdvice ? S.evAdvice.iso : 100,
    ev: S.evAdvice ? S.evAdvice.ev : 0,
    mode: MODES[S.mode].name,
    style: S.styleKey ? STYLES[S.styleKey].name : FILTERS[S.filter].name,
    ts: Date.now(),
  };
}

async function capture(kind = 'manual') {
  if (S.busy) return;
  S.busy = true;
  try {
    const canvas = document.createElement('canvas');
    grabTo(canvas);
    if (!canvas.width) { toast('画面还没准备好'); return; }
    const ctx = canvas.getContext('2d');
    finishCanvas(ctx, S.filter, metaNow(), S.opts.watermark);
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error('blob failed');
    addPhoto(blob, S.ev ? S.ev.score : 0);
    if (kind === 'manual') { flash(); vibrate(16); }
    else toast('自动抓拍：构图到位');
    S.lastShotAt = performance.now();
  } catch (e) {
    toast('拍摄失败：' + (e.message || e));
  } finally {
    S.busy = false;
  }
}

function autoShot() {
  if (S.busy) return;
  capture('auto');
}

async function burst(n = 12) {
  if (S.busy) return;
  S.busy = true;
  const shutter = $('btnShutter');
  shutter.classList.add('bursting');
  const ring = $('burstRing');
  const frames = [];
  try {
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas');
      grabTo(c);
      if (!c.width) break;
      const sharp = measureSharp(c);
      frames.push({ canvas: c, sharp });
      ring.style.strokeDashoffset = String(289 - (289 * (i + 1)) / n);
      vibrate(6);
      await sleep(42);
    }
    if (!frames.length) { toast('连拍失败'); return; }

    // 选最清晰的一帧（同场景下清晰度最有区分度）
    let best = 0;
    frames.forEach((f, i) => { if (f.sharp > frames[best].sharp) best = i; });

    S.burst = frames.map((f, i) => {
      const ctx = f.canvas.getContext('2d');
      finishCanvas(ctx, S.filter, metaNow(), S.opts.watermark);
      const th = document.createElement('canvas');
      const k = 128 / Math.max(f.canvas.width, f.canvas.height);
      th.width = Math.round(f.canvas.width * k);
      th.height = Math.round(f.canvas.height * k);
      th.getContext('2d').drawImage(f.canvas, 0, 0, th.width, th.height);
      return { canvas: f.canvas, thumb: th.toDataURL('image/jpeg', 0.7), sharp: f.sharp, quality: Math.round(clamp(f.sharp * 120, 8, 99)) };
    });
    S.burstBest = best;
    openBurst();
  } finally {
    shutter.classList.remove('bursting');
    ring.style.strokeDashoffset = 289;
    S.busy = false;
  }
}

function openBurst() {
  const strip = $('burstStrip');
  strip.innerHTML = '';
  $('burstInfo').textContent = `已连拍 ${S.burst.length} 张 · 已选最清晰`;
  S.burst.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'burst-item' + (i === S.burstBest ? ' is-best' : '');
    el.innerHTML = `<img src="${f.thumb}" alt=""><span class="bq">${f.quality}</span>${i === S.burstBest ? '<span class="bbest">最佳</span>' : ''}`;
    el.addEventListener('click', () => {
      S.burstBest = i;
      [...strip.children].forEach((c, j) => c.classList.toggle('is-best', j === i));
      strip.querySelectorAll('.bbest').forEach(x => x.remove());
      const b = document.createElement('span');
      b.className = 'bbest'; b.textContent = '最佳';
      el.appendChild(b);
    });
    strip.appendChild(el);
  });
  $('burstSheet').hidden = false;
}

async function saveBurst(idx) {
  const f = S.burst[idx];
  if (!f) return;
  const blob = await canvasToBlob(f.canvas);
  addPhoto(blob, S.ev ? S.ev.score : 0, true);
  toast('已保存');
}

/* ===================== 相册 ===================== */
function addPhoto(blob, score, silent = false) {
  const url = URL.createObjectURL(blob);
  const meta = metaNow();
  S.photos.unshift({ blob, url, score, meta, id: Date.now() + Math.random() });
  renderGallery();
  const img = $('thumbImg');
  img.src = url; img.hidden = false;
  $('thumbEmpty').hidden = true;

  // 原生外壳里直接进系统相册，不用再手动保存
  if (hasNative()) {
    saveToDevice(blob, `chaseframe_${stamp()}.jpg`).then(w => {
      if (!silent) toast(w === 'gallery' ? `已存入相册 · 构图 ${score}` : `已拍下 · 构图 ${score}`);
    });
  } else if (!silent) {
    toast(`已拍下 · 构图 ${score}`);
  }
}

function renderGallery() {
  const grid = $('galleryGrid');
  $('galleryCount').textContent = `${S.photos.length} 张`;
  if (!S.photos.length) {
    grid.innerHTML = '<div class="gallery-empty">还没有照片<br/>回到取景器按快门</div>';
    return;
  }
  grid.innerHTML = '';
  for (const p of S.photos) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = `<img src="${p.url}" alt=""><span class="tag">${p.score}</span>`;
    cell.addEventListener('click', () => openViewer(p));
    grid.appendChild(cell);
  }
}

let viewing = null;
function openViewer(p) {
  viewing = p;
  $('viewerImg').src = p.url;
  const m = p.meta || {};
  $('viewerMeta').textContent = `${m.shutter || ''} · ISO${m.iso || ''} · ${m.mode || ''}`;
  $('viewer').hidden = false;
}

async function savePhoto(p) {
  if (!p) return;
  const name = `chaseframe_${stamp()}.jpg`;
  const where = await saveToDevice(p.blob, name);
  toast(where === 'gallery' ? '已存入系统相册' : where === 'share' ? '已发送到系统分享' : '已保存到下载目录');
}

/* ===================== 创作面板：风格 / 滤镜 / 构图 ===================== */
let thumbCache = null;

function snapshotThumb() {
  const c = document.createElement('canvas');
  grabTo(c);
  if (!c || !c.width) return null;
  const k = 260 / Math.max(c.width, c.height);
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(c.width * k));
  t.height = Math.max(1, Math.round(c.height * k));
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.72);
}

function tintLayer(item) {
  if (!item.tint) return '';
  return `background:${item.tint};mix-blend-mode:${item.blend || 'soft-light'}`;
}

function renderStyleGrid() {
  const box = $('styleGrid');
  const thumb = thumbCache;
  box.innerHTML = '';
  Object.entries(STYLES).forEach(([key, st]) => {
    const f = FILTERS[st.filter] || FILTERS.none;
    const el = document.createElement('button');
    el.className = 'style-card' + (S.styleKey === key ? ' is-active' : '');
    el.innerHTML = `
      <div class="sw">
        ${thumb ? `<img src="${thumb}" style="filter:${f.css}" alt="">` : ''}
        <i style="${tintLayer(f)}"></i>
      </div>
      <div class="meta"><div class="nm">${st.name}</div><div class="tp">${st.tip}</div></div>`;
    el.addEventListener('click', () => applyStyle(key));
    box.appendChild(el);
  });
}

function renderFilterGroups() {
  const box = $('filterGroups');
  box.innerHTML = '';
  FILTER_GROUPS.forEach(g => {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (S.filterGroup === g.id ? ' is-active' : '');
    b.textContent = g.name;
    b.addEventListener('click', () => { S.filterGroup = g.id; renderFilterGroups(); renderFilterGrid(); });
    box.appendChild(b);
  });
}

function renderFilterGrid() {
  const box = $('filterGrid');
  const thumb = thumbCache;
  box.innerHTML = '';
  Object.entries(FILTERS)
    .filter(([, f]) => f.group === S.filterGroup)
    .forEach(([key, f]) => {
      const el = document.createElement('button');
      el.className = 'filter-item' + (S.filter === key ? ' is-active' : '');
      el.innerHTML = `
        ${thumb ? `<img src="${thumb}" style="filter:${f.css}" alt="">` : ''}
        <i style="${tintLayer(f)}"></i>
        <span>${f.name}</span>`;
      el.addEventListener('click', () => selectFilter(key));
      box.appendChild(el);
    });
}

const COMP_SVG = {
  auto: '<rect x="4" y="4" width="34" height="34" fill="none" stroke="#6b6b72"/><circle cx="21" cy="21" r="6" fill="none" stroke="#ffb03a" stroke-width="1.4"/><circle cx="21" cy="21" r="1.6" fill="#ffb03a"/>',
  thirds: '<g stroke="#ffb03a" stroke-width="1.2" opacity=".9"><path d="M15 4v34M27 4v34M4 15h34M4 27h34"/></g><g fill="#fff"><circle cx="15" cy="15" r="1.8"/><circle cx="27" cy="15" r="1.8"/><circle cx="15" cy="27" r="1.8"/><circle cx="27" cy="27" r="1.8"/></g>',
  golden: '<g stroke="#ffb03a" stroke-width="1.1" opacity=".85"><path d="M17 4v34M25 4v34M4 17h34M4 25h34"/></g>',
  center: '<g stroke="#ffb03a" stroke-width="1.3"><path d="M21 6v10M21 26v10M6 21h10M26 21h10"/></g><circle cx="21" cy="21" r="4" fill="none" stroke="#fff" stroke-width="1.2"/>',
  diagonal: '<g stroke="#ffb03a" stroke-width="1.2"><path d="M4 4l34 34M38 4L4 38"/></g><circle cx="12" cy="12" r="2.2" fill="#fff"/>',
  leading: '<rect x="6" y="14" width="8" height="14" rx="2" fill="#fff" opacity=".85"/><g stroke="#ffb03a" stroke-width="1.4" fill="none"><path d="M17 21h14"/><path d="M27 17l5 4-5 4"/></g>',
  look: '<circle cx="14" cy="18" r="4.5" fill="#fff" opacity=".9"/><g stroke="#ffb03a" stroke-width="1.4" fill="none"><path d="M20 18h13"/><path d="M29 14l4 4-4 4"/></g>',
  symmetry: '<path d="M21 4v34" stroke="#ffb03a" stroke-width="1.3" stroke-dasharray="3 3"/><g fill="#fff"><circle cx="12" cy="16" r="3"/><circle cx="30" cy="16" r="3"/></g>',
  triangle: '<path d="M21 7L6 34h30z" fill="none" stroke="#ffb03a" stroke-width="1.3"/><g fill="#fff"><circle cx="21" cy="7" r="2"/><circle cx="6" cy="34" r="2"/><circle cx="36" cy="34" r="2"/></g>',
  frame: '<rect x="6" y="6" width="30" height="30" fill="none" stroke="#ffb03a" stroke-width="1.3"/><rect x="14" y="14" width="14" height="14" fill="none" stroke="#fff" stroke-width="1.1" opacity=".7"/>',
  fill: '<rect x="4" y="4" width="34" height="34" fill="none" stroke="#ffb03a" stroke-width="1.2"/><rect x="11" y="11" width="20" height="20" fill="#fff" opacity=".28"/>',
  rule: '<rect x="4" y="4" width="34" height="34" fill="none" stroke="#6b6b72"/><circle cx="9" cy="21" r="3.4" fill="#fff"/><path d="M14 21h16" stroke="#ffb03a" stroke-width="1.3" stroke-dasharray="2 3"/>',
};

function renderCompList() {
  const box = $('compList');
  box.innerHTML = '';
  COMPOSITIONS.forEach(c => {
    const el = document.createElement('button');
    el.className = 'comp-item' + (S.comp === c.id ? ' is-active' : '');
    el.innerHTML = `
      <svg viewBox="0 0 42 42">${COMP_SVG[c.id] || COMP_SVG.auto}</svg>
      <div class="ci"><div class="cn">${c.name}</div><div class="cd">${c.desc}</div></div>`;
    el.addEventListener('click', () => selectComp(c.id));
    box.appendChild(el);
  });
}

function openCreate(tab = 'style') {
  thumbCache = snapshotThumb();
  $('createSheet').hidden = false;
  switchTab(tab);
  renderStyleGrid();
  renderFilterGroups();
  renderFilterGrid();
  renderCompList();
}

function switchTab(tab) {
  document.querySelectorAll('#createTabs .tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.tab === tab);
  });
  $('paneStyle').hidden = tab !== 'style';
  $('paneFilter').hidden = tab !== 'filter';
  $('paneComp').hidden = tab !== 'comp';
  $('createSub').textContent = tab === 'style' ? '一个风格 = 滤镜 + 画幅 + 拍摄模式 + 构图'
    : tab === 'filter' ? '54 组，含胶片模拟与流行色调'
    : '12 种构图法，选中即画在取景框上';
}

function selectFilter(key) {
  S.filter = key;
  S.styleKey = null;
  $('filterName').textContent = key === 'none' ? '创作' : FILTERS[key].name;
  renderFilterGrid();
  renderStyleGrid();
  toast(`滤镜 · ${FILTERS[key].name}`);
}

function applyStyle(key) {
  const st = STYLES[key];
  if (!st) return;
  S.styleKey = key;
  S.filter = st.filter;
  S.mode = st.mode;
  S.comp = st.comp;
  if (S.ratio !== st.ratio) {
    S.ratio = st.ratio;
    $('btnRatio').textContent = S.ratio;
    $('optRatio').value = S.ratio;
    layout();
  }
  document.querySelectorAll('.mode').forEach(x => x.classList.toggle('is-active', x.dataset.mode === S.mode));
  $('filterName').textContent = st.name;
  renderStyleGrid();
  renderCompList();
  toast(`风格 · ${st.name}：${st.tip}`);
}

function selectComp(id) {
  S.comp = id;
  renderCompList();
  const c = COMPOSITIONS.find(x => x.id === id);
  toast(`构图 · ${c ? c.name : id}${c ? '：' + c.desc : ''}`);
}

/* ===================== UI 绑定 ===================== */
function toast(msg, ms = 1900) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

async function boot() {
  $('gate').hidden = true;
  $('viewfinder').hidden = false;
  S.running = true;
  layout();
  requestAnimationFrame(loop);
}

async function startCamera() {
  try {
    $('btnStart').textContent = '正在启动…';
    await camera.start({ facing: 'environment' });
    S.demo = false;
    $('video').hidden = false;
    $('demoCanvasWrap').hidden = true;
    $('video').classList.toggle('mirror', false);
    S.hasGyro = await initGyro();
    renderCaps();
    await boot();
    toast(`已连接 ${camera.size.w}×${camera.size.h}`);
  } catch (e) {
    console.error(e);
    $('btnStart').textContent = '开启相机';
    $('gateFine').textContent = `无法访问相机（${e.name || '错误'}）。可先试演示画面，或检查浏览器权限。`;
    toast('相机启动失败，可用演示画面体验');
  }
}

async function initGyro() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p !== 'granted') return false;
    }
    window.addEventListener('deviceorientation', e => {
      if (e.gamma === null) return;
      S.hasGyro = true;
      // 竖屏下的滚转角近似
      const beta = e.beta || 0;
      const g = e.gamma || 0;
      S.tilt = Math.abs(beta) > 120 ? (g > 0 ? 180 - g : -180 - g) : g;
    }, true);
    return true;
  } catch { return false; }
}

function renderCaps() {
  const box = $('capsList');
  const items = describeCaps(camera.caps);
  box.innerHTML = items.map(i => `<span class="${i.ok ? 'on' : 'off'}">${i.label}${i.ok ? ' ✓' : ' ·'}</span>`).join('');
  if (camera.caps.zoom) {
    document.querySelectorAll('.zoom-bar .z').forEach(b => {
      b.disabled = Number(b.dataset.z) > camera.caps.zoom.max;
    });
  }
}

function bindUI() {
  $('btnStart').addEventListener('click', startCamera);
  $('btnDemo').addEventListener('click', async () => {
    S.demo = true;
    $('gate').hidden = true;
    $('viewfinder').hidden = false;
    $('video').hidden = true;
    $('demoCanvasWrap').hidden = false;
    const c = $('demoCanvas');
    c.width = 720; c.height = 1280;
    S.hasGyro = false;
    await boot();
    toast('演示画面：运动主体会来回跑');
  });

  $('btnClose').addEventListener('click', () => {
    S.running = false;
    camera.stop();
    $('viewfinder').hidden = true;
    $('gate').hidden = false;
    $('panel').hidden = true;
  });

  $('btnSettings').addEventListener('click', () => {
    $('panel').hidden = false;
    renderCaps();
  });
  $('btnPanelClose').addEventListener('click', () => { $('panel').hidden = true; });

  $('btnFlip').addEventListener('click', async () => {
    if (S.demo) { toast('演示模式下不能切换镜头'); return; }
    const next = camera.facing === 'environment' ? 'user' : 'environment';
    try {
      await camera.start({ facing: next });
      $('video').classList.toggle('mirror', next === 'user');
      analyzer.reset();
      S.hwEv = false;
      renderCaps();
      toast(next === 'user' ? '前置镜头' : '后置镜头');
    } catch (e) { toast('切换失败'); }
  });

  $('btnGrid').addEventListener('click', () => {
    const order = ['thirds', 'golden', 'center', 'none'];
    S.grid = order[(order.indexOf(S.grid) + 1) % order.length];
    $('gridLayer').dataset.mode = S.grid;
    $('optGrid').value = S.grid;
    toast(`网格：${({ thirds: '三分法', golden: '黄金分割', center: '中心十字', none: '关闭' })[S.grid]}`);
  });

  $('btnRatio').addEventListener('click', () => {
    const order = ['4:3', '16:9', '1:1', '9:16'];
    S.ratio = order[(order.indexOf(S.ratio) + 1) % order.length];
    $('btnRatio').textContent = S.ratio;
    $('optRatio').value = S.ratio;
    layout();
    toast(`画幅 ${S.ratio}`);
  });

  $('btnTorch').addEventListener('click', async () => {
    if (S.demo) { toast('演示模式不支持补光'); return; }
    S.torch = !S.torch;
    const r = await camera.apply({ torch: S.torch }, { throttle: 0 });
    if (!r.applied.includes('torch')) { toast('这台设备不支持常亮补光'); S.torch = false; }
    $('btnTorch').classList.toggle('is-on', S.torch);
  });

  $('btnExposure').addEventListener('click', () => {
    const steps = [0, 0.3, 0.7, -0.3, -0.7];
    S.evBias = steps[(steps.indexOf(S.evBias) + 1) % steps.length];
    $('btnExposure').textContent = `${S.evBias > 0 ? '+' : ''}${S.evBias.toFixed(1)}`;
    $('optEv').value = S.evBias;
    $('evVal').textContent = `${S.evBias > 0 ? '+' : ''}${S.evBias.toFixed(1)}`;
  });

  $('btnAuto').addEventListener('click', () => {
    S.auto = !S.auto;
    $('btnAuto').classList.toggle('is-on', S.auto);
    toast(S.auto ? '自动抓拍已开：构图到位自动按快门' : '自动抓拍已关');
  });

  document.querySelectorAll('.mode').forEach(b => {
    b.addEventListener('click', () => {
      S.mode = b.dataset.mode;
      document.querySelectorAll('.mode').forEach(x => x.classList.toggle('is-active', x === b));
      b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      toast(`${MODES[S.mode].name}模式 · ${modeTip(S.mode)}`);
    });
  });

  const zoomBar = $('zoomBar');
  const wakeZoom = () => {
    zoomBar.style.opacity = '1';
    clearTimeout(wakeZoom._t);
    wakeZoom._t = setTimeout(() => { zoomBar.style.opacity = '0.3'; }, 3600);
  };
  zoomBar.addEventListener('pointerdown', wakeZoom);
  zoomBar.addEventListener('pointerenter', wakeZoom);
  wakeZoom();

  document.querySelectorAll('.zoom-bar .z').forEach(b => {
    b.addEventListener('click', async () => {
      S.zoom = Number(b.dataset.z);
      if (S.demo) return;
      const r = await camera.apply({ zoom: S.zoom }, { throttle: 0 });
      if (!r.applied.includes('zoom')) toast('这台设备不支持数字变焦');
    });
  });

  // 快门：点击单拍 / 长按连拍
  const shutter = $('btnShutter');
  let holdTimer = null, holdFired = false;
  shutter.addEventListener('pointerdown', () => {
    holdFired = false;
    holdTimer = setTimeout(() => { holdFired = true; burst(12); }, 420);
  });
  shutter.addEventListener('pointerup', () => {
    clearTimeout(holdTimer);
    if (!holdFired) {
      // 运动模式：单击即连拍选优；其他模式单拍
      if (S.mode === 'sport') burst(10); else capture('manual');
    }
  });
  shutter.addEventListener('pointerleave', () => clearTimeout(holdTimer));

  $('btnGallery').addEventListener('click', () => {
    $('gallery').hidden = false;
    renderGallery();
  });
  $('btnGalleryClose').addEventListener('click', () => { $('gallery').hidden = true; });

  $('btnFilter').addEventListener('click', () => openCreate('style'));
  $('btnCreateClose').addEventListener('click', () => { $('createSheet').hidden = true; });
  document.querySelectorAll('#createTabs .tab').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  $('btnBurstClose').addEventListener('click', () => { $('burstSheet').hidden = true; S.burst = []; });
  $('btnBurstSave').addEventListener('click', async () => {
    await saveBurst(S.burstBest);
    $('burstSheet').hidden = true;
  });
  $('btnBurstAll').addEventListener('click', async () => {
    for (let i = 0; i < S.burst.length; i++) await saveBurst(i);
    $('burstSheet').hidden = true;
    toast(`已保存 ${S.burst.length} 张`);
  });

  $('btnViewerClose').addEventListener('click', () => { $('viewer').hidden = true; });
  $('btnViewerSave').addEventListener('click', () => savePhoto(viewing));

  // 设置项
  const bindCheck = (id, key, cb) => {
    const el = $(id);
    el.checked = !!S.opts[key];
    el.addEventListener('change', () => {
      S.opts[key] = el.checked;
      if (cb) cb(el.checked);
    });
  };
  bindCheck('optGuide', 'guide');
  bindCheck('optLevel', 'level');
  bindCheck('optSubject', 'subject');
  bindCheck('optTrack', 'track');
  bindCheck('optAe', 'ae', v => { if (!v) S.gain = 1; });
  bindCheck('optAwb', 'awb');
  bindCheck('optFast', 'fast');
  bindCheck('optHw', 'hw', async v => { if (!v) { S.hwEv = false; await camera.autoAll(); } });
  bindCheck('optWatermark', 'watermark');
  bindCheck('optHaptic', 'haptic');

  $('optEv').addEventListener('input', e => {
    S.evBias = Number(e.target.value);
    $('evVal').textContent = `${S.evBias > 0 ? '+' : ''}${S.evBias.toFixed(1)}`;
    $('btnExposure').textContent = `${S.evBias > 0 ? '+' : ''}${S.evBias.toFixed(1)}`;
  });

  $('optGrid').addEventListener('change', e => {
    S.grid = e.target.value;
    $('gridLayer').dataset.mode = S.grid;
  });
  $('optRatio').addEventListener('change', e => {
    S.ratio = e.target.value;
    $('btnRatio').textContent = S.ratio;
    layout();
  });

  // 点击取景框对焦 + 长按锁定主体
  let pressTimer = null;
  $('video').addEventListener('pointerdown', e => {
    const rect = stage.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    pressTimer = setTimeout(() => {
      lockSubject(nx, ny);
      pressTimer = null;
    }, 480);
  });
  $('video').addEventListener('pointerup', async e => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (S.demo) return;
    const rect = stage.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const ok = await camera.focusAt(nx, ny);
    if (!ok) toast('这台设备不支持点对焦，靠近主体即可');
  });

  window.addEventListener('keydown', e => {
    if (!S.running) return;
    if (e.code === 'Space') { e.preventDefault(); capture('manual'); }
    if (e.key === 'g') $('btnGrid').click();
    if (e.key === 'f') openCreate('filter');
  });

  window.addEventListener('resize', () => { layout(); });
}

function lockSubject(nx, ny) {
  if (S.locked) {
    S.locked = null;
    analyzer.reset();
    toast('已取消主体锁定，回到自动识别');
    return;
  }
  const w = 0.26, h = 0.36;
  S.locked = {
    x: clamp(nx - w / 2, 0, 1 - w),
    y: clamp(ny - h / 2, 0, 1 - h),
    w, h, cx: clamp(nx, 0, 1), cy: clamp(ny, 0, 1),
    area: 0.24, locked: true,
  };
  analyzer.smoothBox = S.locked;
  analyzer.missCount = 0;
  toast('已锁定这个主体 · 再长按一次可取消');
}

function modeTip(m) {
  return {
    smart: '自动判断场景',
    sport: '高快门 + 运动预测',
    portrait: '主体留白与柔光',
    landscape: '水平线优先',
    night: '提亮暗部',
    macro: '最近对焦与清晰度',
    food: '色彩与背景干净',
  }[m] || '';
}

/* ===================== 启动 ===================== */
window.addEventListener('error', e => {
  document.body.dataset.err = ((document.body.dataset.err || '') + '|' + (e.message || 'err')).slice(-400);
});
window.addEventListener('unhandledrejection', e => {
  document.body.dataset.err = ((document.body.dataset.err || '') + '|rej:' + (e.reason && e.reason.message || e.reason)).slice(-400);
});

bindUI();
$('gridLayer').dataset.mode = S.grid;
$('filterName').textContent = S.filter === 'none' ? '创作' : FILTERS[S.filter].name;

if (!DEBUG && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
if (DEBUG && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}

if (DEBUG) window.__CF = { S, capture, burst, camera, analyzer };

// 便于预览与测试：?demo=1 直接进入演示画面
if (new URLSearchParams(location.search).get('demo') === '1') {
  setTimeout(() => $('btnDemo').click(), 60);
}
