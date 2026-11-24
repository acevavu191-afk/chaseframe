/**
 * app.js — 追帧 ChaseFrame 主控
 */
import { FrameAnalyzer, measureSharp } from './vision.js';
import { PLATFORM, tagPlatform, vibrate as pVibrate, shouldPromptInstall, saveHint, pickVideoMime, resolutionPref, setResolutionPref } from './platform.js';
import { evaluate, guideTarget, MODES, COMPOSITIONS, exposureAdvice, shutterAdvice, predictSubject } from './compose.js';
import { decideShot, shotAdvice, shotPercent, recommendFilters, SHOTS } from './smart.js';
import { Camera, describeCaps } from './camera.js';
import { FILTERS, FILTER_FAMILIES, FILTER_COUNT, FEATURED, STYLES, filterCss, buildFilter, finishCanvas, canvasToBlob, downloadBlob, shareBlob, saveToDevice, hasNative, stamp } from './filters.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const S = {
  mode: 'smart',
  grid: 'thirds',
  ratio: '4:3',
  filter: 'none',
  styleKey: null,
  filterGroup: 'feat',
  filterQuery: '',
  filterLimit: 36,
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
  // 自动抓拍开关放在 opts 里，设置面板可直接绑定
  opts: {
    guide: true, level: true, subject: true, track: true,
    ae: true, awb: true, fast: true, hw: true,
    watermark: false, haptic: true, auto: false, autoZoom: true,
  },
  a: null,
  ev: null,
  lastShotAt: 0,
  readyStreak: 0,
  gain: 1,
  hwEv: false,
  locked: null,
  capture: 'photo',
  simple: true,
  targetLock: null,
  targetMiss: 0,
  lockHintShown: false,
  targetAvoid: null,
  shot: null,
  digitalZoom: 1,
  zoomManualUntil: 0,
  lastAutoZoom: 0,
  recs: [],
  recAt: 0,
  recKey: '',
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

  // 数码变焦：等于把画面放大，取景/裁切/抓帧都跟着同一比例走
  const dz = S.digitalZoom || 1;
  const scale = Math.max(cw / vw, ch / vh) * dz;
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
let anaCost = 8, anaInterval = 42;   // 自适应分析节流：跟着单帧开销走

