/**
 * camera.js — 摄像头控制与硬件参数
 * 优先直写硬件（曝光补偿 / ISO / 快门 / 变焦 / 白平衡），不支持时由上层用软件模拟。
 */

import { captureSizes } from './platform.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.track = null;
    this.facing = 'environment';
    this.caps = {};
    this.lastApplied = {};
    this.lastApplyAt = 0;
    this.hwSupported = false;
    this.deviceId = null;
  }

  async listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter(d => d.kind === 'videoinput');
    } catch { return []; }
  }

  async start(opts = {}) {
    const facing = opts.facing || this.facing;
    this.facing = facing;
    this.busy = true;
    this.busyAt = performance.now();
    this.stop();

    // 从高到低试：先 exact（要么给这个尺寸，要么直接报错），再 ideal 兜底
    let stream = null, lastErr = null;
    for (const c of captureSizes()) {
      for (const mode of ['exact', 'ideal']) {
        const video = {
          facingMode: { ideal: facing },
          width: { [mode]: c.w },
          height: { [mode]: c.h },
          frameRate: { ideal: 30, max: 60 },
        };
        if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (stream) break;
    }
    if (!stream) { this.busy = false; throw lastErr || new Error('无法访问相机'); }
    this.stream = stream;
    this.track = stream.getVideoTracks()[0];
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});

    // 等首帧，拿到真实分辨率
    await new Promise(res => {
      if (this.video.videoWidth) return res();
      const t = setTimeout(res, 1200);
      this.video.addEventListener('loadedmetadata', () => { clearTimeout(t); res(); }, { once: true });
    });

    this.readCapabilities();
    this.busy = false;
    return this.track;
  }

  readCapabilities() {
    const c = this.track && this.track.getCapabilities ? this.track.getCapabilities() : {};
    this.caps = c || {};
    this.hwSupported = !!(
      c.exposureCompensation || c.zoom || c.exposureTime || c.iso || c.colorTemperature || c.torch
    );
    return this.caps;
  }

  get size() {
    return { w: this.video.videoWidth || 1280, h: this.video.videoHeight || 720 };
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.track = null;
    }
  }

  /** 逐项应用，失败的项目单独忽略（不同机型支持度差异极大） */
  async apply(patch = {}, { throttle = 320 } = {}) {
    if (!this.track || !this.track.applyConstraints) return { applied: [], failed: [] };
    const now = performance.now();
    if (now - this.lastApplyAt < throttle) return { applied: [], failed: [], skipped: true };

    const c = this.caps;
    const advanced = [];
    const basic = {};
    const changed = [];

    const num = (v, min, max, step) => {
      if (typeof v !== 'number' || !isFinite(v)) return null;
      let x = clamp(v, min, max);
      if (step) x = Math.round(x / step) * step;
      return x;
    };

    if (patch.ev !== undefined && c.exposureCompensation) {
      const r = c.exposureCompensation;
      const v = num(patch.ev, r.min, r.max, r.step);
      if (v !== null) { basic.exposureCompensation = v; changed.push('ev'); }
    }
    if (patch.iso !== undefined && c.iso && Array.isArray(c.exposureMode) && c.exposureMode.includes('manual')) {
      const r = c.iso;
      const v = num(patch.iso, r.min, r.max, r.step);
      if (v !== null) { advanced.push({ iso: v }); changed.push('iso'); }
    }
    if (patch.exposureTime !== undefined && c.exposureTime &&
        Array.isArray(c.exposureMode) && c.exposureMode.includes('manual')) {
      const r = c.exposureTime;
      const v = num(patch.exposureTime, r.min, r.max, r.step);
      if (v !== null) { advanced.push({ exposureTime: v }); changed.push('shutter'); }
    }
    if (patch.zoom !== undefined && c.zoom) {
      const r = c.zoom;
      const v = num(patch.zoom, r.min, r.max, r.step);
      if (v !== null) { advanced.push({ zoom: v }); changed.push('zoom'); }
    }
    if (patch.torch !== undefined && typeof c.torch === 'boolean') {
      advanced.push({ torch: !!patch.torch }); changed.push('torch');
    }
    if (patch.temperature !== undefined && c.colorTemperature &&
        Array.isArray(c.whiteBalanceMode) && c.whiteBalanceMode.includes('manual')) {
      const r = c.colorTemperature;
      const v = num(patch.temperature, r.min, r.max, r.step);
      if (v !== null) { advanced.push({ colorTemperature: v }); changed.push('wb'); }
    }

    if (!changed.length) return { applied: [], failed: [] };

    const cons = { ...basic };
    if (advanced.length) cons.advanced = advanced;

    try {
      await this.track.applyConstraints(cons);
      this.lastApplyAt = now;
      this.lastApplied = { ...this.lastApplied, ...patch };
      return { applied: changed, failed: [] };
    } catch (e) {
      // 逐条重试，能应用多少算多少
      const applied = [];
      const failed = [];
      for (const item of advanced) {
        try {
          await this.track.applyConstraints({ advanced: [item] });
          applied.push(Object.keys(item)[0]);
        } catch { failed.push(Object.keys(item)[0]); }
      }
      if (basic.exposureCompensation !== undefined) {
        try { await this.track.applyConstraints({ exposureCompensation: basic.exposureCompensation }); applied.push('ev'); }
        catch { failed.push('ev'); }
      }
      this.lastApplyAt = now;
      return { applied, failed };
    }
  }

  /** 点击对焦（支持的机型会真的动镜头，不支持的由上层提示用变焦/距离） */
  async focusAt(nx, ny) {
    if (!this.track) return false;
    const c = this.caps;
    if (!Array.isArray(c.focusMode) || !c.pointsOfInterest) return false;
    try {
      await this.track.applyConstraints({
        advanced: [{ pointsOfInterest: [{ x: nx, y: ny }], focusMode: 'single-shot' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  /** 恢复全自动，用于从手动参数退回 */
  async autoAll() {
    if (!this.track) return;
    try {
      const c = this.caps;
      const cons = {};
      if (Array.isArray(c.exposureMode)) cons.exposureMode = 'continuous';
      if (Array.isArray(c.whiteBalanceMode)) cons.whiteBalanceMode = 'continuous';
      if (Array.isArray(c.focusMode) && c.focusMode.includes('continuous')) cons.focusMode = 'continuous';
      if (Object.keys(cons).length) await this.track.applyConstraints(cons);
      if (typeof c.torch === 'boolean') this.track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
    } catch {}
  }

  /** 抓一帧到画布（按显示裁切，所见即所得） */
  grab(canvas, { aspect = null, src = null, mirror = false, filter = 'none', maxSide = 0 } = {}) {
    const { w: vw, h: vh } = this.size;
    if (!vw || !vh) return null;

    let sw, sh, sx, sy;
    if (src && src.sw > 2 && src.sh > 2) {
      // 上层已经算好「屏幕上看得见」的裁切区，直接照它拍
      sx = clamp(src.sx, 0, vw - 1);
      sy = clamp(src.sy, 0, vh - 1);
      sw = clamp(src.sw, 1, vw - sx);
      sh = clamp(src.sh, 1, vh - sy);
    } else {
      sw = vw; sh = vh; sx = 0; sy = 0;
      if (aspect) {
        const target = typeof aspect === 'number' ? aspect : (() => {
          const [aw, ah] = String(aspect).split(':').map(Number);
          return aw / ah;
        })();
        const sr = vw / vh;
        if (sr > target) { sw = vh * target; sx = (vw - sw) / 2; }
        else { sh = vw / target; sy = (vh - sh) / 2; }
      }
    }

    let outW = sw, outH = sh;
    if (maxSide && Math.max(outW, outH) > maxSide) {
      const k = maxSide / Math.max(outW, outH);
      outW = Math.round(sw * k); outH = Math.round(sh * k);
    }
    canvas.width = Math.round(outW);
    canvas.height = Math.round(outH);
    const ctx = canvas.getContext('2d');
    ctx.save();
    if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    if (filter && filter !== 'none') ctx.filter = filter;
    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    return canvas;
  }
}

/** 能力清单转成中文标签 */
export function describeCaps(caps) {
  const items = [];
  const add = (label, ok, extra) => items.push({ label: extra ? `${label} ${extra}` : label, ok });
  add('曝光补偿', !!caps.exposureCompensation);
  add('变焦', !!caps.zoom, caps.zoom ? `${caps.zoom.min}–${Math.min(8, caps.zoom.max).toFixed(1)}×` : '');
  add('手动快门', Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual') && !!caps.exposureTime);
  add('手动 ISO', Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual') && !!caps.iso);
  add('手动白平衡', Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual'));
  add('点对焦', !!caps.pointsOfInterest);
  add('补光灯', typeof caps.torch === 'boolean');
  add('背景虚化', !!caps.backgroundBlur);
  return items;
}
