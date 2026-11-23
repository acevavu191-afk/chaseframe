#!/usr/bin/env bash
# 把网页资源同步进鸿蒙工程的 rawfile/www（每次改完网页跑一次）
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/.."
DST="$HERE/entry/src/main/resources/rawfile/www"
rm -rf "$DST"
mkdir -p "$DST"
cp -r "$SRC/index.html" "$SRC/manifest.webmanifest" "$SRC/sw.js" "$DST/"
cp -r "$SRC/css" "$SRC/js" "$SRC/icons" "$DST/"
echo "已同步 $(find "$DST" -type f | wc -l) 个文件到 rawfile/www"