function loop(ts) {
  if (!S.running) return;
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
  lastTs = ts;

  if (S.demo) { demo.step(dt); demo.draw(720, 1280); }

  if (ts - lastAnalysis > anaInterval) {
    lastAnalysis = ts;
    const tAna = performance.now();
    runAnalysis(ts);
    // 目标约 25–30fps：单帧越贵越保守，低端机自动降频，高端机跑满
    anaCost = anaCost * 0.75 + (performance.now() - tAna) * 0.25;
    anaInterval = Math.max(24, Math.min(56, anaCost * 1.6));
    if (DEBUG) window.__ana = { cost: +anaCost.toFixed(1), interval: +anaInterval.toFixed(0) };
  }
  drawOverlay(ts);

  if (S.locked && ts - (S.lockedAt || 0) > 10000) {
    S.locked = null;
    S.lockedAt = 0;
    analyzer.reset();
    resetTarget();
    toast('锁定已自动解除');
  }
  if (ts - lastWatch > 1100) {
    lastWatch = ts;
    watchdog(ts);
  }

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
  S.frameAt = ts;
  if (DEBUG) window.__dbg = { miss: analyzer.missCount, sb: analyzer.smoothBox ? +analyzer.smoothBox.cx.toFixed(3) : null, subj: a.subject ? +a.subject.cx.toFixed(3) : null, same: analyzer === __CF.analyzer };

  // ---- 构图目标锁定 ----
  // 目标点只在"第一次认出主体"时定一次，之后固定在画面坐标里。
  // 否则每帧按主体位置重新挑点，用户一平移手机，方框就跟着主体跑。
  if (!S.targetLock) {
    if (a.subject) {
      const t = guideTarget(a.subject, S.mode, a.motion, S.comp, S.lookDir, 0.1, S.targetAvoid);
      S.targetAvoid = null;
      if (t) {
        S.targetLock = { x: t.x, y: t.y, tpl: t.tpl };
        if (!S.lockHintShown) {
          S.lockHintShown = true;
          setTimeout(() => {
            if (S.targetLock) toast('构图目标已固定，点方框可以换一个', 3200);
          }, 1900);
        }
      }
    }
    S.targetMiss = 0;
  } else if (a.subject) {
    S.targetMiss = 0;
  } else if (++S.targetMiss > 70) {
    // 主体消失了足够久（约 3 秒），才允许换一个目标位置
    S.targetLock = null;
    S.targetMiss = 0;
  }

  const ev = evaluate(a, {
    mode: S.mode, tilt: S.tilt, evBias: S.evBias, hasGyro: S.hasGyro,
    comp: S.comp, lookDir: S.lookDir,
    forceTarget: S.targetLock,
  });
  S.ev = ev;

  // ---- 景别自动判定：近/中/远由场景决定，不需要用户手动选 ----
  S.shot = decideShot(a, { mode: S.mode, prev: S.shot });
  if (S.shot && S.shot.action !== 'hold' && ev.hasSubject) {
    // 距离没到位时，别让分数谎报"可以按快门"
    const cap = S.shot.gap > 0.12 ? 66 : 74;
    if (ev.score > cap) ev.score = cap;
    ev.ready = false;
    ev.title = shotAdvice(S.shot);
    ev.detail = `主体占 ${Math.round(S.shot.box * 100)}%，建议 ${shotPercent(S.shot)}`;
    ev.detailCls = '';
  }

  // ---- 智能滤镜推荐（画面变了才重算，1 秒一次足够） ----
  if (ts - S.recAt > 900) {
    S.recAt = ts;
    const recs = recommendFilters(a, { mode: S.mode, shot: S.shot });
    const topKey = recs[0] ? recs[0].key : '';
    S.recs = recs;
    if (topKey !== S.recKey) {
      S.recKey = topKey;
      renderFilterStrip();
      if (!$('createSheet').hidden) renderRecBar();
    }
  }

  maybeAutoZoom(ts);

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
  if (S.opts.auto && S.opts.guide && ev.ready && !S.busy && ts - S.lastShotAt > 2600) {
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
function mirrored() {
  return !S.demo && camera.facing === 'user';
}

function toScreen(nx, ny) {
  if (!L) return { x: 0, y: 0 };
  // 前置镜头预览用 CSS 镜像过，覆盖层坐标必须一起翻，否则圈会朝反方向跑
  const x = mirrored() ? (1 - nx) : nx;
  return { x: L.rect.x + x * L.rect.w, y: L.rect.y + ny * L.rect.h };
}

function drawOverlay(ts) {
  if (!L) {
    octx.save();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.restore();
    return;
  }
  octx.clearRect(0, 0, L.cw, L.ch);
  const a = S.a, ev = S.ev;
  if (!a || !ev) return;

  const accent = ev.score >= 86 ? '#58d68d' : ev.score >= 70 ? '#ffb03a' : '#ff8a5c';

  drawCompGuide();

  // ---- 方框（目标）+ 圆圈（主体中心）：把手机移过去，让圆圈进框 ----
  if (S.opts.guide && (a.subject || (S.targetLock && ev.target))) {
    const sc = a.subject ? toScreen(a.subject.cx, a.subject.cy) : null;
    const tc = toScreen(ev.target.x, ev.target.y);
    const ringR = Math.max(12, L.rect.w * 0.042);
    const half = targetHalfPx();
    const dist0 = sc ? Math.hypot(sc.x - tc.x, sc.y - tc.y) : 999;
    const inside = !!sc && dist0 < half * 0.6;
    // 只有构图分真的到位才变绿，避免"看着进框了但其实不行"
    const ok = !!sc && ev.score >= 86 && inside;
    const accent = ok ? '#58d68d' : '#ffb03a';

    octx.save();
    const x0 = tc.x - half, y0 = tc.y - half, side = half * 2;

    // 半透明底 + 四角括号：在任何背景上都能看清这是个"槽位"
    octx.fillStyle = ok ? 'rgba(24,64,42,.3)' : 'rgba(10,10,12,.36)';
    octx.fillRect(x0, y0, side, side);
    octx.shadowColor = 'rgba(0,0,0,.75)';
    octx.shadowBlur = 4;
    octx.strokeStyle = accent;
    octx.lineWidth = 2;
    const corner = Math.min(16, side * 0.28);
    octx.beginPath();
    octx.moveTo(x0, y0 + corner); octx.lineTo(x0, y0); octx.lineTo(x0 + corner, y0);
    octx.moveTo(x0 + side - corner, y0); octx.lineTo(x0 + side, y0); octx.lineTo(x0 + side, y0 + corner);
    octx.moveTo(x0 + side, y0 + side - corner); octx.lineTo(x0 + side, y0 + side); octx.lineTo(x0 + side - corner, y0 + side);
    octx.moveTo(x0 + corner, y0 + side); octx.lineTo(x0, y0 + side); octx.lineTo(x0, y0 + side - corner);
    octx.stroke();
    octx.globalAlpha = 0.35;
    octx.setLineDash([4, 6]);
    octx.strokeRect(x0, y0, side, side);
    octx.setLineDash([]);
    octx.globalAlpha = 1;

    // 标签贴在方框上方，太靠上就放到框内下方
    const tlabel = ok ? '到位 ✓' : (sc ? '把圈移进框' : '把主体移进框');
    octx.font = '600 10px -apple-system, system-ui, sans-serif';
    const tlw = octx.measureText(tlabel).width;
    octx.fillStyle = ok ? 'rgba(88,214,141,.95)' : 'rgba(255,176,58,.95)';
    const ly = y0 - 17 > L.rect.y ? y0 - 17 : y0 + side + 1;
    octx.fillRect(x0, ly, tlw + 10, 15);
    octx.fillStyle = '#241300';
    octx.fillText(tlabel, x0 + 5, ly + 11);

    // 方框中心准星
    octx.strokeStyle = accent;
    octx.lineWidth = 1.6;
    octx.beginPath();
    octx.moveTo(tc.x - 6, tc.y); octx.lineTo(tc.x + 6, tc.y);
    octx.moveTo(tc.x, tc.y - 6); octx.lineTo(tc.x, tc.y + 6);
    octx.stroke();

    // 目标位置的"虚影圆圈"：直白表达"把圈移到这儿"
    if (!ok) {
      octx.setLineDash([3, 4]);
      octx.globalAlpha = 0.55;
      octx.beginPath(); octx.arc(tc.x, tc.y, ringR, 0, 7); octx.stroke();
      octx.globalAlpha = 1;
      octx.setLineDash([]);
    }

    // 主体中心圆圈（只有认出主体时才画）
    if (sc) {
      octx.shadowColor = 'rgba(0,0,0,.75)';
      octx.shadowBlur = 4;
      octx.strokeStyle = ok ? '#58d68d' : 'rgba(255,255,255,.95)';
      octx.lineWidth = 2.2;
      octx.beginPath(); octx.arc(sc.x, sc.y, ringR, 0, 7); octx.stroke();
      octx.fillStyle = ok ? '#58d68d' : 'rgba(255,255,255,.95)';
      octx.beginPath(); octx.arc(sc.x, sc.y, 2.6, 0, 7); octx.fill();
    }

    // 方向箭头：从圆圈指向方框
    if (sc && !ok && dist0 > ringR + half * 0.6) {
      const ang = Math.atan2(tc.y - sc.y, tc.x - sc.x);
      const sx = sc.x + Math.cos(ang) * (ringR + 4);
      const sy = sc.y + Math.sin(ang) * (ringR + 4);
      const ex = tc.x - Math.cos(ang) * (half * 0.95);
      const ey = tc.y - Math.sin(ang) * (half * 0.95);
      octx.strokeStyle = 'rgba(255,255,255,.8)';
      octx.lineWidth = 2.4;
      octx.setLineDash([7, 7]);
      octx.beginPath(); octx.moveTo(sx, sy); octx.lineTo(ex, ey); octx.stroke();
      octx.setLineDash([]);
      octx.beginPath();
      octx.moveTo(ex, ey);
      octx.lineTo(ex - Math.cos(ang - 0.45) * 13, ey - Math.sin(ang - 0.45) * 13);
      octx.moveTo(ex, ey);
      octx.lineTo(ex - Math.cos(ang + 0.45) * 13, ey - Math.sin(ang + 0.45) * 13);
      octx.strokeStyle = accent;
      octx.lineWidth = 2.6;
      octx.stroke();
    }
    octx.restore();
  }

  // ---- 运动：轨迹 + 预测 ----
  if (a.motion && S.opts.track && !S.simple) {
    const m = a.motion;
    const m0 = toScreen(m.x, m.y), m1 = toScreen(m.x + m.w, m.y + m.h);
    octx.save();
    octx.globalAlpha = 0.4;
    octx.strokeStyle = 'rgba(90,220,255,.85)';
    octx.lineWidth = 1;
    octx.setLineDash([3, 5]);
    octx.strokeRect(m0.x, m0.y, m1.x - m0.x, m1.y - m0.y);
    octx.setLineDash([]);
    octx.globalAlpha = 1;

    // 速度矢量
    const c = toScreen(m.cx, m.cy);
    octx.beginPath();
    octx.moveTo(c.x, c.y);
    octx.lineTo(c.x + m.vx * 0.16 * L.rect.w, c.y + m.vy * 0.16 * L.rect.h);
    octx.strokeStyle = 'rgba(90,220,255,.9)';
    octx.lineWidth = 2;
    octx.stroke();

    // 预测框
    for (const hz of [0.2]) {
      const p = predictSubject(m, hz);
      if (!p) continue;
      const q0 = toScreen(p.x0, p.y0);
      const q1 = toScreen(p.x0 + p.w, p.y0 + p.h);
      octx.globalAlpha = 0.5;
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

/** 换一个构图目标位置：主体重新定位、切换场景/构图时调用 */
function resetTarget(quiet = true) {
  S.targetLock = null;
  S.targetMiss = 0;
  S.readyStreak = 0;
  if (!quiet) toast('已换一个构图目标');
}

function targetHalfPx() {
  return L ? Math.max(24, L.rect.w * 0.095) : 32;
}

function drawCompGuide() {
  if (!S.opts.guide || S.comp === 'auto' || !L) return;
  const r = L.rect;
  const at = (nx, ny) => [r.x + nx * r.w, r.y + ny * r.h];
  octx.save();
  // 前置镜头整体镜像时，参考线在矩形内也镜像一次即可（这里没有文字）
  if (mirrored()) {
    octx.translate(r.x * 2 + r.w, 0);
    octx.scale(-1, 1);
  }
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
    case 'scurve': {
      octx.beginPath();
      octx.moveTo(r.x + r.w * 0.78, r.y + r.h * 0.08);
      octx.bezierCurveTo(r.x + r.w * 0.2, r.y + r.h * 0.3, r.x + r.w * 0.95, r.y + r.h * 0.55, r.x + r.w * 0.34, r.y + r.h * 0.92);
      octx.stroke();
      break;
    }
    case 'negative':
      octx.strokeRect(r.x + r.w * 0.5, r.y + r.h * 0.2, r.w * 0.42, r.h * 0.55);
      break;
    case 'layer':
      for (const y of [0.24, 0.52, 0.8]) hline(y);
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
  updateBigHint();

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

  const lockChip = $('lockChip');
  if (lockChip) {
    const left = S.locked ? Math.max(0, Math.ceil((10000 - (performance.now() - (S.lockedAt || 0))) / 1000)) : 0;
    lockChip.hidden = !S.locked;
    if (S.locked) lockChip.textContent = `🔒 ${left}s · 解锁`;
  }

  const zoomChip = $('zoomChip');
  if (zoomChip) {
    const zOn = S.zoom > 1.05;
    zoomChip.hidden = !zOn;
    if (zOn) zoomChip.textContent = `${S.zoom.toFixed(1)}×`;
  }

  const shotEl = $('exifShot');
  if (shotEl) {
    const shot = S.shot;
    shotEl.textContent = shot
      ? `${shot.name}·${shot.action === 'closer' ? '再近' : shot.action === 'back' ? '退后' : '自动'}`
      : '景别 —';
    shotEl.classList.toggle('closer', !!shot && shot.action === 'closer');
    shotEl.classList.toggle('back', !!shot && shot.action === 'back');
  }

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
  if (S.opts.haptic) pVibrate(ms);
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
    cell.innerHTML = p.type === 'video'
      ? `<video src="${p.url}" muted playsinline></video><span class="vbadge">▶ 视频</span><span class="tag">${p.score}</span>`
      : `<img src="${p.url}" alt=""><span class="tag">${p.score}</span>`;
    cell.addEventListener('click', () => openViewer(p));
    grid.appendChild(cell);
  }
}

let viewing = null;
function openViewer(p) {
  viewing = p;
  const isVid = p.type === 'video';
  $('viewerImg').hidden = isVid;
  $('viewerVid').hidden = !isVid;
  if (isVid) {
    $('viewerVid').src = p.url;
    try { $('viewerVid').play().catch(() => {}); } catch {}
  } else {
    $('viewerImg').src = p.url;
  }
  const m = p.meta || {};
  $('viewerMeta').textContent = isVid
    ? `视频 · ${m.mode || ''}`
    : `${m.shutter || ''} · ISO${m.iso || ''} · ${m.mode || ''}`;
  $('viewer').hidden = false;
}

async function savePhoto(p) {
  if (!p) return;
  const name = `chaseframe_${stamp()}.${p.type === 'video' ? (p.ext || 'webm') : 'jpg'}`;
  const where = await saveToDevice(p.blob, name);
  toast(where === 'gallery' ? '已存入系统相册' : where === 'share' ? saveHint() : '已保存到下载目录');
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

const FAV_KEY = 'cf.fav';
let favSet = new Set();
try { favSet = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { favSet = new Set(); }
const saveFav = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favSet])); } catch {} };

function renderFilterGroups() {
  const box = $('filterGroups');
  box.innerHTML = '';
  FILTER_FAMILIES.forEach(g => {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (S.filterGroup === g.id ? ' is-active' : '');
    b.textContent = g.name;
    b.addEventListener('click', () => {
      S.filterGroup = g.id;
      S.filterLimit = 36;
      renderFilterGroups();
      renderFilterGrid();
    });
    box.appendChild(b);
  });
}

function filteredList() {
  let list = Object.entries(FILTERS);
  if (S.filterGroup === 'feat') {
    const set = new Set(FEATURED);
    list = list.filter(([k]) => set.has(k));
  } else if (S.filterGroup === 'fav') list = list.filter(([k]) => favSet.has(k));
  else if (S.filterGroup !== 'all') list = list.filter(([, f]) => f.family === S.filterGroup);
  const q = S.filterQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(([, f]) =>
      (f.name + ' ' + (f.short || '') + ' ' + (f.tag || '') + ' ' + f.family).toLowerCase().includes(q));
  }
  // 收藏的排前面，其余保持母版顺序
  list.sort((a, b) => (favSet.has(b[0]) ? 1 : 0) - (favSet.has(a[0]) ? 1 : 0));
  return list;
}

