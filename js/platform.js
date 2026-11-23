/**
 * platform.js — 平台能力探测与兼容层
 *
 * 目标：同一套代码在 iOS Safari / Android Chrome / 鸿蒙浏览器 / 各平台 WebView 里
 * 行为一致；差异集中在这个文件里，业务代码只调这里的接口。
 */

const UA = navigator.userAgent || '';

export const PLATFORM = {
  ios: /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  android: /Android/i.test(UA),
  harmony: /HarmonyOS|OpenHarmony|ArkWeb/i.test(UA),
  wechat: /MicroMessenger/i.test(UA),
  safari: /Safari/i.test(UA) && !/Chrome|CriOS|Edg|OPR|Android/i.test(UA),
  edge: /Edg\//.test(UA),
  standalone: (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || navigator.standalone === true,
  touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
  vibrate: typeof navigator.vibrate === 'function',
  share: typeof navigator.share === 'function',
  gyro: typeof DeviceOrientationEvent !== 'undefined',
};

/** 给 <body> 打标记，CSS 可以按平台微调 */
export function tagPlatform() {
  const d = document.body.dataset;
  d.platform = PLATFORM.ios ? 'ios' : PLATFORM.harmony ? 'harmony' : PLATFORM.android ? 'android' : 'desktop';
  if (PLATFORM.standalone) d.standalone = '1';
  if (PLATFORM.ios && PLATFORM.safari) d.iosSafari = '1';
  if (PLATFORM.wechat) d.wechat = '1';
}

/** 震动：iOS 全系不支持，静默降级 */
export function vibrate(ms = 18) {
  if (!PLATFORM.vibrate) return false;
  try { navigator.vibrate(ms); return true; } catch { return false; }
}

/**
 * 拍摄分辨率：iOS 的 getUserMedia 上限普遍是 1920×1080，
 * 请求更高只会被静默降级并可能拉低帧率；鸿蒙/安卓可以要更高。
 */
export function captureSize() {
  if (PLATFORM.ios) return { w: 1920, h: 1440 };
  if (PLATFORM.harmony) return { w: 1920, h: 1440 };
  return { w: 2560, h: 1440 };
}

/** 录制编码：Safari 只认 mp4/avc1，Chrome 系优先 webm */
export function pickVideoMime() {
  const candidates = PLATFORM.ios
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* noop */ }
  }
  return '';
}

/** 陀螺仪授权：iOS 13+ 必须在用户手势里申请 */
export async function requestGyro() {
  try {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      return r === 'granted';
    }
    return true;
  } catch { return false; }
}

/** iOS 上把画面存进相册：只能走系统分享面板 */
export function saveHint() {
  if (PLATFORM.ios) return '点「保存」后选「存储图像」，就会进系统相册';
  if (PLATFORM.harmony) return '保存后可在相册的「ChaseFrame」相簿里找到';
  return '保存到相册 / 下载目录';
}

/** 需要提示"添加到主屏幕"的场景 */
export function shouldPromptInstall() {
  return PLATFORM.ios && PLATFORM.safari && !PLATFORM.standalone;
}

export function platformLabel() {
  if (PLATFORM.ios) return 'iOS';
  if (PLATFORM.harmony) return 'HarmonyOS';
  if (PLATFORM.android) return 'Android';
  return 'Desktop';
}
