#!/usr/bin/env node
/**
 * bump.mjs — 改完东西后，把版本号 +1 并同步到所有引用处
 *
 * 用法：
 *   node scripts/bump.mjs           // 修订号 +1: 1.1.0 -> 1.1.1
 *   node scripts/bump.mjs minor     // 次版本 +1: 1.1.0 -> 1.2.0
 *   node scripts/bump.mjs major     // 主版本 +1: 1.1.0 -> 2.0.0
 *   node scripts/bump.mjs set 2.3.4 // 直接指定
 *
 * 会同步：version.json / android/AndroidManifest.xml / harmony/AppScope/app.json5
 *        / index.html 的 app-version / README 里的安装包文件名
 * 之后跑 bash android/build.sh 就会产出带新版本号的 APK。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const VER_FILE = path.join(ROOT, 'version.json');

const argv = process.argv.slice(2);
const mode = argv[0] || 'patch';

const data = JSON.parse(fs.readFileSync(VER_FILE, 'utf8'));
const [maj, min, pat] = String(data.versionName).split('.').map(Number);

let next;
if (argv[0] === 'set' && argv[1]) {
  next = argv[1];
} else if (mode === 'major') {
  next = `${maj + 1}.0.0`;
} else if (mode === 'minor') {
  next = `${maj}.${min + 1}.0`;
} else {
  next = `${maj}.${min}.${pat + 1}`;
}

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('版本号格式应为 x.y.z');
  process.exit(1);
}

const oldName = data.versionName;
data.versionName = next;
data.versionCode = (data.versionCode || 1) + 1;
fs.writeFileSync(VER_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');

let changed = 0;
function sync(file, fn) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(p, after, 'utf8');
    changed++;
  }
}

// Android 清单
sync('android/AndroidManifest.xml', s => s
  .replace(/android:versionCode="\d+"/, `android:versionCode="${data.versionCode}"`)
  .replace(/android:versionName="[^"]*"/, `android:versionName="${next}"`));

// 鸿蒙
sync('harmony/AppScope/app.json5', s => s
  .replace(/"versionCode":\s*\d+/, `"versionCode": ${data.versionCode * 1000000}`)
  .replace(/"versionName":\s*"[^"]*"/, `"versionName": "${next}"`));

// 网页：meta 与页脚显示
sync('index.html', s => s
  .replace(/<meta name="app-version" content="[^"]*"/, `<meta name="app-version" content="${next}" />`));

// README 里的安装包文件名
sync('README.md', s => s.split(`ChaseFrame-${oldName}.apk`).join(`ChaseFrame-${next}.apk`));

console.log(`版本 ${oldName} → ${next}（versionCode ${data.versionCode}）`);
console.log(`已同步 ${changed} 个文件；接下来跑：bash android/build.sh`);