function renderFilterGrid() {
  const box = $('filterGrid');
  const thumb = thumbCache;
  const list = filteredList();
  const shown = list.slice(0, S.filterLimit);
  box.innerHTML = '';
  shown.forEach(([key, f]) => {
    const el = document.createElement('button');
    el.className = 'filter-item' + (S.filter === key ? ' is-active' : '');
    el.innerHTML = `
      ${thumb ? `<img src="${thumb}" style="filter:${f.css}" alt="">` : ''}
      <i style="${tintLayer(f)}"></i>
      <b class="fav ${favSet.has(key) ? 'on' : ''}">★</b>
      <span>${f.name}</span>`;
    el.addEventListener('click', () => selectFilter(key));
    el.querySelector('.fav').addEventListener('click', ev => {
      ev.stopPropagation();
      if (favSet.has(key)) favSet.delete(key); else favSet.add(key);
      saveFav();
      renderFilterGrid();
    });
    box.appendChild(el);
  });
  $('filterCount').textContent = `${FILTER_COUNT} 组 · 显示 ${shown.length}`;
  $('filterMore').hidden = list.length <= S.filterLimit;
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
  renderRecBar();
}

function switchTab(tab) {
  document.querySelectorAll('#createTabs .tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.tab === tab);
  });
  $('paneStyle').hidden = tab !== 'style';
  $('paneFilter').hidden = tab !== 'filter';
  $('paneComp').hidden = tab !== 'comp';
  $('createSub').textContent = tab === 'style' ? '一个风格 = 滤镜 + 画幅 + 拍摄模式 + 构图'
    : tab === 'filter' ? `${FILTER_COUNT} 组 · 可搜索、可收藏`
    : '12 种构图法，选中即画在取景框上';
}

function selectFilter(key) {
  S.filter = key;
  S.styleKey = null;
  $('filterName').textContent = key === 'none' ? '创作' : FILTERS[key].name;
  renderFilterGrid();
  renderStyleGrid();
  renderFilterStrip();
  if (!$('createSheet').hidden) renderRecBar();
  toast(`滤镜 · ${FILTERS[key].name}`);
}

function applyStyle(key) {
  const st = STYLES[key];
  if (!st) return;
  S.styleKey = key;
  S.filter = st.filter;
  S.mode = st.mode;
  S.comp = st.comp;
  S.targetLock = null;
  S.targetMiss = 0;
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
  S.targetLock = null;
  S.targetMiss = 0;
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
  applyUIMode();
  if (!ONBOARDED) $('onboard').hidden = false;
}

async function startCamera() {
  try {
    $('btnStart').textContent = '正在启动…';
    await camera.start({ facing: 'environment' });
    S.demo = false;
    $('video').hidden = false;
    $('demoCanvasWrap').hidden = true;
    S.zoom = 1;
    S.digitalZoom = 1;
    S.zoomManualUntil = 0;
    setDigitalScale(1);
    $('video').classList.toggle('mirror', false);
    S.hasGyro = await initGyro();
    renderCaps();
    await boot();
    applyUIMode();
    setTimeout(() => { stripThumb = null; renderFilterStrip(); }, 600);
    toast(`已连接 ${camera.size.w}×${camera.size.h}`);
    maybeInstallHint();
  } catch (e) {
    console.error(e);
    $('btnStart').textContent = '开启相机';
    $('gateFine').textContent = `无法访问相机（${e.name || '错误'}）。可先试演示画面，或检查浏览器权限。`;
    toast('相机启动失败，可用演示画面体验');
  }
}

/* ===================== 卡死自愈 ===================== */
let recovering = false;

