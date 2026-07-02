#!/bin/sh
# Switzer is licensed under the ITF Free Font License (fontshare.com/licenses/itf-ffl):
# free to use and self-host, but the font files may not be redistributed — so the
# .ttf is not committed. Every build fetches it from Fontshare's official download
# endpoint instead, which is the distribution channel the license requires.
set -e
dir="$(cd "$(dirname "$0")" && pwd)/src"
target="$dir/Switzer-Variable.ttf"
[ -f "$target" ] && exit 0
echo "Fetching Switzer (ITF FFL) from Fontshare..."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/switzer.zip" "https://api.fontshare.com/v2/fonts/download/switzer"
unzip -q -j "$tmp/switzer.zip" "Switzer_Complete/Fonts/TTF/Switzer-Variable.ttf" -d "$dir"
echo "Saved $target"
