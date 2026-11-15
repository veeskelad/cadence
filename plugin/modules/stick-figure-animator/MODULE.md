# Объяснялка со стик-фигурами

**Когда брать.** Человек хочет мультяшный ролик с палочными человечками: объяснялка по теме, пересказ
текста, сценария, субтитров или чужого видео. Озвучка может быть записана позже или уже готова.

**Что дать.** Тему, сценарий или `.srt`; формат (16:9 по умолчанию, 9:16 по просьбе); длину; нужны ли
вшитые субтитры; голос, если он уже записан.

**Команда (первый шаг).**
`python3 modules/stick-figure-animator/scripts/find_remotion.py --path "$WORK/<проект>/remotion"`
показывает найденные проекты Remotion; дальше по шагам из `guides/stickman-video.md`.

**Что получится.** Проект Remotion со сценами человечков, `voiceover.srt` с текстом и таймингом для записи,
`storyboard.md` и MP4 в `out/` проекта. Эффекты и музыка синтезируются локально, чужих сэмплов нет.

## Важно до начала

- Это движок Remotion. Он ставится отдельно, только с согласия человека: новая установка тянет несколько
  сотен МБ из сети. Python-часть (numpy, scipy, pillow) ставится как обычно:
  `python3 scripts/module_setup.py install stick-figure-animator`.
- Проект Remotion держать в `$WORK/<проект>/remotion`, а не в папке с исходниками человека. Скрипты
  `setup_project.py` и `new_video.py` не перезаписывают чужие файлы; чужой `package.json` без Remotion
  не трогают (код выхода 3).
- По умолчанию сети нет. Её просят только `fetch_transcript.py` (субтитры чужого видео, спросить
  человека) и первая загрузка модели в `transcribe_voice.py` / `align_voice.py` (нужен `faster-whisper`).
- Голос в ролике не слышно агенту: итог проверяется по `check_render.py`, а на слух проверяет человек.

## Шаги

Пути `scripts/`, `assets/`, `references/` ниже считаются от корня модуля `modules/stick-figure-animator/`.

1. Найти или создать проект: `scripts/find_remotion.py`, затем
   `scripts/setup_project.py --dir <проект> [--create]` и `scripts/new_video.py --project <проект> --slug <имя>`.
2. План по тексту: `scripts/parse_input.py --script script.md --out <проект>/src/<имя>`
   (или `--srt`). Получается `timeline.ts`, `timeline.json`, `voiceover.srt`.
3. Раскадровка в `storyboard.md`, сцены в `src/<имя>/Sxx*.tsx`. Приёмы — `references/animation-style.md`,
   API движка — `references/engine-api.md`, типичные ошибки — `references/pitfalls.md`.
4. Проверка кадров без полного рендера: `node stickman-sheet.mjs <Композиция> out/sheet.png 0-450:45`.
5. Звук: `scripts/gen_audio.py --out <проект>/public/<имя> --plan "intro:8,play:40,finale:12"`.
6. Рендер `npx remotion render <Композиция> out/<имя>.mp4` и проверка
   `scripts/check_render.py out/<имя>.mp4 --timeline src/<имя>/timeline.json`.
7. Голос записан позже: `scripts/align_voice.py --timeline ... --audio voice.wav --out ...` перестраивает
   тайминг по реальной речи; потом рендер с `--props='{"voice":"voice.wav"}'`.

## Ограничения

- Реальные люди появляются только как подписанные обобщённые фигуры; насилие мультяшное.
- Пересказ чужого видео или текста указывать в финальных титрах.
- Свою музыку человек приносит на своих правах; встроенная генерируется заново.

## Справка

- [guides/stickman-video.md](guides/stickman-video.md) — полный порядок работы с примерами команд.
- [references/animation-style.md](references/animation-style.md) — принципы, метафоры, рецепты сцен.
- [references/engine-api.md](references/engine-api.md) — движок на одной странице.
- [references/pitfalls.md](references/pitfalls.md) — частые ошибки раскладки.
