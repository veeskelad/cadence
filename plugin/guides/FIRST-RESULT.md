# Первый результат: твой ролик в бит

## Что получится

MP4 1080×1920 на 10–15 секунд в `work/<проект>/out/reel.mp4` — с твоими словами, твоим знаком и в твоём стиле:
- хук — твоя фраза, пока трек ещё тихий;
- на каждую долю форма перестраивается в новую фигуру (форма «одна форма»; пёстрая — новый кадр на каждый удар);
- в финале — твоё название, подпись и кнопка.

Расскажи агенту, о чём ролик и для кого. Тексты в примере сценария — только заготовка.

Всё считается на твоей машине, ключи и платные сервисы не нужны.

## Что нужно на машине

- Node 22+ и движок: `python3 scripts/engine_setup.py install`. Один раз на компьютер, нужна сеть:
  скачивается HyperFrames и Chrome без окна для рендера, около 300 МБ.
- ffmpeg.
- Python 3.11+ с numpy и scipy: `python3 -m pip install -r requirements.txt`.

## Подготовка рабочей папки

Работы лежат рядом с набором, не внутри него. Свой трек копируется, а не переносится:
скрипт заводит проект, копирует трек, сверяет хэш копии и кладёт сценарий-пример с уже
вписанным путём к треку.

```bash
W=../../work/first-reel            # или $CADENCE_WORK/first-reel
python3 scripts/new_project.py first-reel --copy "<путь к треку>" --film one-shape
```

Нет трека — проект без `--copy` и демо-бит кодом:

```bash
python3 scripts/new_project.py first-reel --film one-shape
# пёстрая форма, новый кадр на каждый удар: --film beat-reel, и ниже build.mjs beat-reel
python3 scripts/demo_beat.py --out "$W/in/demo-beat.wav"
```

## Предзапуск: только чтение

```bash
python3 scripts/track_structure.py "$W/in/<трек>"
```

Скрипт напечатает:
- темп;
- где дроп;
- точку входа ролика в трек.

Сценарий — `$W/film.json`. Агент впишет в него твой хук, название, подпись и кнопку; пример про Cadence в твой ролик не попадает.

## Выполнение (после согласия)

```bash
node engine/build.mjs one-shape --film "$W/film.json" --out "$W/build"
npm --prefix engine run check -- "$(pwd)/$W/build"
npm --prefix engine run render -- "$(pwd)/$W/build" --quality high --fps 30 --output "$(pwd)/$W/out/reel-raw.mp4"
python3 scripts/deliver.py "$W/out/reel-raw.mp4" --out "$W/out/reel.mp4"
python3 scripts/check_reel.py "$W/out/reel.mp4"
```

Последняя команда только читает готовый ролик: формат, громкость, пик, чёрные и замершие
кадры. Что ещё посмотреть глазами перед публикацией — [BEFORE-POSTING.md](BEFORE-POSTING.md).

## Что появится в папке

- `in/` — копия трека;
- `film.json` — сценарий;
- `build/` — проект HyperFrames: `index.html`, `lib/`, `fonts/`, `assets/`;
- `out/reel-raw.mp4` — рендер;
- `out/reel.mp4` — готовый ролик: пик не выше −1 dBFS, громкость поднята к −14 LUFS, насколько
  позволяет пик. Плотный трек доходит до −14, демо-бит останавливается около −16: лимитера нет
  намеренно, он сплющил бы удары.

## Если чего-то не хватает

Агент называет **одну** недостающую вещь и команду, которая её даёт. Отсутствующую программу
он не подменяет сетевым сервисом.

| Нет | Что сделать |
|---|---|
| `node` или версия ниже 22 | поставить Node 22 с nodejs.org |
| движок: `python3 scripts/engine_setup.py status` не `ready` | `python3 scripts/engine_setup.py install` (сеть) |
| `ffmpeg` | macOS: `brew install ffmpeg`; Windows: `winget install ffmpeg` |
| numpy или scipy | `python3 -m pip install numpy scipy` |
| рендер падает на Chrome | `npm --prefix engine run doctor` и прочитать, чего не хватает |