async function recoverCamera(msg) {
  if (recovering || S.demo) return;
  recovering = true;
  try {
    if (msg) toast(msg, 3600);
    $('video').play().catch(() => {});
    try {
      await camera.start({ facing: camera.facing });
    } catch (e1) {
      // 常见于 4K 协商失败或相机被占用：退回自动分辨率再试
      setResolutionPref('auto');
      await new Promise(r => setTimeout(r, 450));
      await camera.start({ facing: camera.facing });
      const sel = $('optRes');
      if (sel) sel.value = 'auto';
    }
    $('video').classList.toggle('mirror', camera.facing === 'user');
    analyzer.reset();
    resetTarget();
    S.hwEv = false;
    S.zoom = 1;
    S.zoomManualUntil = 0;
    setDigitalScale(1);
    L = layout();
    renderCaps();
    await $('video').play().catch(() => {});
    toast(`取景已恢复 ${camera.size.w}×${camera.size.h}`, 2600);
  } catch (e) {
    toast('相机恢复失败，请下拉刷新页面', 6000);
  } finally {
    recovering = false;
    lastVideoTime = -1;
  }
}

let lastWatch = 0, lastVideoTime = -1, stallAt = 0;

function watchdog(ts) {
  if (S.demo || recovering) return;
  if (camera.busy && performance.now() - (camera.busyAt || 0) < 6000) return;   // 正在重开流，别插一脚
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const v = $('video');
  if (!v) return;
  const dead = !v.videoWidth || v.readyState < 2;
  const t = v.currentTime || 0;
  const frozen = !v.paused && lastVideoTime >= 0 && Math.abs(t - lastVideoTime) < 1e-4;
  lastVideoTime = t;
  if (dead || frozen) {
    recoverCamera(frozen ? '画面停住了，正在重启相机…' : '取景未就绪，正在重启相机…');
    return;
  }
  // 画面在动、但识别结果长时间不更新 → 重置分析器
  if (!S.a || ts - (S.frameAt || 0) > 2200) {
    if (!stallAt) stallAt = ts;
    else if (ts - stallAt > 1600) { stallAt = ts; analyzer.reset(); }
  } else {
    stallAt = 0;
  }
}

