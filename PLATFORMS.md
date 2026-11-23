# 平台适配说明（iOS / Android / HarmonyOS）

同一套前端代码跑在三类平台上，差异集中在 `js/platform.js`。下面是**需要调整的内容**、**平台差异**和**验证要点**。

---

## 一、总体策略

| 平台 | 交付形态 | 摄像头来源 | 说明 |
|---|---|---|---|
| Android | `ChaseFrame-1.0.0.apk` | 系统 WebView | 已构建，`https://appassets.androidplatform.net` 拦截到 assets，规避 file:// 限制 |
| Android | 网页 / PWA | Chrome 内核 | GitHub Pages 已部署 |
| iOS / iPadOS | 网页 / PWA（加到主屏幕） | Safari / WKWebView | **无法在这台机器上编译 ipa**，iOS 走 PWA 路线 |
| HarmonyOS 4.x | 直接装上面的 APK | 华为 WebView（AOSP 兼容） | 兼容层基本等价 Android |
| HarmonyOS NEXT (5.x) | `.hap`（ArkTS 外壳 + ArkWeb） | ArkWeb | 工程在 `harmony/`，需 DevEco Studio 构建 |

---

## 二、需要调整的内容（已落到代码里）

### 1. 摄像头与分辨率
- **iOS**：`getUserMedia` 上限普遍 1920×1080，请求 2560 会被静默降级并拖低帧率 → `captureSize()` 在 iOS/HarmonyOS 返回 1920×1440。
- **iOS**：`facingMode` 用 `{ ideal }` 而非 `{ exact }`，否则部分机型直接 `OverconstrainedError`。
- **iOS**：`zoom` / `exposureTime` / `iso` 基本不开放 → `camera.js` 先查 `getCapabilities()`，没有就退到软件模拟，UI 上标「软件」。

### 2. 权限
- **iOS**：`DeviceOrientationEvent.requestPermission()` 必须在**用户手势**里调用（已放在「开启相机」按钮链路中）；拒绝后水平仪自动隐藏，不阻塞拍摄。
- **Android WebView**：`WebChromeClient.onPermissionRequest` 授权 `VIDEO_CAPTURE`，同时宿主 App 需持有 `CAMERA`。
- **HarmonyOS**：`module.json5` 声明 `ohos.permission.CAMERA` / `MICROPHONE`；`Index.ets` 里 `requestPermissionsFromUser` 先拿系统权限，再在 `onPermissionRequest` 里把资源授予 Web 内核，缺一不可。

### 3. 安全上下文
- 三端都要求 `https` 或 `localhost`（`file://` 在 Chromium 里被视为可信来源，所以鸿蒙用 `$rawfile` 也能调起摄像头）。
- Android 用自定义 https 域拦截 assets，比 file:// 更稳，也便于以后接 Service Worker。

### 4. 媒体与录制
- **Safari 只认 `video/mp4;codecs=avc1`**，Chrome 系优先 `webm/vp9` → `pickVideoMime()` 按平台排序候选。
- iOS 不支持 `navigator.vibrate` → `vibrate()` 静默降级（不报错、不弹提示）。
- iOS 保存到相册只能走系统分享面板 → `saveHint()` 提示「存储图像」。

### 5. 布局与交互
- `100dvh` 前补 `100vh` 回退；鸿蒙浏览器用 `@supports not (height:100dvh)` 再兜一层。
- iOS 需要 `-webkit-backdrop-filter`，否则毛玻璃整条失效（已在 `@supports (-webkit-touch-callout: none)` 里补齐）。
- iOS 输入框字号 <16px 会触发页面自动放大 → 搜索框在 iOS 下强制 16px。
- iOS 长按会弹系统菜单、选中文字 → `-webkit-touch-callout: none` + `user-select: none`（输入框除外）。
- iOS 全屏：`apple-mobile-web-app-capable` + `black-translucent` 状态栏，加到主屏后没有地址栏。
- 鸿蒙：`setWindowLayoutFullScreen(true)` + 深色系统栏，避免顶部白条破坏取景器。

### 6. 传感器与朝向
- iOS PWA 不能锁定屏幕方向；横竖屏切换时 `layout()` 会重算裁切框，不需要额外处理。
- 水平仪在 iOS 上首次授权后才显示，未授权时所有「倾斜」相关评分按满分处理，不误伤构图分。

---

