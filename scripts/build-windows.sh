#!/usr/bin/env bash
# 半亩方塘 · build the Windows desktop-wallpaper app into dist/SkyPond-$VERSION-Windows.zip.
# Needs the .NET SDK (8 or later; builds on Linux/Windows): https://dot.net — or set DOTNET to its path.
# The app targets .NET Framework 4.8 and WebView2, both already part of Windows 10/11, so nothing else is installed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOTNET="${DOTNET:-$(command -v dotnet || echo "$HOME/.dotnet/dotnet")}"
VERSION="1.1.0"
PROJ="$ROOT/native/windows"
OUT="$ROOT/build/windows/SkyPond"
ZIP="$ROOT/dist/SkyPond-$VERSION-Windows.zip"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if command -v sips >/dev/null 2>&1; then
echo "▸ Generating the icon…"
# The rounded pond tile from assets/app-icon.png, at every size Windows asks for, packed as PNG-in-ICO.
sips -c 824 824 "$ROOT/assets/app-icon.png" --out "$WORK/tile.png" >/dev/null
for s in 16 20 24 32 40 48 64 96 128 256; do sips -z $s $s "$WORK/tile.png" --out "$WORK/$s.png" >/dev/null; done
python3 - "$WORK" "$PROJ/AppIcon.ico" <<'PY'
import struct, sys
work, out = sys.argv[1], sys.argv[2]
sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
pngs = [open(f"{work}/{s}.png", "rb").read() for s in sizes]
head = struct.pack("<HHH", 0, 1, len(sizes))
offset, entries = 6 + 16 * len(sizes), b""
for s, data in zip(sizes, pngs):
    entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
open(out, "wb").write(head + entries + b"".join(pngs))
PY
else
# sips is macOS-only. On Linux/Windows reuse the committed .ico so the build still runs.
echo "▸ sips not found — reusing $PROJ/AppIcon.ico"
[[ -f "$PROJ/AppIcon.ico" ]] || { echo "✗ AppIcon.ico missing and sips unavailable"; exit 1; }
fi

echo "▸ Building (.NET Framework 4.8 + WebView2)…"
rm -rf "$OUT"
"$DOTNET" publish "$PROJ/SkyPond.csproj" -c Release -o "$OUT" --nologo -v quiet
rm -f "$OUT"/*.pdb "$OUT"/*.xml
# Only the WebView2 loaders Windows can use: x64, x86 and ARM64.
if [[ -d "$OUT/runtimes" ]]; then
  find "$OUT/runtimes" -mindepth 1 -maxdepth 1 ! -name 'win-x64' ! -name 'win-x86' ! -name 'win-arm64' -exec rm -rf {} +
fi

cat > "$OUT/README.txt" <<'TXT'
半亩方塘 · Windows 桌面动态壁纸

使用：解压整个文件夹（不要只拿出 exe），双击 SkyPond.exe，池塘即铺满每块屏幕的桌面背景，
位于桌面图标之下，不影响正常使用桌面。

· 在桌面空白处轻点一下：锦鲤游过来抢食。
· 任务栏通知区域的锦鲤图标（右键）：打开交互窗口（投喂、给锦鲤起名、天气、声音、设置）、
  切换天气与月下观鱼、暂停壁纸动画、重载、开机时启动、退出。双击图标也可打开交互窗口。
· 被最大化或全屏的窗口挡住、或锁屏时，这块屏幕的池塘自动停止绘制，不占用资源。
· 退出后桌面恢复为原来的系统壁纸。

要求：Windows 10 / 11，Microsoft Edge WebView2 运行时（Windows 11 自带；Windows 10 若缺少，
程序会提示并打开下载页）。首次运行时 Windows 可能提示“已保护你的电脑”，点“更多信息 → 仍要运行”。
数据保存在 %LOCALAPPDATA%\SkyPond。
TXT
# Notepad reads UTF-8 without a BOM fine on Windows 10 1903+, but a BOM keeps older builds from guessing wrong.
printf '\xEF\xBB\xBF' | cat - "$OUT/README.txt" > "$WORK/readme" && mv "$WORK/readme" "$OUT/README.txt"

echo "▸ Packing…"
mkdir -p "$ROOT/dist"
rm -f "$ZIP"
(cd "$(dirname "$OUT")" && zip -qr -X "$ZIP" "$(basename "$OUT")")
echo "✓ Built $OUT"
echo "✓ Packed $ZIP ($(du -h "$ZIP" | cut -f1))"
