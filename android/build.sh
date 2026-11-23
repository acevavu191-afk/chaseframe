#!/usr/bin/env bash
# 追帧 ChaseFrame — 免 Gradle 的 APK 构建脚本（aapt2 + javac + d8 + zipalign + apksigner）
set -euo pipefail

ROOT="E:/ai/chaseframe"
SDK="E:/ai/.toolchain/sdk"
BT="$SDK/android-15"
PLAT="$SDK/android-35/android.jar"
JAVA="$SDK/jdk-17.0.2/bin"
OUT="$ROOT/android/build"
AND="$ROOT/android"

VER_NAME=$(python -c "import json;print(json.load(open(r'$ROOT/version.json'))['versionName'])")
VER_CODE=$(python -c "import json;print(json.load(open(r'$ROOT/version.json'))['versionCode'])")
APK="$ROOT/ChaseFrame-$VER_NAME.apk"

export PATH="$JAVA:$BT:$PATH"
export JAVA_HOME="$SDK/jdk-17.0.2"

echo "== 1/7 清理 =="
rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/assets/www"

echo "== 2/7 拷贝网页资源 =="
cp -r "$ROOT/index.html" "$ROOT/manifest.webmanifest" "$ROOT/sw.js" "$OUT/assets/www/"
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/icons" "$OUT/assets/www/"
rm -rf "$OUT/assets/www/icons/../.qa" 2>/dev/null || true
find "$OUT/assets/www" -type f | wc -l

echo "== 3/7 aapt2 compile =="
mkdir -p "$OUT/flat"
"$BT/aapt2.exe" compile --dir "$AND/res" -o "$OUT/flat/"

echo "== 4/7 aapt2 link =="
FLATS=$(find "$OUT/flat" -name '*.flat' | tr '\n' ' ')
"$BT/aapt2.exe" link \
  -o "$OUT/base.apk" \
  -I "$PLAT" \
  --manifest "$AND/AndroidManifest.xml" \
  $FLATS \
  -A "$OUT/assets" \
  --java "$OUT/gen" \
  --min-sdk-version 26 \
  --target-sdk-version 35 \
  --version-code "$VER_CODE" \
  --version-name "$VER_NAME" \
  --no-version-vectors

echo "== 5/7 javac =="
"$JAVA/javac.exe" -encoding UTF-8 -source 8 -target 8 -nowarn \
  -classpath "$PLAT" \
  -d "$OUT/classes" \
  "$AND/src/com/chaseframe/app/MainActivity.java" 2>&1 | grep -v "^警告" | grep -v "bootstrap class path" || true

echo "== 6/7 d8 =="
CLASSES=$(find "$OUT/classes" -name '*.class' | tr '\n' ' ')
"$BT/d8.bat" --release --min-api 26 --lib "$PLAT" --output "$OUT/dex" $CLASSES

python - <<EOF
import zipfile, shutil, os
src = r"$OUT/base.apk"
dst = r"$OUT/base+dex.apk"
shutil.copyfile(src, dst)
with zipfile.ZipFile(dst, "a", zipfile.ZIP_DEFLATED) as z:
    z.write(r"$OUT/dex/classes.dex", "classes.dex")
print("dex added", os.path.getsize(dst))
EOF

echo "== 7/7 对齐 + 签名 =="
"$BT/zipalign.exe" -f -p 4 "$OUT/base+dex.apk" "$OUT/aligned.apk"

KS="$ROOT/android/chaseframe.keystore"
if [ ! -f "$KS" ]; then
  "$JAVA/keytool.exe" -genkeypair -v \
    -keystore "$KS" -alias chaseframe \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass chaseframe -keypass chaseframe \
    -dname "CN=ChaseFrame, O=ChaseFrame, C=CN" >/dev/null 2>&1
  echo "keystore created"
fi

"$BT/apksigner.bat" sign \
  --ks "$KS" --ks-key-alias chaseframe \
  --ks-pass pass:chaseframe --key-pass pass:chaseframe \
  --min-sdk-version 26 \
  --out "$APK" \
  "$OUT/aligned.apk"

"$BT/apksigner.bat" verify --print-certs "$APK" | head -6
ls -lh "$APK"
echo "BUILD_OK"