## 三、主要平台差异对照

| 项目 | iOS Safari | Android Chrome | HarmonyOS ArkWeb |
|---|---|---|---|
| 摄像头 | 需 HTTPS + 手势触发 | 需 HTTPS + 权限弹窗 | 需系统权限 + Web 层授权 |
| 分辨率上限 | 约 1080p | 可到 4K（看机型） | 约 1080p |
| 硬件参数（EV/ISO/快门） | 极少数支持 | 部分支持 EV/变焦 | 基本不开放 |
| 震动 | ❌ | ✅ | ✅ |
| 分享面板 | ✅ | ✅ | ✅ |
| 录制编码 | mp4/h264 | webm/vp9 | webm/mp4 视版本 |
| 全屏 | 仅「添加到主屏幕」 | 可用 Fullscreen API | 原生全屏 |
| 屏幕方向锁定 | ❌ | ✅ | ✅ |
| 后台保持 | 切后台即暂停 | 可短暂保持 | 可短暂保持 |
| 存相册 | 分享面板「存储图像」 | 下载 / MediaStore | 下载 / 媒体库 |

---

## 四、验证要点（每端逐条过）

### iOS（Safari + 主屏 PWA）
1. 首次点「开启相机」→ 弹相机权限 → 允许后 3 秒内出画面。
2. 拒绝相机权限 → 出现提示且可改用「演示画面」，页面不卡死。
3. 陀螺仪授权被拒 → 水平仪消失，构图分仍正常。
4. 竖屏 3:4 / 横屏切换 → 裁切框始终在屏幕内，拍到的比看到的**不多不少**。
5. 点快门 → 有快门动画、无震动（预期）、缩略图更新。
6. 保存 → 弹系统分享 → 「存储图像」→ 相册里能看到。
7. 加到主屏幕后重新打开 → 全屏、无地址栏、相机仍可用。
8. 锁屏后再回来 → 视频流恢复，不需要重新授权。
9. 输入框聚焦（搜索滤镜）→ 页面不放大。
10. 长按取景框 → 锁定主体，不弹系统菜单。

### Android（Chrome + APK）
1. Chrome 与 APK 两种入口都能出画面。
2. 切换前后摄像头 → 前置镜像正确（预览与成片一致）。
3. 变焦 1×/2×/3× → 有硬件变焦则画面变化，没有则提示不支持。
4. 点对焦 → 支持机型有反应，不支持时给提示。
5. APK 拍完 → 相册 `Pictures/ChaseFrame` 立即出现，无需手动保存。
6. 连拍 10 张 → 面板出现、标「最佳」、可单存/全存。
7. 切后台 10 秒回来 → 画面恢复（部分机型需重新点开启）。

### HarmonyOS
**4.x（装 APK）**：同 Android 清单，重点看华为 WebView 的 `getUserMedia` 是否需要额外「相机」系统权限弹窗。
**NEXT（.hap）**：
1. DevEco Studio 打开 `harmony/`，先跑 `bash harmony/sync-www.sh` 同步网页资源。
2. 真机运行 → 首次启动弹相机/麦克风授权。
3. 取景是否出画面（这是 ArkWeb 授权链路最容易出问题的一步）。
4. 系统栏是否为深色、无白条；返回手势不退出应用。
5. 拍照后文件落到应用沙箱，需确认「保存」走的是下载/分享路径。

### 通用回归
- 737 组滤镜里任选 10 个 → 预览与成片色调一致（成片多一层颗粒/暗角属预期）。
- 15 种构图逐个选 → 参考线正确、评分随之变化。
- AI 构图 → 识别框合理、4 个方案可切换、出片比例正确。

---

## 五、已知限制（不藏着）

1. **iOS 不能打包 ipa**：没有 Apple 开发者证书，也没有 macOS 构建环境。PWA 是当前唯一可行路径，功能上除了「震动 / 方向锁定」外基本对齐。
2. **HK 鸿蒙 NEXT 的 `.hap` 未在真机验证**：工程结构按 API 12 Stage 模型写的，ArkWeb 的 `onPermissionRequest` 行为需要在真机上确认。
3. **硬件参数**：三端对 ISO / 快门 / 白平衡的开放度都很低，能直写就直写，不能就软件模拟 + 给建议值。
4. **后台录制**：三端都会在切后台时暂停视频流，属浏览器安全策略，无法绕过。
