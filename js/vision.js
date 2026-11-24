/**
 * vision.js — 本地取景分析
 *
 * 全流程在低分辨率离屏画布上完成（默认 208px 宽），单帧约 2~3ms。
 * 输出：曝光统计 / 对焦清晰度 / 显著主体框 / 色温 / 帧差运动
 *
 * 主体判定顺序（重要）：
 *   1. 先算帧差，得到「哪里在动」
 *   2. 再算显著性簇，落在运动区域内的簇大幅加权（拍动的物体时，动的就是主体）
 *   3. 最后用主体质心的位移估速度（帧差只剩边缘带，质心会左右跳，不能直接测速）
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 两个归一化框的重叠度 */
function iou(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export class FrameAnalyzer {
  constructor(analysisWidth = 208) {
    this.aw = analysisWidth;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this._buf = null;
    this._prev = null;
    this._prevValid = false;
    this.prevTime = 0;

    this.smoothBox = null;
    this.missCount = 0;
    this.prevMotionCenter = null;
    this.prevSubjectCenter = null;
    this.smVx = 0;
    this.smVy = 0;
  }

  _ensureBuffers(n, gw, gh) {
    if (!this._buf || this._buf.n !== n) {
      this._buf = {
        n,
        gray: new Float32Array(n),
        sat: new Float32Array(n),
        edges: new Float32Array(n),
        hist: new Uint32Array(64),
      };
    }
    const b = this._buf;
    if (b.gw !== gw || b.gh !== gh) {
      const gN = gw * gh;
      b.gw = gw; b.gh = gh; b.gN = gN;
      b.cellEdge = new Float32Array(gN);
      b.cellSat = new Float32Array(gN);
      b.cellLum = new Float32Array(gN);
      b.sal = new Float32Array(gN);
      b.seen = new Uint8Array(gN);
      b.mv = new Uint8Array(gN);
      b.cells = new Int32Array(gN);
    }
    if (!this._prev || this._prev.length !== n) {
      this._prev = new Float32Array(n);
      this._prevValid = false;
    }
  }

  /**
   * @param {HTMLVideoElement|HTMLCanvasElement} source
   * @param {number} now performance.now()
   * @param {{sx:number,sy:number,sw:number,sh:number}} [region] 与拍摄一致的裁切区
   */
  analyze(source, now = performance.now(), region = null) {
    const vw = source.videoWidth || source.width;
    const vh = source.videoHeight || source.height;
    if (!vw || !vh) return null;

    const r = region && region.sw > 2 && region.sh > 2 ? region : { sx: 0, sy: 0, sw: vw, sh: vh };
    const w = this.aw;
    const h = Math.max(2, Math.round((w * r.sh) / r.sw));
    const n = w * h;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this._prevValid = false;
      this.smoothBox = null;
    }

    const ctx = this.ctx;
    ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return null; // 画面跨域，读不了
    }

    const BS = 8;
    const gw = Math.max(2, Math.floor(w / BS));
    const gh = Math.max(2, Math.floor(h / BS));
    const gN = gw * gh;
    this._ensureBuffers(n, gw, gh);
    const b = this._buf;
    const gray = b.gray, sat = b.sat, edges = b.edges, hist = b.hist;
    hist.fill(0);

    // ---------- 1. 灰度 / 饱和度 / 直方图 ----------
    let sumR = 0, sumG = 0, sumB = 0, sumL = 0, sumSat = 0;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const rr = data[p], gg = data[p + 1], bb = data[p + 2];
      sumR += rr; sumG += gg; sumB += bb;
      const y = 0.299 * rr + 0.587 * gg + 0.114 * bb;
      gray[i] = y;
      sumL += y;
      const mx = rr > gg ? (rr > bb ? rr : bb) : (gg > bb ? gg : bb);
      const mn = rr < gg ? (rr < bb ? rr : bb) : (gg < bb ? gg : bb);
      sat[i] = mx > 4 ? (mx - mn) / mx : 0;
      sumSat += sat[i];
      hist[(y * 63 / 255) | 0]++;
    }
    const meanLum = sumL / n;
    const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;

    // 全局位移：判断"是画面在平移"还是"主体自己在动"
    this._estGlobalShift(gray, w, h);

    let cHigh = 0, cLow = 0;
    for (let i = 0; i < 64; i++) {
      if (i >= 61) cHigh += hist[i];
      if (i <= 2) cLow += hist[i];
    }
    const clipHigh = cHigh / n;
    const clipLow = cLow / n;

    // ---------- 2. Sobel + 拉普拉斯 ----------
    let edgeSum = 0, lapSum = 0, lapSqSum = 0;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
        const l = gray[i - 1], rr2 = gray[i + 1];
        const bl = gray[i + w - 1], bo = gray[i + w], br = gray[i + w + 1];
        const gx = (tr + 2 * rr2 + br) - (tl + 2 * l + bl);
        const gy = (bl + 2 * bo + br) - (tl + 2 * t + tr);
        const m = Math.sqrt(gx * gx + gy * gy) * 0.25;
        edges[i] = m;
        edgeSum += m;
        const lap = 4 * gray[i] - (t + l + rr2 + bo);
        lapSum += lap; lapSqSum += lap * lap;
      }
    }
    const edgeMean = edgeSum / n;
    const lapVar = lapSqSum / n - (lapSum / n) ** 2;

    // ---------- 3. 网格特征 ----------
    const cellEdge = b.cellEdge, cellSat = b.cellSat, cellLum = b.cellLum;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let e = 0, s = 0, l = 0, cnt = 0;
        const y0 = gy * BS, x0 = gx * BS;
        for (let y = y0; y < y0 + BS; y++) {
          const row = y * w;
          for (let x = x0; x < x0 + BS; x++) {
            const i = row + x;
            e += edges[i]; s += sat[i]; l += gray[i]; cnt++;
          }
        }
        const k = gy * gw + gx;
        cellEdge[k] = e / cnt / 60;
        cellSat[k] = s / cnt;
        cellLum[k] = l / cnt / 255;
      }
    }

    // ---------- 4. 帧差（先算，用来给主体加权） ----------
    const mv = b.mv;
    let motionCells = 0;
    let mMinX = gw, mMinY = gh, mMaxX = -1, mMaxY = -1, mCount = 0, mSx = 0, mSy = 0;
    const prev = this._prev;
    if (this._prevValid) {
      mv.fill(0);
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          let diff = 0, cnt = 0;
          const y0 = gy * BS, x0 = gx * BS;
          for (let y = y0; y < y0 + BS; y++) {
            const row = y * w;
            for (let x = x0; x < x0 + BS; x++) {
              const i = row + x;
              diff += Math.abs(gray[i] - prev[i]);
              cnt++;
            }
          }
          if (diff / cnt > 13) {
            mv[gy * gw + gx] = 1;
            motionCells++;
          }
        }
      }
      // 运动块并集（帧差只剩边缘带，取并集才稳）
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          if (!mv[gy * gw + gx]) continue;
          mCount++;
          mSx += gx + 0.5; mSy += gy + 0.5;
          if (gx < mMinX) mMinX = gx; if (gx > mMaxX) mMaxX = gx;
          if (gy < mMinY) mMinY = gy; if (gy > mMaxY) mMaxY = gy;
        }
      }
    }
    const motionRatio = motionCells / gN;
    const motionBox = mCount > 2 && motionRatio < 0.62 ? {
      x: mMinX / gw, y: mMinY / gh,
      w: (mMaxX - mMinX + 1) / gw, h: (mMaxY - mMinY + 1) / gh,
      cx: mSx / mCount / gw, cy: mSy / mCount / gh,
    } : null;

    // ---------- 5. 显著性 ----------
    const sal = b.sal;
    const ccx = gw / 2, ccy = gh / 2;
    const maxR = Math.sqrt(ccx * ccx + ccy * ccy) || 1;
    let maxSal = 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const k = y * gw + x;
        const d = Math.sqrt((x - ccx) ** 2 + (y - ccy) ** 2) / maxR;
        const centerW = 1 - 0.62 * d;
        const contrast = Math.min(1, cellEdge[k] * 1.9);
        const satW = Math.min(1, cellSat[k] * 1.6);
        const colorDist = Math.min(1, Math.abs(cellLum[k] - meanLum / 255) * 1.6);
        let v = (0.4 * contrast + 0.44 * satW + 0.16 * colorDist) * centerW;
        // 死白高光（太阳、灯泡、反光）基本不是主体
        if (cellLum[k] > 0.93 && cellEdge[k] < 0.55) v *= 0.3;
        sal[k] = v;
        if (v > maxSal) maxSal = v;
      }
    }

    // ---------- 6. 找显著簇 ----------
    const thr = Math.max(0.12, maxSal * 0.46);
    const seen = b.seen, cells = b.cells;
    seen.fill(0);
    let best = null, bestScore = 0;

    for (let start = 0; start < gN; start++) {
      if (seen[start] || sal[start] < thr) continue;
      const stack = [start];
      seen[start] = 1;
      let cellCount = 0, count = 0, sumSal = 0, sumEdge = 0;
      let minX = gw, minY = gh, maxX = -1, maxY = -1;
      let wx = 0, wy = 0, sumW = 0;

      while (stack.length) {
        const k = stack.pop();
        if (cellCount < cells.length) cells[cellCount++] = k;
        const x = k % gw, y = (k / gw) | 0;
        count++;
        sumSal += sal[k];
        sumEdge += cellEdge[k];
        const wgt = sal[k] * sal[k] + 0.0005;
        sumW += wgt; wx += (x + 0.5) * wgt; wy += (y + 0.5) * wgt;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const nk = ny * gw + nx;
            if (!seen[nk] && sal[nk] >= thr) { seen[nk] = 1; stack.push(nk); }
          }
        }
      }
      if (cellCount < 2) continue;

      // 簇内分级收紧：只留最亮的一批，避免被低对比边缘拖宽
      let cellMax = 0;
      for (let ci = 0; ci < cellCount; ci++) {
        const v = sal[cells[ci]];
        if (v > cellMax) cellMax = v;
      }
      let bx0 = minX, by0 = minY, bx1 = maxX, by1 = maxY, kept = count;
      for (const ratio of [0.8, 0.68, 0.56, 0.44]) {
        const t2 = cellMax * ratio;
        let ax0 = gw, ay0 = gh, ax1 = -1, ay1 = -1, kc = 0;
        for (let ci = 0; ci < cellCount; ci++) {
          const kk = cells[ci];
          if (sal[kk] < t2) continue;
          kc++;
          const xx = kk % gw, yy = (kk / gw) | 0;
          if (xx < ax0) ax0 = xx; if (xx > ax1) ax1 = xx;
          if (yy < ay0) ay0 = yy; if (yy > ay1) ay1 = yy;
        }
        if (kc === 0) continue;
        bx0 = ax0; by0 = ay0; bx1 = ax1; by1 = ay1; kept = kc;
        if (kc >= Math.max(3, cellCount * 0.06)) break;
      }

      const bwN = (bx1 - bx0 + 1) / gw;
      const bhN = (by1 - by0 + 1) / gh;
      const fill = kept / Math.max(1, (bx1 - bx0 + 1) * (by1 - by0 + 1));
      const meanSal = sumSal / Math.max(1, count);
      const meanEdge = sumEdge / Math.max(1, count);

      let sc = Math.pow(meanSal, 1.5) * Math.sqrt(kept) * Math.pow(fill, 0.5);
      sc *= Math.pow(Math.min(1, meanEdge * 2.0), 0.6);

      // 与运动区域重叠的簇，基本可以确定就是「在动的主体」
      if (motionBox) {
        const ix = Math.max(0, Math.min((bx1 + 1) / gw, motionBox.x + motionBox.w) - Math.max(bx0 / gw, motionBox.x));
        const iy = Math.max(0, Math.min((by1 + 1) / gh, motionBox.y + motionBox.h) - Math.max(by0 / gh, motionBox.y));
        const inter = ix * iy;
        const union = bwN * bhN + motionBox.w * motionBox.h - inter;
        const iou = union > 0 ? inter / union : 0;
        sc *= 1 + 2.4 * iou;
      }

      if (bwN > 0.8 || bhN > 0.95) sc *= 0.4;
      const asp = bwN / Math.max(0.001, bhN);
      if (asp > 5 || asp < 0.14) sc *= 0.5;
      if (kept < 3) sc *= 0.5;

      // 时间一致性：和上一帧主体重叠的簇大幅加分，防止框"换人"
      if (this.lastBox) {
        const i = iou({ x: bx0 / gw, y: by0 / gh, w: bwN, h: bhN }, this.lastBox);
        sc *= 1 + 2.6 * i;
      }

      if (sc > bestScore) {
        bestScore = sc;
        best = {
          area: clamp(kept / gN, 0.002, 1),
          x: bx0 / gw, y: by0 / gh, w: bwN, h: bhN,
          cx: clamp(wx / sumW / gw, bx0 / gw, (bx1 + 1) / gw),
          cy: clamp(wy / sumW / gh, by0 / gh, (by1 + 1) / gh),
          kept, count,
        };
      }
    }

    // ---------- 7. 主体时域平滑 ----------
    // 帧差区域是「上一帧位置 ∪ 这一帧位置」的并集，中心天然落后半帧。
    // 这里用上一帧估出的速度把它补到当前帧位置，否则快速平移时框会比主体慢半拍。
    const dtFrame = Math.max(0.008, (now - this.prevTime) / 1000);
    const vfx = this.smVx || 0, vfy = this.smVy || 0;
    const shiftX = clamp(vfx * dtFrame * 0.5, -0.09, 0.09);
    const shiftY = clamp(vfy * dtFrame * 0.5, -0.09, 0.09);

    const fromMotion = (mb) => {
      // 并集还包含位移，宽度也一并收掉
      const mw = clamp(mb.w - Math.min(mb.w * 0.55, Math.abs(vfx * dtFrame)), 0.03, 1);
      const mh = clamp(mb.h - Math.min(mb.h * 0.55, Math.abs(vfy * dtFrame)), 0.03, 1);
      const mcx = clamp(mb.cx + shiftX, 0, 1);
      const mcy = clamp(mb.cy + shiftY, 0, 1);
      return {
        area: clamp(mCount / gN, 0.004, 0.9),
        x: clamp(mcx - mw / 2, 0, 1 - mw),
        y: clamp(mcy - mh / 2, 0, 1 - mh),
        w: mw, h: mh,
        cx: mcx, cy: mcy,
        kept: mCount, count: mCount,
      };
    };

    // ---- 平移锁定 ----
    // 整个画面在动（手机在平移）时，帧差和显著性都不可靠，
    // 直接按全局位移把上一帧的主体框推过去，绝不在这一帧换目标。
    const flow = this.flow || { dx: 0, dy: 0, conf: 0 };
    const flowMag = Math.hypot(flow.dx, flow.dy);
    const panning = !!(flow.conf > 0.32 && flowMag > 0.01 && this.lastBox);
    if (panning) {
      const lb = this.lastBox;
      const predicted = {
        x: clamp(lb.x + flow.dx, 0, 1 - lb.w),
        y: clamp(lb.y + flow.dy, 0, 1 - lb.h),
        w: lb.w, h: lb.h,
        cx: clamp(lb.cx + flow.dx, 0, 1),
        cy: clamp(lb.cy + flow.dy, 0, 1),
        area: lb.area,
        kept: lb.keptCells || 0, count: lb.clusterCells || 0,
      };
      // 检测框和预测对得上就用检测（更准），对不上就信预测（别换目标）
      if (!best || iou(best, predicted) < 0.22) best = predicted;
    }
    this.panning = panning;

    // 画面里确实有东西在动、而且运动区紧凑时，直接以运动区为主体。
    // 拍运动物体时这才是用户真正想要的框，也比"显著簇"稳定得多。
    // 但画面整体在平移时，帧差是"整个场景在动"，不能当主体。
    if (!panning && motionBox && motionBox.w < 0.55 && motionBox.h < 0.85 &&
        motionRatio > 0.015 && motionRatio < 0.35) {
      best = fromMotion(motionBox);
    } else if (!panning && best && motionBox && best.w > 0.55 && motionBox.w < 0.6 && motionBox.h < 0.9) {
      best = fromMotion(motionBox);
    }

    // 跟踪锁定：只有"换了个东西"才需要多帧确认。
    // 平移镜头时同一个主体会整体位移，IoU 同样会掉到很低——
    // 这时如果还按 6 帧确认，框就会死死停在原地，看起来就是"跟不上手"。
    if (!panning && best && this.lastBest && this.lastScore > 0) {
      const prev = this.lastBest;
      const keepIou = iou(best, prev);
      const sizeSame = Math.abs(best.w - prev.w) < prev.w * 0.55 + 0.035 &&
                       Math.abs(best.h - prev.h) < prev.h * 0.55 + 0.035;
      const near = Math.hypot(best.cx - prev.cx, (best.cy - prev.cy) * 1.1) < 0.42;
      if (keepIou > 0.15 || (sizeSame && near)) {
        this.challenger = null;               // 还是同一个目标（只是平移了）
      } else {
        if (this.challenger && iou(best, this.challenger.box) > 0.25) {
          this.challenger.count++;
          this.challenger.box = best;
        } else {
          this.challenger = { box: best, count: 1 };
        }
        // 连续 4 帧、或分数明显更高，才切过去
        if (this.challenger.count < 4 && bestScore < this.lastScore * 1.7) {
          best = this.lastBest;
        } else {
          this.challenger = null;
        }
      }
    }

    let subject = null;
    if (best && best.area >= 0.008 && best.area <= 0.95) {
      const bw2 = clamp(best.w, 0.02, 1);
      const bh2 = clamp(best.h, 0.02, 1);
      subject = {
        x: clamp(best.x, 0, 1 - bw2), y: clamp(best.y, 0, 1 - bh2),
        w: bw2, h: bh2,
        cx: clamp(best.cx, 0, 1), cy: clamp(best.cy, 0, 1),
        area: best.area, keptCells: best.kept, clusterCells: best.count,
      };
    }

    if (subject) {
      const p0 = this.smoothBox;
      if (p0) {
        const dx = subject.cx - p0.cx, dy = subject.cy - p0.cy;
        const dist = Math.hypot(dx, dy * 1.1);
        // 增益随位移变化：手抖（<1%）几乎不动，平移手机（>5%）几乎实时
        // 快速平移时直接跟到位（增益 1.0），只在慢速/静止时才做平滑；
        // 抖动由下面的死区负责，不再靠"跟得慢"来压抖动。
        const gain = dist > 0.03 ? 1 : dist > 0.012 ? 0.72 : dist > 0.005 ? 0.4 : 0;
        if (gain === 0) {
          // 死区：完全沿用上一帧，避免"呼吸式"抖动
          subject = p0;
          this.lastBox = p0;
          this.lastBest = p0;
          this.lastScore = Math.max(this.lastScore, bestScore);
        } else {
          // 上限只用来挡场景突跳（换镜头、走过遮挡物），不再限制正常跟手
          const cap = 0.34;
          const ncx = clamp(p0.cx + clamp(dx, -cap, cap) * gain, 0, 1);
          const ncy = clamp(p0.cy + clamp(dy, -cap, cap) * gain, 0, 1);
          const sizeGain = dist > 0.05 ? 0.6 : 0.24;
          const sw2 = clamp(p0.w + (subject.w - p0.w) * sizeGain, 0.02, 1);
          const sh2 = clamp(p0.h + (subject.h - p0.h) * sizeGain, 0.02, 1);
          subject = {
            x: clamp(ncx - sw2 / 2, 0, 1 - sw2),
            y: clamp(ncy - sh2 / 2, 0, 1 - sh2),
            w: sw2, h: sh2,
            cx: ncx,
            cy: ncy,
            area: p0.area + (subject.area - p0.area) * gain,
            keptCells: subject.keptCells,
            clusterCells: subject.clusterCells,
          };
        }
      }
      this.smoothBox = subject;
      this.missCount = 0;
    } else {
      this.missCount++;
      if (this.missCount > 12) this.smoothBox = null;
      if (this.missCount <= 5) subject = this.smoothBox;
    }

    // ---------- 8. 速度：主体质心位移 ----------
    let motion = null;
    if (motionBox && this._prevValid) {
      const dt = Math.max(0.008, (now - this.prevTime) / 1000);
      const cur = subject ? { x: subject.cx, y: subject.cy } : { x: motionBox.cx, y: motionBox.cy };
      const pv = this.prevSubjectCenter || this.prevMotionCenter;
      let vx = 0, vy = 0;
      if (pv) {
        vx = (cur.x - pv.x) / dt;
        vy = (cur.y - pv.y) / dt;
        if (Math.abs(vx) > 3.2 || Math.abs(vy) > 3.2) { vx = 0; vy = 0; }
      }
      this.smVx = this.smVx * 0.34 + vx * 0.66;
      this.smVy = this.smVy * 0.34 + vy * 0.66;
      this.prevSubjectCenter = cur;
      this.prevMotionCenter = { x: motionBox.cx, y: motionBox.cy };
      motion = {
        ...motionBox,
        vx: this.smVx, vy: this.smVy,
        speed: Math.sqrt(this.smVx * this.smVx + this.smVy * this.smVy),
        ratio: motionRatio,
      };
    } else {
      this.prevSubjectCenter = null;
      this.prevMotionCenter = null;
      this.smVx = 0; this.smVy = 0;
    }

    // ---------- 9. 收尾 ----------
    const rb = meanB / Math.max(1, meanR);
    const colorTemp = clamp(6500 * Math.pow(rb, 1.45), 2300, 8800);
    const tint = clamp((meanG - (meanR + meanB) / 2) / 128, -1, 1);

    let clutter = 0.5;
    if (subject) {
      let e = 0, c = 0;
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          const nx = (gx + 0.5) / gw, ny = (gy + 0.5) / gh;
          const inside = nx > subject.x && nx < subject.x + subject.w &&
                         ny > subject.y && ny < subject.y + subject.h;
          if (inside) continue;
          e += cellEdge[gy * gw + gx]; c++;
        }
      }
      clutter = c ? clamp(e / c, 0, 1) : 0.5;
    }

    if (best) { this.lastBest = best; this.lastScore = bestScore; }
    if (subject) this.lastBox = subject;

    prev.set(gray);
    this._prevValid = true;
    this.prevTime = now;

    return {
      w, h, aspect: w / h,
      meanLum: meanLum / 255,
      clipHigh, clipLow,
      sharp: clamp(lapVar / 260, 0, 1),
      lapVar, edgeMean,
      gw, gh, cellEdge, cellLum,
      subject,
      subjectConfidence: subject ? clamp(bestScore, 0, 1) : 0,
      meanSat: sumSat / n,
      clutter, colorTemp, tint,
      motion, motionRatio,
      flow: this.flow || { dx: 0, dy: 0, conf: 0 },
    };
  }

  /**
   * 投影法估计全局位移：把灰度按列/行求和，找使 SAD 最小的整体平移量。
   * 成本只有 O(w*h + 候选数*(w+h))，但能区分"整个画面在平移"和"主体自己在动"。
   */
  _estGlobalShift(gray, w, h) {
    const b = this._buf;
    if (!b.colSum || b.colSum.length !== w || b.rowSum.length !== h) {
      b.colSum = new Float32Array(w);
      b.rowSum = new Float32Array(h);
      b.colPrev = new Float32Array(w);
      b.rowPrev = new Float32Array(h);
      b.hasPrev = false;
    }
    const col = b.colSum, row = b.rowSum;
    col.fill(0); row.fill(0);
    for (let y = 0; y < h; y++) {
      const off = y * w;
      let rs = 0;
      for (let x = 0; x < w; x++) { const v = gray[off + x]; col[x] += v; rs += v; }
      row[y] = rs;
    }
    for (let x = 0; x < w; x++) col[x] /= h;
    for (let y = 0; y < h; y++) row[y] /= w;

    if (!b.hasPrev) {
      b.colPrev.set(col); b.rowPrev.set(row); b.hasPrev = true;
      this.flow = { dx: 0, dy: 0, conf: 0 };
      return;
    }

    const est = (cur, prev, len) => {
      const maxD = Math.max(4, Math.round(len * 0.16));
      let bestD = 0, bestCost = Infinity;
      let zero = 0;
      for (let i = 0; i < len; i++) zero += Math.abs(cur[i] - prev[i]);
      zero /= len;
      // 这个轴上几乎没有变化 → 可以确定"没有位移"
      if (zero < 0.5) return { d: 0, conf: 1 };
      for (let d = -maxD; d <= maxD; d++) {
        const s0 = Math.max(0, -d), e0 = Math.min(len, len - d);
        if (e0 - s0 < len * 0.55) continue;
        let cost = 0;
        for (let i = s0; i < e0; i++) cost += Math.abs(cur[i] - prev[i + d]);
        cost /= (e0 - s0);
        if (cost < bestCost) { bestCost = cost; bestD = d; }
      }
      const conf = zero > 1e-4 ? Math.max(0, 1 - bestCost / zero) : 0;
      const atEdge = Math.abs(bestD) >= maxD;
      return { d: bestD, conf: atEdge ? 0 : conf };
    };

    const sx = est(col, b.colPrev, w);
    const sy = est(row, b.rowPrev, h);
    b.colPrev.set(col); b.rowPrev.set(row);

    // cur[x] ≈ prev[x + d] → 画面实际位移是 -d
    this.flow = { dx: -sx.d / w, dy: -sy.d / h, conf: Math.min(sx.conf, sy.conf) };
  }

  reset() {
    this._prevValid = false;
    this.smoothBox = null;
    this.missCount = 0;
    this.prevMotionCenter = null;
    this.prevSubjectCenter = null;
    this.smVx = 0;
    this.smVy = 0;
    this.lastBox = null;
    this.lastBest = null;
    this.lastScore = 0;
    this.challenger = null;
    this.flow = { dx: 0, dy: 0, conf: 0 };
    if (this._buf) this._buf.hasPrev = false;
  }
}

/** 快速清晰度（0~1），用于连拍选帧 */
export function measureSharp(source, width = 180) {
  const sw = source.videoWidth || source.width;
  const sh = source.videoHeight || source.height;
  if (!sw || !sh) return 0;
  const w = width, h = Math.max(2, Math.round((w * sh) / sw));
  const c = measureSharp._c || (measureSharp._c = document.createElement('canvas'));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return 0; }
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  let sum = 0, sq = 0, cnt = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap; sq += lap * lap; cnt++;
    }
  }
  const v = sq / cnt - (sum / cnt) ** 2;
  return clamp(v / 320, 0, 1);
}
