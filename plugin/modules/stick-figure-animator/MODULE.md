# Объяснялка со стик-фигурами

**Когда брать.** Человек хочет мультяшный ролик с палочными человечками: объяснялка по теме, пересказ
текста, сценария, субтитров или чужого видео. Озвучка может быть записана позже или уже готова.

**Что дать.** Тему, сценарий или `.srt`; формат (16:9 по умолчанию, 9:16 по просьбе); длину; нужны ли
вшитые субтитры; голос, если он уже записан.

**Команда (первый шаг).**
`python3 modules/stick-figure-animator/scripts/new_video.py --project "$WORK/<проект>/stickman" --slug <имя>`
создаёт ролик; продолжить начатый помогает `scripts/find_projects.py --path "$WORK/<проект>"`. Дальше по шагам
из `guides/stickman-video.md`.

**Что получится.** Папка ролика (страница HyperFrames со сценами человечков), `voiceover.srt` с текстом и
таймингом для записи, `storyboard.md` и MP4 в `out/` ролика. Эффекты и музыка синтезируются локально, чужих сэмплов нет.

## Важно до начала

- Рисует общий движок Cadence (HyperFrames в `engine/`): `python3 scripts/engine_setup.py status` должен
  ответить `ready`. Своих node-пакетов у модуля нет. Python-часть (numpy, scipy, pillow) ставится как обычно:
  `python3 scripts/module_setup.py install stick-figure-animator`.
- Ролик — отдельная папка `$WORK/<проект>/stickman/<имя>`, а не папка с исходниками человека. Скрипты
  `setup_project.py` и `new_video.py` не перезаписывают чужие файлы; непустую папку, которая не ролик
  со стик-фигурами, не трогают (код выхода 3).
- Время анимации: кадр считается заново из номера кадра (`bindSeek` из `engine/lib/motion.js`), без
  библиотеки анимации; сцены — функции `({ f, from, dur }) => разметка`.
- По умолчанию сети нет. Её просят только `fetch_transcript.py` (субтитры чужого видео, спросить
  человека) и первая загрузка модели в `transcribe_voice.py` / `align_voice.py` (нужен `faster-whisper`).
- Голос в ролике не слышно агенту: итог проверяется по `check_render.py`, а на слух проверяет человек.

## Шаги

Пути `scripts/`, `assets/`, `references/` ниже считаются от корня модуля `modules/stick-figure-animator/`.

1. Создать ролик: `scripts/new_video.py --project <проект> --slug <имя>` (начатый найти —
   `scripts/find_projects.py`; обновить копию движка в старом ролике — `scripts/setup_project.py --dir <ролик> --update-engine`).
2. План по тексту: `scripts/parse_input.py --script script.md --out <ролик>/src`
   (или `--srt`). Получается `timeline.js`, `timeline.json`, `voiceover.srt`.
3. Раскадровка в `storyboard.md`, сцены в `<ролик>/src/Sxx*.js`. Приёмы — `references/animation-style.md`,
   API движка — `references/engine-api.md`, типичные ошибки — `references/pitfalls.md`.
4. Проверка кадров без полного рендера: `node <ролик>/render.mjs --sheet 0-450:45` (лист в `out/sheet.png`).
5. Звук: `scripts/gen_audio.py --out <ролик>/assets --plan "intro:8,play:40,finale:12"`.
6. Рендер `node <ролик>/render.mjs [--captions]` (в один поток) и проверка
   `scripts/check_render.py <ролик>/out/<имя>.mp4 --timeline <ролик>/src/timeline.json`.
7. Голос записан позже: `scripts/align_voice.py --timeline ... --audio voice.wav --out <ролик>/src` перестраивает
   тайминг по реальной речи; потом `node <ролик>/render.mjs --voice voice.wav`.

## Ограничения

- Реальные люди появляются только как подписанные обобщённые фигуры; насилие мультяшное.
- Пересказ чужого видео или текста указывать в финальных титрах.
- Свою музыку человек приносит на своих правах; встроенная генерируется заново.
- Шрифт заголовков — Oswald из шрифтов движка (раньше был Barlow Condensed из сети); шрифт ударных слов
  Bangers без кириллицы, для русских надписей брать `FONT.title` или `FONT.body`.

## Справка

- [guides/stickman-video.md](guides/stickman-video.md) — полный порядок работы с примерами команд.
- [references/animation-style.md](references/animation-style.md) — принципы, метафоры, рецепты сцен.
- [references/engine-api.md](references/engine-api.md) — движок на одной странице.
- [references/pitfalls.md](references/pitfalls.md) — частые ошибки раскладки.