/** 切换分辨率：重开一次流（摄像头只能重新协商） */
async function applyResolution() {
  if (S.demo) { toast('演示模式下不改分辨率'); return; }
  const want = resolutionPref();
  const facing = camera.facing;
  try {
    toast('正在切换分辨率…');
    await camera.start({ facing });
    $('video').classList.toggle('mirror', facing === 'user');
    analyzer.reset();
    resetTarget();
    S.hwEv = false;
    S.zoom = 1;
    S.zoomManualUntil = 0;
    setDigitalScale(1);
    layout();
    renderCaps();
    const sz = camera.size;
    if (want === '4k' && sz.w < 3000) {
      toast(`这台设备给不到 4K，已用 ${sz.w}×${sz.h}`, 3600);
    } else {
      toast(`${sz.w}×${sz.h}`);
    }
  } catch (e) {
    await recoverCamera('切换失败，正在恢复取景…');
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

function applyUIMode() {
  $('viewfinder').classList.toggle('simple', S.simple);
  $('btnMode').textContent = S.simple ? '简易' : '专业';
  $('btnMode').classList.toggle('is-on', !S.simple);
  try { localStorage.setItem('cf.simple', S.simple ? '1' : '0'); } catch {}
  if (S.simple) renderFilterStrip();
}

const ARROW = { 左: '←', 右: '→', 上: '↑', 下: '↓', 左上: '↖', 右上: '↗', 左下: '↙', 右下: '↘' };

function updateBigHint() {
  const ev = S.ev;
  if (!ev) return;
  const box = $('bigHint');
  const arrowEl = $('bhArrow');
  const textEl = $('bhText');
  if (S.locked) {
    box.classList.remove('good');
    arrowEl.textContent = '🔒';
    const left = Math.max(0, Math.ceil((10000 - (performance.now() - (S.lockedAt || 0))) / 1000));
    textEl.textContent = `主体已锁定 ${left}s · 点顶部解锁`;
    return;
  }
  if (!ev.hasSubject) {
    box.classList.remove('good');
    arrowEl.textContent = '◎';
    textEl.textContent = '把想拍的东西放进画面';
    return;
  }
  if (ev.ready) {
    box.classList.add('good');
    arrowEl.textContent = '✓';
    textEl.textContent = '构图好了，按快门';
    return;
  }
  box.classList.remove('good');
  if (ev.moveDir) {
    arrowEl.textContent = ARROW[ev.moveDir] || '→';
    const big = ev.score < 55;
    textEl.textContent = big ? `往${ev.moveDir}多移一点` : `往${ev.moveDir}移一点`;
  } else if (S.shot && S.shot.action !== 'hold') {
    arrowEl.textContent = S.shot.action === 'closer' ? '＋' : '－';
    textEl.textContent = shotAdvice(S.shot);
  } else {
    arrowEl.textContent = '·';
    textEl.textContent = ev.detail;
  }
}

/* 滤镜速选条（Doka 风格） */
let stripThumb = null;
function renderFilterStrip() {
  const box = $('filterStrip');
  if (!box) return;
  if (!stripThumb) stripThumb = snapshotThumb();
  const picks = FEATURED.slice(0, 12);
  box.innerHTML = '';

  // 智能推荐排在最前面
  const rec = S.recs[0];
  if (rec && FILTERS[rec.key] && rec.key !== 'none') {
    const rf = FILTERS[rec.key];
    const el = document.createElement('button');
    el.className = 'fs-item rec' + (S.filter === rec.key ? ' is-active' : '');
    el.title = rec.why;
    const shortName = rec.name.replace(/ · .*/, '').split(' ')[0].slice(0, 9);
    el.innerHTML = `
      ${stripThumb ? `<img src="${stripThumb}" style="filter:${rf.css}" alt="">` : ''}
      <i style="${rf.tint ? `background:${rf.tint};mix-blend-mode:${rf.blend || 'soft-light'}` : ''}"></i>
      <b class="rec-flag">✦</b>
      <span>${shortName}</span>`;
    el.addEventListener('click', () => applyRec(rec));
    box.appendChild(el);
  }

  picks.forEach(key => {
    const f = FILTERS[key];
    if (!f) return;
    const el = document.createElement('button');
    el.className = 'fs-item' + (S.filter === key ? ' is-active' : '');
    el.innerHTML = `
      ${stripThumb ? `<img src="${stripThumb}" style="filter:${f.css}" alt="">` : ''}
      <i style="${f.tint ? `background:${f.tint};mix-blend-mode:${f.blend || 'soft-light'}` : ''}"></i>
      <span>${f.name.replace(/ · .*/, '')}</span>`;
    el.addEventListener('click', () => {
      S.filter = key;
      S.styleKey = null;
      $('filterName').textContent = f.name;
      renderFilterStrip();
      toast(`滤镜 · ${f.name}`);
    });
    box.appendChild(el);
  });
}

function applyRec(rec) {
  if (!rec || !FILTERS[rec.key]) return;
  S.filter = rec.key;
  S.styleKey = null;
  $('filterName').textContent = FILTERS[rec.key].name;
  renderFilterStrip();
  if (!$('createSheet').hidden) { renderFilterGrid(); renderRecBar(); }
  toast(`推荐 · ${rec.why || FILTERS[rec.key].name}`);
}

/** 创作面板里的三条推荐 */
function renderRecBar() {
  const box = $('recBar');
  if (!box) return;
  if (!S.recs.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'rec-head';
  head.innerHTML = `<b>按当前画面推荐</b><span>${S.shot ? S.shot.name + ' · ' + shotPercent(S.shot) : ''}</span>`;
  box.appendChild(head);
  const list = document.createElement('div');
  list.className = 'rec-list';
  S.recs.forEach((r, i) => {
    const f = FILTERS[r.key];
    if (!f) return;
    const el = document.createElement('button');
    el.className = 'rec-chip' + (S.filter === r.key ? ' is-active' : '');
    el.innerHTML = `
      <b>${i === 0 ? '最合适' : '也可以'}</b>
      <span>${f.name}</span>
      <i>${r.why}</i>`;
    el.addEventListener('click', () => applyRec(r));
    list.appendChild(el);
  });
  box.appendChild(list);
}

function maybeInstallHint() {
  if (!shouldPromptInstall()) return;
  if (sessionStorage.getItem('cf.installHint')) return;
  sessionStorage.setItem('cf.installHint', '1');
  setTimeout(() => toast('iOS：点底部「分享」→「添加到主屏幕」，就能全屏当 App 用', 6500), 1500);
}

function renderCaps() {
  const box = $('capsList');
  const items = describeCaps(camera.caps);
  const sz = camera.size;
  const resChip = !S.demo && sz && sz.w ? `<span class="on">输出 ${sz.w}×${sz.h}</span>` : '';
  box.innerHTML = resChip + items.map(i => `<span class="${i.ok ? 'on' : 'off'}">${i.label}${i.ok ? ' ✓' : ' ·'}</span>`).join('');
  if (camera.caps.zoom) {
    document.querySelectorAll('.zoom-bar .z').forEach(b => {
      b.disabled = Number(b.dataset.z) > camera.caps.zoom.max;
    });
  }
}

/* ===================== AI 构图：静态图片分析与方向指引 ===================== */
const AI_ZOOM = { loose: 0.2, mid: 0.32, tight: 0.46 };
const AI = { frame: null, a: null, subj: null, options: [], index: 0, zoom: 'mid', state: 'idle' };

function setAIState(state, text) {
  AI.state = state;
  const box = $('aiState');
  box.classList.toggle('busy', state === 'busy');
  box.classList.toggle('done', state === 'done');
  $('aiStateText').textContent = text;
  $('btnAIRe').disabled = state === 'busy';
  $('btnAIUse').disabled = state === 'busy';
  $('btnAIPick').disabled = state === 'busy';
}

function openAICompose() {
  const c = document.createElement('canvas');
  grabTo(c);
  if (!c || !c.width) { toast('画面还没准备好'); return; }
  $('aiSheet').hidden = false;
  $('aiSub').textContent = '静态图片 · 不追踪、不实时';
  analyzeStill(c);
}

/** 核心：对一张静态图做识别 + 构图诊断 + 方向指引 */
function analyzeStill(canvas) {
  setAIState('busy', '正在识别画面内容…');
  AI.frame = canvas;
  AI.options = [];
  AI.index = 0;
  $('aiCards').innerHTML = '';
  $('aiChips').innerHTML = '';
  $('aiIssues').innerHTML = '';
  $('aiMove').textContent = '分析中…';
  document.querySelectorAll('#aiDirs .dir').forEach(b => b.classList.remove('on'));
  $('aiDirCenter').textContent = '分析中';

  // 让"分析中"这一帧能画出来
  setTimeout(() => {
    const an = new FrameAnalyzer(208);
    an.reset();
    const a = an.analyze(canvas, performance.now());
    if (!a) { setAIState('idle', '这张图读不出来'); $('aiMove').textContent = '换一张试试。'; return; }
    AI.a = a;
    AI.subj = a.subject;
    // 景别自动判定：远景用松裁切、特写用紧裁切
    const shot = decideShot(a, { mode: S.mode });
    AI.zoom = shot.id === 'wide' ? 'loose' : shot.id === 'close' ? 'tight' : 'mid';
    document.querySelectorAll('#aiZoomSeg button').forEach(b => {
      b.classList.toggle('is-active', b.dataset.z === AI.zoom);
    });
    renderAIResult(a);
    buildAIOptions();
    setAIState('done', '分析完成 · 可继续调整');
  }, 60);
}

function pct(v) { return Math.round(v * 100); }

function renderAIResult(a) {
  const s = a.subject;
  const chips = [];
  const issues = [];
  const targetInfo = evaluate(
    { ...a, subject: s || { x: 0.32, y: 0.3, w: 0.36, h: 0.44, cx: 0.5, cy: 0.52, area: 0.16 } },
    { mode: S.mode, comp: S.comp, lookDir: S.lookDir, hasGyro: false, evBias: 0 }
  );

  // ---- 识别结果 ----
  if (s) {
    chips.push(`主体占画面 ${pct(s.w * s.h)}%`);
    const cxOff = s.cx - 0.5, cyOff = s.cy - 0.5;
    const posTxt = Math.abs(cxOff) < 0.08 && Math.abs(cyOff) < 0.08 ? '居中'
      : `${cxOff < 0 ? '偏左' : '偏右'}${Math.abs(cyOff) > 0.08 ? (cyOff < 0 ? '偏上' : '偏下') : ''}`;
    chips.push(`主体位置：${posTxt}`);

    const margins = { l: s.x, r: 1 - (s.x + s.w), t: s.y, b: 1 - (s.y + s.h) };
    const maxSide = Object.entries(margins).sort((x, y) => y[1] - x[1])[0];
    const sideName = { l: '左侧', r: '右侧', t: '上方', b: '下方' }[maxSide[0]];
    chips.push(`留白：${sideName} ${pct(maxSide[1])}%`);
    chips.push(`重心：${Math.abs(cxOff) < 0.08 ? '水平居中' : (cxOff < 0 ? '偏左' : '偏右')}`);
    chips.push(`背景${a.clutter > 0.5 ? '偏乱' : '干净'}`);
  } else {
    chips.push('未识别到明确主体');
    chips.push('建议：让主体更大、与背景有对比');
  }

  // ---- 构图诊断 ----
  if (s) {
    const boxArea = s.w * s.h;
    if (boxArea < 0.06) issues.push('主体偏小（不到 6%），看不清细节，靠近一点或放大');
    else if (boxArea > 0.6) issues.push('主体太满，边缘容易被切，退后一点');
    else issues.push({ good: true, t: '主体大小合适' });

    const dx = targetInfo.target.x - s.cx;
    const dy = targetInfo.target.y - s.cy;
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      issues.push(`主体没有落在${targetInfo.target.tpl.name}的视觉点上`);
    } else {
      issues.push({ good: true, t: `主体已在${targetInfo.target.tpl.name}的位置上` });
    }

    if (s.y > 0.42 && (1 - (s.y + s.h)) < 0.08) issues.push('底部太挤，脚下没有空间，抬高一点留出地面');
    if (s.y < 0.06) issues.push('顶部贴边，头上没有留白，压低一点');
    if (a.clutter > 0.55) issues.push('背景抢戏，换个角度或靠近让背景虚化');
    if (a.meanLum < 0.28) issues.push('整体偏暗，提亮或换个光位');
    if (a.meanLum > 0.72) issues.push('整体偏亮，高光有溢出风险');
    if (issues.length && issues.every(i => i.good)) issues.unshift({ good: true, t: '这张构图已经挺稳，可以直接出片' });
  }

  $('aiChips').innerHTML = chips.map(c => `<span>${c}</span>`).join('');
  $('aiIssues').innerHTML = issues.map(i => {
    if (typeof i === 'string') return `<li>${i}</li>`;
    return `<li class="${i.good ? 'good' : ''}">${i.t}</li>`;
  }).join('');

  // ---- 方向指引 ----
  const dirs = { up: 0, down: 0, left: 0, right: 0 };
  let main = '构图已经到位，稳住按快门';
  let sub = '';

  if (s) {
    const dx = targetInfo.target.x - s.cx;   // 主体需要移动的方向
    const dy = targetInfo.target.y - s.cy;
    // 手机移动方向 = 主体移动方向的反方向
    if (Math.abs(dx) > 0.035) { if (dx > 0) dirs.left = Math.abs(dx); else dirs.right = Math.abs(dx); }
    if (Math.abs(dy) > 0.035) { if (dy > 0) dirs.up = Math.abs(dy); else dirs.down = Math.abs(dy); }

    const parts = [];
    if (dirs.left) parts.push('左');
    if (dirs.right) parts.push('右');
    if (dirs.up) parts.push('上');
    if (dirs.down) parts.push('下');

    if (parts.length) {
      const mag = Math.max(dirs.left, dirs.right, dirs.up, dirs.down);
      const step = mag > 0.18 ? '一大步' : mag > 0.09 ? '一小步' : '一点点';
      const subjDir = [dx > 0.035 ? '右' : '', dx < -0.035 ? '左' : '', dy > 0.035 ? '下' : '', dy < -0.035 ? '上' : ''].join('');
      main = `手机向${parts.join('')}移${step}（约 ${pct(mag)}% 画面）`;
      sub = `主体会向${subjDir}移动，落到${targetInfo.target.tpl.name}的位置上；手移动方向与主体移动方向相反`;
    } else {
      main = '位置已经到位，稳住按快门';
      sub = `主体已在${targetInfo.target.tpl.name}的位置上`;
    }
  } else {
    main = '先让主体进入画面';
    sub = '找一个和背景有明显对比的物体，占画面 1/5 到 1/2 比较合适';
  }

  document.querySelectorAll('#aiDirs .dir').forEach(b => {
    b.classList.toggle('on', !!dirs[b.dataset.dir]);
  });
  $('aiDirCenter').textContent = s ? (targetInfo.target.tpl.name) : '无主体';
  $('aiMove').innerHTML = `<b>${main}</b>${sub ? `<br>${sub}` : ''}`;

  AI.guide = { dirs, main, sub };
  drawAIPreview();
}

function aiTargets() {
  const list = ['thirds', 'center', 'fill'];
  if (AI.a && AI.a.motion && AI.a.motion.speed > 0.06) list.push('leading');
  else list.push('negative');
  return list;
}

function computeCrop(subj, target, fillFrac, frameAspect) {
  const s = subj || { cx: 0.5, cy: 0.5, w: 0.36, h: 0.5, area: 0.18 };
  let cw = clamp(s.w / fillFrac, 0.34, 1);
  let ch = cw / frameAspect;
  if (ch > 1) { ch = 1; cw = ch * frameAspect; }
  const realW = Math.min(1, cw);
  const x = clamp(s.cx - target.x * realW, 0, 1 - realW);
  const y = clamp(s.cy - target.y * ch, 0, 1 - ch);
  return { x, y, w: realW, h: ch };
}

function buildAIOptions() {
  const f = AI.frame;
  const a = AI.a;
  if (!f || !a) return;
  const frameAspect = f.width / f.height;
  const fill = AI_ZOOM[AI.zoom];
  const cards = [];

  aiTargets().forEach(id => {
    const meta = COMPOSITIONS.find(c => c.id === id) || { name: id };
    const probe = evaluate(
      { ...a, subject: AI.subj || { x: 0.32, y: 0.3, w: 0.36, h: 0.44, cx: 0.5, cy: 0.52, area: 0.16 } },
      { mode: S.mode, comp: id, lookDir: S.lookDir, hasGyro: false, evBias: S.evBias }
    );
    const target = { x: probe.target.x, y: probe.target.y };
    const crop = computeCrop(AI.subj, target, fill, frameAspect);

    const th = document.createElement('canvas');
    th.width = 200;
    th.height = Math.max(2, Math.round(200 / frameAspect));
    th.getContext('2d').drawImage(
      f, crop.x * f.width, crop.y * f.height, crop.w * f.width, crop.h * f.height,
      0, 0, th.width, th.height
    );

    const newArea = AI.subj ? clamp(AI.subj.area / (crop.w * crop.h), 0.005, 0.95) : 0.16;
    const a2 = {
      ...a,
      subject: AI.subj
        ? { ...AI.subj, cx: target.x, cy: target.y, area: newArea,
            x: clamp(target.x - AI.subj.w / 2 / crop.w, 0, 1),
            y: clamp(target.y - AI.subj.h / 2 / crop.h, 0, 1),
            w: clamp(AI.subj.w / crop.w, 0.01, 1), h: clamp(AI.subj.h / crop.h, 0.01, 1) }
        : null,
    };
    const score = evaluate(a2, { mode: S.mode, comp: id, lookDir: S.lookDir, hasGyro: false, evBias: S.evBias });

    cards.push({
      id, name: meta.name, crop, thumb: th.toDataURL('image/jpeg', 0.72),
      score: score.score, detail: score.detail, target,
    });
  });

  cards.sort((x, y) => y.score - x.score);
  AI.options = cards;
  AI.index = 0;
  renderAICards();
}

function renderAICards() {
  const box = $('aiCards');
  box.innerHTML = '';
  AI.options.forEach((o, i) => {
    const el = document.createElement('button');
    el.className = 'ai-card' + (i === AI.index ? ' is-active' : '');
    el.innerHTML = `<img src="${o.thumb}" alt=""><div class="am"><div class="an">${o.name}</div><div class="as">构图 ${o.score}</div></div>`;
    el.addEventListener('click', () => {
      AI.index = i;
      renderAICards();
      drawAIPreview();
    });
    box.appendChild(el);
  });
  drawAIPreview();
}

function drawAIPreview() {
  const f = AI.frame;
  if (!f) return;
  const cv = $('aiCanvas');
  cv.width = f.width;
  cv.height = f.height;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  try { g.filter = buildFilter(1, S.filter); } catch {}
  g.drawImage(f, 0, 0);
  g.filter = 'none';

  const s = AI.subj;
  // 目标方框 + 主体圆圈
  if (s) {
    const ti = evaluate({ ...AI.a, subject: s }, { mode: S.mode, comp: S.comp, lookDir: S.lookDir, hasGyro: false });
    const half = Math.max(0.04, s.w * 0.55);
    const gx = ti.target.x - half, gy = ti.target.y - half;
    g.save();
    g.setLineDash([9, 8]);
    g.strokeStyle = 'rgba(255,176,58,.95)';
    g.lineWidth = Math.max(2, cv.width * 0.004);
    g.strokeRect(gx * cv.width, gy * cv.height, half * 2 * cv.width, half * 2 * cv.height);
    g.setLineDash([]);
    g.font = `600 ${Math.max(11, cv.width * 0.022)}px -apple-system, system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,176,58,.95)';
    g.fillText('把圆圈移进框', gx * cv.width + 2, Math.max(12, gy * cv.height - 5));
    // 圆圈
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.lineWidth = Math.max(2, cv.width * 0.004);
    const r = Math.max(10, cv.width * 0.035);
    g.beginPath();
    g.arc(s.cx * cv.width, s.cy * cv.height, r, 0, 7);
    g.stroke();
    g.restore();
  }

  // 主体框
  if (s) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = Math.max(2, cv.width * 0.004);
    g.strokeRect(s.x * cv.width, s.y * cv.height, s.w * cv.width, s.h * cv.height);
    // 构图重心
    g.strokeStyle = 'rgba(90,220,255,.95)';
    g.beginPath();
    const cx = s.cx * cv.width, cy = s.cy * cv.height, r = Math.max(5, cv.width * 0.012);
    g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
    g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
    g.stroke();
    g.restore();
  }

  // 选中的裁切方案
  const o = AI.options[AI.index];
  if (o) {
    g.save();
    g.setLineDash([4, 6]);
    g.strokeStyle = 'rgba(120,228,255,.42)';
    g.lineWidth = 1.4;
    g.strokeRect(o.crop.x * cv.width, o.crop.y * cv.height, o.crop.w * cv.width, o.crop.h * cv.height);
    g.restore();
  }

  const tag = s
    ? `主体 ${pct(s.w * s.h)}% · 重心 ${Math.round(s.cx * 100)},${Math.round(s.cy * 100)}`
    : '未识别到主体';
  $('aiTag').textContent = tag;
}

async function useAIOption() {
  if (!AI.frame) return;
  const f = AI.frame;
  const o = AI.options[AI.index];
  const out = document.createElement('canvas');
  const crop = o ? o.crop : { x: 0, y: 0, w: 1, h: 1 };
  out.width = Math.max(2, Math.round(crop.w * f.width));
  out.height = Math.max(2, Math.round(crop.h * f.height));
  const g = out.getContext('2d');
  if (g.filter !== undefined) g.filter = buildFilter(1, S.filter);
  g.drawImage(f, crop.x * f.width, crop.y * f.height, crop.w * f.width, crop.h * f.height,
    0, 0, out.width, out.height);
  finishCanvas(out.getContext('2d'), S.filter, metaNow(), S.opts.watermark);
  const blob = await canvasToBlob(out);
  if (!blob) return;
  addPhoto(blob, o ? o.score : 0);
  flash();
  vibrate(16);
  $('aiSheet').hidden = true;
  toast(o ? `已按「${o.name}」出片` : '已保存');
}

function loadAIImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxSide = 1600;
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(img.width * k));
    c.height = Math.max(2, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    $('aiSheet').hidden = false;
    $('aiSub').textContent = `本地图片 ${img.width}×${img.height}`;
    analyzeStill(c);
  };
  img.onerror = () => { toast('这张图打不开'); URL.revokeObjectURL(url); };
  img.src = url;
}

/* ===================== 变焦：硬件优先，数字兜底 ===================== */
function hwZoomMax() {
  const c = camera.caps || {};
  return c.zoom && c.zoom.max > 1.02 ? Math.min(8, c.zoom.max) : 0;
}

function zoomMax() {
  if (S.demo) return 2.5;
  // 硬件变焦可以用到 8×；纯数码变焦上限 2.2×，再高就只是糊
  return hwZoomMax() || 2.2;
}

function zoomMode() {
  if (S.demo) return 'digital';
  return hwZoomMax() ? 'hw' : 'digital';
}

function setDigitalScale(z) {
  S.digitalZoom = z;
  const v = String(Math.round(z * 1000) / 1000);
  const vid = $('video'), dm = $('demoCanvasWrap');
  if (vid) vid.style.setProperty('--z', v);
  if (dm) dm.style.setProperty('--z', v);
}

async function setZoom(z, { auto = false } = {}) {
  const v = clamp(z, 1, zoomMax());
  S.zoom = Math.round(v * 100) / 100;
  if (zoomMode() === 'hw') {
    setDigitalScale(1);
    try { await camera.apply({ zoom: S.zoom }, { throttle: 0 }); } catch {}
  } else {
    setDigitalScale(S.zoom);
  }
  layout();
  updateHud();
  if (auto) {
    if (zoomMode() === 'digital' && !S.digitalZoomNoted) {
      S.digitalZoomNoted = true;
      toast(`自动变焦 ${S.zoom.toFixed(1)}×（数码变焦，画质略降）`, 3200);
    } else {
      toast(`自动变焦 ${S.zoom.toFixed(1)}×`);
    }
  }
  return S.zoom;
}

/** 特写但主体太小 → 自动拉近（有上限、有冷却、手动操作会打断） */
function maybeAutoZoom(ts) {
  if (!S.opts.autoZoom) return;
  if (S.capture !== 'photo') return;
  if (REC && REC.rec) return;
  if (S.zoomManualUntil && ts < S.zoomManualUntil) return;
  const shot = S.shot;
  if (!shot || shot.id !== 'close' || shot.action !== 'closer') return;
  const max = zoomMax();
  if (max <= 1.02) return;
  const target = shot.band[0] * 1.06;
  const need = Math.sqrt(target / Math.max(0.006, shot.box));
  let want = Math.min(max, Math.max(1, need));
  want = Math.min(want, S.zoom * 1.8);      // 一次最多提 1.8 倍，别突然糊一片
  if (want < S.zoom * 1.22) return;         // 提升不明显就别动
  if (ts - S.lastAutoZoom < 1800) return;
  S.lastAutoZoom = ts;
  setZoom(want, { auto: true });
}

/* ===================== 视频模式：独立录制链路 ===================== */
const REC = { rec: null, chunks: [], canvas: null, raf: 0, t0: 0, timer: 0, audio: null, mime: '' };

function setCaptureMode(mode) {
  if (REC.rec) { toast('先停止录制'); return; }
  S.capture = mode;
  document.querySelectorAll('#capSeg button').forEach(b => {
    b.classList.toggle('is-active', b.dataset.cap === mode);
  });
  $('btnShutter').classList.toggle('recording', mode === 'video');
  toast(mode === 'video' ? '视频模式：点快门开始，再点停止' : '照片模式');
}

function recTick() {
  const t = Math.floor((performance.now() - REC.t0) / 1000);
  $('recTime').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

async function startRecording() {
  const box = layout();
  if (!box) { toast('画面还没准备好'); return; }
  // 先给反馈，再等权限/编码器初始化
  $('recBadge').hidden = false;
  $('recTime').textContent = '00:00';
  REC.t0 = performance.now();
  const src = S.demo ? $('demoCanvas') : $('video');
  const maxW = 1280;
  const k = Math.min(1, maxW / box.src.sw);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(box.src.sw * k / 2) * 2);
  c.height = Math.max(2, Math.round(box.src.sh * k / 2) * 2);
  const g = c.getContext('2d');
  const filter = buildFilter(S.gain, S.filter);

  const draw = () => {
    if (g.filter !== undefined) g.filter = filter;
    g.drawImage(src, box.src.sx, box.src.sy, box.src.sw, box.src.sh, 0, 0, c.width, c.height);
    REC.raf = requestAnimationFrame(draw);
  };
  draw();

  let stream;
  try {
    stream = c.captureStream(30);
  } catch (e) {
    toast('这台设备不支持画布录制');
    cancelAnimationFrame(REC.raf);
    $('recBadge').hidden = true;
    return;
  }

  try {
    const as = await navigator.mediaDevices.getUserMedia({ audio: true });
    REC.audio = as;
    as.getAudioTracks().forEach(t => stream.addTrack(t));
  } catch { REC.audio = null; }

  const mime = pickVideoMime();
  if (mime === null) { toast('这台设备不支持录制'); cancelAnimationFrame(REC.raf); $('recBadge').hidden = true; return; }

  let rec;
  try {
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined);
  } catch {
    try { rec = new MediaRecorder(stream); } catch { toast('录制启动失败'); cancelAnimationFrame(REC.raf); $('recBadge').hidden = true; return; }
  }

  REC.rec = rec;
  REC.canvas = c;
  REC.chunks = [];
  REC.mime = rec.mimeType || mime || 'video/webm';
  rec.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  rec.onstop = () => finishRecording();
  rec.start(500);

  REC.timer = setInterval(recTick, 500);
  vibrate(20);
}

function stopRecording() {
  if (!REC.rec) return;
  try { REC.rec.stop(); } catch {}
}

async function finishRecording() {
  clearInterval(REC.timer);
  cancelAnimationFrame(REC.raf);
  $('recBadge').hidden = true;
  if (REC.audio) { REC.audio.getTracks().forEach(t => t.stop()); REC.audio = null; }

  const type = REC.mime || 'video/webm';
  const blob = new Blob(REC.chunks, { type });
  REC.rec = null;
  REC.chunks = [];
  if (!blob.size) { toast('这段没录上，重试一次'); return; }

  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  S.photos.unshift({
    blob, url, score: S.ev ? S.ev.score : 0, meta: metaNow(),
    id: Date.now() + Math.random(), type: 'video', ext,
  });
  renderGallery();
  const img = $('thumbImg');
  img.src = url; img.hidden = false;
  $('thumbEmpty').hidden = true;
  if (hasNative()) {
    saveToDevice(blob, `chaseframe_${stamp()}.${ext}`).then(() => toast('视频已保存'));
  } else {
    toast('录制完成 · 点左下角相册保存');
  }
  vibrate(30);
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
    applyUIMode();
    setTimeout(() => { stripThumb = null; renderFilterStrip(); }, 400);
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
      resetTarget();
      S.hwEv = false;
      S.zoom = 1;
      S.zoomManualUntil = 0;
      await setZoom(1);
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
    const order = ['4:3', '16:9', '1:1', '5:4', '9:16'];
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

  bindCheck('optAuto', 'auto');
  bindCheck('optAutoZoom', 'autoZoom');

  document.querySelectorAll('.mode').forEach(b => {
    b.addEventListener('click', () => {
      S.mode = b.dataset.mode;
      resetTarget();
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
      S.zoomManualUntil = performance.now() + 15000;
      const z = await setZoom(Number(b.dataset.z));
      toast(`${z.toFixed(1)}× · 15 秒内不自动变焦`);
    });
  });

  // 快门：点击单拍 / 长按连拍
  const shutter = $('btnShutter');
  let holdTimer = null, holdFired = false;
  shutter.addEventListener('pointerdown', () => {
    holdFired = false;
    holdTimer = setTimeout(() => {
      if (S.capture === 'video') return;
      holdFired = true;
      burst(12);
    }, 420);
  });
  shutter.addEventListener('pointerup', () => {
    clearTimeout(holdTimer);
    if (!holdFired) {
      if (S.capture === 'video') {
        if (REC.rec) stopRecording(); else startRecording();
        return;
      }
      // 运动模式：单击即连拍选优；其他模式单拍
      if (S.mode === 'sport') burst(10); else capture('manual');
    }
  });
  shutter.addEventListener('pointerleave', () => clearTimeout(holdTimer));

  document.querySelectorAll('#capSeg button').forEach(b => {
    b.addEventListener('click', () => setCaptureMode(b.dataset.cap));
  });

  $('btnGallery').addEventListener('click', () => {
    $('gallery').hidden = false;
    renderGallery();
  });
  $('btnGalleryClose').addEventListener('click', () => { $('gallery').hidden = true; });

  $('btnFilter').addEventListener('click', () => openCreate('style'));
  $('btnCreateClose').addEventListener('click', () => { $('createSheet').hidden = true; });
  $('btnAI').addEventListener('click', openAICompose);
  $('btnAIClose').addEventListener('click', () => { $('aiSheet').hidden = true; });
  $('lockChip').addEventListener('click', () => {
    S.locked = null;
    S.lockedAt = 0;
    analyzer.reset();
    resetTarget();
    toast('已解锁，回到自动识别');
  });

  $('zoomChip').addEventListener('click', () => {
    S.zoomManualUntil = performance.now() + 15000;
    setZoom(1);
    toast('已回到 1× · 15 秒内不自动变焦');
  });

  $('btnMode').addEventListener('click', () => {
    S.simple = !S.simple;
    applyUIMode();
    toast(S.simple ? '简易模式：只留必要的东西' : '专业模式：全部控件已展开');
  });
  $('btnObOk').addEventListener('click', () => {
    $('onboard').hidden = true;
    try { localStorage.setItem('cf.onboarded', '1'); } catch {}
  });
  $('btnObPro').addEventListener('click', () => {
    $('onboard').hidden = true;
    S.simple = false;
    applyUIMode();
    try { localStorage.setItem('cf.onboarded', '1'); } catch {}
    toast('专业模式：所有构图方法与参数都在这里');
  });
  $('btnAIUse').addEventListener('click', useAIOption);
  $('btnAIRe').addEventListener('click', () => { if (AI.frame) analyzeStill(AI.frame); });
  $('btnAIPick').addEventListener('click', () => $('aiFile').click());
  $('aiFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    loadAIImage(f);
    e.target.value = '';
  });
  document.querySelectorAll('#aiZoomSeg button').forEach(b => {
    b.addEventListener('click', () => {
      AI.zoom = b.dataset.z;
      document.querySelectorAll('#aiZoomSeg button').forEach(x => x.classList.toggle('is-active', x === b));
      buildAIOptions();
    });
  });
  $('filterSearch').addEventListener('input', e => {
    S.filterQuery = e.target.value;
    S.filterLimit = 36;
    renderFilterGrid();
  });
  $('filterMore').addEventListener('click', () => {
    S.filterLimit += 36;
    renderFilterGrid();
  });
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

  $('btnViewerClose').addEventListener('click', () => {
    $('viewer').hidden = true;
    try { $('viewerVid').pause(); } catch {}
  });
  $('btnViewerSave').addEventListener('click', () => savePhoto(viewing));

  // 设置项
  function bindCheck(id, key, cb) {
    const el = $(id);
    el.checked = !!S.opts[key];
    el.addEventListener('change', () => {
      S.opts[key] = el.checked;
      if (cb) cb(el.checked);
    });
  }
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
  const resSel = $('optRes');
  resSel.value = resolutionPref();
  resSel.addEventListener('change', async e => {
    setResolutionPref(e.target.value);
    await applyResolution();
  });

  $('optRatio').addEventListener('change', e => {
    S.ratio = e.target.value;
    $('btnRatio').textContent = S.ratio;
    layout();
  });

  // 点击取景框对焦 + 长按锁定主体
  let pressTimer = null, pressAt = null;
  $('video').addEventListener('pointerdown', e => {
    const rect = stage.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    pressAt = { x: e.clientX, y: e.clientY };
    pressTimer = setTimeout(() => {
      lockSubject(nx, ny);
      pressTimer = null;
    }, 560);
  });
  // 手指一挪就取消长按：移动手机时手指常搭在屏幕上，别再误锁
  $('video').addEventListener('pointermove', e => {
    if (!pressTimer || !pressAt) return;
    if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  });
  $('video').addEventListener('pointerup', async e => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    pressAt = null;
    const rect = stage.getBoundingClientRect();
    // 点在目标方框里 → 换一个构图目标（方框本身可以点）
    if (S.ev && S.ev.target && S.opts.guide) {
      const p = toScreen(S.ev.target.x, S.ev.target.y);
      const half = targetHalfPx();
      if (Math.abs(e.clientX - rect.left - p.x) < half && Math.abs(e.clientY - rect.top - p.y) < half) {
        S.targetAvoid = { x: S.ev.target.x, y: S.ev.target.y };
        S.targetLock = null;
        S.targetMiss = 0;
        toast('换一个构图目标');
        return;
      }
    }
    if (S.demo) return;
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
    resetTarget();
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
  S.lockedAt = performance.now();
  resetTarget();
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
tagPlatform();

const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '';
try {
  const sv = localStorage.getItem('cf.simple');
  S.simple = sv === null ? true : sv === '1';
} catch {}
const ONBOARDED = (() => { try { return localStorage.getItem('cf.onboarded') === '1'; } catch { return false; } })();
document.addEventListener('DOMContentLoaded', () => {
  const el = $('verText');
  if (el) el.textContent = APP_VERSION ? `v${APP_VERSION}` : '—';
});

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
  // 新版本接管后自动刷新一次，避免用户停留在旧 JS 上
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
if (DEBUG && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}

if (DEBUG) window.__CF = { S, capture, burst, camera, analyzer, FrameAnalyzer, guideTarget };

// 便于预览与测试：?demo=1 直接进入演示画面
if (new URLSearchParams(location.search).get('demo') === '1') {
  setTimeout(() => $('btnDemo').click(), 60);
}
