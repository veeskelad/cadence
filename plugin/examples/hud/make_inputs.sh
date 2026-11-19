#!/usr/bin/env bash
# Входы примера «слова поверх записи»: одно своё тестовое видео 9:16 локальным ffmpeg (синтетика, лицензия и сеть не нужны).
# В кадре — экран с бегущим счётчиком кадров (его увеличивает лупа) и плашка (у неё тревога).
#   bash examples/hud/make_inputs.sh "$WORK"/hud-demo
set -euo pipefail
dst="${1:?папка проекта, например \"\$WORK\"/hud-demo}"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$dst/in"
cp "$here/film.json" "$dst/"
ffmpeg -v error -y \
  -f lavfi -i "gradients=s=1080x1920:d=16:r=30:c0=0x1d2a3a:c1=0x3a5a6c:c2=0x14181d:speed=0.006" \
  -f lavfi -i "testsrc2=s=360x200:d=16:r=30" \
  -filter_complex "[0:v][1:v]overlay=600:520,drawbox=x=120:y=1000:w=420:h=90:color=0xf2c94c@0.9:t=fill,drawbox=x=150:y=1030:w=250:h=30:color=0x14181d@0.85:t=fill,format=yuv420p" \
  -c:v libx264 -crf 20 "$dst/in/scene.mp4"
echo "входы примера → $dst"
