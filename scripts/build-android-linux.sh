#!/usr/bin/env bash
# 半亩方塘 · build the Android live-wallpaper APK on Linux.
# Toolchain layout (override with the ANDROID_BUILD env var):
#   $ANDROID_BUILD/jdk                              Temurin JDK 17
#   $ANDROID_BUILD/sdk/build-tools/34.0.0           aapt2 / d8 / zipalign / apksigner
#   $ANDROID_BUILD/sdk/platforms/android-34/android.jar
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_ROOT="${ANDROID_BUILD:-$HOME/android-build}"
export JAVA_HOME="$SDK_ROOT/jdk"
BT="$SDK_ROOT/sdk/build-tools/34.0.0"
AJ="$SDK_ROOT/sdk/platforms/android-34/android.jar"
VERSION_NAME="$(node "$ROOT/scripts/version.mjs" android.versionName)"
VERSION_CODE="$(node "$ROOT/scripts/version.mjs" android.versionCode)"
OUT="SkyPond-${VERSION_NAME}-Android.apk"
export PATH="$JAVA_HOME/bin:$PATH"
cd "$ROOT/android"

# Package the current pond, never a stale copy: assets/ is rebuilt from the web sources every time.
rm -rf assets && mkdir -p assets/assets
for f in index.html app.js core.js art.js gl.js scene.js now.js audio.js style.css; do cp "$ROOT/$f" assets/; done
for img in pond.webp pond-spring.webp pond-summer.webp pond-autumn.webp pond-winter.webp; do cp "$ROOT/assets/$img" assets/assets/; done
cp "$ROOT/assets/pond-data.js" "$ROOT/assets/favicon.svg" assets/assets/

# Keep the signing key between builds, so a new APK installs over the old one without losing the pond.
[[ -f build/skypond.keystore ]] && cp build/skypond.keystore "$ROOT/android/.skypond.keystore.keep"
rm -rf build && mkdir -p build/gen build/classes build/dex
[[ -f "$ROOT/android/.skypond.keystore.keep" ]] && mv "$ROOT/android/.skypond.keystore.keep" build/skypond.keystore

"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/unsigned.apk -I "$AJ" --manifest AndroidManifest.xml -A assets build/res.zip \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"
javac --release 11 -Xlint:all -Xlint:-options -classpath "$AJ" -d build/classes java/com/skypond/koipond/*.java
"$BT/d8" --release --lib "$AJ" --output build/dex $(find build/classes -name '*.class')
(cd build/dex && zip -q -X ../unsigned.apk classes.dex)
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk

if [[ ! -f build/skypond.keystore ]]; then
  keytool -genkeypair -keystore build/skypond.keystore -alias skypond -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass skypond -keypass skypond -dname "CN=SkyPond" 2>/dev/null
fi
"$BT/apksigner" sign --ks build/skypond.keystore --ks-pass pass:skypond --key-pass pass:skypond \
  --out "build/$OUT" build/aligned.apk
"$BT/apksigner" verify "build/$OUT"
mkdir -p "$ROOT/dist" && cp "build/$OUT" "$ROOT/dist/$OUT"
echo "✓ build/$OUT ($(du -h "build/$OUT" | cut -f1)), also at dist/$OUT — transfer to a phone and install"
