# smart-cutter: быстрая нарезка и экспорт таймлайна

**Когда брать.** Человек хочет резать запись не только по паузам речи: по неподвижности кадра, чёрным кадрам,
сказанным словам, с разной скоростью кусков или с готовым проектом для монтажной программы (Resolve, Premiere,
Final Cut, Shotcut, Kdenlive, EDL). Простые паузы из речи без всего этого вырезает `scripts/silence_cut.py`.

**Что дать.** Путь к видео или звуку и словами, что считать «живым» местом (громкое, подвижное, слово).

**Команда** (из корня Cadence):

```bash
python3 modules/smart-cutter/scripts/ae_run.py <видео> --edit audio:threshold=0.04
python3 modules/smart-cutter/scripts/ae_run.py <видео> --edit audio:threshold=0.04 --export resolve
python3 modules/smart-cutter/scripts/ae_run.py <видео> --edit motion:threshold=0.02 --dry-run
```

**Что получится.** Новый файл в `$WORK/<проект>/out/<имя>-ae.<расширение>`: MP4 (по умолчанию) или таймлайн
(`.fcpxml`, `.xml`, `.mlt`, `.kdenlive`, `.edl`, `.v3`). Исходник не меняется. Всё локально, сеть не нужна.

Оглавление: Как работает · Сборка · Параметры · Ограничения · Справка.

## Как работает

`scripts/ae_run.py` ищет бинарь `auto-editor` (переменная `CADENCE_AE_BIN`, затем `modules/smart-cutter/auto-editor`,
затем PATH), подставляет безопасный `-o` в рабочую папку и передаёт остальные параметры бинарю как есть.
Сам бинарь без `-o` пишет `<имя>_ALTERED.mp4` рядом с исходником, поэтому его напрямую не запускать.

Шаги:
1. `python3 modules/smart-cutter/scripts/ae_run.py <видео> --dry-run` показывает, что будет вырезано (`--preview`).
2. Показать человеку объём вырезанного, согласовать пороги.
3. Тот же запуск без `--dry-run`; для проекта в монтажную программу добавить `--export resolve|premiere|final-cut-pro|shotcut|kdenlive|edl`.
4. Результат проверить `scripts/check_reel.py` или глазами в плеере.

## Сборка (только по согласию человека)

Если бинаря нет, `ae_run.py` печатает «Нет бинаря auto-editor» и выходит с кодом 3. Тогда:
- Для пауз речи берём `python3 scripts/silence_cut.py <видео>`: он на ffmpeg, собирать ничего не нужно.
- Нужны именно движения, слова, чёрные кадры или таймлайн: спросить человека, готов ли он на сборку.
  Нужны `nim`, `nimble`, для статической сборки ещё `cmake`, `meson`, `ninja`, для облегчённой (`brewmake`) —
  библиотеки ffmpeg. Сеть идёт на скачивание исходников.
  Лёгкий путь на macOS: `brew install nim ffmpeg`, затем из `modules/smart-cutter/`: `nimble brewmake`
  (создаёт `modules/smart-cutter/auto-editor`). Статический путь: `nimble makeff`, затем `nimble make`; он долгий
  и скачивает около полутора десятков библиотек (ffmpeg, x264, x265, whisper и другие).
- Готовый бинарь можно положить куда угодно и указать `CADENCE_AE_BIN=<путь>`.
- Ничего не ставить без явного «да». Не собранное не обещать.

## Параметры

- `--edit METHOD`: `audio:threshold=0.04` (тишина), `motion:threshold=0.02`, `blackdetect`, `subtitle:pattern=...`, `word:value=...`.
- `--margin 0.2sec` запас вокруг речи, `--smooth 0.2s,0.1s` минимальные куски и пробелы.
- `--cut`, `--keep`, `--set-speed` ручные диапазоны.
- `--export` формат таймлайна. Переходы на резах: `--transition`.
- Расшифровка речи (`auto-editor whisper`, резка по словам) требует модель whisper, её скачивание идёт по сети и
  только с согласия человека. Без модели методы `subtitle` и `word` не работают.

## Ограничения

- Бинарь не собран в этой поставке: рабочие команды проверены только по справке, не на живом файле.
- `clip-sequence` кладёт файлы по своим правилам имени: перед выдачей человеку посмотреть, что реально появилось в `out/`.
- Кросс-сборки (Windows, wasm, ARM) вырезаны, сборка только macOS и Linux.
- Папку `ffmpeg_sources/` и `build*/` не коммитить, их создаёт сборка.

## Справка (один уровень)

- `guides/auto-editor.md`: методы разметки, темп, ручные резы, микрофон.
- `guides/auto-editor-effects.md`: скорость, громкость, зум, наложения.
- `guides/auto-editor-export.md`: Premiere, Resolve, Final Cut, EDL, клипы, файлы таймлайна.
- `guides/auto-editor-transcribe.md`: расшифровка и резка по словам.
- `guides/auto-editor-transitions.md`: переходы и кроссфейды.
- `docs/src/docs/`: подробные описания (ranges, anorm, форматы таймлайна v1–v3, кулинарная книга).
