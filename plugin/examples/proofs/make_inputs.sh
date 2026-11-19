#!/usr/bin/env bash
# Входы для примера слоя доказательств: копирует сценарий и картинки-плейсхолдеры в папку проекта,
# делает два своих тестовых видео локальным ffmpeg (синтетика, лицензия и сеть не нужны)
# и снимок своей страницы-плейсхолдера article.html (file://, сети нет) инструментом scripts/news_shot.py.
#   bash examples/proofs/make_inputs.sh "$WORK"/proofs-demo
set -euo pipefail
dst="${1:?папка проекта, например \"\$WORK\"/proofs-demo}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
mkdir -p "$dst/in"
cp "$here/film.json" "$here/mark.svg" "$here/cover.svg" "$dst/"
# фон «говорящего»: спокойный плывущий градиент 9:16
ffmpeg -v error -y -f lavfi -i "gradients=s=1080x1920:d=29:r=30:c0=0x2a1d18:c1=0x5a3a2c:c2=0x1c1917:speed=0.004" \
  -c:v libx264 -pix_fmt yuv420p -crf 20 "$dst/in/talk.mp4"
# кусок видео для карточки: тестовая таблица со счётчиком кадров — сразу видно, что видео идёт
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1280x720:d=29:r=30" -c:v libx264 -pix_fmt yuv420p -crf 22 "$dst/in/clip.mp4"
# снимок статьи: своя страница с диска, цитата и её строки — в in/news/primer.json
python3 "$root/scripts/news_shot.py" url --url "file://$here/article.html" --yes --name primer --out "$dst/in/news" \
  --quote "всё шло слишком быстро для зрителя. Когда план стал длиннее" >/dev/null
echo "входы примера → $dst"
