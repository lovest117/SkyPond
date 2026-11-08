#!/usr/bin/env bash
# 半亩方塘 · publish to GitHub: create the public repository (if needed), push, and release every app.
# Needs the GitHub CLI signed in to the owning account:  gh auth login
# Builds are taken from dist/ (run the scripts/build-*.sh first), renamed to plain ASCII for the release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${REPO:-lovest117/SkyPond}"
VERSION="${VERSION:-$(node "$ROOT/scripts/version.mjs" version)}"
GH="${GH:-$(command -v gh || true)}"
[[ -n "$GH" ]] || { echo "GitHub CLI not found: https://cli.github.com (or set GH=/path/to/gh)"; exit 1; }
"$GH" auth status >/dev/null 2>&1 || { echo "Sign in first:  gh auth login"; exit 1; }
cd "$ROOT"

echo "▸ Collecting the apps…"
OUT="$ROOT/build/release"; rm -rf "$OUT"; mkdir -p "$OUT"
cp "dist/SkyPond-$VERSION-Windows.zip" "$OUT/"
cp "dist/SkyPond-$VERSION-Android.apk" "$OUT/"
(cd dist && zip -qr -X "$OUT/SkyPond-$VERSION-Web.zip" index.html style.css core.js art.js gl.js scene.js now.js audio.js app.js project.json assets -x '*.DS_Store')
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUT" && sha256sum SkyPond-* > SHA256SUMS.txt)
else
  (cd "$OUT" && shasum -a 256 SkyPond-* > SHA256SUMS.txt)
fi

echo "▸ Repository $REPO…"
if ! "$GH" repo view "$REPO" >/dev/null 2>&1; then
  "$GH" repo create "$REPO" --public --description "半亩方塘 · 锦鲤池塘动态壁纸（Windows / Android / Web）"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
"$GH" auth setup-git
git push -u origin HEAD:main

echo "▸ Release v$VERSION…"
NOTES="docs/release-notes-$VERSION.md"
if "$GH" release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  "$GH" release upload "v$VERSION" "$OUT"/* --repo "$REPO" --clobber
elif [[ -f "$NOTES" ]]; then
  "$GH" release create "v$VERSION" "$OUT"/* --repo "$REPO" --title "半亩方塘 v$VERSION" --notes-file "$NOTES"
else
  "$GH" release create "v$VERSION" "$OUT"/* --repo "$REPO" --title "半亩方塘 v$VERSION" --generate-notes
fi
echo "✓ https://github.com/$REPO/releases/tag/v$VERSION"
